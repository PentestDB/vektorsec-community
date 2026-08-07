import { ToolDefinition } from "../types";
import {
  MYTHIC_NOT_CONFIGURED_MSG,
  describeMythicError,
  getTask,
  getTaskOutput,
  getTasks,
  isMythicConfigured,
} from "../../services/mythic.client";
import { clampOutput, formatTask, formatTaskList } from "../../utils/mythicFormat";

/**
 * Read-only companion to mythic_task. Kept separate so polling for results never
 * triggers a consent prompt — `requiresConsent` applies to a whole tool, not to
 * individual actions.
 */
const mythicTaskResults: ToolDefinition = {
  name: "mythic_task_results",
  description:
    "Read the status and output of tasks issued to Mythic C2 callbacks. Use this to poll long-running tasks " +
    "started with mythic_task, and to review what has already been run on a callback. Read-only. " +
    "Operates against the operator's Mythic server; all C2 session data remains in Mythic, this tool only issues API calls.",
  parameters: {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: ["output", "status", "list"],
        description:
          '"output" fetches a task\'s results; "status" checks whether it has finished; "list" shows recent tasks.',
      },
      task_display_id: {
        type: "number",
        description: 'The task display id. Required for "output" and "status".',
      },
      callback_display_id: {
        type: "number",
        description: 'For "list": limit to one callback.',
      },
      limit: {
        type: "number",
        description: 'For "list": how many recent tasks to return. Default 25, max 100.',
      },
    },
    required: ["action"],
  },
  timeoutMs: 60_000,
  async execute(args, _ctx) {
    if (!isMythicConfigured()) {
      return { output: `Error: ${MYTHIC_NOT_CONFIGURED_MSG}`, exitCode: 1 };
    }

    const action = String(args.action || "");
    try {
      if (action === "status" || action === "output") {
        const taskDisplayId = Number(args.task_display_id);
        if (!Number.isInteger(taskDisplayId)) {
          return { output: `Error: task_display_id is required for action "${action}".`, exitCode: 1 };
        }
        const task = await getTask(taskDisplayId);
        if (!task) {
          return { output: `No task with display id ${taskDisplayId} exists in Mythic.`, exitCode: 1 };
        }
        if (action === "status") {
          return { output: formatTask(task), exitCode: 0 };
        }
        const output = await getTaskOutput(taskDisplayId);
        return { output: `${formatTask(task)}\n\n${clampOutput(output)}`, exitCode: 0 };
      }

      if (action === "list") {
        const tasks = await getTasks({
          callbackDisplayId: Number.isInteger(Number(args.callback_display_id))
            ? Number(args.callback_display_id)
            : undefined,
          limit: typeof args.limit === "number" ? args.limit : undefined,
        });
        return { output: formatTaskList(tasks), exitCode: 0 };
      }

      return { output: `Error: Unknown action "${action}". Use "output", "status" or "list".`, exitCode: 1 };
    } catch (err) {
      return { output: `Error: ${describeMythicError(err)}`, exitCode: 1 };
    }
  },
};

export default mythicTaskResults;
