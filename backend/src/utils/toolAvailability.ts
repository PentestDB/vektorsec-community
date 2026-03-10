import { readEnvFile } from "./envWriter";

const BURP_TOOLS = [
  "search_burp_proxy_history",
  "send_to_burp_repeater",
  "send_to_burp_intruder",
  "burp_collaborator",
];

/**
 * Returns tool names that are NOT configured (missing required env/settings).
 * These tools should be excluded from the LLM context and greyed out in the UI.
 */
export function getUnconfiguredToolNames(): string[] {
  const env = readEnvFile();
  const unconfigured: string[] = [];

  const burpConfigured = !!env.BURP_RPC_HOST;
  if (!burpConfigured) {
    unconfigured.push(...BURP_TOOLS);
  }

  const magnitudeConfigured = env.MAGNITUDE_ENABLED === "true";
  if (!magnitudeConfigured) {
    unconfigured.push("browser_action");
  }

  const googleApiKey = env["GOOGLE-API-KEY"] || process.env["GOOGLE-API-KEY"];
  const googleCx = env["CUSTOM-SEARCH-ENGINE-ID"] || process.env["CUSTOM-SEARCH-ENGINE-ID"];
  const googleConfigured = !!(googleApiKey && googleCx);
  if (!googleConfigured) {
    unconfigured.push("google_search");
  }

  return unconfigured;
}
