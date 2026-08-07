import { exec, spawn } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { promisify } from "util";
import { Client as SSHClient } from "ssh2";
import { EventEmitter } from "events";
import { PassThrough } from "stream";
import WorkspaceModel, { WorkHostKind } from "../models/Workspace/Workspace.model";
import SessionsModel from "../models/Sessions/Sessions.model";
import { SSHConfig } from "../utils/sshConfig";
import { resolveSSHProfile, SSHProfileSummary } from "./ssh-profile.service";

const execAsync = promisify(exec);
const DEFAULT_WORK_ROOT = process.env.WORKSPACE_DIR || "~/pentest-workspaces";

export interface ResolvedWorkHost {
  workspaceId: string;
  kind: WorkHostKind;
  workFolder: string;
  sshProfileAlias?: string;
  sshConfig?: SSHConfig;
  sshProfile?: SSHProfileSummary;
}

export interface WorkHostInput {
  kind: WorkHostKind;
  workFolder: string;
  sshProfileAlias?: string;
}

export interface CommandResult {
  stdout: string;
  stderr: string;
  code: number;
}

export interface DirectoryListing {
  homePath: string;
  currentPath: string;
  parentPath: string | null;
  directories: Array<{ name: string; path: string }>;
}

export function defaultWorkFolder(workspaceId: string): string {
  return `${DEFAULT_WORK_ROOT.replace(/\/+$/, "")}/${workspaceId}`;
}

export function validateWorkFolder(value: unknown): string {
  const folder = String(value ?? "").trim();
  if (!folder) throw new Error("Work folder is required");
  if (folder.length > 1024 || /[\0\r\n]/.test(folder)) {
    throw new Error("Work folder is invalid");
  }
  if (!(folder.startsWith("/") || folder === "~" || folder.startsWith("~/"))) {
    throw new Error("Work folder must be an absolute path or start with ~/");
  }
  return folder.replace(/\/+$/, "") || "/";
}

export function shellEscape(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

/** A shell expression for a validated path which keeps remote $HOME expansion. */
export function shellFolderExpression(folder: string): string {
  if (folder === "~") return '"$HOME"';
  if (folder.startsWith("~/")) {
    return `"$HOME"/${shellEscape(folder.slice(2))}`;
  }
  return shellEscape(folder);
}

export function expandLocalFolder(folder: string): string {
  if (folder === "~") return os.homedir();
  if (folder.startsWith("~/")) return path.join(os.homedir(), folder.slice(2));
  return folder;
}

export async function normalizeWorkHost(
  workspaceId: string,
  input: Partial<WorkHostInput>,
): Promise<WorkHostInput> {
  const kind = input.kind;
  if (kind !== "local" && kind !== "ssh") {
    throw new Error("Work host must be local or ssh");
  }
  const workFolder = validateWorkFolder(input.workFolder || defaultWorkFolder(workspaceId));
  if (kind === "local") return { kind, workFolder };

  const sshProfileAlias = String(input.sshProfileAlias || "").trim();
  if (!sshProfileAlias) throw new Error("SSH profile is required for a remote work host");
  const profile = await resolveSSHProfile(sshProfileAlias);
  if (!profile.summary.available) {
    throw new Error(profile.summary.error || "SSH profile is unavailable");
  }
  return { kind, workFolder, sshProfileAlias };
}

export async function resolveWorkspaceWorkHost(workspaceId: string): Promise<ResolvedWorkHost> {
  const workspace = await WorkspaceModel.findOne({ workspaceId, status: "active" })
    .select("workspaceId workHost")
    .lean();
  if (!workspace) throw new Error("Workspace not found");

  return resolveWorkHostRecords(
    { workspaceId },
    { workspaceId: workspace.workspaceId, workHost: workspace.workHost },
  );
}

export async function resolveWorkHostRecords(
  session: { workspaceId?: string },
  workspace: { workspaceId: string; workHost?: { kind: WorkHostKind; workFolder: string; sshProfileAlias?: string } },
  profileResolver: typeof resolveSSHProfile = resolveSSHProfile,
): Promise<ResolvedWorkHost> {
  if (!session.workspaceId || session.workspaceId !== workspace.workspaceId) {
    throw new Error("Session does not belong to the resolved workspace");
  }
  const workspaceId = workspace.workspaceId;
  const stored = workspace.workHost;
  const kind: WorkHostKind = stored?.kind || "local";
  const workFolder = validateWorkFolder(stored?.workFolder || defaultWorkFolder(workspaceId));
  if (kind === "local") return { workspaceId, kind, workFolder };

  const sshProfileAlias = stored?.sshProfileAlias;
  if (!sshProfileAlias) throw new Error("The workspace has no SSH profile selected");
  const resolved = await profileResolver(sshProfileAlias);
  return {
    workspaceId,
    kind,
    workFolder,
    sshProfileAlias,
    sshConfig: resolved.config,
    sshProfile: resolved.summary,
  };
}

export async function resolveSessionWorkHost(sessionId: string): Promise<ResolvedWorkHost> {
  const session = await SessionsModel.findOne({ sessionId, status: "active" })
    .select("workspaceId")
    .lean();
  if (!session?.workspaceId) throw new Error("Session workspace not found");
  const workspace = await WorkspaceModel.findOne({ workspaceId: session.workspaceId, status: "active" })
    .select("workspaceId workHost")
    .lean();
  if (!workspace) throw new Error("Workspace not found");
  return resolveWorkHostRecords(session, { workspaceId: workspace.workspaceId, workHost: workspace.workHost });
}

export function connectSSH(config: SSHConfig, timeoutMs = 10_000): Promise<SSHClient> {
  return new Promise((resolve, reject) => {
    const ssh = new SSHClient();
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      error ? reject(error) : resolve(ssh);
    };
    ssh.on("ready", () => finish());
    ssh.on("error", (error) => finish(error));
    ssh.on("keyboard-interactive", (_name, _instructions, _lang, prompts, done) => {
      done(prompts.map(() => config.password || ""));
    });
    ssh.connect({ ...config, readyTimeout: timeoutMs });
  });
}

