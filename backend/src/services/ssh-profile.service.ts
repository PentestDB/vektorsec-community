import { execFile } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { promisify } from "util";
import { Client as SSHClient } from "ssh2";
import { buildSSHConfig, SSHConfig } from "../utils/sshConfig";

const execFileAsync = promisify(execFile);
const LEGACY_PROFILE_ALIAS = "__legacy_env__";
const PROFILE_ALIAS_PATTERN = /^[a-zA-Z0-9_.@:+-]{1,128}$/;

export interface SSHProfileSummary {
  alias: string;
  label: string;
  host: string;
  port: number;
  username: string;
  identityFile?: string;
  source: "ssh_config" | "legacy_env" | "managed";
  available: boolean;
  error?: string;
}

export interface ResolvedSSHProfile {
  summary: SSHProfileSummary;
  config: SSHConfig;
}

function getSSHConfigFile(): string {
  return process.env.SSH_CONFIG_FILE?.trim() || path.join(os.homedir(), ".ssh", "config");
}

export function parseSSHConfigAliases(content: string): string[] {
  const aliases = new Set<string>();
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    const match = line.match(/^Host\s+(.+)$/i);
    if (!match) continue;
    for (const token of match[1].trim().split(/\s+/)) {
      if (
        token &&
        !token.startsWith("!") &&
        !token.includes("*") &&
        !token.includes("?") &&
        PROFILE_ALIAS_PATTERN.test(token)
      ) {
        aliases.add(token);
      }
    }
  }
  return Array.from(aliases);
}

export function parseSSHGOutput(output: string): Record<string, string[]> {
  const parsed: Record<string, string[]> = {};
  for (const rawLine of output.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const space = line.indexOf(" ");
    if (space === -1) continue;
    const key = line.slice(0, space).toLowerCase();
    const value = line.slice(space + 1).trim();
    if (!value) continue;
    (parsed[key] ??= []).push(value);
  }
  return parsed;
}

export function expandSSHPath(value: string): string {
  if (value === "~") return os.homedir();
  if (value.startsWith("~/")) return path.join(os.homedir(), value.slice(2));
  return value.replace(/^\$\{HOME\}(?=\/|$)/, os.homedir());
}

function first(values: Record<string, string[]>, key: string): string | undefined {
  return values[key]?.[0];
}

async function resolveFromSSHConfig(alias: string): Promise<ResolvedSSHProfile> {
  if (!PROFILE_ALIAS_PATTERN.test(alias)) throw new Error("Invalid SSH profile alias");
  const configFile = getSSHConfigFile();
  if (!fs.existsSync(configFile)) {
    throw new Error(`SSH config is not mounted at ${configFile}`);
  }

  const aliases = parseSSHConfigAliases(await fs.promises.readFile(configFile, "utf8"));
  if (!aliases.includes(alias)) throw new Error(`SSH profile "${alias}" was not found`);

  const { stdout } = await execFileAsync(
    "ssh",
    ["-G", "-F", configFile, alias],
    { timeout: 5_000, maxBuffer: 512 * 1024 },
  );
  const values = parseSSHGOutput(stdout);
  const host = first(values, "hostname") || alias;
  const username = first(values, "user") || process.env.USER || "root";
  const port = Number.parseInt(first(values, "port") || "22", 10);
  const identityCandidates = (values.identityfile ?? []).map(expandSSHPath);
  const identityFile = identityCandidates.find((candidate) => {
    try {
      return fs.statSync(candidate).isFile();
    } catch {
      return false;
    }
  });

  const keepaliveSeconds = Number.parseInt(
    first(values, "serveraliveinterval") || "10",
    10,
  );
  const keepaliveCountMax = Number.parseInt(
    first(values, "serveralivecountmax") || "3",
    10,
  );

  const config: SSHConfig = {
    host,
    port: Number.isFinite(port) ? port : 22,
    username,
    keepaliveInterval: Number.isFinite(keepaliveSeconds) ? keepaliveSeconds * 1_000 : 10_000,
    keepaliveCountMax: Number.isFinite(keepaliveCountMax) ? keepaliveCountMax : 3,
  };

  if (identityFile) {
    config.privateKey = await fs.promises.readFile(identityFile, "utf8");
  } else if (process.env.SSH_AUTH_SOCK) {
    config.agent = process.env.SSH_AUTH_SOCK;
  } else {
    const shown = identityCandidates[0] ? path.basename(identityCandidates[0]) : "none configured";
    throw new Error(`No readable identity file for "${alias}" (${shown})`);
  }

  return {
    summary: {
      alias,
      label: alias,
      host,
      port: config.port,
      username,
      identityFile: identityFile ? path.basename(identityFile) : "SSH agent",
      source: "ssh_config",
      available: true,
    },
    config,
  };
}

function hasLegacyConfig(): boolean {
  return Boolean(process.env.SSH_HOST?.trim() && process.env.SSH_USERNAME?.trim());
}

