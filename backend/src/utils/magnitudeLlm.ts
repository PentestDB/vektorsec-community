export interface MagnitudeProviderInput {
  provider: string;
  model: string;
  apiKey: string;
  baseURL?: string;
}

export interface MagnitudeLlmConfig {
  provider: string;
  options: {
    model: string;
    apiKey: string;
    baseUrl?: string;
  };
}

export function getMagnitudeModelIssue(
  config: Pick<MagnitudeProviderInput, "provider" | "baseURL">,
): string | null {
  const provider = config.provider;
  const baseURL = config.baseURL?.trim();

  if (provider === "anthropic-compatible") {
    return (
      "The Browser Agent cannot use Anthropic-compatible presets with custom " +
      "base URLs because Magnitude 0.3.1 does not pass generic Anthropic " +
      "base URLs through to its BAML client. Select an OpenAI-compatible " +
      "preset instead, for example MiniMax at https://api.minimax.io/v1."
    );
  }

  if (provider === "anthropic" && baseURL) {
    return (
      "The Browser Agent cannot use a custom base URL with the official " +
      "Anthropic provider. Use the default Anthropic API, or create an " +
      "OpenAI-compatible preset if the provider exposes one."
    );
  }

  if (provider === "openai-compatible" && !baseURL) {
    return "OpenAI-compatible Browser Agent presets require a base URL.";
  }

  if (
    ![
      "anthropic",
      "openai",
      "google",
      "openrouter",
      "openai-compatible",
      "ollama",
      "deepseek",
    ].includes(provider)
  ) {
  const providerMap: Record<string, string> = {
    anthropic: "anthropic",
    openai: "openai",
    google: "google-ai",
    openrouter: "openai-generic",
    "openai-compatible": "openai-generic",
    ollama: "openai-generic",
    deepseek: "openai-generic",
  };
  const defaultBaseURL =
    config.provider === "openrouter"
      ? "https://openrouter.ai/api/v1"
      : config.provider === "ollama"
        ? "http://localhost:11434/v1"
        : config.provider === "deepseek"
          ? "https://api.deepseek.com/v1"
          : "";
    return (
      "This provider is not supported by the Browser Agent. Select an " +
      "OpenAI-compatible preset if this provider exposes an OpenAI-compatible API."
    );
  }

  return null;
}

export function resolveMagnitudeLlmConfig(
  config: MagnitudeProviderInput,
): MagnitudeLlmConfig {
  const issue = getMagnitudeModelIssue(config);
  if (issue) {
    throw new Error(issue);
  }

  const baseURL = config.baseURL?.trim();
  const providerMap: Record<string, string> = {
    anthropic: "anthropic",
    openai: "openai",
    google: "google-ai",
    openrouter: "openai-generic",
    "openai-compatible": "openai-generic",
    ollama: "openai-generic",
  };

  const magnitudeProvider = providerMap[config.provider] || "openai";
  const defaultBaseURL =
    config.provider === "openrouter"
      ? "https://openrouter.ai/api/v1"
      : config.provider === "ollama"
        ? "http://localhost:11434/v1"
        : "";
  const resolvedBaseURL = baseURL || defaultBaseURL;

  return {
    provider: magnitudeProvider,
    options: {
      model: config.model,
      apiKey: config.apiKey,
      ...(resolvedBaseURL ? { baseUrl: resolvedBaseURL } : {}),
    },
  };
}
