import { ToolDefinition } from "../types";
import {
  MYTHIC_NOT_CONFIGURED_MSG,
  describeMythicError,
  getCallback,
  getCallbacks,
  isMythicConfigured,
  updateCallback,
} from "../../services/mythic.client";
import { formatCallback, formatCallbackList } from "../../utils/mythicFormat";

const mythicCallbacks: ToolDefinition = {
  name: "mythic_callbacks",
  description:
    "Inspect the agent callbacks (implants) registered with the operator's Mythic C2 server. " +
    'Use action "list" to enumerate active footholds before doing anything else — never assume a callback exists. ' +
    'Use "get" for the full detail of one callback, and "update" to annotate or lock one. ' +
    "The bracketed number in the output is the callback_display_id every other Mythic tool takes. " +
    "Operates against the operator's Mythic server; all C2 session data remains in Mythic, this tool only issues API calls.",
  parameters: {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: ["list", "get", "update"],
        description:
          '"list" enumerates callbacks, "get" fetches one by display id, "update" sets description/locked state.',
      },
      callback_display_id: {
        type: "number",
        description: 'The callback display id (the bracketed number from "list"). Required for "get" and "update".',
      },
      include_inactive: {
        type: "boolean",
        description: 'For "list": include dead/inactive callbacks too. Defaults to false (active only).',
      },
      limit: {
        type: "number",
        description: 'For "list": maximum callbacks to return. Default 50, max 200.',
      },
      description: {
        type: "string",
        description: 'For "update": a note to attach to the callback (e.g. "DC01 - domain admin context").',
      },
      locked: {
        type: "boolean",
        description: 'For "update": lock the callback so other operators cannot task it.',
      },
    },
    required: ["action"],
  },
  timeoutMs: 30_000,
  async execute(args, _ctx) {
    if (!isMythicConfigured()) {
      return { output: `Error: ${MYTHIC_NOT_CONFIGURED_MSG}`, exitCode: 1 };
    }

    const action = String(args.action || "");
    try {
      if (action === "list") {
        const callbacks = await getCallbacks({
          activeOnly: args.include_inactive !== true,
          limit: typeof args.limit === "number" ? args.limit : undefined,
        });
        return { output: formatCallbackList(callbacks), exitCode: 0 };
      }

      if (action === "get") {
        const displayId = Number(args.callback_display_id);
        if (!Number.isInteger(displayId)) {
          return { output: 'Error: callback_display_id is required for action "get".', exitCode: 1 };
        }
        const callback = await getCallback(displayId);
        if (!callback) {
          return { output: `No callback with display id ${displayId} exists in Mythic.`, exitCode: 1 };
        }
        return { output: formatCallback(callback), exitCode: 0 };
      }

      if (action === "update") {
        const displayId = Number(args.callback_display_id);
        if (!Number.isInteger(displayId)) {
          return { output: 'Error: callback_display_id is required for action "update".', exitCode: 1 };
        }
        if (args.description === undefined && args.locked === undefined) {
          return { output: 'Error: "update" needs at least one of description or locked.', exitCode: 1 };
        }
        await updateCallback({
          displayId,
          description: typeof args.description === "string" ? args.description : undefined,
          locked: typeof args.locked === "boolean" ? args.locked : undefined,
        });
        return { output: `Callback ${displayId} updated.`, exitCode: 0 };
      }

      return { output: `Error: Unknown action "${action}". Use "list", "get" or "update".`, exitCode: 1 };
    } catch (err) {
      return { output: `Error: ${describeMythicError(err)}`, exitCode: 1 };
    }
  },
};

export default mythicCallbacks;