export function execSSH(
  ssh: SSHClient,
  command: string,
  timeoutMs = 300_000,
): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    let settled = false;
    let timer: NodeJS.Timeout | undefined;
    const finish = (error?: Error, code = 0) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      error ? reject(error) : resolve({ stdout, stderr, code });
    };
    ssh.exec(command, (error, stream) => {
      if (error) return finish(error);
      if (timeoutMs > 0) {
        timer = setTimeout(() => {
          stream.destroy();
          finish(new Error(`Command timed out after ${timeoutMs}ms`));
        }, timeoutMs);
      }
      stream.on("data", (data: Buffer) => { stdout += data.toString(); });
      stream.stderr.on("data", (data: Buffer) => { stderr += data.toString(); });
      stream.on("close", (code: number | null) => finish(undefined, code ?? 0));
      stream.on("error", (streamError: Error) => finish(streamError));
    });
  });
}

export async function ensureWorkFolder(target: ResolvedWorkHost): Promise<void> {
  if (target.kind === "local") {
    await fs.promises.mkdir(expandLocalFolder(target.workFolder), { recursive: true });
    return;
  }
  const ssh = await connectSSH(target.sshConfig!);
  try {
    const result = await execSSH(ssh, `mkdir -p -- ${shellFolderExpression(target.workFolder)}`, 10_000);
    if (result.code !== 0) throw new Error(result.stderr || "Could not create work folder");
  } finally {
    ssh.end();
  }
}

export async function testWorkHost(target: ResolvedWorkHost): Promise<CommandResult> {
  const marker = ".pentest-copilot-write-test";
  const folder = target.kind === "local"
    ? shellEscape(expandLocalFolder(target.workFolder))
    : shellFolderExpression(target.workFolder);
  const command = `mkdir -p -- ${folder} && cd -- ${folder} && touch ${marker} && rm -f ${marker} && printf '%s' "$PWD"`;
  if (target.kind === "local") {
    const result = await execAsync(command, { shell: "/bin/sh", timeout: 10_000 });
    return { stdout: result.stdout, stderr: result.stderr, code: 0 };
  }
  const ssh = await connectSSH(target.sshConfig!, 10_000);
  try {
    return await execSSH(ssh, command, 10_000);
  } finally {
    ssh.end();
  }
}

function directoryParent(currentPath: string): string | null {
  const parent = path.posix.dirname(currentPath);
  return parent === currentPath ? null : parent;
}

/**
 * List directories on a resolved workspace host without reading file contents.
 * Paths are validated and shell-escaped before remote execution; NUL separators
 * preserve spaces and other shell-significant characters in directory names.
 */
export async function listResolvedWorkHostDirectories(
  target: ResolvedWorkHost,
  requestedPath = "~",
): Promise<DirectoryListing> {
  const folder = validateWorkFolder(requestedPath || "~");

  if (target.kind === "local") {
    const homePath = await fs.promises.realpath(os.homedir());
    const expanded = expandLocalFolder(folder);
    let currentPath: string;
    try {
      currentPath = await fs.promises.realpath(expanded);
    } catch (error: any) {
      if (error?.code === "ENOENT") throw new Error("Directory does not exist");
      throw error;
    }
    const stat = await fs.promises.stat(currentPath);
    if (!stat.isDirectory()) throw new Error("Path is not a directory");

    const entries = await fs.promises.readdir(currentPath, { withFileTypes: true });
    const directories = entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => ({ name: entry.name, path: path.join(currentPath, entry.name) }))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
    return {
      homePath,
      currentPath,
      parentPath: directoryParent(currentPath),
      directories,
    };
  }

  const ssh = await connectSSH(target.sshConfig!, 10_000);
  try {
    const expression = shellFolderExpression(folder);
    const command =
      `printf '%s\\0' "$HOME" && ` +
      `cd -- ${expression} 2>/dev/null && ` +
      `printf '%s\\0' "$(pwd -P)" && ` +
      `find . -mindepth 1 -maxdepth 1 -type d -print0 2>/dev/null`;
    const result = await execSSH(ssh, command, 15_000);
    if (result.code !== 0) throw new Error(result.stderr.trim() || "Directory does not exist or is not accessible");
    const parts = result.stdout.split("\0");
    const homePath = parts.shift() || "/";
    const currentPath = parts.shift() || homePath;
    const directories = parts
      .filter(Boolean)
      .map((entry) => entry.startsWith("./") ? entry.slice(2) : entry)
      .filter(Boolean)
      .map((name) => ({ name, path: path.posix.join(currentPath, name) }))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
    return {
      homePath,
      currentPath,
      parentPath: directoryParent(currentPath),
      directories,
    };
  } finally {
    ssh.end();
  }
}

