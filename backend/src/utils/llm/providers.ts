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

// ─── Shared types ────────────────────────────────────────────────────

export interface ToolCallData {
  id: string;
  name: string;
  arguments: string;
}

export type FinishReason = "stop" | "tool_calls" | "length" | "content_filter" | "error";

export interface InvokeOptions {
  messages: Array<OpenAI.Chat.ChatCompletionMessageParam>;
  tools?: OpenAI.Chat.ChatCompletionTool[];
  format?: "json" | "text";
  temperature?: number;
  sessionId?: string;
  userId?: string;
  tags?: string[];
  generationName?: string;
}

export interface InvokeResult {
  content: string | null;
  toolCalls: ToolCallData[];
  finishReason: FinishReason;
  usage: OpenAI.Completions.CompletionUsage | undefined;
  model: string;
  provider: ProviderType;
  elapsedMs: number;
}

// ─── Streaming types ─────────────────────────────────────────────────

export interface StreamDelta {
  type: "text" | "tool_call_start" | "tool_call_delta" | "tool_call_done";
  content?: string;
  toolCall?: Partial<ToolCallData> & { index?: number };
}

export interface StreamingInvokeOptions extends InvokeOptions {
  onDelta: (delta: StreamDelta) => void;
  abortSignal?: AbortSignal;
}

// ─── Helpers ─────────────────────────────────────────────────────────

function maskSecret(s: string | undefined): string {
  if (!s) return "(empty)";
  if (s.length <= 8) return "****";
  return s.slice(0, 6) + "…" + s.slice(-4);
}

const FIXED_TEMPERATURE_MODELS = new Set([
  "gpt-5-nano",
]);

function clampTemperature(model: string, requested: number): number {
  for (const m of FIXED_TEMPERATURE_MODELS) {
    if (model.includes(m)) return 1;
  }
  return requested;
}

function normalizeFinishReason(raw: string | null | undefined): FinishReason {
  if (raw === "stop" || raw === "end_turn") return "stop";
  if (raw === "tool_calls" || raw === "tool_use") return "tool_calls";
  if (raw === "length" || raw === "max_tokens") return "length";
  if (raw === "content_filter") return "content_filter";
  return "stop";
}

function extractToolCalls(message: OpenAI.Chat.ChatCompletionMessage): ToolCallData[] {
  if (!message.tool_calls?.length) return [];
  return message.tool_calls.map((tc) => ({
    id: tc.id,
    name: tc.function.name,
    arguments: tc.function.arguments,
  }));
}

function logRequest(config: ProviderConfig, opts: InvokeOptions, streaming: boolean) {
  const msgCount = opts.messages.length;
  const lastRole = opts.messages[msgCount - 1]?.role ?? "?";
  const totalChars = opts.messages.reduce((n, m) => {
    if (typeof m.content === "string") return n + m.content.length;
    return n;
  }, 0);

  console.log(
    `[inference] → provider=${config.provider} model=${config.model} auth=${config.authMethod ?? "api_key"}` +
    ` key=${maskSecret(config.authMethod === "oauth" ? config.oauthAccessToken : config.apiKey)}` +
    ` baseURL=${config.baseURL ?? "(default)"}` +
    ` | msgs=${msgCount} lastRole=${lastRole} chars=${totalChars}` +
    ` tools=${opts.tools?.length ?? 0} stream=${streaming}` +
    ` fmt=${opts.format ?? "text"}`
  );
}

function logResponse(config: ProviderConfig, elapsed: number, result: InvokeResult) {
  console.log(
    `[inference] ← ${elapsed}ms provider=${config.provider} model=${result.model}` +
    ` tokens=${result.usage?.prompt_tokens ?? "?"}→${result.usage?.completion_tokens ?? "?"}` +
    ` (total ${result.usage?.total_tokens ?? "?"})` +
    ` | finish=${result.finishReason} toolCalls=${result.toolCalls.length}` +
    ` content=${result.content ? result.content.length + " chars" : "null"}`
  );
}

function buildCompletionConfig(
  config: ProviderConfig,
  opts: InvokeOptions & { abortSignal?: AbortSignal },
  temperature: number,
  stream: boolean,
): any {
  const params: any = {
    model: config.model,
    messages: opts.messages,
    temperature,
    stream,
  };

  if (stream) {
    params.stream_options = { include_usage: true };
  }

  if (opts.tools?.length) {
    params.tools = opts.tools;
    params.tool_choice = "auto";
  }

  if (opts.format === "json" && !opts.tools?.length && config.provider !== "anthropic") {
    params.response_format = { type: "json_object" };
  }

  return params;
}

