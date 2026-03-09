import { v4 as uuidv4 } from "uuid";
import SessionsModel, { AgentMessageDoc } from "../models/Sessions/Sessions.model";
import { SSEWriter } from "./agent.service";
import { invoke_llm, invoke_llm_streaming, getProvider } from "../utils/llm/providers";
import { sessionLifecycle } from "./session.lifecycle";

export interface SlashCommandDef {
  name: string;
  description: string;
  usage: string;
  args?: { name: string; required: boolean; description: string }[];
}

export const SLASH_COMMANDS: SlashCommandDef[] = [
  {
    name: "summarize",
    description: "Summarize the entire session so far",
    usage: "/summarize",
  },
  {
    name: "status",
    description: "Show current engagement status — targets, ports, vulns, credentials",
    usage: "/status",
  },
  {
    name: "clear",
    description: "Clear the conversation context (keeps system prompt)",
    usage: "/clear",
  },
  {
    name: "help",
    description: "List all available slash commands",
    usage: "/help",
  },
  {
    name: "targets",
    description: "Extract and list all targets/IPs mentioned in the session",
    usage: "/targets",
  },
  {
    name: "export",
    description: "Export session findings as a structured report",
    usage: "/export",
  },
  {
    name: "shells",
    description: "List all active and closed shell sessions",
    usage: "/shells",
  },
  {
    name: "reset",
    description: "Reset agent state to idle (useful if agent is stuck)",
    usage: "/reset",
  },
];

export function parseSlashCommand(input: string): { command: string; args: string } | null {
  const trimmed = input.trim();
  if (!trimmed.startsWith("/")) return null;
  const spaceIdx = trimmed.indexOf(" ");
  if (spaceIdx === -1) {
    return { command: trimmed.slice(1).toLowerCase(), args: "" };
  }
  return {
    command: trimmed.slice(1, spaceIdx).toLowerCase(),
    args: trimmed.slice(spaceIdx + 1).trim(),
  };
}

export function matchCommands(partial: string): SlashCommandDef[] {
  const lower = partial.toLowerCase().replace(/^\//, "");
  if (!lower) return SLASH_COMMANDS;
  return SLASH_COMMANDS.filter((cmd) => cmd.name.startsWith(lower));
}

export async function executeSlashCommand(params: {
  sessionId: string;
  userId: string;
  command: string;
  args: string;
  sse: SSEWriter;
}): Promise<void> {
  const { sessionId, userId, command, args, sse } = params;

  const handler = commandHandlers[command];
  if (!handler) {
    sse.write("slash_command_result", {
      command,
      success: false,
      content: `Unknown command \`/${command}\`. Type \`/help\` to see available commands.`,
    });
    sse.write("done", { message: "Slash command completed" });
    sse.end();
    return;
  }

  try {
    await handler({ sessionId, userId, args, sse });
  } catch (err: any) {
    console.error(`[slash-command] /${command} error:`, err);
    sse.write("slash_command_result", {
      command,
      success: false,
      content: `Error executing \`/${command}\`: ${err.message ?? "Unknown error"}`,
    });
    sse.write("done", { message: "Slash command completed" });
    sse.end();
  }
}

type CommandHandler = (ctx: {
  sessionId: string;
  userId: string;
  args: string;
  sse: SSEWriter;
}) => Promise<void>;

const CHARS_PER_TOKEN_ESTIMATE = 3.5;
const SUMMARIZE_PROMPT_OVERHEAD_TOKENS = 500;

function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN_ESTIMATE);
}

const MODEL_CONTEXT_LIMITS: Record<string, number> = {
  "gpt-4o": 128_000,
  "gpt-4o-mini": 128_000,
  "gpt-4-turbo": 128_000,
  "gpt-4": 8_192,
  "gpt-3.5-turbo": 16_385,
  "claude-sonnet-4-20250514": 200_000,
  "claude-3-5-sonnet-20241022": 200_000,
  "claude-3-opus-20240229": 200_000,
  "claude-3-haiku-20240307": 200_000,
};
const DEFAULT_CONTEXT_LIMIT = 128_000;

