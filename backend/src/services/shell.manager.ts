import { Client as SSHClient } from "ssh2";
import { ChildProcessWithoutNullStreams, spawn } from "child_process";
import { EventEmitter } from "events";
import { v4 as uuidv4 } from "uuid";
import { ShellType, ShellCreator } from "../models/Sessions/Sessions.model";
import {
  expandLocalFolder,
  ResolvedWorkHost,
  shellFolderExpression,
  spawnLocalShell,
} from "./work-host.service";

const RING_BUFFER_MAX = 256 * 1024; // 256KB per shell
const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 30_000;
const ANSI_REGEX = /\x1B\[[0-?]*[-\[\]#-~]/g;

/**
 * Wrap a command in a login shell so PATH additions from .zprofile/.bashrc
 * (brew, apt-installed tooling, language version managers) are available.
 *
 * $SHELL must not be used bare: it is routinely unset in containers and over
 * non-interactive SSH, and the wrapper then degrades to ` -l -c '…'`, so the
 * shell tries to execute "-l" as a program and every command fails with
 * "/bin/sh: 1: -l: not found". Fall back to bash, then sh, when it is empty.
 */
export function escapeForLoginShell(command: string): string {
  const escaped = command.replace(/'/g, "'\\''");
  return `"\${SHELL:-$(command -v bash || command -v sh)}" -l -c '${escaped}'`;
}

/**
 * Command that opens a persistent interactive login shell on a remote work
 * host, rooted in the workspace folder.
 *
 * `$SHELL` must not be used bare here either: it is routinely unset over
 * non-interactive SSH and in containers, and `exec $SHELL -l` would collapse
 * to `exec -l` — the remote shell tries to run "-l" as a program, the channel
 * closes instantly, and the terminal appears blank (no prompt, no error).
 * Fall back to bash, then sh, when it is empty — same policy as
 * escapeForLoginShell().
 */
export function buildPersistentShellCommand(folder: string): string {
  return `mkdir -p -- ${folder} && cd -- ${folder} && exec "\${SHELL:-$(command -v bash || command -v sh)}" -l`;
}

export type ShellPurpose = "exploit-box" | "reverse-shell" | "listener";

export interface ShellInfo {
  shellId: string;
  label: string;
  type: ShellType;
  status: "active" | "closed";
  createdBy: ShellCreator;
  subagentId?: string;
  purpose: ShellPurpose;
  createdAt: Date;
  bufferLength: number;
}

export interface ShellSpawnOptions {
  label: string;
  type?: ShellType;
  createdBy?: ShellCreator;
  subagentId?: string;
  purpose?: ShellPurpose;
}

class RingBuffer {
  private buffer: string = "";
  private maxSize: number;
  private _offset: number = 0;

  constructor(maxSize: number = RING_BUFFER_MAX) {
    this.maxSize = maxSize;
  }

  append(data: string): void {
    this.buffer += data;
    if (this.buffer.length > this.maxSize) {
      const excess = this.buffer.length - this.maxSize;
      this.buffer = this.buffer.slice(excess);
      this._offset += excess;
    }
  }

  read(fromOffset?: number): { data: string; offset: number } {
    const start = fromOffset ?? this._offset;
    const relativeStart = Math.max(0, start - this._offset);
    return {
      data: this.buffer.slice(relativeStart),
      offset: this._offset + this.buffer.length,
    };
  }

  get currentOffset(): number {
    return this._offset + this.buffer.length;
  }

  get length(): number {
    return this.buffer.length;
  }

  clear(): void {
    this.buffer = "";
    this._offset = 0;
  }
}

interface ManagedShell {
  shellId: string;
  label: string;
  type: ShellType;
  status: "active" | "closed";
  channel: RuntimeChannel | null;
  outputBuffer: RingBuffer;
  createdBy: ShellCreator;
  subagentId?: string;
  purpose: ShellPurpose;
  createdAt: Date;
}

interface RuntimeChannel extends EventEmitter {
  stderr?: EventEmitter;
  write(data: string): unknown;
  end(): unknown;
  destroy(): unknown;
  setWindow?(rows: number, cols: number, height: number, width: number): unknown;
}

function localChannel(child: ChildProcessWithoutNullStreams): RuntimeChannel {
  const channel = child.stdout as unknown as RuntimeChannel;
  channel.stderr = child.stderr;
  channel.write = (data: string) => child.stdin.write(data);
  channel.end = () => child.stdin.end();
  channel.destroy = () => child.kill("SIGTERM");
  child.on("close", (code) => channel.emit("close", code));
  child.on("error", (error) => channel.emit("error", error));
  return channel;
}

export class ShellManager extends EventEmitter {
  private sessionId: string;
  private sshConnection: SSHClient | null = null;
  private target?: ResolvedWorkHost;
  private readonly loadTarget: () => Promise<ResolvedWorkHost>;
  private shells: Map<string, ManagedShell> = new Map();
  private connected: boolean = false;
  private connecting: boolean = false;
  private destroyed: boolean = false;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private reconnectAttempt: number = 0;
  /** In-flight connect attempt shared by concurrent callers (spawn + HTTP reconnect). */
  private connectPromise: Promise<void> | null = null;

  constructor(sessionId: string, loadTarget: () => Promise<ResolvedWorkHost>) {
    super();
    this.sessionId = sessionId;
    this.loadTarget = loadTarget;
  }

  get isConnected(): boolean {
    return this.connected;
  }

  get sessionIdValue(): string {
    return this.sessionId;
  }

  get remoteWorkspaceDir(): string {
    return this.target?.workFolder || "";
  }

  async connect(): Promise<void> {
    if (this.destroyed) throw new Error("Shell manager is destroyed");
    if (this.connected) return;
    // Concurrent callers (WS spawn_shell + HTTP reconnect) share the same
    // in-flight attempt instead of racing. Without this, spawnShell could
    // proceed while the SSH handshake is still running and fail spuriously
    // with "SSH not connected" — a classic silent/no-feedback failure.
    const inFlight = this.connectPromise;
    if (inFlight) return inFlight;

    this.connecting = true;
    const attempt = this.doConnect().finally(() => {
      this.connecting = false;
      this.connectPromise = null;
    });
    this.connectPromise = attempt;
    return attempt;
  }

  private async doConnect(): Promise<void> {
    try {
      this.target = await this.loadTarget();
    } catch (error: any) {
      this.emit("connection_status", {
        sshConnected: false,
        error: error?.message || "Could not resolve workspace work host",
      });
      throw error;
    }

    if (this.target.kind === "local") {
      await import("fs").then(({ promises }) => promises.mkdir(expandLocalFolder(this.target!.workFolder), { recursive: true }));
      this.connected = true;
      this.reconnectAttempt = 0;
      console.log(`[ShellManager:${this.sessionId}] Local work host ready (folder=${this.target.workFolder})`);
      this.emit("connection_status", { sshConnected: false, hostConnected: true, kind: "local" });
      return;
    }

    const ssh = new SSHClient();
    const timeoutMs = Number.parseInt(
      process.env.SSH_CONNECT_TIMEOUT_MS || "15000",
      10,
    ) || 15_000;

    await new Promise<void>((resolve, reject) => {
      let settled = false;
      let timer: NodeJS.Timeout | null = null;

      const finish = (error?: Error) => {
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
        error ? reject(error) : resolve();
      };

      // Hard bound on the handshake: ssh2's own readyTimeout covers the TCP +
      // key-exchange phase, but a server that keeps demanding auth methods (or
      // a blackholed network) could otherwise stall this forever. A bounded
      // connect always settles, so callers always get feedback.
      timer = setTimeout(() => {
        if (settled) return;
        try { ssh.end(); } catch { /* ignore */ }
        finish(new Error(`SSH connection timed out after ${Math.round(timeoutMs / 1000)}s`));
      }, timeoutMs);

      ssh.on("ready", () => {
        this.sshConnection = ssh;
        this.connected = true;
        this.reconnectAttempt = 0;
        console.log(`[ShellManager:${this.sessionId}] SSH connected`);
        ssh.exec(`mkdir -p -- ${shellFolderExpression(this.target!.workFolder)}`, (err) => {
          if (err) console.warn(`[ShellManager:${this.sessionId}] Failed to create workspace dir:`, err.message);
        });
        this.emit("connection_status", { sshConnected: true, hostConnected: true, kind: "ssh" });
        finish();
      });

      ssh.on("error", (err: Error) => {
        console.error(`[ShellManager:${this.sessionId}] SSH error:`, err.message);
        if (!settled) {
          finish(err);
        } else if (this.connected && this.sshConnection === ssh) {
          this.handleDisconnect();
        }
      });

      ssh.on("close", () => {
        if (this.connected && this.sshConnection === ssh) {
          this.handleDisconnect();
        }
      });

      ssh.on("end", () => {
        if (this.connected && this.sshConnection === ssh) {
          this.handleDisconnect();
        }
      });

      ssh.on("keyboard-interactive", (_name: string, _instructions: string, _instructionsLang: string, prompts: any[], respond: (responses: string[]) => void) => {
        respond(prompts.map(() => this.target?.sshConfig?.password || ""));
      });

      ssh.connect({ ...this.target!.sshConfig!, readyTimeout: timeoutMs });
    }).catch((error: Error) => {
      // Ensure a failed handshake is always surfaced through connection_status
      // (the UI renders it next to the "SSH Connect" button) and never leaves a
      // half-open client attached.
      try { ssh.end(); } catch { /* ignore */ }
      this.emit("connection_status", { sshConnected: false, error: error.message });
      throw error;
    });
  }

  async reconnect(): Promise<void> {
    // Let any in-flight attempt settle (it has a hard timeout) before tearing
    // down, so two clients never race for the same connection state.
    if (this.connectPromise) {
      try { await this.connectPromise; } catch { /* failed attempt — retry fresh */ }
    }
    if (this.sshConnection) {
      try { this.sshConnection.end(); } catch { /* ignore */ }
      this.sshConnection = null;
    }
    this.connected = false;
    this.connecting = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.reconnectAttempt = 0;
    await this.connect();
  }

  private handleDisconnect(): void {
    if (this.target?.kind === "local") return;
    this.connected = false;
    this.sshConnection = null;

    for (const shell of this.shells.values()) {
      if (shell.status === "active") {
        shell.channel = null;
        shell.outputBuffer.append("\r\n[SSH connection lost]\r\n");
        this.emit("shell_output", { shellId: shell.shellId, data: "\r\n[SSH connection lost]\r\n", offset: shell.outputBuffer.currentOffset });
      }
    }

    this.emit("connection_status", { sshConnected: false, error: "Connection lost" });

    if (!this.destroyed) {
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer || this.destroyed) return;

    const delay = Math.min(
      RECONNECT_BASE_MS * Math.pow(2, this.reconnectAttempt),
      RECONNECT_MAX_MS,
    );
    this.reconnectAttempt++;

    console.log(`[ShellManager:${this.sessionId}] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempt})`);

    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      try {
        await this.connect();
        await this.reopenShells();
      } catch {
        if (!this.destroyed) {
          this.scheduleReconnect();
        }
      }
    }, delay);
  }

  private async reopenShells(): Promise<void> {
    for (const shell of this.shells.values()) {
      if (shell.status === "active" && !shell.channel) {
        try {
          await this.openChannel(shell);
          shell.outputBuffer.append("\r\n[SSH reconnected]\r\n");
          this.emit("shell_output", { shellId: shell.shellId, data: "\r\n[SSH reconnected]\r\n", offset: shell.outputBuffer.currentOffset });
        } catch (err) {
          console.error(`[ShellManager:${this.sessionId}] Failed to reopen shell ${shell.shellId}:`, err);
        }
      }
    }
  }

  private openChannel(shell: ManagedShell): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.target?.kind === "local") {
        const child = spawnLocalShell(this.target.workFolder, shell.type === "pty");
        this.wireChannel(shell, localChannel(child));
        console.log(`[ShellManager:${this.sessionId}] Spawned local shell ${shell.shellId} (label=${shell.label}, cwd=${expandLocalFolder(this.target.workFolder)})`);
        resolve();
        return;
      }
      if (!this.sshConnection) {
        return reject(new Error("SSH not connected"));
      }

      const folder = shellFolderExpression(this.target!.workFolder);
      const cmd = buildPersistentShellCommand(folder);
      console.log(`[ShellManager:${this.sessionId}] Opening shell ${shell.shellId} (label=${shell.label}) over SSH — exec: ${cmd}`);

      // If the remote command fails before a shell is up (e.g. the fallback
      // shell was missing, mkdir failed, $SHELL unset), surface the real error
      // into the terminal buffer instead of leaving a blank screen that looks
      // like a hang.
      const finish = (err: Error | undefined, channel: RuntimeChannel | null) => {
        if (err) {
          const msg = `\r\n[Failed to start shell: ${err.message}]\r\n`;
          shell.outputBuffer.append(msg);
          this.emit("shell_output", {
            shellId: shell.shellId,
            data: msg,
            offset: shell.outputBuffer.currentOffset,
          });
          console.error(`[ShellManager:${this.sessionId}] Failed to start shell ${shell.shellId}:`, err.message);
          return reject(err);
        }
        if (!channel) {
          return reject(new Error("No channel returned by SSH server"));
        }
        this.wireChannel(shell, channel);
        console.log(`[ShellManager:${this.sessionId}] Shell ${shell.shellId} channel opened`);
        resolve();
      };

      if (shell.type === "pty") {
        this.sshConnection.exec(
          cmd,
          { pty: { term: "xterm-256color", cols: 200, rows: 50 } },
          (err, channel) => finish(err, channel),
        );
      } else {
        this.sshConnection.exec(cmd, (err, channel) => finish(err, channel));
      }
    });
  }

  private wireChannel(shell: ManagedShell, channel: RuntimeChannel): void {
    shell.channel = channel;

    channel.on("data", (data: Buffer) => {
      const text = data.toString();
      shell.outputBuffer.append(text);
      this.emit("shell_output", {
        shellId: shell.shellId,
        data: text,
        offset: shell.outputBuffer.currentOffset,
      });
    });

    channel.stderr?.on("data", (data: Buffer) => {
      const text = data.toString();
      shell.outputBuffer.append(text);
      this.emit("shell_output", {
        shellId: shell.shellId,
        data: text,
        offset: shell.outputBuffer.currentOffset,
      });
    });

    channel.on("close", (code?: number | null) => {
      console.log(`[ShellManager:${this.sessionId}] Shell ${shell.shellId} channel closed (code=${code ?? "n/a"})`);
      if (shell.status === "active" && !this.destroyed) {
        shell.channel = null;
        shell.outputBuffer.append("\r\n[Shell closed]\r\n");
        this.emit("shell_output", { shellId: shell.shellId, data: "\r\n[Shell closed]\r\n", offset: shell.outputBuffer.currentOffset });
        shell.status = "closed";
        this.emit("shell_closed", { shellId: shell.shellId });
      }
    });
  }

  async spawnShell(opts: ShellSpawnOptions): Promise<string> {
    if (!this.connected) {
      await this.connect();
    }

    const shellId = `sh_${uuidv4().slice(0, 8)}`;
    const purpose = opts.purpose ?? "exploit-box";
    const shell: ManagedShell = {
      shellId,
      label: opts.label,
      type: opts.type ?? "pty",
      status: "active",
      channel: null,
      outputBuffer: new RingBuffer(),
      createdBy: opts.createdBy ?? "agent",
      subagentId: opts.subagentId,
      purpose,
      createdAt: new Date(),
    };

    this.shells.set(shellId, shell);
    try {
      await this.openChannel(shell);
    } catch (err: any) {
      // Don't leave a stuck "active" tab behind when the channel failed to
      // open — the socket error event already tells the user why.
      console.error(`[ShellManager:${this.sessionId}] spawnShell failed (label=${shell.label}):`, err?.message ?? err);
      shell.status = "closed";
      this.shells.delete(shellId);
      this.emit("shell_closed", { shellId });
      throw err;
    }

    this.emit("shell_created", {
      shellId,
      label: shell.label,
      type: shell.type,
      createdBy: shell.createdBy,
      subagentId: shell.subagentId,
      purpose: shell.purpose,
    });

    return shellId;
  }

  async writeToShell(shellId: string, data: string): Promise<void> {
    const shell = this.shells.get(shellId);
    if (!shell || shell.status !== "active") {
      throw new Error(`Shell ${shellId} not found or closed`);
    }
    if (!shell.channel) {
      throw new Error(`Shell ${shellId} has no active channel (SSH disconnected?)`);
    }
    shell.channel.write(data);
  }

  resizeShell(shellId: string, cols: number, rows: number): void {
    const shell = this.shells.get(shellId);
    if (!shell || shell.status !== "active" || !shell.channel) return;
    try {
      shell.channel.setWindow?.(rows, cols, 0, 0);
    } catch {
      // channel may be closing
    }
  }

  async execInShell(
    command: string,
    timeoutMs: number = 300_000,
    onChunk?: (chunk: string) => void,
    abortSignal?: AbortSignal,
  ): Promise<{ output: string; exitCode: number }> {
    if (!this.connected) {
      await this.connect();
    }

    return new Promise((resolve, reject) => {
      let output = "";
      let exitCode = 0;
      let timer: NodeJS.Timeout | null = null;
      let resolved = false;

      const finish = (out: string, code: number) => {
        if (resolved) return;
        resolved = true;
        if (timer) clearTimeout(timer);
        resolve({ output: out, exitCode: code });
      };

      const onAbort = () => {
        if (resolved) return;
        finish(output + "\n[ABORTED: command terminated by user]", 130);
      };

      if (abortSignal?.aborted) {
        finish("", 130);
        return;
      }
      abortSignal?.addEventListener("abort", onAbort);

      const folder = this.target!.kind === "local"
        ? expandLocalFolder(this.target!.workFolder)
        : this.target!.workFolder;
      const folderExpression = this.target!.kind === "local"
        ? `'${folder.replace(/'/g, `'\\''`)}'`
        : shellFolderExpression(folder);
      const wrappedCommand = `mkdir -p -- ${folderExpression} && cd -- ${folderExpression} && ${escapeForLoginShell(command)}`;

      if (this.target!.kind === "local") {
        const child = spawn("/bin/sh", ["-lc", wrappedCommand], {
          cwd: folder,
          env: process.env,
          stdio: ["ignore", "pipe", "pipe"],
        });
        const onData = (data: Buffer) => {
          const text = data.toString();
          output += text;
          onChunk?.(text);
        };
        child.stdout.on("data", onData);
        child.stderr.on("data", onData);
        child.on("error", reject);
        child.on("close", (code) => {
          abortSignal?.removeEventListener("abort", onAbort);
          finish(output, code ?? 0);
        });
        abortSignal?.addEventListener("abort", () => child.kill("SIGTERM"), { once: true });
        if (timeoutMs > 0) {
          timer = setTimeout(() => {
            child.kill("SIGTERM");
            finish(output + `\n[TIMEOUT: command exceeded ${Math.round(timeoutMs / 1000)}s limit]`, 124);
          }, timeoutMs);
        }
        return;
      }

      if (!this.sshConnection) return reject(new Error("SSH not connected"));
      this.sshConnection.exec(wrappedCommand, (err, stream) => {
        if (err) {
          abortSignal?.removeEventListener("abort", onAbort);
          return reject(err);
        }

        if (timeoutMs > 0) {
          timer = setTimeout(() => {
            stream.destroy();
            abortSignal?.removeEventListener("abort", onAbort);
            finish(output + `\n[TIMEOUT: command exceeded ${Math.round(timeoutMs / 1000)}s limit]`, 124);
          }, timeoutMs);
        }

        stream.on("data", (data: Buffer) => {
          const text = data.toString();
          output += text;
          onChunk?.(text);
        });

        stream.stderr.on("data", (data: Buffer) => {
          const text = data.toString();
          output += text;
          onChunk?.(text);
        });

        stream.on("close", (code: number | null) => {
          abortSignal?.removeEventListener("abort", onAbort);
          exitCode = code ?? 0;
          finish(output, exitCode);
        });
      });
    });
  }

  readOutput(shellId: string, fromOffset?: number): { data: string; offset: number } {
    const shell = this.shells.get(shellId);
    if (!shell) {
      throw new Error(`Shell ${shellId} not found`);
    }
    return shell.outputBuffer.read(fromOffset);
  }

  async closeShell(shellId: string): Promise<void> {
    const shell = this.shells.get(shellId);
    if (!shell) return;

    if (shell.channel) {
      shell.channel.end();
      shell.channel.destroy();
      shell.channel = null;
    }

    shell.status = "closed";
    this.emit("shell_closed", { shellId });
  }

  getShellList(): ShellInfo[] {
    return Array.from(this.shells.values()).map((s) => ({
      shellId: s.shellId,
      label: s.label,
      type: s.type,
      status: s.status,
      createdBy: s.createdBy,
      subagentId: s.subagentId,
      purpose: s.purpose,
      createdAt: s.createdAt,
      bufferLength: s.outputBuffer.length,
    }));
  }

  getActiveShells(): ShellInfo[] {
    return this.getShellList().filter((s) => s.status === "active");
  }

  hasShell(shellId: string): boolean {
    return this.shells.has(shellId);
  }

  getShell(shellId: string): ShellInfo | undefined {
    const s = this.shells.get(shellId);
    if (!s) return undefined;
    return {
      shellId: s.shellId,
      label: s.label,
      type: s.type,
      status: s.status,
      createdBy: s.createdBy,
      subagentId: s.subagentId,
      purpose: s.purpose,
      createdAt: s.createdAt,
      bufferLength: s.outputBuffer.length,
    };
  }

  cleanOutput(output: string): string {
    return output.replace(ANSI_REGEX, "").trim();
  }

  async destroy(): Promise<void> {
    this.destroyed = true;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    for (const shell of this.shells.values()) {
      if (shell.channel) {
        shell.channel.end();
        shell.channel.destroy();
      }
      shell.status = "closed";
    }

    if (this.sshConnection) {
      this.sshConnection.end();
      this.sshConnection = null;
    }

    this.connected = false;
    this.shells.clear();
    this.removeAllListeners();
    console.log(`[ShellManager:${this.sessionId}] Destroyed`);
  }
}
