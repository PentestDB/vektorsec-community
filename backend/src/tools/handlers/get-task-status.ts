import { ToolDefinition } from "../types";
import { getTaskQueue } from "../../services/taskQueue";

// ─── Task Status Tool ───────────────────────────────────────────────
// ตรวจสอบสถานะของ Async Task ที่รันผ่าน Task Queue

const getTaskStatus: ToolDefinition = {
  name: "get_task_status",
  allowedRoles: ["orchestrator", "swarm_agent"],
  description:
    "Check the status of an async task that was queued with run_async_task. " +
    "Returns the current status (queued/running/completed/failed), progress percentage, " +
    "and any output collected so far. Poll this until the task completes.",
  parameters: {
    type: "object",
    properties: {
      task_id: {
        type: "string",
        description: "The task ID returned by run_async_task",
      },
      include_output: {
        type: "boolean",
        description: "Whether to include the full output (default: true)",
      },
    },
    required: ["task_id"],
  },
  timeoutMs: 10_000,
  async execute(args, ctx) {
    const { task_id, include_output = true } = args;

    if (!task_id) {
      return { output: "Error: task_id is required", exitCode: 1 };
    }

    const taskQueue = getTaskQueue();
    const task = taskQueue.getTask(task_id);

    if (!task) {
      return {
        output: `Task '${task_id}' not found. It may have been completed and cleaned up.`,
        exitCode: 1,
      };
    }

    const lines = [
      `Task ID: ${task.id}`,
      `Type: ${task.type}`,
      `Status: ${task.status.toUpperCase()}`,
      `Progress: ${task.progress}%`,
      `Priority: ${task.priority}`,
      `Created: ${task.createdAt.toISOString()}`,
    ];

    if (task.startedAt) {
      lines.push(`Started: ${task.startedAt.toISOString()}`);
    }
    if (task.completedAt) {
      lines.push(`Completed: ${task.completedAt.toISOString()}`);
    }
    if (task.error) {
      lines.push(`Error: ${task.error}`);
    }
    if (task.retryCount > 0) {
      lines.push(`Retries: ${task.retryCount}/${task.maxRetries}`);
    }

    if (include_output && task.output.length > 0) {
      lines.push("");
      lines.push("=== OUTPUT ===");
      lines.push(task.output.join("").slice(-8000)); // last 8KB
    }

    return {
      output: lines.join("\n"),
      exitCode: task.status === "failed" ? 1 : 0,
    };
  },
};

export default getTaskStatus;
