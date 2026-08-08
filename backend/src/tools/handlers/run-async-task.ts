import { ToolDefinition } from "../types";
import { getTaskQueue } from "../../services/taskQueue";
import { getSandboxManager } from "../../services/sandbox";
import { getAuditTrail } from "../../services/auditTrail";

// ─── Async Task Execution Tool ──────────────────────────────────────
// รันงาน Pentest ที่ใช้เวลานาน (Nmap scan, FFUF brute force, SQLmap dump)
// แบบ Background ผ่าน Task Queue + Sandbox Isolation

const runAsyncTask: ToolDefinition = {
  name: "run_async_task",
  allowedRoles: ["orchestrator", "swarm_agent"],
  description:
    "Run a long-running security task (nmap scan, ffuf brute force, sqlmap, etc.) " +
    "in the background asynchronously. Returns a task ID that can be polled for status. " +
    "Tasks run in isolated sandbox containers with resource limits. " +
    "Use this for tasks that would take more than a few seconds.",
  parameters: {
    type: "object",
    properties: {
      command: {
        type: "string",
        description: "The command to run (e.g. 'nmap -sV -p- 10.10.10.10')",
      },
      task_type: {
        type: "string",
        enum: ["nmap_scan", "ffuf_bruteforce", "sqlmap_dump", "gobuster_enum", "custom"],
        description: "The type of task (used for progress tracking)",
      },
      priority: {
        type: "string",
        enum: ["low", "normal", "high", "critical"],
        description: "Task priority",
      },
      timeout_ms: {
        type: "number",
        description: "Timeout in milliseconds (default: 300000)",
      },
      target: {
        type: "string",
        description: "The target being scanned (for audit logging)",
      },
    },
    required: ["command"],
  },
  timeoutMs: 15_000,
  async execute(args, ctx) {
    const { command, task_type = "custom", priority = "normal", timeout_ms, target } = args;

    if (!command) {
      return { output: "Error: command is required", exitCode: 1 };
    }

    const taskQueue = getTaskQueue();
    const sandbox = getSandboxManager();
    const audit = getAuditTrail();

    // Check if sandbox is available
    const dockerAvailable = await sandbox.isDockerAvailable();

    // Register handler for this task type if not already registered
    if (!taskQueue.hasHandler(task_type)) {

      taskQueue.registerHandler(task_type, async (task, emit, updateProgress) => {
        const cmd = task.payload.command;

        // Run in sandbox if Docker is available, otherwise run directly
        if (dockerAvailable) {
          emit(`[sandbox] Running in isolated container...\n`);
          const result = await sandbox.runCommand(
            { command: cmd, timeoutMs: task.timeoutMs },
            (chunk) => emit(chunk),
          );
          updateProgress(100);
          return result;
        } else {
          // Fallback: run directly (with warning)
          emit(`[warning] Docker not available - running without sandbox isolation\n`);
          const { exec } = await import("child_process");
          const { promisify } = await import("util");
          const execAsync = promisify(exec);
          try {
            const { stdout, stderr } = await execAsync(cmd, { timeout: task.timeoutMs });
            emit(stdout);
            if (stderr) emit(stderr);
            updateProgress(100);
            return { stdout, stderr, exitCode: 0 };
          } catch (err: any) {
            emit(err.stdout ?? "");
            emit(err.stderr ?? "");
            updateProgress(100);
            return { stdout: err.stdout ?? "", stderr: err.stderr ?? "", exitCode: err.code ?? 1 };
          }
        }
      });
    }

    // Enqueue the task
    const task = taskQueue.enqueue({
      type: task_type,
      sessionId: ctx.sessionId,
      userId: ctx.agentId,
      payload: { command, target },
      priority: priority as any,
      timeoutMs: timeout_ms,
      tags: ["security", task_type],
    });


    // Audit log
    audit.log({
      action: "command_executed",
      severity: "warning",
      userId: ctx.agentId,
      sessionId: ctx.sessionId,
      target,
      command,
      details: { taskId: task.id, async: true, sandboxed: dockerAvailable },
    });


    return {
      output: [
        `Task queued successfully!`,
        `Task ID: ${task.id}`,
        `Type: ${task_type}`,
        `Priority: ${priority}`,
        `Sandbox: ${dockerAvailable ? "isolated Docker container" : "NOT AVAILABLE (running directly)"}`,
        ``,
        `Use the get_task_status tool with task_id=${task.id} to check progress.`,
      ].join("\n"),
      exitCode: 0,
    };
  },
};

export default runAsyncTask;