/**
 * True when the environment still carries the pre-workspace SSH credentials
 * (Settings → SSH / `SSH_*` in `.env`). Used as the fallback work host for
 * workspaces that never picked a host explicitly — otherwise those sessions
 * silently ran every command inside the backend container.
 */
export function hasLegacySSHConfig(): boolean {
  return hasLegacyConfig();
}

function loadLegacyKeyFromMountedPath(config: SSHConfig): SSHConfig {
  if (config.privateKey || config.password || config.agent) return config;

  const configuredPath = process.env.SSH_PRIVATE_KEY?.trim();
  if (!configuredPath) return config;

  const keyName = path.basename(configuredPath);
  const candidates = [
    expandSSHPath(configuredPath),
    path.join(os.homedir(), ".ssh", keyName),
    path.join(os.homedir(), "keys", keyName),
  ];
  for (const candidate of candidates) {
    try {
      if (fs.statSync(candidate).isFile()) {
        return { ...config, privateKey: fs.readFileSync(candidate, "utf8") };
      }
    } catch {
      // Try the next container-visible location.
    }
  }
  return config;
}

function resolveLegacyProfile(): ResolvedSSHProfile {
  const config = loadLegacyKeyFromMountedPath(buildSSHConfig());
  return {
    summary: {
      alias: LEGACY_PROFILE_ALIAS,
      label: "Legacy environment default",
      host: config.host,
      port: config.port,
      username: config.username,
      source: "legacy_env",
      available: Boolean(config.password || config.privateKey || config.agent),
      ...(!config.password && !config.privateKey && !config.agent
        ? { error: "The legacy credential could not be loaded" }
        : {}),
    },
    config,
  };
}

// ─── Managed SSH profiles (persisted in /srv/data/ssh-profiles.json) ──
// Lets a user define multiple SSH servers (any host/port/user/auth) from the
// UI. They are merged into listSSHProfiles() so every workspace can target any
// of them from the Connection page — no ~/.ssh/config edit required.

export interface ManagedSSHProfile {
  alias: string;
  label: string;
  host: string;
  port: number;
  username: string;
  password?: string;
  privateKeyPath?: string;
}

/** Raw input accepted from the UI form for a managed SSH profile. */
export interface ManagedSSHProfileInput {
  alias?: unknown;
  label?: unknown;
  host?: unknown;
  port?: unknown;
  username?: unknown;
  password?: unknown;
  privateKeyPath?: unknown;
}

function managedProfilesPath(): string {
  const dataDir =
    process.env.DATA_DIR?.trim() ||
    (fs.existsSync("/srv/data") ? "/srv/data" : path.resolve(__dirname, "../.."));
  return path.join(dataDir, "ssh-profiles.json");
}

function readManagedProfiles(): ManagedSSHProfile[] {
  try {
    const file = managedProfilesPath();
    if (!fs.existsSync(file)) return [];
    const parsed = JSON.parse(fs.readFileSync(file, "utf-8"));
    return Array.isArray(parsed) ? (parsed as ManagedSSHProfile[]) : [];
  } catch (error) {
    console.warn("[ssh-profiles] Failed to read managed profiles:", error);
    return [];
  }
}

function writeManagedProfiles(profiles: ManagedSSHProfile[]): void {
  fs.writeFileSync(managedProfilesPath(), JSON.stringify(profiles, null, 2), "utf-8");
}

function managedProfileToSummary(profile: ManagedSSHProfile): SSHProfileSummary {
  const hasAuth = Boolean(profile.password || profile.privateKeyPath);
  const available = Boolean(profile.host && profile.username && hasAuth);
  return {
    alias: profile.alias,
    label: profile.label || profile.alias,
    host: profile.host,
    port: profile.port,
    username: profile.username,
    source: "managed",
    available,
    ...(!available
      ? { error: "Provide a host, username and an auth method (password or key)" }
      : {}),
  };
}

export function listManagedProfiles(): SSHProfileSummary[] {
  return readManagedProfiles().map(managedProfileToSummary);
}

export function getManagedProfile(alias: string): ManagedSSHProfile | undefined {
  return readManagedProfiles().find((profile) => profile.alias === alias);
}

function parseManagedFields(input: Record<string, unknown>): ManagedSSHProfile {
  const alias = String(input.alias ?? "").trim();
  if (!PROFILE_ALIAS_PATTERN.test(alias)) {
    throw new Error("Profile name may only contain letters, numbers and _ . @ : + -");
  }
  const host = String(input.host ?? "").trim();
  const username = String(input.username ?? "").trim();
  if (!host || !username) throw new Error("Host and username are required");

  return {
    alias,
    label: String(input.label || alias).trim() || alias,
    host,
    port: Number.parseInt(String(input.port ?? "22"), 10) || 22,
    username,
    password: input.password ? String(input.password) : undefined,
    privateKeyPath: input.privateKeyPath ? String(input.privateKeyPath).trim() : undefined,
  };
}

/**
 * Parse and validate a managed-profile form payload. Unlike addManagedProfile,
 * this REQUIRES an auth method (password or key path) so a connection test
 * always has something to authenticate with — used by the Test button.
 */
