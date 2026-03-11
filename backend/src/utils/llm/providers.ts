import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
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

export type ReasoningMode = "off" | "low" | "medium" | "high";

export interface InvokeOptions {
  messages: Array<OpenAI.Chat.ChatCompletionMessageParam>;
  tools?: OpenAI.Chat.ChatCompletionTool[];
  format?: "json" | "text";
  temperature?: number;
  reasoningMode?: ReasoningMode;
  sessionId?: string;
  userId?: string;
  tags?: string[];
  generationName?: string;
}

export interface InvokeResult {
  content: string | null;
  reasoning: string | null;
  toolCalls: ToolCallData[];
  finishReason: FinishReason;
  usage: OpenAI.Completions.CompletionUsage | undefined;
  model: string;
  provider: ProviderType;
  elapsedMs: number;
}

// ─── Streaming types ─────────────────────────────────────────────────

export interface StreamDelta {
  type: "text" | "reasoning" | "tool_call_start" | "tool_call_delta" | "tool_call_done";
  content?: string;
  toolCall?: Partial<ToolCallData> & { index?: number };
}

export interface StreamingInvokeOptions extends InvokeOptions {
  onDelta: (delta: StreamDelta) => void;
  abortSignal?: AbortSignal;
}

// ─── Reasoning support ──────────────────────────────────────────────

const ANTHROPIC_BUDGET_TOKENS: Record<Exclude<ReasoningMode, "off">, number> = {
  low: 4096,
  medium: 10000,
  high: 32000,
};

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
      reasoning: null,
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

// ─── Anthropic native streaming (for extended thinking) ─────────────

function openaiToAnthropicMessages(
  messages: OpenAI.Chat.ChatCompletionMessageParam[],
): { system: string; messages: Anthropic.MessageParam[] } {
  let system = "";
  const out: Anthropic.MessageParam[] = [];

  for (const m of messages) {
    if (m.role === "system") {
      system += (typeof m.content === "string" ? m.content : "") + "\n";
      continue;
    }
    if (m.role === "user") {
      out.push({ role: "user", content: typeof m.content === "string" ? m.content : JSON.stringify(m.content) });
      continue;
    }
    if (m.role === "assistant") {
      const am = m as OpenAI.Chat.ChatCompletionAssistantMessageParam;
      const blocks: Anthropic.ContentBlockParam[] = [];
      if (am.content) blocks.push({ type: "text", text: typeof am.content === "string" ? am.content : JSON.stringify(am.content) });
      if (am.tool_calls) {
        for (const tc of am.tool_calls) {
          let input: Record<string, unknown> = {};
          try { input = JSON.parse(tc.function.arguments); } catch { /* ignore */ }
          blocks.push({ type: "tool_use", id: tc.id, name: tc.function.name, input });
        }
      }
      if (blocks.length) out.push({ role: "assistant", content: blocks });
      continue;
    }
    if (m.role === "tool") {
      const tm = m as OpenAI.Chat.ChatCompletionToolMessageParam;
      out.push({
        role: "user",
        content: [{ type: "tool_result", tool_use_id: tm.tool_call_id, content: typeof tm.content === "string" ? tm.content : JSON.stringify(tm.content) }],
      });
    }
  }

  return { system: system.trim(), messages: out };
}

function openaiToAnthropicTools(tools?: OpenAI.Chat.ChatCompletionTool[]): Anthropic.Tool[] | undefined {
  if (!tools?.length) return undefined;
  return tools.map((t) => ({
    name: t.function.name,
    description: t.function.description ?? "",
    input_schema: (t.function.parameters ?? { type: "object", properties: {} }) as Anthropic.Tool.InputSchema,
  }));
}

