const SUPPORTED_MAGNITUDE_PROVIDERS = new Set([
  "anthropic",
  "openai",
  "google",
  "openrouter",
  "openai-compatible",
  "ollama",
]);

export function getMagnitudeModelIssue(model) {
  if (!model) return "No Browser Agent model is selected.";

  const provider = model.provider;
  const baseURL = model.baseURL?.trim();

  if (provider === "anthropic-compatible") {
    return (
      "Browser Agent cannot use Anthropic-compatible presets with custom " +
      "base URLs. For MiniMax browser automation, create an OpenAI-Compatible " +
      "preset with base URL https://api.minimax.io/v1."
    );
  }

  if (provider === "anthropic" && baseURL) {
    return (
      "Browser Agent cannot use custom base URLs with the Anthropic provider. " +
      "Use the default Anthropic API or an OpenAI-Compatible preset."
    );
  }

  if (provider === "openai-compatible" && !baseURL) {
    return "OpenAI-Compatible Browser Agent presets require a base URL.";
  }

  if (!SUPPORTED_MAGNITUDE_PROVIDERS.has(provider)) {
    return (
      "This provider is not supported by Browser Agent. Use an " +
      "OpenAI-Compatible preset if the provider exposes one."
    );
  }

  return null;
}

export function isMagnitudeModelCompatible(model) {
  return !getMagnitudeModelIssue(model);
}
