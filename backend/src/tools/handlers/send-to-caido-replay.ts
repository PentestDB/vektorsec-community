import { ToolDefinition } from "../types";
import { getCaidoConnection, isCaidoConfigured, sendCaidoReplayRequest } from "../../services/caido.client";
import { assertTargetIsExternal, blockedTargetResult } from "../../utils/ssrfGuard";

const MAX_RESPONSE_LENGTH = 8000;

const sendToCaidoReplay: ToolDefinition = {
  name: "send_to_caido_replay",
  description:
    "Send an HTTP request through the configured Replay integration and return the full HTTP response. " +
    "Provide a complete raw HTTP request.",
  parameters: {
    type: "object",
    properties: {
      host: { type: "string", description: "Target hostname (e.g. example.com)" },
      port: { type: "number", description: "Target port (default 443)" },
      secure: { type: "boolean", description: "Use TLS/HTTPS (default true)" },
      raw_request: {
        type: "string",
        description: "Full raw HTTP request including request line, headers, and body.",
      },
      tab_name: { type: "string", description: "Optional Replay session name." },
    },
    required: ["host", "raw_request"],
  },
  timeoutMs: 90_000,
  async execute(args) {
    const conn = getCaidoConnection();
    if (!isCaidoConfigured(conn)) {
      return {
        output: "Error: integration is not configured. Set CAIDO_URL and CAIDO_PAT in Settings.",
        exitCode: 1,
      };
    }

    if (!args.host) return { output: "Error: host is required", exitCode: 1 };
    if (!args.raw_request) return { output: "Error: raw_request is required", exitCode: 1 };

    // SSRF guard: Replay fires the request at this host on our behalf.
    try {
      await assertTargetIsExternal(args.host);
    } catch {
      return blockedTargetResult();
    }

    try {
      const result = await sendCaidoReplayRequest({
        host: args.host,
        port: args.port ?? 443,
        secure: args.secure ?? true,
        rawRequest: args.raw_request,
        tabName: args.tab_name,
      });

      if (!result.rawResponse) {
        return {
          output: `No response received from target via Replay. Status: ${result.status || "unknown"}.`,
          exitCode: result.status === "DONE" ? 0 : 1,
        };
      }

      let rawResponse = result.rawResponse;
      if (rawResponse.length > MAX_RESPONSE_LENGTH) {
        rawResponse =
          rawResponse.substring(0, MAX_RESPONSE_LENGTH) +
          `\n\n... [response truncated — ${rawResponse.length} bytes total]`;
      }

      return { output: rawResponse, exitCode: 0 };
    } catch (err: any) {
      return { output: `Error sending request through Replay: ${err.message}`, exitCode: 1 };
    }
  },
};

export default sendToCaidoReplay;