function getClient(config: ProviderConfig, opts: InvokeOptions): OpenAI {
  const rawClient = buildClient(config);
  if (isTracingEnabled()) {
    return observeOpenAI(rawClient, {
      sessionId: opts.sessionId,
      userId: opts.userId,
      tags: opts.tags,
      generationName: opts.generationName,
    });
  }
  return rawClient;
}

// ─── invoke_llm — non-streaming (kept for summarization, simple calls) ───

export async function invoke_llm(opts: InvokeOptions): Promise<InvokeResult> {
  const config = await getProvider();
  const client = getClient(config, opts);
  const requestedTemp = clampTemperature(config.model, opts.temperature ?? 0.75);
  const start = Date.now();

  logRequest(config, opts, false);

  const tryCompletion = async (temp: number): Promise<InvokeResult> => {
    const params = buildCompletionConfig(config, opts, temp, false);
    const response = await client.chat.completions.create(params) as OpenAI.Chat.ChatCompletion;
    const elapsed = Date.now() - start;
    const message = response.choices[0]?.message;

    const result: InvokeResult = {
      content: message?.content ?? null,
      toolCalls: message ? extractToolCalls(message) : [],
      finishReason: normalizeFinishReason(response.choices[0]?.finish_reason),
      usage: response.usage,
      model: response.model ?? config.model,
      provider: config.provider,
      elapsedMs: elapsed,
    };

    logResponse(config, elapsed, result);
    return result;
  };

  try {
    return await tryCompletion(requestedTemp);
  } catch (err: any) {
    const isTempUnsupported =
      err?.code === "unsupported_value" &&
      err?.param === "temperature" &&
      requestedTemp !== 1;

    if (isTempUnsupported) {
      console.warn(`[inference] Model ${config.model} does not support temperature=${requestedTemp}, retrying with temperature=1`);
      return await tryCompletion(1);
    }

    const elapsed = Date.now() - start;
    console.error(
      `[inference] ✗ ${elapsed}ms provider=${config.provider} model=${config.model}` +
      ` | ${err?.status ?? "?"} ${err?.code ?? err?.type ?? err?.message ?? "unknown error"}`
    );
    throw err;
  }
}

// ─── invoke_llm_streaming — streaming with tool calls ────────────────

export async function invoke_llm_streaming(opts: StreamingInvokeOptions): Promise<InvokeResult> {
  const config = await getProvider();
  const client = getClient(config, opts);
  const requestedTemp = clampTemperature(config.model, opts.temperature ?? 0.75);
  const start = Date.now();

  logRequest(config, opts, true);

  const runStream = async (temp: number): Promise<InvokeResult> => {
    const params = buildCompletionConfig(config, opts, temp, true);

    const stream = await client.chat.completions.create(params) as unknown as AsyncIterable<OpenAI.Chat.ChatCompletionChunk>;

    let contentParts: string[] = [];
    let toolCallAccumulators: Map<number, { id: string; name: string; argParts: string[] }> = new Map();
    let finishReason: FinishReason = "stop";
    let usage: OpenAI.Completions.CompletionUsage | undefined;
    let model = config.model;

    for await (const chunk of stream) {
      if (opts.abortSignal?.aborted) {
        finishReason = "stop";
        break;
      }

      if (chunk.model) model = chunk.model;
      if (chunk.usage) usage = chunk.usage as any;

      const delta = chunk.choices?.[0]?.delta;
      const chunkFinish = chunk.choices?.[0]?.finish_reason;

      if (chunkFinish) {
        finishReason = normalizeFinishReason(chunkFinish);
      }

      if (!delta) continue;

      if (delta.content) {
        contentParts.push(delta.content);
        opts.onDelta({ type: "text", content: delta.content });
      }

      if (delta.tool_calls) {
        for (const tc of delta.tool_calls) {
          const idx = tc.index ?? 0;

          if (!toolCallAccumulators.has(idx)) {
            toolCallAccumulators.set(idx, {
              id: tc.id ?? "",
              name: tc.function?.name ?? "",
              argParts: [],
            });
            opts.onDelta({
              type: "tool_call_start",
              toolCall: { index: idx, id: tc.id, name: tc.function?.name },
            });
          }

          const acc = toolCallAccumulators.get(idx)!;
          if (tc.id) acc.id = tc.id;
          if (tc.function?.name) acc.name = tc.function.name;

          if (tc.function?.arguments) {
            acc.argParts.push(tc.function.arguments);
            opts.onDelta({
              type: "tool_call_delta",
              toolCall: { index: idx },
              content: tc.function.arguments,
            });
          }
        }
      }
    }

    const toolCalls: ToolCallData[] = [];
    for (const [idx, acc] of toolCallAccumulators) {
      const tc: ToolCallData = {
        id: acc.id,
        name: acc.name,
        arguments: acc.argParts.join(""),
      };
      toolCalls.push(tc);
      opts.onDelta({ type: "tool_call_done", toolCall: { index: idx, ...tc } });
    }

    if (toolCalls.length > 0 && finishReason === "stop") {
      finishReason = "tool_calls";
    }

    const elapsed = Date.now() - start;
    const result: InvokeResult = {
      content: contentParts.join("") || null,
      toolCalls,
      finishReason,
      usage,
      model,
      provider: config.provider,
      elapsedMs: elapsed,
    };

    logResponse(config, elapsed, result);
    return result;
  };

  try {
    return await runStream(requestedTemp);
  } catch (err: any) {
    const isTempUnsupported =
      err?.code === "unsupported_value" &&
      err?.param === "temperature" &&
      requestedTemp !== 1;

    if (isTempUnsupported) {
      console.warn(`[inference] Retrying stream with temperature=1`);
      return await runStream(1);
    }

    // If tool calling is not supported, retry without tools using JSON fallback
    const isToolsUnsupported =
      opts.tools?.length &&
      (err?.message?.includes("tool") || err?.code === "unsupported_parameter");

    if (isToolsUnsupported) {
      console.warn(`[inference] Provider does not support native tool calling, falling back to JSON-in-prompt`);
      return await invoke_llm_json_fallback(opts, config, start);
    }

    const elapsed = Date.now() - start;
    console.error(
      `[inference] ✗ ${elapsed}ms stream provider=${config.provider} model=${config.model}` +
      ` | ${err?.status ?? "?"} ${err?.code ?? err?.type ?? err?.message ?? "unknown error"}`
    );
    throw err;
  }
}