async function runAnthropicThinkingStream(
  config: ProviderConfig,
  opts: StreamingInvokeOptions,
  budgetTokens: number,
  start: number,
): Promise<InvokeResult> {
  const apiKey = config.authMethod === "oauth" ? (config.oauthAccessToken ?? "") : config.apiKey;
  const client = new Anthropic({
    apiKey: config.authMethod === "oauth" ? undefined : apiKey,
    ...(config.authMethod === "oauth" ? { authToken: config.oauthAccessToken } : {}),
  });

  const { system, messages } = openaiToAnthropicMessages(opts.messages);
  const anthropicTools = openaiToAnthropicTools(opts.tools);

  const params: Anthropic.MessageCreateParamsStreaming = {
    model: config.model,
    max_tokens: 16384,
    stream: true,
    thinking: { type: "enabled", budget_tokens: budgetTokens },
    messages,
    ...(system ? { system } : {}),
    ...(anthropicTools ? { tools: anthropicTools } : {}),
  };

  console.log(`[inference] → anthropic-native model=${config.model} thinking budget=${budgetTokens}`);

  const stream = client.messages.stream(params);

  let contentParts: string[] = [];
  let reasoningParts: string[] = [];
  let toolCallAccumulators: Map<string, { id: string; name: string; argParts: string[] }> = new Map();
  let finishReason: FinishReason = "stop";
  let usage: OpenAI.Completions.CompletionUsage | undefined;

  for await (const event of stream) {
    if (opts.abortSignal?.aborted) {
      finishReason = "stop";
      break;
    }

    if (event.type === "content_block_delta") {
      const delta = event.delta as any;
      if (delta.type === "thinking_delta" && delta.thinking) {
        reasoningParts.push(delta.thinking);
        opts.onDelta({ type: "reasoning", content: delta.thinking });
      }
      if (delta.type === "text_delta" && delta.text) {
        contentParts.push(delta.text);
        opts.onDelta({ type: "text", content: delta.text });
      }
      if (delta.type === "input_json_delta" && delta.partial_json) {
        const currentBlockIdx = event.index;
        const acc = [...toolCallAccumulators.values()].find((_, i) => i === currentBlockIdx - (reasoningParts.length > 0 ? 2 : 1))
          ?? [...toolCallAccumulators.values()].at(-1);
        if (acc) {
          acc.argParts.push(delta.partial_json);
          opts.onDelta({
            type: "tool_call_delta",
            toolCall: { index: toolCallAccumulators.size - 1 },
            content: delta.partial_json,
          });
        }
      }
    }

    if (event.type === "content_block_start") {
      const block = (event as any).content_block;
      if (block?.type === "tool_use") {
        const idx = toolCallAccumulators.size;
        toolCallAccumulators.set(block.id, { id: block.id, name: block.name, argParts: [] });
        opts.onDelta({
          type: "tool_call_start",
          toolCall: { index: idx, id: block.id, name: block.name },
        });
      }
    }

    if (event.type === "message_delta") {
      const md = event as any;
      if (md.delta?.stop_reason) {
        finishReason = normalizeFinishReason(md.delta.stop_reason);
      }
      if (md.usage) {
        usage = {
          prompt_tokens: 0,
          completion_tokens: md.usage.output_tokens ?? 0,
          total_tokens: md.usage.output_tokens ?? 0,
        };
      }
    }

    if (event.type === "message_start") {
      const ms = event as any;
      if (ms.message?.usage) {
        const u = ms.message.usage;
        usage = {
          prompt_tokens: u.input_tokens ?? 0,
          completion_tokens: u.output_tokens ?? 0,
          total_tokens: (u.input_tokens ?? 0) + (u.output_tokens ?? 0),
        };
      }
    }
  }

  const toolCalls: ToolCallData[] = [];
  let idx = 0;
  for (const [, acc] of toolCallAccumulators) {
    const tc: ToolCallData = { id: acc.id, name: acc.name, arguments: acc.argParts.join("") };
    toolCalls.push(tc);
    opts.onDelta({ type: "tool_call_done", toolCall: { index: idx++, ...tc } });
  }

  if (toolCalls.length > 0 && finishReason === "stop") {
    finishReason = "tool_calls";
  }

  const elapsed = Date.now() - start;
  const result: InvokeResult = {
    content: contentParts.join("") || null,
    reasoning: reasoningParts.join("") || null,
    toolCalls,
    finishReason,
    usage,
    model: config.model,
    provider: config.provider,
    elapsedMs: elapsed,
  };

  logResponse(config, elapsed, result);
  return result;
}

// ─── OpenAI Responses API streaming (for reasoning summary) ─────────

