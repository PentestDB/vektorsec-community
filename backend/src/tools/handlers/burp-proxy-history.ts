import { ToolDefinition } from "../types";
import { readEnvFile } from "../../utils/envWriter";

const MAX_ENTRIES_RETURNED = 25;

const burpProxyHistory: ToolDefinition = {
  name: "search_burp_proxy_history",
  description:
    "Search and fetch HTTP requests/responses from Burp Suite's proxy history. " +
    "Use this to discover what requests the application makes, find interesting endpoints " +
    "to test, and retrieve full request/response details for specific entries. " +
    'Use action "search" with optional filters (search text, HTTP methods, status code range, ' +
    "hide static assets) to get a summary list of proxy history entries. " +
    'Use action "get" with an entry ID to fetch the full raw request and response for a specific entry.',
  parameters: {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: ["search", "get"],
        description:
          '"search" returns a filtered list of proxy history entries (lightweight summaries). ' +
          '"get" fetches the full request/response for a specific entry by ID.',
      },
      search: {
        type: "string",
        description: 'Free-text search across host, path, and content type. Only used with "search" action.',
      },
      methods: {
        type: "string",
        description:
          'Comma-separated HTTP methods to filter by (e.g. "GET,POST"). Only used with "search" action.',
      },
      status_min: {
        type: "number",
        description: 'Minimum status code to include (e.g. 200). Only used with "search" action.',
      },
      status_max: {
        type: "number",
        description: 'Maximum status code to include (e.g. 299). Only used with "search" action.',
      },
      hide_assets: {
        type: "boolean",
        description: 'If true, hides static assets (images, CSS, JS, fonts). Only used with "search" action.',
      },
      entry_id: {
        type: "number",
        description: 'The proxy history entry ID to fetch full details for. Required for "get" action.',
      },
    },
    required: ["action"],
  },
  timeoutMs: 30_000,
  async execute(args, _ctx) {
    const { action } = args;

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
      const { BurpClient, decodeBase64Body } = await import("burp-rpc");
      const burp = new BurpClient({ host: connHost, port: connPort });

      try {
        if (action === "search") {
          const filter: any = {};
          if (args.search) filter.search = args.search;
          if (args.methods) filter.methods = args.methods.split(",").map((m: string) => m.trim()).filter(Boolean);
          if (args.status_min) filter.statusMin = args.status_min;
          if (args.status_max) filter.statusMax = args.status_max;
          if (args.hide_assets) filter.hideAssets = true;

          const entries = await burp.proxy.getHistorySummary(filter);
          const total = entries.length;

          const reversed = [...entries].reverse();
          const slice = reversed.slice(0, MAX_ENTRIES_RETURNED);

          const lines = slice.map((e: any, idx: number) => {
            const id = e.id ?? (total - idx);
            const status = e.statusCode ? `${e.statusCode}` : "---";
            const size = e.responseLength ? `${e.responseLength}B` : "-";
            const ct = e.contentType || "";
            return `[${id}] ${(e.method || "?").padEnd(6)} ${status.padEnd(4)} ${e.host || ""}${e.path || "/"} ${ct} ${size}`;
          });

          let output = `Found ${total} entries`;
          if (total > MAX_ENTRIES_RETURNED) {
            output += ` (showing latest ${MAX_ENTRIES_RETURNED})`;
          }
          output += `:\n\n${lines.join("\n")}`;

          if (total > MAX_ENTRIES_RETURNED) {
            output += `\n\n... and ${total - MAX_ENTRIES_RETURNED} more. Refine your search filters to narrow results.`;
          }

          output += `\n\nUse action "get" with entry_id to see the full request/response for any entry.`;

          return { output, exitCode: 0 };
        }

        if (action === "get") {
          if (args.entry_id == null) {
            return { output: 'Error: entry_id is required for "get" action.', exitCode: 1 };
          }

          const entry = await burp.proxy.getEntry(args.entry_id);

          if (!entry) {
            return { output: `No proxy entry found with ID ${args.entry_id}.`, exitCode: 1 };
          }

          const host = entry.request?.httpService?.host || "unknown";
          const port = entry.request?.httpService?.port || "?";
          const secure = entry.request?.httpService?.secure ?? false;

          let output = `=== Proxy Entry #${args.entry_id} ===\n`;
          output += `Host: ${host}:${port} (${secure ? "HTTPS" : "HTTP"})\n\n`;

          output += `--- REQUEST ---\n`;
          if (entry.request?.rawBytesBase64) {
            let reqText = decodeBase64Body(entry.request.rawBytesBase64);
            if (reqText.length > 4000) {
              reqText = reqText.substring(0, 4000) + "\n... [truncated]";
            }
            output += reqText;
          } else {
            output += "(no request data)";
          }

          output += `\n\n--- RESPONSE ---\n`;
          if (entry.response?.rawBytesBase64) {
            let respText = decodeBase64Body(entry.response.rawBytesBase64);
            if (respText.length > 6000) {
              respText = respText.substring(0, 6000) + "\n... [truncated]";
            }
            output += respText;
          } else {
            output += "(no response data)";
          }

          return { output, exitCode: 0 };
        }

        return { output: `Error: Unknown action "${action}". Use "search" or "get".`, exitCode: 1 };
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
      return { output: `Error fetching proxy history: ${err.message}`, exitCode: 1 };
    }
  },
};

export default burpProxyHistory;
