import { Client as SSHClient, ClientChannel } from "ssh2";
import { EventEmitter } from "events";
import { v4 as uuidv4 } from "uuid";
import { buildSSHConfig, SSHConfig } from "../utils/sshConfig";
import { ShellType, ShellCreator } from "../models/Sessions/Sessions.model";

const RING_BUFFER_MAX = 256 * 1024; // 256KB per shell
const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 30_000;
const ANSI_REGEX = /\x1B\[[0-?]*[-\[\]#-~]/g;

export interface ShellInfo {
  shellId: string;
  label: string;
  type: ShellType;
  status: "active" | "closed";
  createdBy: ShellCreator;
  subagentId?: string;
  createdAt: Date;
  bufferLength: number;
}

export interface ShellSpawnOptions {
  label: string;
  type?: ShellType;
  createdBy?: ShellCreator;
  subagentId?: string;
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
  channel: ClientChannel | null;
  outputBuffer: RingBuffer;
  createdBy: ShellCreator;
  subagentId?: string;
  createdAt: Date;
}

export class ShellManager extends EventEmitter {
  private sessionId: string;
  private sshConnection: SSHClient | null = null;
  private sshConfig: SSHConfig;
  private shells: Map<string, ManagedShell> = new Map();
  private connected: boolean = false;
  private connecting: boolean = false;
  private destroyed: boolean = false;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private reconnectAttempt: number = 0;

  constructor(sessionId: string) {
    super();
    this.sessionId = sessionId;
    this.sshConfig = buildSSHConfig();
  }

  get isConnected(): boolean {
    return this.connected;
  }

  get sessionIdValue(): string {
    return this.sessionId;
  }

  async connect(): Promise<void> {
    if (this.connected || this.connecting || this.destroyed) return;
    this.connecting = true;

    return new Promise<void>((resolve, reject) => {
      const ssh = new SSHClient();

      ssh.on("ready", () => {
        this.sshConnection = ssh;
        this.connected = true;
        this.connecting = false;
        this.reconnectAttempt = 0;
        console.log(`[ShellManager:${this.sessionId}] SSH connected`);
        this.emit("connection_status", { sshConnected: true });
        resolve();
      });

      ssh.on("error", (err: Error) => {
        console.error(`[ShellManager:${this.sessionId}] SSH error:`, err.message);
        this.connecting = false;
        this.emit("connection_status", { sshConnected: false, error: err.message });
        if (!this.connected) {
          reject(err);
        } else {
          this.handleDisconnect();
        }
      });

      ssh.on("close", () => {
        if (this.connected) {
          this.handleDisconnect();
        }
      });

      ssh.on("end", () => {
        if (this.connected) {
          this.handleDisconnect();
        }
      });

      ssh.connect(this.sshConfig);
    });
  }

  private handleDisconnect(): void {
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
        this.sshConfig = buildSSHConfig();
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
      if (!this.sshConnection) {
        return reject(new Error("SSH not connected"));
      }

      if (shell.type === "pty") {
        this.sshConnection.shell({ term: "xterm-256color", cols: 200, rows: 50 }, (err, channel) => {
          if (err) return reject(err);
          this.wireChannel(shell, channel);
          resolve();
        });
      } else {
        this.sshConnection.shell((err, channel) => {
          if (err) return reject(err);
          this.wireChannel(shell, channel);
          resolve();
        });
      }
    });
  }

  private wireChannel(shell: ManagedShell, channel: ClientChannel): void {
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

    channel.on("close", () => {
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
    const shell: ManagedShell = {
      shellId,
      label: opts.label,
      type: opts.type ?? "pty",
      status: "active",
      channel: null,
      outputBuffer: new RingBuffer(),
      createdBy: opts.createdBy ?? "agent",
      subagentId: opts.subagentId,
      createdAt: new Date(),
    };

    this.shells.set(shellId, shell);
    await this.openChannel(shell);

    this.emit("shell_created", {
      shellId,
      label: shell.label,
      type: shell.type,
      createdBy: shell.createdBy,
      subagentId: shell.subagentId,
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
      if (!this.sshConnection) {
        return reject(new Error("SSH not connected"));
      }

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

      this.sshConnection.exec(command, (err, stream) => {
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
