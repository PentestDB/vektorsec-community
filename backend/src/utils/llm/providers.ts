import OpenAI from "openai";
import axios from "axios";
import { observeOpenAI } from "@langfuse/openai";
import getSecrets from "../getSecrets";
import { readEnvFile, updateEnvVars } from "../envWriter";
import { isTracingEnabled } from "../tracing";

export type ProviderType = "openai" | "anthropic" | "openai-compatible";

export interface ProviderConfig {
  provider: ProviderType;
  apiKey: string;
  model: string;
  baseURL?: string;
  authMethod?: "api_key" | "oauth";
  oauthAccessToken?: string;
}

const PROVIDER_DEFAULTS: Record<ProviderType, { baseURL: string }> = {
  openai: { baseURL: "https://api.openai.com/v1" },
  anthropic: { baseURL: "https://api.anthropic.com/v1/" },
  "openai-compatible": { baseURL: "" },
};

function buildClient(config: ProviderConfig): OpenAI {
  const baseURL = config.baseURL || PROVIDER_DEFAULTS[config.provider]?.baseURL;

  const isOAuth = config.provider === "anthropic" && config.authMethod === "oauth" && config.oauthAccessToken;

  const clientOpts: ConstructorParameters<typeof OpenAI>[0] = {
    apiKey: isOAuth ? "placeholder" : config.apiKey,
  };

  if (baseURL) {
    clientOpts.baseURL = baseURL;
  }

  if (config.provider === "anthropic") {
    if (isOAuth) {
      clientOpts.defaultHeaders = {
        "anthropic-version": "2023-06-01",
        "anthropic-beta": "oauth-2025-04-20",
        "Authorization": `Bearer ${config.oauthAccessToken}`,
      };
    } else {
      clientOpts.defaultHeaders = {
        "anthropic-version": "2023-06-01",
        "x-api-key": config.apiKey,
      };
    }
  }

  return new OpenAI(clientOpts);
}

const ANTHROPIC_OAUTH_TOKEN_URL = "https://console.anthropic.com/v1/oauth/token";
const ANTHROPIC_OAUTH_CLIENT_ID = "9d1c250a-e61b-44d9-88ed-5944d1962f5e";

async function maybeRefreshOAuthToken(): Promise<string | null> {
  const env = readEnvFile();
  const accessToken = env.ANTHROPIC_OAUTH_ACCESS_TOKEN;
  const refreshToken = env.ANTHROPIC_OAUTH_REFRESH_TOKEN;
  const expiresAt = parseInt(env.ANTHROPIC_OAUTH_EXPIRES_AT || "0", 10);

  if (!accessToken || !refreshToken) return null;

  const now = Math.floor(Date.now() / 1000);
  if (expiresAt - now > 300) return accessToken;

  try {
    const response = await axios.post(
      ANTHROPIC_OAUTH_TOKEN_URL,
      new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        client_id: ANTHROPIC_OAUTH_CLIENT_ID,
      }).toString(),
      { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
    );

    const { access_token, refresh_token, expires_in } = response.data;
    updateEnvVars({
      ANTHROPIC_OAUTH_ACCESS_TOKEN: access_token,
      ANTHROPIC_OAUTH_REFRESH_TOKEN: refresh_token || refreshToken,
      ANTHROPIC_OAUTH_EXPIRES_AT: String(Math.floor(Date.now() / 1000) + (expires_in || 3600)),
    });
    return access_token;
  } catch (err) {
    console.warn("[providers] Failed to refresh Anthropic OAuth token:", err);
    return accessToken;
  }
}

async function loadProviderConfig(): Promise<ProviderConfig> {
  const env = readEnvFile();

  const provider = env.MODEL_PROVIDER || (await getSecrets("MODEL_PROVIDER")) || "openai";
  const apiKey = env.MODEL_API_KEY || (await getSecrets("MODEL_API_KEY"));
  const model = env.MODEL || (await getSecrets("MODEL"));
  const baseURL = env.MODEL_BASE_PATH || (await getSecrets("MODEL_BASE_PATH"));

  if (provider === "anthropic") {
    const oauthToken = await maybeRefreshOAuthToken();
    if (oauthToken) {
      return {
        provider: "anthropic",
        apiKey: "",
        model: model || "claude-sonnet-4-20250514",
        baseURL: baseURL || undefined,
        authMethod: "oauth",
        oauthAccessToken: oauthToken,
      };
    }
  }

  return {
    provider: provider as ProviderType,
    apiKey,
    model: model || "gpt-4o",
    baseURL: baseURL || undefined,
    authMethod: "api_key",
  };
}

// ─── Provider cache ──────────────────────────────────────────────────

let cachedProvider: ProviderConfig | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 30_000;

function isCacheStale(): boolean {
  return Date.now() - cacheTimestamp > CACHE_TTL_MS;
}

export async function getProvider(): Promise<ProviderConfig> {
  if (cachedProvider && !isCacheStale()) return cachedProvider;
  cachedProvider = await loadProviderConfig();
  cacheTimestamp = Date.now();
  return cachedProvider;
}