export function normalizeManagedInput(input: Record<string, unknown>): ManagedSSHProfile {
  const profile = parseManagedFields(input);
  if (!profile.password && !profile.privateKeyPath) {
    throw new Error("Provide an auth method (password or private key path)");
  }
  return profile;
}

/** Build an ssh2 config for a managed profile, resolving the key file if present. */
export function managedProfileToConfig(profile: ManagedSSHProfile): SSHConfig {
  const config: SSHConfig = {
    host: profile.host,
    port: profile.port,
    username: profile.username,
    tryKeyboard: true,
  };
  if (profile.password) config.password = profile.password;
  if (profile.privateKeyPath) {
    const candidates = [
      expandSSHPath(profile.privateKeyPath),
      profile.privateKeyPath,
      path.join(os.homedir(), ".ssh", path.basename(profile.privateKeyPath)),
    ];
    for (const candidate of candidates) {
      try {
        if (fs.statSync(candidate).isFile()) {
          config.privateKey = fs.readFileSync(candidate, "utf-8");
          break;
        }
      } catch {
        // try the next candidate
      }
    }
  }
  return config;
}

export function addManagedProfile(input: Record<string, unknown>): ManagedSSHProfile {
  const profile = parseManagedFields(input);

  const profiles = readManagedProfiles();
  const index = profiles.findIndex((p) => p.alias === profile.alias);
  if (index !== -1) profiles[index] = profile;
  else profiles.push(profile);
  writeManagedProfiles(profiles);
  return profile;
}

export function removeManagedProfile(alias: string): boolean {
  const profiles = readManagedProfiles();
  const remaining = profiles.filter((p) => p.alias !== alias);
  if (remaining.length === profiles.length) return false;
  writeManagedProfiles(remaining);
  return true;
}

export async function resolveSSHProfile(alias: string): Promise<ResolvedSSHProfile> {
  if (alias === LEGACY_PROFILE_ALIAS) {
    if (!hasLegacyConfig()) throw new Error("Legacy SSH environment configuration is unavailable");
    return resolveLegacyProfile();
  }
  const managed = getManagedProfile(alias);
  if (managed) {
    return { summary: managedProfileToSummary(managed), config: managedProfileToConfig(managed) };
  }
  return resolveFromSSHConfig(alias);
}

export async function listSSHProfiles(): Promise<SSHProfileSummary[]> {
  const summaries: SSHProfileSummary[] = listManagedProfiles();
  const managedAliases = new Set<string>(readManagedProfiles().map((p) => p.alias));
  const configFile = getSSHConfigFile();
  if (fs.existsSync(configFile)) {
    const aliases = parseSSHConfigAliases(await fs.promises.readFile(configFile, "utf8"));
    for (const alias of aliases) {
      if (managedAliases.has(alias)) continue;
      try {
        summaries.push((await resolveFromSSHConfig(alias)).summary);
      } catch (error: any) {
        summaries.push({
          alias,
          label: alias,
          host: alias,
          port: 22,
          username: "unknown",
          source: "ssh_config",
          available: false,
          error: error?.message || "Could not resolve profile",
        });
      }
    }
  }
  if (hasLegacyConfig()) summaries.push(resolveLegacyProfile().summary);
  return summaries;
}

/**
 * Open (and immediately close) an SSH session against a raw config so callers
 * can verify credentials without keeping a connection around. Resolves when the
 * handshake succeeds, rejects with a friendly error otherwise.
 */
export async function testSSHConfig(config: SSHConfig, timeoutMs = 8_000): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const ssh = new SSHClient();
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try { ssh.end(); } catch { /* ignore */ }
      reject(new Error(`Connection timed out after ${timeoutMs / 1000}s`));
    }, timeoutMs);
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { ssh.end(); } catch { /* ignore */ }
      error ? reject(error) : resolve();
    };
    ssh.on("ready", () => finish());
    ssh.on("error", (error) => finish(error));
    ssh.on("keyboard-interactive", (_name, _instructions, _language, prompts, callback) => {
      callback(prompts.map(() => config.password || ""));
    });
    ssh.connect({ ...config, readyTimeout: timeoutMs });
  });
}

export async function testSSHProfile(alias: string, timeoutMs = 8_000): Promise<SSHProfileSummary> {
  const resolved = await resolveSSHProfile(alias);
  await testSSHConfig(resolved.config, timeoutMs);
  return resolved.summary;
}

/**
 * Test a managed-profile form payload BEFORE it is saved — validates the fields
 * the same way addManagedProfile does, but requires an auth method so the probe
 * can actually authenticate.
 */
export async function testManagedSSHProfileInput(
  input: Record<string, unknown>,
  timeoutMs = 8_000,
): Promise<SSHProfileSummary> {
  const profile = normalizeManagedInput(input);
  await testSSHConfig(managedProfileToConfig(profile), timeoutMs);
  return managedProfileToSummary(profile);
}

export { LEGACY_PROFILE_ALIAS };