function openaiToResponsesInput(
  messages: OpenAI.Chat.ChatCompletionMessageParam[],
): { instructions: string; input: any[] } {
  let instructions = "";
  const input: any[] = [];

  for (const m of messages) {
    if (m.role === "system" || m.role === "developer") {
      instructions += (typeof m.content === "string" ? m.content : "") + "\n";
      continue;
    }
    if (m.role === "user") {
      input.push({
        role: "user",
        content: typeof m.content === "string" ? m.content : JSON.stringify(m.content),
      });
      continue;
    }
    if (m.role === "assistant") {
      const am = m as OpenAI.Chat.ChatCompletionAssistantMessageParam;
      if (am.tool_calls?.length) {
        if (am.content) {
          input.push({
            role: "assistant",
            content: typeof am.content === "string" ? am.content : JSON.stringify(am.content),
          });
        }
        for (const tc of am.tool_calls) {
          input.push({
            type: "function_call",
            call_id: tc.id,
            name: tc.function.name,
            arguments: tc.function.arguments,
          });
        }
      } else {
        input.push({
          role: "assistant",
          content: typeof am.content === "string" ? am.content : JSON.stringify(am.content ?? ""),
        });
      }
      continue;
    }
    if (m.role === "tool") {
      const tm = m as OpenAI.Chat.ChatCompletionToolMessageParam;
      input.push({
        type: "function_call_output",
        call_id: tm.tool_call_id,
        output: typeof tm.content === "string" ? tm.content : JSON.stringify(tm.content),
      });
    }
  }

  return { instructions: instructions.trim(), input };
}

function openaiToResponsesTools(tools?: OpenAI.Chat.ChatCompletionTool[]): any[] | undefined {
  if (!tools?.length) return undefined;
  return tools.map((t) => ({
    type: "function",
    name: t.function.name,
    description: t.function.description ?? "",
    parameters: t.function.parameters ?? { type: "object", properties: {} },
    strict: false,
  }));
}

async function runOpenAIResponsesStream(
  config: ProviderConfig,
  opts: StreamingInvokeOptions,
  reasoningMode: Exclude<ReasoningMode, "off">,
  start: number,
): Promise<InvokeResult> {
  const client = getClient(config, opts);
  const { instructions, input } = openaiToResponsesInput(opts.messages);
  const responsesTools = openaiToResponsesTools(opts.tools);

  const params: any = {
    model: config.model,
    input,
    stream: true,
    reasoning: { effort: reasoningMode, summary: "auto" },
    ...(instructions ? { instructions } : {}),
    ...(responsesTools ? { tools: responsesTools, tool_choice: "auto" } : {}),
  };

  console.log(`[inference] → openai-responses model=${config.model} reasoning effort=${reasoningMode}`);

  const stream = await client.responses.create(params) as unknown as AsyncIterable<any>;

  let contentParts: string[] = [];
  let reasoningParts: string[] = [];
  let toolCallAccumulators: Map<string, { callId: string; name: string; argParts: string[]; index: number }> = new Map();
  let toolCallIndex = 0;
  let finishReason: FinishReason = "stop";
  let usage: OpenAI.Completions.CompletionUsage | undefined;
  let model = config.model;

  for await (const event of stream) {
    if (opts.abortSignal?.aborted) {
      finishReason = "stop";
      break;
    }

    switch (event.type) {
      case "response.output_text.delta": {
        const text = event.delta as string;
        if (text) {
          contentParts.push(text);
          opts.onDelta({ type: "text", content: text });
        }
        break;
      }

      case "response.reasoning_summary_text.delta": {
        const text = event.delta as string;
        if (text) {
          reasoningParts.push(text);
          opts.onDelta({ type: "reasoning", content: text });
        }
        break;
      }

      case "response.output_item.added": {
        const item = event.item;
        if (item?.type === "function_call") {
          const idx = toolCallIndex++;
          toolCallAccumulators.set(item.call_id ?? item.id ?? `tc_${idx}`, {
            callId: item.call_id ?? item.id ?? `tc_${idx}`,
            name: item.name ?? "",
            argParts: [],
            index: idx,
          });
          opts.onDelta({
            type: "tool_call_start",
            toolCall: { index: idx, id: item.call_id ?? item.id, name: item.name },
          });
        }
        break;
      }

      case "response.function_call_arguments.delta": {
        const delta = event.delta as string;
        const itemId = event.item_id as string;
        const acc = toolCallAccumulators.get(itemId)
          ?? [...toolCallAccumulators.values()].at(-1);
        if (acc && delta) {
          acc.argParts.push(delta);
          opts.onDelta({
            type: "tool_call_delta",
            toolCall: { index: acc.index },
            content: delta,
          });
        }
        break;
      }

      case "response.function_call_arguments.done": {
        const itemId = event.item_id as string;
        const acc = toolCallAccumulators.get(itemId)
          ?? [...toolCallAccumulators.values()].at(-1);
        if (acc) {
          acc.argParts = [event.arguments ?? acc.argParts.join("")];
        }
        break;
      }

      case "response.completed": {
        const resp = event.response;
        if (resp?.model) model = resp.model;
        if (resp?.status === "incomplete") {
          finishReason = "length";
        }
        if (resp?.usage) {
          usage = {
            prompt_tokens: resp.usage.input_tokens ?? 0,
            completion_tokens: resp.usage.output_tokens ?? 0,
            total_tokens: (resp.usage.input_tokens ?? 0) + (resp.usage.output_tokens ?? 0),
          };
        }
        break;
      }

      case "response.failed": {
        const resp = event.response;
        const errMsg = resp?.error?.message ?? "Unknown Responses API error";
        console.error(`[inference] Responses API failed: ${errMsg}`);
        throw new Error(errMsg);
      }
    }
  }

  const toolCalls: ToolCallData[] = [];
  for (const [, acc] of toolCallAccumulators) {
    const tc: ToolCallData = {
      id: acc.callId,
      name: acc.name,
      arguments: acc.argParts.join(""),
    };
    toolCalls.push(tc);
    opts.onDelta({ type: "tool_call_done", toolCall: { index: acc.index, ...tc } });
  }

  if (toolCalls.length > 0 && finishReason === "stop") {
    finishReason = "tool_calls";
  }

  const elapsed = Date.now() - start;
  const result: InvokeResult = {
    content: contentParts.join("") || null,
    reasoning: reasoningParts.join("") || null,
    toolCalls,
    finishReason,
    usage,
    model,
    provider: config.provider,
    elapsedMs: elapsed,
  };

  logResponse(config, elapsed, result);
  return result;
}

