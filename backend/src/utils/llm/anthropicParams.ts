import type OpenAI from "openai";
import type Anthropic from "@anthropic-ai/sdk";
import { parseToolArguments } from "../toolArguments";

/**
 * Builders for Anthropic native Messages API requests.
 *
 * These are kept free of runtime/SDK-client dependencies so the request shape
 * can be unit-tested in isolation.
 *
 * NOTE: `temperature` is intentionally never sent. Recent Anthropic models
 * reject it (HTTP 400 "temperature is deprecated for this model") and the
 * OpenAI-shaped retry handler in providers.ts does not match the Anthropic
 * error format, so a request that includes it can never recover. Omitting it
 * lets the model apply its own default and works across every Anthropic model.
 */

const DEFAULT_MAX_TOKENS = 8192;

function openaiUserContentToAnthropic(
  content: OpenAI.Chat.ChatCompletionUserMessageParam["content"],
): string | Anthropic.ContentBlockParam[] {
  if (typeof content === "string") return content;
  const blocks: Anthropic.ContentBlockParam[] = [];
  for (const part of content) {
    if (part.type === "text") {
      blocks.push({ type: "text", text: part.text });
      continue;
    }
    if (part.type === "image_url") {
      const url = part.image_url.url;
      const dataMatch = url.match(
        /^data:(image\/(?:jpeg|png|gif|webp));base64,(.+)$/s,
      );
      blocks.push({
        type: "image",
        source: dataMatch
          ? {
              type: "base64",
              media_type: dataMatch[1] as
                | "image/jpeg"
                | "image/png"
                | "image/gif"
                | "image/webp",
              data: dataMatch[2],
            }
          : { type: "url", url },
      });
      continue;
    }
    blocks.push({ type: "text", text: JSON.stringify(part) });
  }
  return blocks;
}

export interface AnthropicRequestInput {
  model: string;
  messages: OpenAI.Chat.ChatCompletionMessageParam[];
  tools?: OpenAI.Chat.ChatCompletionTool[];
  reasoningMode?: "off" | "low" | "medium" | "high" | "xhigh" | "max";
}

function usesAdaptiveThinking(model: string): boolean {
  return (
    /claude-(fable|mythos|opus|sonnet)-5/.test(model) ||
    /claude-opus-4-[678]/.test(model) ||
    model.includes("claude-sonnet-4-6") ||
    model.includes("claude-mythos-preview")
  );
}

function requiresAdaptiveThinking(model: string): boolean {
  return /claude-(fable|mythos)-5/.test(model);
}

function adaptiveControls(input: AnthropicRequestInput): Record<string, any> {
  if (!usesAdaptiveThinking(input.model)) return {};
  const mode = input.reasoningMode ?? "off";
  if (mode === "off") {
    return requiresAdaptiveThinking(input.model)
      ? { thinking: { type: "adaptive" }, output_config: { effort: "low" } }
      : { thinking: { type: "disabled" } };
  }
  return {
    thinking: { type: "adaptive" },
    output_config: { effort: mode },
  };
}

export function openaiToAnthropicMessages(
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
      out.push({
        role: "user",
        content: openaiUserContentToAnthropic(m.content),
      });
      continue;
    }
    if (m.role === "assistant") {
      const am = m as OpenAI.Chat.ChatCompletionAssistantMessageParam;
      const blocks: Anthropic.ContentBlockParam[] = [];
      if (am.content)
        blocks.push({
          type: "text",
          text:
            typeof am.content === "string"
              ? am.content
              : JSON.stringify(am.content),
        });
      if (am.tool_calls) {
        for (const tc of am.tool_calls) {
          let input: Record<string, unknown> = {};
          try {
            input = parseToolArguments(tc.function.arguments).args;
          } catch {
            /* Keep malformed historical calls from breaking the request. */
          }
          blocks.push({
            type: "tool_use",
            id: tc.id,
            name: tc.function.name,
            input,
          });
        }
      }
      if (blocks.length) out.push({ role: "assistant", content: blocks });
      continue;
    }
    if (m.role === "tool") {
      const tm = m as OpenAI.Chat.ChatCompletionToolMessageParam;
      out.push({
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: tm.tool_call_id,
            content:
              typeof tm.content === "string"
                ? tm.content
                : JSON.stringify(tm.content),
          },
        ],
      });
    }
  }

  return { system: system.trim(), messages: out };
}

export function openaiToAnthropicTools(
  tools?: OpenAI.Chat.ChatCompletionTool[],
): Anthropic.Tool[] | undefined {
  if (!tools?.length) return undefined;
  return tools.map((t) => ({
    name: t.function.name,
    description: t.function.description ?? "",
    input_schema: (t.function.parameters ?? {
      type: "object",
      properties: {},
    }) as Anthropic.Tool.InputSchema,
  }));
}

export function buildAnthropicMessageParams(
  input: AnthropicRequestInput,
): Anthropic.MessageCreateParamsNonStreaming {
  const { system, messages } = openaiToAnthropicMessages(input.messages);
  const tools = openaiToAnthropicTools(input.tools);

  return {
    model: input.model,
    max_tokens:
      input.reasoningMode === "xhigh" || input.reasoningMode === "max"
        ? 64000
        : DEFAULT_MAX_TOKENS,
    messages,
    ...adaptiveControls(input),
    ...(system ? { system } : {}),
    ...(tools ? { tools, tool_choice: { type: "auto" } } : {}),
  };
}

export function buildAnthropicStreamParams(
  input: AnthropicRequestInput,
  budgetTokens: number | null,
): Anthropic.MessageCreateParamsStreaming {
  const { system, messages } = openaiToAnthropicMessages(input.messages);
  const tools = openaiToAnthropicTools(input.tools);

  return {
    model: input.model,
    max_tokens: budgetTokens
      ? Math.min(64000, Math.max(16384, budgetTokens + 4096))
      : DEFAULT_MAX_TOKENS,
    stream: true,
    messages,
    ...(system ? { system } : {}),
    ...(usesAdaptiveThinking(input.model)
      ? adaptiveControls(input)
      : budgetTokens
      ? { thinking: { type: "enabled", budget_tokens: budgetTokens } as const }
      : {}),
    ...(tools ? { tools, tool_choice: { type: "auto" } as const } : {}),
  };
}
