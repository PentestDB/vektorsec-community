import { ToolDefinition } from "../types";
import {
  getCaidoConnection,
  getCaidoInterceptState,
  isCaidoConfigured,
  setCaidoInterceptEnabled,
} from "../../services/caido.client";

const caidoInterceptControl: ToolDefinition = {
  name: "caido_intercept_control",
  description: "Read or toggle proxy interception for the configured integration.",
  parameters: {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: ["status", "enable", "disable"],
        description: "Intercept action to perform.",
      },
    },
    required: ["action"],
  },
  async execute(args) {
    const conn = getCaidoConnection();
    if (!isCaidoConfigured(conn)) {
      return {
        output: "Error: integration is not configured. Set CAIDO_URL and CAIDO_PAT in Settings.",
        exitCode: 1,
      };
    }

    try {
      const action = String(args.action || "status");
      if (!["status", "enable", "disable"].includes(action)) {
        return { output: "Error: action must be status, enable, or disable", exitCode: 1 };
      }

      const state =
        action === "enable"
          ? await setCaidoInterceptEnabled(true)
          : action === "disable"
            ? await setCaidoInterceptEnabled(false)
            : await getCaidoInterceptState();

      return {
        output: [
          `Intercept status: ${state.status}`,
          `Effective request interception: ${state.enabled ? "enabled" : "disabled"}`,
          `Request option: ${state.options?.request?.enabled ? "enabled" : "disabled"}`,
          `Response option: ${state.options?.response?.enabled ? "enabled" : "disabled"}`,
          `WebSocket stream option: ${state.options?.streamWs?.enabled ? "enabled" : "disabled"}`,
        ].join("\n"),
        exitCode: 0,
      };
    } catch (err: any) {
      return { output: `Error controlling Intercept: ${err.message}`, exitCode: 1 };
    }
  },
};

export default caidoInterceptControl;