// ─── invoke_llm_streaming — streaming with tool calls ────────────────

export async function invoke_llm_streaming(opts: StreamingInvokeOptions): Promise<InvokeResult> {
  const config = await getProvider();
  const reasoningMode = opts.reasoningMode ?? "medium";
  const start = Date.now();

  if (reasoningMode !== "off" && config.provider === "anthropic") {
    const budget = ANTHROPIC_BUDGET_TOKENS[reasoningMode];
    logRequest(config, opts, true);
    return await runAnthropicThinkingStream(config, opts, budget, start);
  }

  if (reasoningMode !== "off" && config.provider === "openai") {
    logRequest(config, opts, true);
    return await runOpenAIResponsesStream(config, opts, reasoningMode, start);
  }

  const client = getClient(config, opts);
  const requestedTemp = clampTemperature(config.model, opts.temperature ?? 0.75);

  logRequest(config, opts, true);

  const runStream = async (temp: number): Promise<InvokeResult> => {
    const params = buildCompletionConfig(config, opts, temp, true);

    if (reasoningMode !== "off" && config.provider === "openai-compatible") {
      params.reasoning_effort = reasoningMode;
    }

    const stream = await client.chat.completions.create(params) as unknown as AsyncIterable<OpenAI.Chat.ChatCompletionChunk>;

    let contentParts: string[] = [];
    let reasoningParts: string[] = [];
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

      const d = delta as Record<string, unknown>;
      const reasoningContent =
        (typeof d.reasoning_content === "string" ? d.reasoning_content : null) ??
        (typeof d.reasoning_text === "string" ? d.reasoning_text : null) ??
        (d.reasoning_text && typeof (d.reasoning_text as { text?: string }).text === "string"
          ? (d.reasoning_text as { text: string }).text
          : null) ??
        (typeof d.reasoning === "string" ? d.reasoning : null);
      if (reasoningContent) {
        reasoningParts.push(reasoningContent);
        opts.onDelta({ type: "reasoning", content: reasoningContent });
      }

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
      reasoning: reasoningParts.join("") || null,
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
    reasoning: null,
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
