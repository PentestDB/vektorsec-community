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
  source: "ssh_config" | "legacy_env";
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

export async function resolveSSHProfile(alias: string): Promise<ResolvedSSHProfile> {
  if (alias === LEGACY_PROFILE_ALIAS) {
    if (!hasLegacyConfig()) throw new Error("Legacy SSH environment configuration is unavailable");
    return resolveLegacyProfile();
  }
  return resolveFromSSHConfig(alias);
}

export async function listSSHProfiles(): Promise<SSHProfileSummary[]> {
  const summaries: SSHProfileSummary[] = [];
  const configFile = getSSHConfigFile();
  if (fs.existsSync(configFile)) {
    const aliases = parseSSHConfigAliases(await fs.promises.readFile(configFile, "utf8"));
    for (const alias of aliases) {
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

export async function testSSHProfile(alias: string, timeoutMs = 8_000): Promise<SSHProfileSummary> {
  const resolved = await resolveSSHProfile(alias);
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
      callback(prompts.map(() => resolved.config.password || ""));
    });
    ssh.connect({ ...resolved.config, readyTimeout: timeoutMs });
  });
  return resolved.summary;
}

export { LEGACY_PROFILE_ALIAS };