export async function execOnWorkHost(
  sessionId: string,
  command: string,
  timeoutMs = 300_000,
): Promise<CommandResult> {
  const target = await resolveSessionWorkHost(sessionId);
  return execOnResolvedWorkHost(target, command, timeoutMs);
}

export async function execOnWorkspaceHost(
  workspaceId: string,
  command: string,
  timeoutMs = 300_000,
): Promise<CommandResult> {
  const target = await resolveWorkspaceWorkHost(workspaceId);
  return execOnResolvedWorkHost(target, command, timeoutMs);
}

/**
 * Prepended to every command run on a work host.
 *
 * Non-interactive SSH (`ssh host 'cmd'`) does not source ~/.bashrc or ~/.profile,
 * so tools installed under ~/.local/bin or ~/go/bin are invisible to the agent even
 * though they resolve fine in an interactive login shell. That applies to anything
 * installed without root — pipx, `go install`, and the AWS CLI's `-b ~/.local/bin`
 * mode all land there. Prepending (not appending) means a user-local build wins over
 * an older system copy of the same tool.
 */
const WORK_HOST_PATH_PREFIX = 'export PATH="$HOME/.local/bin:$HOME/go/bin:$PATH"';

export async function execOnResolvedWorkHost(
  target: ResolvedWorkHost,
  command: string,
  timeoutMs = 300_000,
): Promise<CommandResult> {
  const folder = target.kind === "local"
    ? shellEscape(expandLocalFolder(target.workFolder))
    : shellFolderExpression(target.workFolder);
  const inFolder =
    `${WORK_HOST_PATH_PREFIX}; mkdir -p -- ${folder} && cd -- ${folder} && ${command}`;
  if (target.kind === "local") {
    try {
      const result = await execAsync(inFolder, {
        shell: "/bin/sh",
        timeout: timeoutMs > 0 ? timeoutMs : undefined,
        maxBuffer: 16 * 1024 * 1024,
      });
      return { stdout: result.stdout, stderr: result.stderr, code: 0 };
    } catch (error: any) {
      if (typeof error?.code === "number") {
        return { stdout: error.stdout || "", stderr: error.stderr || "", code: error.code };
      }
      throw error;
    }
  }
  const ssh = await connectSSH(target.sshConfig!);
  try {
    return await execSSH(ssh, inFolder, timeoutMs);
  } finally {
    ssh.end();
  }
}

export function spawnLocalShell(workFolder: string, interactive: boolean) {
  const folder = expandLocalFolder(workFolder);
  fs.mkdirSync(folder, { recursive: true });
  const shell = process.env.SHELL || "/bin/sh";
  return spawn(shell, interactive ? ["-l"] : [], {
    cwd: folder,
    env: { ...process.env, PWD: folder },
    stdio: ["pipe", "pipe", "pipe"],
  });
}

/**
 * Compatibility adapter for older VNC setup code that only needs the small
 * `ssh2.Client` exec/event surface. Commands still route through the selected
 * workspace host (including local), without duplicating transport decisions.
 */
export class WorkHostCommandClient extends EventEmitter {
  constructor(private readonly sessionId: string) {
    super();
  }

  connect(): this {
    queueMicrotask(() => this.emit("ready"));
    return this;
  }

  end(): this {
    return this;
  }

  exec(command: string, callback: (error: Error | undefined, stream: any) => void): void {
    const stdout = new PassThrough() as PassThrough & { stderr: PassThrough };
    stdout.stderr = new PassThrough();
    callback(undefined, stdout);
    execOnWorkHost(this.sessionId, command)
      .then((result) => {
        if (result.stdout) stdout.write(result.stdout);
        if (result.stderr) stdout.stderr.write(result.stderr);
        stdout.stderr.end();
        stdout.end();
        stdout.emit("close", result.code);
      })
      .catch((error) => {
        stdout.stderr.end();
        stdout.destroy(error);
      });
  }
}
