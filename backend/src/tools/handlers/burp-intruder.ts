import { ToolDefinition } from "../types";
import { readEnvFile } from "../../utils/envWriter";

const burpIntruder: ToolDefinition = {
  name: "send_to_burp_intruder",
  description:
    "Send an HTTP request to Burp Suite's Intruder for automated brute-force and payload-based testing. " +
    "Use this when you need to test many payloads against the same request — brute-forcing credentials, " +
    "fuzzing parameters with wordlists, enumerating valid IDs/tokens, or testing multiple injection " +
    "points simultaneously. Provide a raw HTTP request and optionally specify byte-offset insertion " +
    "points where Intruder will place payloads.",
  parameters: {
    type: "object",
    properties: {
      host: {
        type: "string",
        description: "Target hostname (e.g. example.com)",
      },
      port: {
        type: "number",
        description: "Target port (default 443)",
      },
      secure: {
        type: "boolean",
        description: "Use TLS/HTTPS (default true)",
      },
      raw_request: {
        type: "string",
        description: "Full raw HTTP request including request line, headers, and body.",
      },
      tab_name: {
        type: "string",
        description: "Optional name for the Intruder tab in Burp UI.",
      },
      insertion_points: {
        type: "array",
        description:
          "Byte-offset ranges in the raw request where payloads should be inserted. " +
          "Each element has start and end offsets.",
        items: {
          type: "object",
          properties: {
            start: { type: "number", description: "Start byte offset (inclusive)" },
            end: { type: "number", description: "End byte offset (exclusive)" },
          },
          required: ["start", "end"],
        },
      },
    },
    required: ["host", "raw_request"],
  },
  timeoutMs: 30_000,
  async execute(args, _ctx) {
    const { host, raw_request, tab_name } = args;
    const port = args.port ?? 443;
    const secure = args.secure ?? true;
    const insertionPoints = (args.insertion_points || []).map((p: any) => ({
      startOffset: p.start,
      endOffset: p.end,
    }));

    if (!host) return { output: "Error: host is required", exitCode: 1 };
    if (!raw_request) return { output: "Error: raw_request is required", exitCode: 1 };

    const env = readEnvFile();
    const connHost = env.BURP_RPC_HOST;
    const connPort = parseInt(env.BURP_RPC_PORT || "50051", 10);

    if (!connHost) {
      return {
        output: "Error: Burp RPC is not configured. Set BURP_RPC_HOST and BURP_RPC_PORT in Settings.",
        exitCode: 1,
      };
    }

    try {
      const { BurpClient, encodeBase64Body } = await import("burp-rpc");
      const burp = new BurpClient({ host: connHost, port: connPort });

      try {
        let normalized = raw_request.replace(/\r?\n/g, "\r\n");
        const b64 = encodeBase64Body(normalized);

        await burp.intruder.sendToIntruder(
          host,
          port,
          secure,
          b64,
          tab_name || "",
          insertionPoints
        );

        return {
          output: `Request sent to Burp Intruder for ${host}:${port}${tab_name ? ` (tab: "${tab_name}")` : ""}. ` +
            `${insertionPoints.length} insertion point(s) configured.`,
          exitCode: 0,
        };
      } finally {
        burp.close();
      }
    } catch (err: any) {
      if (err?.code === 14) {
        return {
          output: `Error: Could not connect to Burp Suite at ${connHost}:${connPort}.`,
          exitCode: 1,
        };
      }
      return { output: `Error sending to Intruder: ${err.message}`, exitCode: 1 };
    }
  },
};

export default burpIntruder;
