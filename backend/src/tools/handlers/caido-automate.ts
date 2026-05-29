import { ToolDefinition } from "../types";
import {
  createCaidoAutomateSession,
  getCaidoConnection,
  isCaidoConfigured,
} from "../../services/caido.client";

const caidoAutomate: ToolDefinition = {
  name: "send_to_caido_automate",
  description:
    "Send a raw HTTP request to Caido Automate, optionally configuring simple-list payloads/placeholders and starting the Automate task.",
  parameters: {
    type: "object",
    properties: {
      host: { type: "string", description: "Target hostname." },
      port: { type: "number", description: "Target port (default 443)." },
      secure: { type: "boolean", description: "Use TLS/HTTPS (default true)." },
      raw_request: { type: "string", description: "Full raw HTTP request." },
      tab_name: { type: "string", description: "Optional Automate tab name." },
      placeholders: {
        type: "array",
        description:
          "Optional raw request byte ranges to fuzz. Each item uses zero-based start/end indexes.",
        items: {
          type: "object",
          properties: {
            start: { type: "number" },
            end: { type: "number" },
          },
          required: ["start", "end"],
        },
      },
      payloads: {
        type: "array",
        description: "Optional simple-list payload strings for Automate.",
        items: { type: "string" },
      },
      strategy: {
        type: "string",
        enum: ["SEQUENTIAL", "ALL", "PARALLEL", "MATRIX"],
        description: "Automate payload strategy. Defaults to SEQUENTIAL.",
      },
      run: {
        type: "boolean",
        description:
          "Start the Automate task immediately after creating/configuring the session.",
      },
    },
    required: ["host", "raw_request"],
  },
  timeoutMs: 90_000,
  async execute(args) {
    const conn = getCaidoConnection();
    if (!isCaidoConfigured(conn)) {
      return {
        output: "Error: Caido is not configured. Set CAIDO_URL and CAIDO_PAT in Settings > Caido.",
        exitCode: 1,
      };
    }

    if (!args.host) return { output: "Error: host is required", exitCode: 1 };
    if (!args.raw_request) return { output: "Error: raw_request is required", exitCode: 1 };

    try {
      const strategy = ["SEQUENTIAL", "ALL", "PARALLEL", "MATRIX"].includes(args.strategy)
        ? args.strategy
        : undefined;
      const placeholders = Array.isArray(args.placeholders)
        ? args.placeholders
            .map((placeholder: any) => ({
              start: Number(placeholder?.start),
              end: Number(placeholder?.end),
            }))
            .filter((placeholder: any) => Number.isFinite(placeholder.start) && Number.isFinite(placeholder.end))
        : undefined;

      const session = await createCaidoAutomateSession({
        host: String(args.host),
        port: args.port ?? 443,
        secure: args.secure ?? true,
        rawRequest: String(args.raw_request),
        tabName: args.tab_name ? String(args.tab_name) : undefined,
        placeholders,
        payloads: Array.isArray(args.payloads) ? args.payloads.map(String) : undefined,
        strategy,
        run: args.run === true,
      });

      const lines = [
        session.task ? "Started Caido Automate task." : "Created Caido Automate session.",
        `Session ID: ${session.sessionId}`,
      ];
      if (session.name) lines.push(`Name: ${session.name}`);
      if (session.task?.id) lines.push(`Task ID: ${session.task.id}`);
      if (session.task?.entry?.id) lines.push(`Entry ID: ${session.task.entry.id}`);

      return { output: lines.join("\n"), exitCode: 0 };
    } catch (err: any) {
      return { output: `Error sending request to Caido Automate: ${err.message}`, exitCode: 1 };
    }
  },
};

export default caidoAutomate;