// ─── JSON-in-prompt fallback for providers without native tool calling ───

function buildToolDescriptionPrompt(tools: OpenAI.Chat.ChatCompletionTool[]): string {
  const descriptions = tools.map((t) => {
    const fn = t.function;
    return `- **${fn.name}**: ${fn.description}\n  Parameters: ${JSON.stringify(fn.parameters)}`;
  }).join("\n");

  return `You have access to the following tools. To use a tool, respond with a JSON object containing "tool_calls" array. Each element should have "name" (tool name) and "arguments" (object with the tool parameters). If you don't need to use a tool, respond normally without the tool_calls field.

Available tools:
${descriptions}

When using tools, respond ONLY with this JSON format:
{"content": "your thinking/explanation", "tool_calls": [{"name": "tool_name", "arguments": {...}}]}

When NOT using tools, respond with plain text.`;
}

async function invoke_llm_json_fallback(
  opts: StreamingInvokeOptions,
  config: ProviderConfig,
  startTime: number,
): Promise<InvokeResult> {
  const client = getClient(config, opts);

  const messages = [...opts.messages];
  if (opts.tools?.length) {
    const toolPrompt = buildToolDescriptionPrompt(opts.tools);
    const sysIdx = messages.findIndex((m) => m.role === "system");
    if (sysIdx >= 0 && typeof messages[sysIdx].content === "string") {
      messages[sysIdx] = {
        ...messages[sysIdx],
        content: (messages[sysIdx] as any).content + "\n\n" + toolPrompt,
      };
    } else {
      messages.unshift({ role: "system", content: toolPrompt });
    }
  }

  const params: any = {
    model: config.model,
    messages,
    temperature: opts.temperature ?? 0.75,
  };

  const response = await client.chat.completions.create(params) as OpenAI.Chat.ChatCompletion;
  const elapsed = Date.now() - startTime;
  const rawContent = response.choices[0]?.message?.content ?? "";

  let content: string | null = rawContent;
  let toolCalls: ToolCallData[] = [];
  let finishReason: FinishReason = "stop";

  try {
    const parsed = JSON.parse(rawContent);
    if (parsed.tool_calls && Array.isArray(parsed.tool_calls)) {
      content = parsed.content || null;
      toolCalls = parsed.tool_calls.map((tc: any, i: number) => ({
        id: `fallback_${Date.now()}_${i}`,
        name: tc.name,
        arguments: JSON.stringify(tc.arguments ?? {}),
      }));
      finishReason = "tool_calls";
    }
  } catch {
    // Not JSON, treat as plain text
  }

  if (content) opts.onDelta({ type: "text", content });
  for (const tc of toolCalls) {
    opts.onDelta({ type: "tool_call_start", toolCall: tc });
    opts.onDelta({ type: "tool_call_done", toolCall: tc });
  }

  const result: InvokeResult = {
    content,
    toolCalls,
    finishReason,
    usage: response.usage,
    model: response.model ?? config.model,
    provider: config.provider,
    elapsedMs: elapsed,
  };

  logResponse(config, elapsed, result);
  return result;
}