async function getMaxInputTokens(): Promise<number> {
  const config = await getProvider();
  const limit = Object.entries(MODEL_CONTEXT_LIMITS).find(([k]) =>
    config.model.includes(k),
  )?.[1] ?? DEFAULT_CONTEXT_LIMIT;
  return Math.floor(limit * 0.6) - SUMMARIZE_PROMPT_OVERHEAD_TOKENS;
}

function formatMessageForSummary(m: any): string {
  if (m.role === "assistant" && m.toolCalls?.length) {
    const toolDesc = m.toolCalls
      .map((tc: any) => `[Tool: ${tc.name}](${tc.arguments})`)
      .join(", ");
    return `Assistant: ${m.content ?? ""} ${toolDesc}`;
  }
  if (m.role === "tool") {
    return `Tool Result (${m.toolName ?? "unknown"}): ${m.content?.slice(0, 500) ?? ""}`;
  }
  return `${m.role}: ${m.content ?? ""}`;
}

/**
 * Builds conversation text for the summarize prompt, keeping the latest
 * messages when the full history would exceed the model's input token budget.
 */
async function buildConversationTextForSummarize(messages: any[]): Promise<string> {
  const maxTokens = await getMaxInputTokens();

  const formatted = messages.map(formatMessageForSummary);

  const fullText = formatted.join("\n\n");
  if (estimateTokens(fullText) <= maxTokens) {
    return fullText;
  }

  const kept: string[] = [];
  let tokenBudget = maxTokens;

  for (let i = formatted.length - 1; i >= 0; i--) {
    const entry = formatted[i];
    const entryTokens = estimateTokens(entry) + 2;
    if (tokenBudget - entryTokens < 0) break;
    kept.unshift(entry);
    tokenBudget -= entryTokens;
  }

  return kept.join("\n\n");
}

