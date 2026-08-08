import { exec } from "child_process";
import { promisify } from "util";
import { randomUUID } from "crypto";

const execAsync = promisify(exec);

// ─── Dynamic Sandbox & Isolation Infrastructure ─────────────────────
// การรันคำสั่งหรือ Script ที่ AI เจนขึ้นมาบน Server ตรงๆ มีความเสี่ยงสูง
// (Remote Code Execution) ระบบนี้จะยิงงานเข้าไปรันใน Isolated Docker
// Container ที่จำกัด Memory/CPU/Network และถูกทำลายทิ้งทันทีที่เสร็จสิ้น

export interface SandboxConfig {
  image: string;
  memoryLimit: string; // e.g. "512m"
  cpuLimit: string; // e.g. "0.5"
  networkMode: "none" | "bridge" | "host";
  readOnlyRootFs: boolean;
  timeoutMs: number;
  maxOutputBytes: number;
  environment: Record<string, string>;
  volumes: Array<{ hostPath: string; containerPath: string; readOnly?: boolean }>;
}

export interface SandboxResult {
  success: boolean;
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
  containerId: string;
  truncated: boolean;
}

export interface SandboxExecution {
  command: string;
  workdir?: string;
  stdin?: string;
  timeoutMs?: number;
}

export function createDefaultSandboxConfig(): SandboxConfig {
  return {
    image: process.env.SANDBOX_IMAGE || "kalilinux/kali-rolling:latest",
    memoryLimit: process.env.SANDBOX_MEMORY_LIMIT || "512m",
    cpuLimit: process.env.SANDBOX_CPU_LIMIT || "0.5",
    networkMode: "bridge",
    readOnlyRootFs: true,
    timeoutMs: 300_000,
    maxOutputBytes: 1_000_000, // 1MB
    environment: {},
    volumes: [],
  };
}

// ─── Sandbox Manager ────────────────────────────────────────────────

export class SandboxManager {
  private config: SandboxConfig;
  private activeContainers = new Map<string, string>(); // containerId -> taskId

  constructor(config: SandboxConfig = createDefaultSandboxConfig()) {
    this.config = config;
  }

  // Check if Docker is available
  async isDockerAvailable(): Promise<boolean> {
    try {
      await execAsync("docker version --format '{{.Server.Version}}'");
      return true;
    } catch {
      return false;
    }
  }

  // Pull the sandbox image if not present
  async ensureImage(): Promise<void> {
    try {
      await execAsync(`docker image inspect ${this.config.image} > /dev/null 2>&1`);
    } catch {
      // Image not found, pull it
      await execAsync(`docker pull ${this.config.image}`);
    }
  }

  // Run a command inside an ephemeral Docker container
  async runCommand(
    execution: SandboxExecution,
    onOutput?: (chunk: string) => void,
  ): Promise<SandboxResult> {
    const start = Date.now();
    const containerId = `sandbox-${randomUUID().slice(0, 8)}`;

    // Build docker run command
    const dockerArgs: string[] = ["docker", "run", "--rm", "--name", containerId];

    // Resource limits
    dockerArgs.push("--memory", this.config.memoryLimit);
    dockerArgs.push("--cpus", this.config.cpuLimit);
    dockerArgs.push("--network", this.config.networkMode);
    if (this.config.readOnlyRootFs) {
      dockerArgs.push("--read-only");
    }

    // Environment variables
    for (const [key, value] of Object.entries(this.config.environment)) {
      dockerArgs.push("-e", `${key}=${value}`);
    }

    // Volumes
    for (const vol of this.config.volumes) {
      const ro = vol.readOnly ? ":ro" : "";
      dockerArgs.push("-v", `${vol.hostPath}:${vol.containerPath}${ro}`);
    }

    // Timeout
    const timeoutMs = execution.timeoutMs ?? this.config.timeoutMs;
    dockerArgs.push("--stop-timeout", String(Math.ceil(timeoutMs / 1000)));

    // Image and command
    dockerArgs.push(this.config.image);
    dockerArgs.push("/bin/bash", "-c", execution.command);

    const dockerCmd = dockerArgs.join(" ");

    try {
      this.activeContainers.set(containerId, execution.command);

      const { stdout, stderr } = await execAsync(dockerCmd, {
        timeout: timeoutMs,
        maxBuffer: this.config.maxOutputBytes,
      });

      if (onOutput) onOutput(stdout);

      const truncated = stdout.length + stderr.length > this.config.maxOutputBytes;

      return {
        success: true,
        exitCode: 0,
        stdout,
        stderr,
        durationMs: Date.now() - start,
        containerId,
        truncated,
      };
    } catch (err: any) {
      // execAsync throws on non-zero exit code
      const stdout = err.stdout ?? "";
      const stderr = err.stderr ?? "";
      const exitCode = err.code ?? 1;

      if (onOutput) onOutput(stdout + stderr);

      return {
        success: exitCode === 0,
        exitCode,
        stdout,
        stderr,
        durationMs: Date.now() - start,
        containerId,
        truncated: false,
      };
    } finally {
      this.activeContainers.delete(containerId);
      // Ensure container is removed even on timeout
      try {
        await execAsync(`docker rm -f ${containerId} > /dev/null 2>&1`);
      } catch {
        // Container already removed
      }
    }
  }

  // Kill a running container
  async killContainer(containerId: string): Promise<void> {
    try {
      await execAsync(`docker kill ${containerId} > /dev/null 2>&1`);
    } catch {
      // Container not found
    }
  }

  // Get active container count
  getActiveCount(): number {
    return this.activeContainers.size;
  }

  // Clean up all active containers (on shutdown)
  async cleanupAll(): Promise<void> {
    for (const containerId of this.activeContainers.keys()) {
      await this.killContainer(containerId);
    }
    this.activeContainers.clear();
  }
}

// ─── Singleton instance ─────────────────────────────────────────────

let sandboxInstance: SandboxManager | null = null;

export function getSandboxManager(): SandboxManager {
  if (!sandboxInstance) {
    sandboxInstance = new SandboxManager();
  }
  return sandboxInstance;
}
