import OpenAI from "openai";
import { invoke_llm } from "../utils/llm/providers";
import { getProvider } from "../utils/llm/providers";
import { AgentMessageDoc } from "../models/Sessions/Sessions.model";

const MODEL_CONTEXT_LIMITS: Record<string, number> = {
  "gpt-4o": 128_000,
  "gpt-4o-mini": 128_000,
  "gpt-4-turbo": 128_000,
  "gpt-4-turbo-preview": 128_000,
  "gpt-4": 8_192,
  "gpt-3.5-turbo": 16_385,
  "gpt-5-nano": 128_000,
  "claude-sonnet-4-20250514": 200_000,
  "claude-3-5-sonnet-20241022": 200_000,
  "claude-3-opus-20240229": 200_000,
  "claude-3-haiku-20240307": 200_000,
};

const DEFAULT_CONTEXT_LIMIT = 128_000;
const SUMMARIZE_THRESHOLD = 0.70;
const CHARS_PER_TOKEN_ESTIMATE = 3.5;
const PRESERVE_RECENT_MESSAGES = 8;

function getContextLimit(model: string): number {
  for (const [key, limit] of Object.entries(MODEL_CONTEXT_LIMITS)) {
    if (model.includes(key)) return limit;
  }
  return DEFAULT_CONTEXT_LIMIT;
}

function estimateTokens(text: string | null): number {
  if (!text) return 0;
  return Math.ceil(text.length / CHARS_PER_TOKEN_ESTIMATE);
}

function estimateMessagesTokens(messages: Array<{ role: string; content: string | null }>): number {
  let total = 0;
  for (const msg of messages) {
    total += 4; // role + structural overhead
    total += estimateTokens(msg.content);
  }
  return total;
}

export async function shouldSummarize(
  messages: AgentMessageDoc[],
  lastPromptTokens?: number,
): Promise<boolean> {
  const config = await getProvider();
  const limit = getContextLimit(config.model);
  const inputTokens = lastPromptTokens ?? estimateMessagesTokens(
    messages.map((m) => ({ role: m.role, content: m.content })),
  );
  return inputTokens > limit * SUMMARIZE_THRESHOLD;
}

const SUMMARIZE_SYSTEM_PROMPT = `You are a penetration test engagement summarizer. Your job is to compress a conversation history into a dense summary that preserves all important context for continuing the engagement.

Include in your summary:
- Target IP(s), hostnames, and network details
- All open ports and services discovered (with versions)
- Tools used and their key findings
- Vulnerabilities identified (with severity assessment)
- Credentials, tokens, or secrets discovered
- Files created or downloaded
- Current attack surface understanding
- What has been attempted and the results
- Promising attack vectors not yet explored
- Active persistent shells and their purposes (shell IDs, labels, what is running in them)
- Any subagents that were spawned and their status/results

Be comprehensive. This summary replaces the full conversation history.`;

export async function summarizeMessages(
  messages: AgentMessageDoc[],
  traceContext?: { sessionId?: string; userId?: string },
): Promise<{
  summaryMessage: AgentMessageDoc;
  preservedMessages: AgentMessageDoc[];
}> {
  const systemMsg = messages.find((m) => m.role === "system");
  const nonSystemMessages = messages.filter((m) => m.role !== "system");

  if (nonSystemMessages.length <= PRESERVE_RECENT_MESSAGES) {
    return {
      summaryMessage: null as any,
      preservedMessages: messages,
    };
  }

  const toSummarize = nonSystemMessages.slice(0, -PRESERVE_RECENT_MESSAGES);
  const toPreserve = nonSystemMessages.slice(-PRESERVE_RECENT_MESSAGES);

  const conversationText = toSummarize
    .map((m) => {
      if (m.role === "assistant" && m.toolCalls?.length) {
        const toolDesc = m.toolCalls
          .map((tc) => `[Tool: ${tc.name}](${tc.arguments})`)
          .join(", ");
        return `Assistant: ${m.content ?? ""} ${toolDesc}`;
      }
      if (m.role === "tool") {
        return `Tool Result (${m.toolName ?? "unknown"}): ${m.content?.slice(0, 500) ?? ""}`;
      }
      return `${m.role}: ${m.content ?? ""}`;
    })
    .join("\n\n");

  const summaryResult = await invoke_llm({
    messages: [
      { role: "system", content: SUMMARIZE_SYSTEM_PROMPT },
      { role: "user", content: conversationText },
    ] as OpenAI.Chat.ChatCompletionMessageParam[],
    temperature: 0.3,
    sessionId: traceContext?.sessionId,
    userId: traceContext?.userId,
    tags: ["agent", "context", "summarize"],
    generationName: "context-summarization",
  });

  const summaryContent = summaryResult.content ?? "Summary generation failed.";

  const summaryMessage: AgentMessageDoc = {
    id: `summary_${Date.now()}`,
    role: "system",
    content: `[Previous conversation summarized]\n\n${summaryContent}`,
    timestamp: new Date(),
    turnIndex: toPreserve[0]?.turnIndex ?? 0,
    isSummary: true,
  };

  const result: AgentMessageDoc[] = [];
  if (systemMsg) result.push(systemMsg);
  result.push(summaryMessage);
  result.push(...toPreserve);

  return {
    summaryMessage,
    preservedMessages: result,
  };
}

export function messagesToOpenAI(
  messages: AgentMessageDoc[],
): OpenAI.Chat.ChatCompletionMessageParam[] {
  const toolResponseIds = new Set(
    messages.filter((m) => m.role === "tool" && m.toolCallId).map((m) => m.toolCallId!),
  );

  return messages.map((m) => {
    if (m.role === "assistant" && m.toolCalls?.length) {
      const validToolCalls = m.toolCalls.filter((tc) => toolResponseIds.has(tc.id));

      if (validToolCalls.length === 0) {
        return {
          role: "assistant" as const,
          content: m.content ?? "",
        };
      }

      return {
        role: "assistant" as const,
        content: m.content,
        tool_calls: validToolCalls.map((tc) => ({
          id: tc.id,
          type: "function" as const,
          function: { name: tc.name, arguments: tc.arguments },
        })),
      };
    }

    if (m.role === "tool") {
      return {
        role: "tool" as const,
        content: m.content ?? "",
        tool_call_id: m.toolCallId ?? "",
      };
    }

    return {
      role: m.role as "system" | "user" | "assistant",
      content: m.content ?? "",
    };
  });
}