const commandHandlers: Record<string, CommandHandler> = {
  help: async ({ sse }) => {
    const lines = SLASH_COMMANDS.map(
      (cmd) => `**\`/${cmd.name}\`** — ${cmd.description}`,
    );
    sse.write("slash_command_result", {
      command: "help",
      success: true,
      content: `### Available Commands\n\n${lines.join("\n\n")}`,
    });
    sse.write("done", { message: "Slash command completed" });
    sse.end();
  },

  clear: async ({ sessionId, sse }) => {
    const session = await SessionsModel.findOne({ sessionId });
    if (!session) {
      sse.write("slash_command_result", { command: "clear", success: false, content: "Session not found." });
      sse.write("done", { message: "Slash command completed" });
      sse.end();
      return;
    }

    const systemMsg = session.messages?.find((m: any) => m.role === "system" && !m.isSummary);

    await SessionsModel.updateOne(
      { sessionId },
      {
        $set: {
          messages: systemMsg ? [systemMsg] : [],
          subagents: [],
          agentState: "idle",
          pendingConsent: null,
          pendingManualExecution: null,
        },
      },
    );

    sse.write("slash_command_result", {
      command: "clear",
      success: true,
      content: "Context cleared. Session history has been reset.",
      action: "clear_messages",
    });
    sse.write("done", { message: "Slash command completed" });
    sse.end();
  },

  reset: async ({ sessionId, sse }) => {
    await SessionsModel.updateOne(
      { sessionId },
      {
        $set: {
          agentState: "idle",
          pendingConsent: null,
          pendingManualExecution: null,
        },
      },
    );

    sse.write("slash_command_result", {
      command: "reset",
      success: true,
      content: "Agent state has been reset to idle.",
      action: "reset_state",
    });
    sse.write("done", { message: "Slash command completed" });
    sse.end();
  },

  summarize: async ({ sessionId, sse }) => {
    const session = await SessionsModel.findOne({ sessionId });
    if (!session) {
      sse.write("slash_command_result", { command: "summarize", success: false, content: "Session not found." });
      sse.write("done", { message: "Slash command completed" });
      sse.end();
      return;
    }

    const nonSystemMessages = session.messages.filter(
      (m: any) => m.role !== "system",
    );

    if (nonSystemMessages.length === 0) {
      sse.write("slash_command_result", {
        command: "summarize",
        success: true,
        content: "Nothing to summarize — the session is empty.",
      });
      sse.write("done", { message: "Slash command completed" });
      sse.end();
      return;
    }

    const conversationText = await buildConversationTextForSummarize(nonSystemMessages);

    const resultId = `slash_result_${Date.now()}`;
    sse.write("slash_command_ack", { command: "summarize", message: "Generating summary..." });

    sse.write("slash_command_result", {
      command: "summarize",
      success: true,
      content: "",
      streaming: true,
      id: resultId,
    });

    let accumulated = "";

    const result = await invoke_llm_streaming({
      messages: [
        {
          role: "system",
          content: `You are a concise penetration test engagement summarizer. Summarize the engagement so far in a clear, structured format. Include: targets, discovered services/ports, tools used, vulnerabilities found, credentials obtained, current status, and recommended next steps. Use markdown formatting.`,
        },
        { role: "user", content: conversationText },
      ],
      temperature: 0.3,
      tags: ["slash-command", "summarize"],
      generationName: "slash-summarize",
      onDelta(delta) {
        if (delta.type === "text" && delta.content) {
          accumulated += delta.content;
          sse.write("slash_command_stream", {
            command: "summarize",
            id: resultId,
            content: delta.content,
          });
        }
      },
    });

    sse.write("slash_command_done", {
      command: "summarize",
      id: resultId,
      content: accumulated || result.content || "Failed to generate summary.",
    });
    sse.write("done", { message: "Slash command completed" });
    sse.end();
  },

  status: async ({ sessionId, sse }) => {
    const session = await SessionsModel.findOne({ sessionId });
    if (!session) {
      sse.write("slash_command_result", { command: "status", success: false, content: "Session not found." });
      sse.write("done", { message: "Slash command completed" });
      sse.end();
      return;
    }

    const lines: string[] = [];

    lines.push(`### Session Status`);
    lines.push(``);
    lines.push(`- **Session ID:** \`${sessionId}\``);
    lines.push(`- **Agent State:** ${session.agentState}`);
    lines.push(`- **Messages:** ${session.messages.length}`);
    lines.push(`- **Turn Index:** ${session.turnIndex}`);
    lines.push(`- **Total Tokens Used:** ${session.totalTokens?.toLocaleString() ?? 0}`);

    const subagents = session.subagents ?? [];
    if (subagents.length > 0) {
      lines.push(``);
      lines.push(`#### Subagents`);
      for (const s of subagents) {
        lines.push(`- \`${s.subagentId}\` — ${s.task} (${s.status})`);
      }
    }

    sse.write("slash_command_result", {
      command: "status",
      success: true,
      content: lines.join("\n"),
    });
    sse.write("done", { message: "Slash command completed" });
    sse.end();
  },

  targets: async ({ sessionId, sse }) => {
    const session = await SessionsModel.findOne({ sessionId });
    if (!session) {
      sse.write("slash_command_result", { command: "targets", success: false, content: "Session not found." });
      sse.write("done", { message: "Slash command completed" });
      sse.end();
      return;
    }

    const allContent = session.messages
      .map((m: any) => m.content ?? "")
      .join("\n");

    const ipv4Pattern = /\b(?:(?:25[0-5]|2[0-4]\d|1\d{2}|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d{2}|[1-9]?\d)\b/g;
    const hostnamePattern = /\b(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}\b/g;

    const ips = [...new Set(allContent.match(ipv4Pattern) ?? [])];
    const hostnames = [...new Set(allContent.match(hostnamePattern) ?? [])].filter(
      (h) => !h.match(/\.(js|ts|py|txt|json|xml|html|css|scss|md|log|csv|pdf|png|jpg)$/i),
    );

    const lines: string[] = ["### Discovered Targets", ""];

    if (ips.length > 0) {
      lines.push("#### IP Addresses");
      for (const ip of ips) lines.push(`- \`${ip}\``);
      lines.push("");
    }

    if (hostnames.length > 0) {
      lines.push("#### Hostnames");
      for (const h of hostnames) lines.push(`- \`${h}\``);
      lines.push("");
    }

    if (ips.length === 0 && hostnames.length === 0) {
      lines.push("No targets found in the session history.");
    }

    sse.write("slash_command_result", {
      command: "targets",
      success: true,
      content: lines.join("\n"),
    });
    sse.write("done", { message: "Slash command completed" });
    sse.end();
  },

  export: async ({ sessionId, sse }) => {
    const session = await SessionsModel.findOne({ sessionId });
    if (!session) {
      sse.write("slash_command_result", { command: "export", success: false, content: "Session not found." });
      sse.write("done", { message: "Slash command completed" });
      sse.end();
      return;
    }

    const nonSystemMessages = session.messages.filter(
      (m: any) => m.role !== "system",
    );

    if (nonSystemMessages.length === 0) {
      sse.write("slash_command_result", {
        command: "export",
        success: true,
        content: "Nothing to export — the session is empty.",
      });
      sse.write("done", { message: "Slash command completed" });
      sse.end();
      return;
    }

    const conversationText = nonSystemMessages
      .map((m: any) => {
        if (m.role === "assistant" && m.toolCalls?.length) {
          const toolDesc = m.toolCalls
            .map((tc: any) => `[Tool: ${tc.name}](${tc.arguments})`)
            .join(", ");
          return `Assistant: ${m.content ?? ""} ${toolDesc}`;
        }
        if (m.role === "tool") {
          return `Tool Result (${m.toolName ?? "unknown"}): ${m.content?.slice(0, 1000) ?? ""}`;
        }
        return `${m.role}: ${m.content ?? ""}`;
      })
      .join("\n\n");

    sse.write("slash_command_ack", { command: "export", message: "Generating report..." });

    const result = await invoke_llm({
      messages: [
        {
          role: "system",
          content: `You are a professional penetration test report writer. Generate a structured pentest report from the engagement conversation. Use this format:

# Penetration Test Report

## Executive Summary
Brief overview of the engagement, methodology, and key findings.

## Scope
List of in-scope targets, IP addresses, networks.

## Findings

### Finding 1: [Title]
- **Severity:** Critical/High/Medium/Low/Info
- **Affected Systems:** ...
- **Description:** ...
- **Evidence:** ...
- **Recommendation:** ...

(repeat for each finding)

## Tools Used
List of tools and their purpose.

## Recommendations
Prioritized remediation steps.

## Appendix
Any additional data, raw outputs, or notes.

Use markdown formatting. Be thorough but concise.`,
        },
        { role: "user", content: conversationText },
      ],
      temperature: 0.3,
      tags: ["slash-command", "export"],
      generationName: "slash-export-report",
    });

    sse.write("slash_command_result", {
      command: "export",
      success: true,
      content: result.content ?? "Failed to generate report.",
    });
    sse.write("done", { message: "Slash command completed" });
    sse.end();
  },

  shells: async ({ sessionId, sse }) => {
    let shellManager;
    try {
      shellManager = await sessionLifecycle.getShellManager(sessionId);
    } catch {
      sse.write("slash_command_result", {
        command: "shells",
        success: true,
        content: "No shell manager available for this session.",
      });
      sse.write("done", { message: "Slash command completed" });
      sse.end();
      return;
    }

    const shells = shellManager.getShellList();
    if (shells.length === 0) {
      sse.write("slash_command_result", {
        command: "shells",
        success: true,
        content: "No shells have been created in this session.",
      });
      sse.write("done", { message: "Slash command completed" });
      sse.end();
      return;
    }

    const active = shells.filter((s) => s.status === "active");
    const closed = shells.filter((s) => s.status !== "active");

    const lines: string[] = [
      `### Shell Sessions`,
      ``,
      `**${active.length}** active, **${closed.length}** closed`,
      ``,
    ];

    if (active.length > 0) {
      lines.push("#### Active");
      for (const s of active) {
        lines.push(`- \`${s.shellId}\` — **${s.label}** (${s.type}, created by: ${s.createdBy})`);
      }
      lines.push("");
    }

    if (closed.length > 0) {
      lines.push("#### Closed");
      for (const s of closed) {
        lines.push(`- \`${s.shellId}\` — ${s.label} (${s.type})`);
      }
    }

    sse.write("slash_command_result", {
      command: "shells",
      success: true,
      content: lines.join("\n"),
    });
    sse.write("done", { message: "Slash command completed" });
    sse.end();
  },
};
