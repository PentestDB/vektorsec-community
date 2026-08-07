import { ToolDefinition } from "../types";
import {
  MYTHIC_NOT_CONFIGURED_MSG,
  describeMythicError,
  getCallback,
  isMythicConfigured,
  issueTask,
  waitForTaskOutput,
} from "../../services/mythic.client";
import { classifyMythicCommand } from "../../utils/mythicCommandSafety";
import { describeIntegrity, clampOutput } from "../../utils/mythicFormat";

/**
 * Issuing a task is the write half of Mythic tasking and is deliberately its own
 * tool: `requiresConsent` is tool-level, so folding the read-only status/output
 * actions in here would prompt the operator every time the agent polled for
 * results. Those live in mythic_task_results.
 */
const mythicTask: ToolDefinition = {
  name: "mythic_task",
  description:
    "Issue a command to an agent callback in the operator's Mythic C2 server. " +
    'Use "issue_and_wait" for short commands (whoami, ls, net user) and "issue" for long-running ones, then read ' +
    "results with mythic_task_results. The command and params are agent-specific — run mythic_callbacks first to " +
    "see which agent type the callback is, and pass params exactly as an operator would type them in the Mythic UI. " +
    "Operates against the operator's Mythic server; all C2 session data remains in Mythic, this tool only issues API calls.",
  parameters: {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: ["issue", "issue_and_wait"],
        description:
          '"issue" submits the task and returns immediately; "issue_and_wait" submits and polls until it finishes.',
      },
      callback_display_id: {
        type: "number",
        description: "The target callback, from mythic_callbacks list.",
      },
      command: {
        type: "string",
        description: 'The agent command name, e.g. "shell", "ls", "whoami", "execute_assembly".',
      },
      params: {
        type: "string",
        description:
          "Parameters for the command, exactly as typed in the Mythic UI. For commands taking dictionary " +
          'parameters, pass a JSON string, e.g. {"action":"start","port":7005}. Optional.',
      },
      wait_seconds: {
        type: "number",
        description: 'For "issue_and_wait": how long to poll before giving up. Default 60, max 240.',
      },
    },
    required: ["action", "callback_display_id", "command"],
  },
  // Tasking a live implant always warrants review; high-impact commands additionally
  // trip the deterministic safety hook below, which cannot be auto-approved.
  requiresConsent: true,
  timeoutMs: 300_000,
  shouldRequireConsent(args) {
    return classifyMythicCommand(String(args?.command || "")).highImpact;
  },
  async execute(args, ctx) {
    if (!isMythicConfigured()) {
      return { output: `Error: ${MYTHIC_NOT_CONFIGURED_MSG}`, exitCode: 1 };
    }

    const action = String(args.action || "");
    if (action !== "issue" && action !== "issue_and_wait") {
      return { output: `Error: Unknown action "${action}". Use "issue" or "issue_and_wait".`, exitCode: 1 };
    }

    const callbackDisplayId = Number(args.callback_display_id);
    const command = String(args.command || "").trim();
    if (!Number.isInteger(callbackDisplayId)) {
      return { output: `Error: callback_display_id is required for "${action}".`, exitCode: 1 };
    }
    if (!command) {
      return { output: `Error: command is required for "${action}".`, exitCode: 1 };
    }

    try {
      const callback = await getCallback(callbackDisplayId);
      if (!callback) {
        return {
          output: `No callback with display id ${callbackDisplayId} exists in Mythic. Run mythic_callbacks list first.`,
          exitCode: 1,
        };
      }
      if (callback.active === false) {
        return {
          output: `Callback ${callbackDisplayId} (${callback.host || "?"}) is not active — it cannot be tasked.`,
          exitCode: 1,
        };
      }

      const { taskDisplayId } = await issueTask({
        callbackDisplayId,
        command,
        params: typeof args.params === "string" ? args.params : undefined,
      });

      // Keep the agent's working memory aware of which implants it is driving.
      ctx.engagementState?.upsertImplant({
        callbackDisplayId,
        host: callback.host || "unknown",
        user: callback.user,
        domain: callback.domain,
        os: callback.os,
        integrityLevel: describeIntegrity(callback.integrity_level),
        agentType: callback.payload?.payloadtype?.name,
      });

      const principal = [callback.domain, callback.user].filter(Boolean).join("\\") || "?";
      const target = `${callback.host || "?"} as ${principal}`;
      const header =
        `Task ${taskDisplayId} on callback ${callbackDisplayId} (${target}): ` +
        `${command} ${args.params || ""}`.trimEnd();

      if (action === "issue") {
        return {
          output:
            `${header}\nSubmitted. Fetch results with mythic_task_results action "output" and ` +
            `task_display_id ${taskDisplayId}.`,
          exitCode: 0,
        };
      }

      const waitSeconds = Math.min(Math.max(Number(args.wait_seconds) || 60, 5), 240);
      const { task, output, timedOut } = await waitForTaskOutput(taskDisplayId, {
        timeoutMs: waitSeconds * 1000,
      });

      if (timedOut) {
        return {
          output:
            `${header}\nStill running after ${waitSeconds}s (status: ${task?.status || "unknown"}).\n` +
            `Partial output:\n${clampOutput(output)}\n` +
            `Poll again with mythic_task_results action "output" and task_display_id ${taskDisplayId}.`,
          exitCode: 0,
        };
      }
      return {
        output: `${header}\nStatus: ${task?.status || "completed"}\n\n${clampOutput(output)}`,
        exitCode: 0,
      };
    } catch (err) {
      return { output: `Error: ${describeMythicError(err)}`, exitCode: 1 };
    }
  },
};

export default mythicTask;
