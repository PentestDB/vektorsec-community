import { ToolDefinition } from "../types";
import getSecrets from "../../utils/getSecrets";

const { google } = require("googleapis");

const googleSearch: ToolDefinition = {
  name: "google_search",
  description:
    "Search Google for information relevant to the penetration test. " +
    "Use this to look up CVEs, exploit databases, service version vulnerabilities, etc.",
  parameters: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "The search query",
      },
    },
    required: ["query"],
  },
  timeoutMs: 30_000,
  async execute(args, _ctx) {
    const query = args.query;
    if (!query) return { output: "Error: no query provided", exitCode: 1 };

    try {
      const apiKey = await getSecrets("GOOGLE-API-KEY");
      const cx = await getSecrets("CUSTOM-SEARCH-ENGINE-ID");

      if (!apiKey || !cx) {
        return { output: "Google Search API is not configured (missing API key or CX).", exitCode: 1 };
      }

      const customSearch = google.customsearch("v1");
      const res = await customSearch.cse.list({ auth: apiKey, cx, q: query, num: 5 });

      const items = res.data.items ?? [];
      const results = items.map((item: any) => ({
        title: item.title,
        snippet: item.snippet,
        url: item.link,
      }));

      return { output: JSON.stringify(results, null, 2), exitCode: 0 };
    } catch (err: any) {
      if (err?.response?.status === 403) {
        return { output: "Google API error: invalid API key or quota exceeded", exitCode: 1 };
      }
      return { output: `Google search error: ${err.message}`, exitCode: 1 };
    }
  },
};

export default googleSearch;
