import { ToolDefinition } from "../types";
import { readEnvFile } from "../../utils/envWriter";
import { assertTargetIsExternal, blockedTargetResult } from "../../utils/ssrfGuard";

const MAX_RESPONSE_LENGTH = 8000;

function normalizeHttpRequest(raw: string): string {
  let normalized = raw.replace(/\r?\n/g, "\r\n");

  const headerBodySplit = normalized.indexOf("\r\n\r\n");
  if (headerBodySplit !== -1) {
    const headersPart = normalized.substring(0, headerBodySplit);
    const bodyPart = normalized.substring(headerBodySplit + 4);
    const bodyLength = Buffer.byteLength(bodyPart, "utf-8");

    normalized =
      headersPart.replace(
        /Content-Length:\s*\d+/i,
        `Content-Length: ${bodyLength}`
      ) +
      "\r\n\r\n" +
      bodyPart;
  }

  return normalized;
}

const sendToBurp: ToolDefinition = {
  name: "send_to_burp_repeater",
  description:
    "Send an HTTP request through Burp Suite's Repeater and return the full HTTP response. " +
    "Use this for precision testing of web endpoints — crafting custom payloads, modifying " +
    "headers, testing authentication bypasses, logical flaws, parameter tampering, injection " +
    "payloads (SQLi, XSS, IDOR, SSRF, etc.), and analyzing the raw response in detail. " +
    "Each request is sent individually through Burp's HTTP engine which handles TLS, HTTP/2, " +
    "and connection management. Provide a complete raw HTTP request (request line + headers + body). " +
    "The tool automatically normalizes line endings and recalculates Content-Length.",
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
        description:
          "Full raw HTTP request including request line, headers, and body. " +
          "Example: 'GET /api/users HTTP/1.1\\r\\nHost: example.com\\r\\n\\r\\n'",
      },
    },
    required: ["host", "raw_request"],
  },
  timeoutMs: 60_000,
  async execute(args, _ctx) {
    const { host, raw_request } = args;
    const port = args.port ?? 443;
    const secure = args.secure ?? true;

    if (!host) return { output: "Error: host is required", exitCode: 1 };
    if (!raw_request) return { output: "Error: raw_request is required", exitCode: 1 };

    // SSRF guard: Burp will forward the request on our behalf, so the host
    // must resolve to a public address only.
    try {
      await assertTargetIsExternal(host);
    } catch {
      return blockedTargetResult();
    }

    const env = readEnvFile();
    const connHost = env.BURP_RPC_HOST;
    const connPort = parseInt(env.BURP_RPC_PORT || "50051", 10);

    if (!connHost) {
      return {
        output:
          "Error: Burp RPC is not configured. " +
          "Set BURP_RPC_HOST and BURP_RPC_PORT in Settings > Burp Suite.",
        exitCode: 1,
      };
    }

    try {
      const normalizedRequest = normalizeHttpRequest(raw_request);

      const { BurpClient, decodeBase64Body } = await import("burp-rpc");
      const burp = new BurpClient({ host: connHost, port: connPort });

      try {
        const result = await burp.http.sendRawRequest(
          host,
          port,
          secure,
          normalizedRequest,
        );

        if (!result.response?.rawBytesBase64) {
          return {
            output: "No response received from target. The server may have closed the connection.",
            exitCode: 1,
          };
        }

        let rawResponse = decodeBase64Body(result.response.rawBytesBase64);

        if (rawResponse.length > MAX_RESPONSE_LENGTH) {
          rawResponse =
            rawResponse.substring(0, MAX_RESPONSE_LENGTH) +
            `\n\n... [response truncated — ${rawResponse.length} bytes total]`;
        }

        return { output: rawResponse, exitCode: 0 };
      } finally {
        burp.close();
      }
    } catch (err: any) {
      if (err?.code === 14) {
        return {
          output:
            "Error: Could not connect to Burp Suite. " +
            "Make sure the Burp RPC extension is loaded and running on " +
            `${connHost}:${connPort}.`,
          exitCode: 1,
        };
      }
      return { output: `Error sending request through Burp: ${err.message}`, exitCode: 1 };
    }
  },
};

export default sendToBurp;
