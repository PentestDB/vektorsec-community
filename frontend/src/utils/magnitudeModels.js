/**
 * Browser Agent / Magnitude model compatibility rules.
 *
 * `getMagnitudeModelIssue` returns a **dictionary key** (not a sentence) so the
 * caller can translate it with `t(...)`; the UI only ever runs client-side,
 * where the active locale is known. `null` means "compatible".
 */
const SUPPORTED_MAGNITUDE_PROVIDERS = new Set([
  "anthropic",
  "openai",
  "google",
  "openrouter",
  "openai-compatible",
  "ollama",
  "deepseek",
]);

export function getMagnitudeModelIssue(model) {
  if (!model) return "browserAgent.modelIssueNoModel";

  const provider = model.provider;
  const baseURL = model.baseURL?.trim();

  if (provider === "anthropic-compatible") {
    return "browserAgent.modelIssueAnthropicCustomBaseUrl";
  }

  if (provider === "anthropic" && baseURL) {
    return "browserAgent.modelIssueAnthropicBaseUrl";
  }

  if (provider === "openai-compatible" && !baseURL) {
    return "browserAgent.modelIssueOpenAiCompatibleBaseUrl";
  }

  if (!SUPPORTED_MAGNITUDE_PROVIDERS.has(provider)) {
    return "browserAgent.modelIssueUnsupportedProvider";
  }

  return null;
}

export function isMagnitudeModelCompatible(model) {
  return !getMagnitudeModelIssue(model);
}