export function clearProviderCache(): void {
  cachedProvider = null;
  cacheTimestamp = 0;
}

// ─── invoke_llm — the single inference entry point ───────────────────

export interface InvokeOptions {
  messages: Array<{ role: string; content: string }>;
  format?: "json" | "text";
  temperature?: number;
  /** Langfuse: session ID for tracing */
  sessionId?: string;
  /** Langfuse: user ID for tracing */
  userId?: string;
  /** Langfuse: tags for filtering traces (e.g. "copilot", "task", "metasploit") */
  tags?: string[];
  /** Langfuse: generation name for identification */
  generationName?: string;
}

export interface InvokeResult {
  content: string | null;
  usage: OpenAI.Completions.CompletionUsage | undefined;
  model: string;
  provider: ProviderType;
  elapsedMs: number;
}

function maskSecret(s: string | undefined): string {
  if (!s) return "(empty)";
  if (s.length <= 8) return "****";
  return s.slice(0, 6) + "…" + s.slice(-4);
}

export async function invoke_llm(opts: InvokeOptions): Promise<InvokeResult> {
  const config = await getProvider();

  const msgCount = opts.messages.length;
  const lastRole = opts.messages[msgCount - 1]?.role ?? "?";
  const totalChars = opts.messages.reduce((n, m) => n + m.content.length, 0);

  const start = Date.now();
  const rawClient = buildClient(config);
  const client = isTracingEnabled()
    ? observeOpenAI(rawClient, {
        sessionId: opts.sessionId,
        userId: opts.userId,
        tags: opts.tags,
        generationName: opts.generationName,
      })
    : rawClient;

  const runCompletion = async (temperature: number) => {
    const completionConfig: OpenAI.Chat.ChatCompletionCreateParamsNonStreaming = {
      model: config.model,
      messages: opts.messages as OpenAI.Chat.ChatCompletionMessageParam[],
      temperature,
    };

    if (opts.format === "json" && config.provider !== "anthropic") {
      completionConfig.response_format = { type: "json_object" };
    }

    return client.chat.completions.create(completionConfig);
  };

  const requestedTemp = opts.temperature ?? 0.75;

  console.log(
    `[inference] → provider=${config.provider} model=${config.model} auth=${config.authMethod ?? "api_key"}` +
    ` key=${maskSecret(config.authMethod === "oauth" ? config.oauthAccessToken : config.apiKey)}` +
    ` baseURL=${config.baseURL ?? "(default)"}` +
    ` | msgs=${msgCount} lastRole=${lastRole} chars=${totalChars} fmt=${opts.format ?? "text"} temp=${requestedTemp}`
  );

  try {
    let response = await runCompletion(requestedTemp);
    const elapsed = Date.now() - start;
    const content = response.choices[0]?.message?.content ?? null;

    console.log(
      `[inference] ← ${elapsed}ms provider=${config.provider} model=${response.model ?? config.model}` +
      ` tokens=${response.usage?.prompt_tokens ?? "?"}→${response.usage?.completion_tokens ?? "?"}` +
      ` (total ${response.usage?.total_tokens ?? "?"})` +
      ` | response ${content ? content.length + " chars" : "null"}`
    );

    return {
      content,
      usage: response.usage,
      model: config.model,
      provider: config.provider,
      elapsedMs: elapsed,
    };
  } catch (err: any) {
    // If model doesn't support temperature (e.g. only allows temp=1), retry with default
    const isTempUnsupported =
      err?.code === "unsupported_value" &&
      err?.param === "temperature" &&
      requestedTemp !== 1;

    if (isTempUnsupported) {
      console.warn(
        `[inference] Model ${config.model} does not support temperature=${requestedTemp}, retrying with temperature=1`
      );
      try {
        const response = await runCompletion(1);
        const elapsed = Date.now() - start;
        const content = response.choices[0]?.message?.content ?? null;

        console.log(
          `[inference] ← ${elapsed}ms provider=${config.provider} model=${response.model ?? config.model}` +
          ` tokens=${response.usage?.prompt_tokens ?? "?"}→${response.usage?.completion_tokens ?? "?"}` +
          ` (total ${response.usage?.total_tokens ?? "?"})` +
          ` | response ${content ? content.length + " chars" : "null"}`
        );

        return {
          content,
          usage: response.usage,
          model: config.model,
          provider: config.provider,
          elapsedMs: elapsed,
        };
      } catch (retryErr: any) {
        const elapsed = Date.now() - start;
        console.error(
          `[inference] ✗ ${elapsed}ms provider=${config.provider} model=${config.model} auth=${config.authMethod ?? "api_key"}` +
          ` | ${retryErr?.status ?? "?"} ${retryErr?.code ?? retryErr?.type ?? retryErr?.message ?? "unknown error"}`
        );
        throw retryErr;
      }
    }

    const elapsed = Date.now() - start;
    console.error(
      `[inference] ✗ ${elapsed}ms provider=${config.provider} model=${config.model} auth=${config.authMethod ?? "api_key"}` +
      ` | ${err?.status ?? "?"} ${err?.code ?? err?.type ?? err?.message ?? "unknown error"}`
    );
    throw err;
  }
}
