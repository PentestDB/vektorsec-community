import { ToolDefinition } from "../types";
import { getCaidoConnection, getCaidoEntry, getCaidoHistory, isCaidoConfigured } from "../../services/caido.client";

const MAX_ENTRIES_RETURNED = 25;

const caidoHttpHistory: ToolDefinition = {
  name: "search_caido_http_history",
  description:
    "Search and fetch HTTP requests/responses from Caido HTTP History. " +
    'Use action "search" with optional filters to get a summary list, or action "get" with entry_id for full raw details.',
  parameters: {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: ["search", "get"],
        description: '"search" returns summaries. "get" fetches full request/response by ID.',
      },
      search: { type: "string", description: "Free-text search across summary fields." },
      methods: { type: "string", description: 'Comma-separated HTTP methods, e.g. "GET,POST".' },
      status_min: { type: "number", description: "Minimum response status code." },
      status_max: { type: "number", description: "Maximum response status code." },
      hide_assets: { type: "boolean", description: "Hide common static assets." },
      entry_id: { type: "string", description: 'Caido request ID. Required for "get".' },
    },
    required: ["action"],
  },
  timeoutMs: 30_000,
  async execute(args) {
    const conn = getCaidoConnection();
    if (!isCaidoConfigured(conn)) {
      return {
        output: "Error: Caido is not configured. Set CAIDO_URL and CAIDO_PAT in Settings > Caido.",
        exitCode: 1,
      };
    }

    try {
      if (args.action === "search") {
        const result = await getCaidoHistory({
          page: 1,
          pageSize: MAX_ENTRIES_RETURNED,
          filter: {
            search: args.search,
            method: args.methods,
            statusMin: args.status_min,
            statusMax: args.status_max,
            hideAssets: args.hide_assets,
          },
        });

        const lines = result.entries.map((e: any) => {
          const status = e.statusCode ? `${e.statusCode}` : "---";
          const size = e.responseLength ? `${e.responseLength}B` : "-";
          const ct = e.contentType || "";
          return `[${e.id}] ${(e.method || "?").padEnd(6)} ${status.padEnd(4)} ${e.host || ""}${e.path || "/"} ${ct} ${size}`;
        });

        let output = `Found ${result.total} entries`;
        if (result.total > MAX_ENTRIES_RETURNED) output += ` (showing latest ${MAX_ENTRIES_RETURNED})`;
        output += `:\n\n${lines.join("\n") || "(none)"}`;
        output += `\n\nUse action "get" with entry_id to see the full request/response for any entry.`;
        return { output, exitCode: 0 };
      }

      if (!args.entry_id) {
        return { output: 'Error: entry_id is required for "get" action.', exitCode: 1 };
      }

      const entry = await getCaidoEntry(String(args.entry_id));
      if (!entry) return { output: `No Caido HTTP entry found with ID ${args.entry_id}.`, exitCode: 1 };

      let output = `=== Caido HTTP Entry #${args.entry_id} ===\n`;
      output += `Host: ${entry.host}:${entry.port} (${entry.secure ? "HTTPS" : "HTTP"})\n\n`;
      output += `--- REQUEST ---\n${entry.rawRequest || "(no request data)"}`;
      output += `\n\n--- RESPONSE ---\n${entry.rawResponse || "(no response data)"}`;
      return { output, exitCode: 0 };
    } catch (err: any) {
      return { output: `Error fetching Caido HTTP history: ${err.message}`, exitCode: 1 };
    }
  },
};

export default caidoHttpHistory;
