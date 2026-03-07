import { google } from "googleapis";
import getSecrets from "../../utils/getSecrets";
import { ToolDefinition } from "../types";

export const googleSearchTool: ToolDefinition = {
  name: "google",
  description: "Google Search",
  args: {
    query: {
      type: "string",
      required: true,
      description: "The search query",
    },
  },
  async execute({ args, choice }) {
    try {
      if (["yes", "edit"].includes(choice)) {
        const apiKey = await getSecrets("GOOGLE-API-KEY");
        const customSearchEngineId = await getSecrets("CUSTOM-SEARCH-ENGINE-ID");

        const service = google.customsearch("v1");
        const result = await service.cse.list({
          auth: apiKey,
          cx: customSearchEngineId,
          q: args.query,
          num: 5,
        });

        const searchResults: any = result.data.items || [];

        const detailedResults = searchResults.map((item: any) => ({
          title: item.title,
          snippet: item.snippet,
          url: item.link,
        }));

        return JSON.stringify(detailedResults) ?? "No Google search results found.";
      }
      return args.output ?? "No Google search results found.";
    } catch (error: any) {
      if (error.response?.data?.error) {
        const errorDetails = error.response.data.error;
        if (errorDetails.code === 403 && errorDetails.message.includes("invalid API key")) {
          return "Error: The provided Google API key is invalid or missing.";
        }
        return `Error: ${error}`;
      }
      return `Error: ${error}`;
    }
  },
};
