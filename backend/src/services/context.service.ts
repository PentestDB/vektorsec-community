import OpenAI from "openai";
import { invoke_llm } from "../utils/llm/providers";
import { getProvider } from "../utils/llm/providers";
import { AgentMessageDoc } from "../models/Sessions/Sessions.model";
import { EngagementState } from "./engagement-state";
import { getModelContextLimit } from "../utils/modelMetadata";

const SUMMARIZE_THRESHOLD = 0.70;
const CHARS_PER_TOKEN_ESTIMATE = 3.5;
const PRESERVE_RECENT_MESSAGES = 8;

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
  const limit = getModelContextLimit(config.model);
  const inputTokens = lastPromptTokens ?? estimateMessagesTokens(
    messages.map((m) => ({ role: m.role, content: m.content })),
  );
  return inputTokens > limit * SUMMARIZE_THRESHOLD;
}

const FALLBACK_SUMMARIZE_PROMPT = `You are a penetration test engagement summarizer. Your job is to compress a conversation history into a dense summary that preserves all important context for continuing the engagement.

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

function buildSummarizePrompt(state?: EngagementState): string {
  if (state && !state.isEmpty()) {
    return `You are summarizing an agent conversation. A structured engagement state is maintained separately and will be preserved across this summarization. Focus your summary on:
- Reasoning, hypotheses, and analysis NOT captured in the structured state
- Context about WHY certain approaches were tried
- Observations that don't fit structured categories
- Current thinking direction and open questions
- Active shells and their purposes

Do NOT re-list hosts, ports, credentials, vulnerabilities, flag attempts, or file analyses — those are already tracked in the structured engagement state below:

${state.toPromptBlock()}

Summarize only the reasoning and narrative context around these findings.`;
  }
  return FALLBACK_SUMMARIZE_PROMPT;
}

export async function summarizeMessages(
  messages: AgentMessageDoc[],
  traceContext?: { sessionId?: string; userId?: string },
  engagementState?: EngagementState,
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

  let splitIndex = nonSystemMessages.length - PRESERVE_RECENT_MESSAGES;

  // Walk the split boundary backwards so we never orphan tool-result messages
  // from their preceding assistant+tool_calls message. If the first preserved
  // message is a tool result, pull the boundary back until the matching
  // assistant message (and any sibling tool results) are also preserved.
  while (splitIndex > 0 && nonSystemMessages[splitIndex]?.role === "tool") {
    splitIndex--;
  }

  const toSummarize = nonSystemMessages.slice(0, splitIndex);
  const toPreserve = nonSystemMessages.slice(splitIndex);

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
      { role: "system", content: buildSummarizePrompt(engagementState) },
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
  includeReasoningContent = false,
): OpenAI.Chat.ChatCompletionMessageParam[] {
  const toolResponseIds = new Set(
    messages.filter((m) => m.role === "tool" && m.toolCallId).map((m) => m.toolCallId!),
  );

  // Collect all tool_call IDs present on assistant messages so we can
  // detect orphaned tool-result messages whose assistant was summarized away.
  const assistantToolCallIds = new Set<string>();
  for (const m of messages) {
    if (m.role === "assistant" && m.toolCalls?.length) {
      for (const tc of m.toolCalls) {
        assistantToolCallIds.add(tc.id);
      }
    }
  }

  return messages.flatMap((m) => {
    if (m.role === "assistant" && m.toolCalls?.length) {
      const validToolCalls = m.toolCalls.filter((tc) => toolResponseIds.has(tc.id));

      if (validToolCalls.length === 0) {
        const assistantMessage: OpenAI.Chat.ChatCompletionAssistantMessageParam & {
          reasoning_content?: string;
        } = {
          role: "assistant" as const,
          content: m.content ?? "",
        };
        if (includeReasoningContent && m.reasoning) {
          assistantMessage.reasoning_content = m.reasoning;
        }
        return assistantMessage;
      }

      const assistantMessage: OpenAI.Chat.ChatCompletionAssistantMessageParam & {
        reasoning_content?: string;
      } = {
        role: "assistant" as const,
        content: m.content,
        tool_calls: validToolCalls.map((tc) => {
          const call: Record<string, unknown> = {
            id: tc.id,
            type: "function" as const,
            function: { name: tc.name, arguments: tc.arguments },
          };
          // Echo provider passthrough (Gemini's extra_content.google
          // thought_signature) verbatim; omitting it 400s multi-turn tools.
          const extra = (tc as { extraContent?: unknown }).extraContent;
          if (extra != null) call.extra_content = extra;
          return call;
        }) as unknown as OpenAI.Chat.ChatCompletionMessageToolCall[],
      };
      if (includeReasoningContent && m.reasoning) {
        assistantMessage.reasoning_content = m.reasoning;
      }
      return assistantMessage;
    }

    if (m.role === "tool") {
      // Drop orphaned tool results whose assistant+tool_calls was removed
      // (e.g. by summarization). Sending these causes 400 errors on the
      // OpenAI Responses API ("No tool call found for function call output").
      if (!m.toolCallId || !assistantToolCallIds.has(m.toolCallId)) {
        return [];
      }
      return {
        role: "tool" as const,
        content: m.content ?? "",
        tool_call_id: m.toolCallId,
      };
    }

    const message = {
      role: m.role as "system" | "user" | "assistant",
      content: m.content ?? "",
    };
    if (includeReasoningContent && m.role === "assistant" && m.reasoning) {
      return { ...message, reasoning_content: m.reasoning };
    }
    return message;
  });
}
