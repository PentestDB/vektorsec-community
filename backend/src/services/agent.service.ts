import { v4 as uuidv4 } from "uuid";
import { Response } from "express";
import { redisClient } from "../server";
import SessionsModel, {
  AgentMessageDoc,
  AgentState,
} from "../models/Sessions/Sessions.model";
import { invoke_llm_streaming, ToolCallData } from "../utils/llm/providers";
import { toolRegistry } from "../tools/registry";
import {
  executeToolCalls,
  executeConsentedTool,
  buildExecutionContext,
  ToolExecutionCallbacks,
} from "./agent.tools";
import { shouldSummarize, summarizeMessages, messagesToOpenAI } from "./context.service";
import { buildSystemPrompt, AgentPromptConfig } from "../utils/copilot/prompts";
import UserModel from "../models/User/User.model";
import { sessionLifecycle } from "./session.lifecycle";
import { SubagentManager } from "./subagent.manager";

const MAX_ITERATIONS = 25;
const PAUSE_CHECK_KEY = (id: string) => `agent:pause:${id}`;

// ─── Abort controller registry (for immediate pause) ───────────────────

const abortControllers = new Map<string, AbortController>();

export function registerAbortController(sessionId: string): AbortController {
  const ctrl = new AbortController();
  abortControllers.set(sessionId, ctrl);
  return ctrl;
}

export function abortSession(sessionId: string): void {
  const ctrl = abortControllers.get(sessionId);
  if (ctrl) {
    try {
      ctrl.abort();
    } catch {
      // already aborted
    }
    abortControllers.delete(sessionId);
  }
}

// ─── SSE helpers ─────────────────────────────────────────────────────

export interface SSEWriter {
  write: (event: string, data: any) => void;
  end: () => void;
}

export function createSSEWriter(res: Response): SSEWriter {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });

  return {
    write(event: string, data: any) {
      try {
        res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      } catch {
        // client disconnected
      }
    },
    end() {
      try {
        res.end();
      } catch {
        // already ended
      }
    },
  };
}

// ─── State helpers ───────────────────────────────────────────────────

async function isPaused(sessionId: string): Promise<boolean> {
  try {
    const val = await redisClient.GET(PAUSE_CHECK_KEY(sessionId));
    return val === "1";
  } catch {
    return false;
  }
}

export async function setPaused(sessionId: string, paused: boolean): Promise<void> {
  if (paused) {
    await redisClient.SET(PAUSE_CHECK_KEY(sessionId), "1");
  } else {
    await redisClient.DEL(PAUSE_CHECK_KEY(sessionId));
  }
}

async function setAgentState(sessionId: string, state: AgentState): Promise<void> {
  await SessionsModel.updateOne({ sessionId }, { $set: { agentState: state } });
}

async function appendMessages(sessionId: string, messages: AgentMessageDoc[]): Promise<void> {
  if (!messages.length) return;
  await SessionsModel.updateOne(
    { sessionId },
    { $push: { messages: { $each: messages } } },
  );
}

async function replaceMessages(sessionId: string, messages: AgentMessageDoc[]): Promise<void> {
  await SessionsModel.updateOne(
    { sessionId },
    { $set: { messages } },
  );
}

async function trackTokens(
  sessionId: string,
  promptTokens: number,
  completionTokens: number,
  totalTokens: number,
): Promise<void> {
  await SessionsModel.updateOne(
    { sessionId },
    {
      $inc: { totalTokens },
      $push: {
        tokenHistory: {
          promptTokens,
          completionTokens,
          totalTokens,
          timestamp: new Date(),
        },
      },
    },
  );
}

// ─── Build shell status context (injected after summarization) ──────

import { ShellManager, ShellInfo } from "./shell.manager";

function buildShellStatusMessage(shellManager: ShellManager, turnIndex: number): AgentMessageDoc | null {
  const shells = shellManager.getShellList();
  const active = shells.filter((s) => s.status === "active");
  if (active.length === 0 && shells.length === 0) return null;

  const lines = shells.map((s) => {
    const status = s.status === "active" ? "ACTIVE" : "CLOSED";
    return `  - ${s.shellId} | label: "${s.label}" | type: ${s.type} | status: ${status} | created by: ${s.createdBy}`;
  });

  const content = `[Shell Status - ${active.length} active, ${shells.length - active.length} closed]\n${lines.join("\n")}\n\nUse these shell_id values with write_to_shell and read_shell. Use run_bash (without shell_id) for new one-off commands.`;

  return {
    id: `shell_status_${Date.now()}`,
    role: "system",
    content,
    timestamp: new Date(),
    turnIndex,
    isSummary: false,
  };
}

// ─── Build system message for a session ──────────────────────────────

async function buildSystemMessage(
  sessionId: string,
  userId: string,
): Promise<AgentMessageDoc> {
  const user = await UserModel.findById(userId);
  const now = new Date();
  const promptConfig: AgentPromptConfig = {
    sessionId,
    installedCapabilities: user?.configs?.installedCapabilities ?? [],
    selectedCapabilities: user?.configs?.capabilities ?? [],
    currentDate: now.toISOString().split("T")[0],
    currentDay: now.toLocaleDateString("en-US", { weekday: "long" }),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  };

  return {
    id: `sys_${sessionId}`,
    role: "system",
    content: buildSystemPrompt(promptConfig),
    timestamp: now,
    turnIndex: 0,
  };
}

// ─── Core agent loop ─────────────────────────────────────────────────

export async function runAgentLoop(params: {
  sessionId: string;
  userId: string;
  sse: SSEWriter;
  abortSignal?: AbortSignal;
}): Promise<void> {
  const { sessionId, userId, sse } = params;

  const session = await SessionsModel.findOne({ sessionId });
  if (!session) {
    sse.write("error", { message: "Session not found" });
    sse.end();
    return;
  }

  const user = await UserModel.findById(session.uid).lean();
  const requireConsentForAllTools = user?.configs?.requireConsentForAllTools ?? false;

  await setAgentState(sessionId, "running");
  await setPaused(sessionId, false);

  const shellManager = await sessionLifecycle.getShellManager(sessionId);
  if (!shellManager.isConnected) {
    try {
      await shellManager.connect();
    } catch (err: any) {
      console.warn(`[agent] SSH connection failed: ${err.message}. Running without shell support.`);
    }
  }

  const subagentManager = new SubagentManager(sessionId, shellManager);
  const spawnedSubagentIds: string[] = [];

  let messages = [...session.messages];
  const turnIndex = session.turnIndex;
  let iteration = 0;
  const newMessages: AgentMessageDoc[] = [];

  const executionCtx = buildExecutionContext({
    sessionId,
    agentId: "main",
    shellManager,
    subagentManager,
    sse,
    userId,
    abortSignal: params.abortSignal,
  });

  try {
    while (iteration < MAX_ITERATIONS) {
      iteration++;

      if (await isPaused(sessionId)) {
        await appendMessages(sessionId, newMessages);
        await setAgentState(sessionId, "paused");
        sse.write("paused", { message: "Agent paused by user" });
        sse.end();
        return;
      }

      if (params.abortSignal?.aborted) {
        break;
      }

      // Collect completed subagent results and inject into messages
      if (spawnedSubagentIds.length > 0) {
        const completedIds = spawnedSubagentIds.filter((id) => !subagentManager.isRunning(id));
        if (completedIds.length > 0) {
          const results = await subagentManager.waitFor(completedIds);
          for (const r of results) {
            const resultMsg: AgentMessageDoc = {
              id: uuidv4(),
              role: "user",
              content: `[Subagent ${r.subagentId} completed (${r.status})]\n\n${r.result}`,
              timestamp: new Date(),
              turnIndex,
            };
            messages.push(resultMsg);
            newMessages.push(resultMsg);
          }
          for (const id of completedIds) {
            spawnedSubagentIds.splice(spawnedSubagentIds.indexOf(id), 1);
          }
        }
      }

      if (await shouldSummarize(messages)) {
        sse.write("summarizing", { message: "Context approaching limit, summarizing..." });

        const { summaryMessage, preservedMessages } = await summarizeMessages(messages);
        messages = preservedMessages;

        await replaceMessages(sessionId, messages);
        newMessages.length = 0;

        if (summaryMessage) {
          sse.write("summary_done", { summary: summaryMessage.content });
        }

        const shellStatusMsg = buildShellStatusMessage(shellManager, turnIndex);
        if (shellStatusMsg) {
          messages.push(shellStatusMsg);
          newMessages.push(shellStatusMsg);
        }
      }

      const openaiMessages = messagesToOpenAI(messages);
      const tools = toolRegistry.toOpenAISchemas();

      let assistantContent = "";
      let assistantToolCalls: ToolCallData[] = [];

      const result = await invoke_llm_streaming({
        messages: openaiMessages,
        tools,
        temperature: 0.7,
        sessionId,
        userId: session.uid.toString(),
        tags: ["agent", "loop"],
        generationName: `agent-turn-${turnIndex}-iter-${iteration}`,
        abortSignal: params.abortSignal,
        onDelta(delta) {
          if (delta.type === "text" && delta.content) {
            assistantContent += delta.content;
            sse.write("thinking", { content: delta.content });
          }
          if (delta.type === "tool_call_start" && delta.toolCall) {
            sse.write("tool_call_start", {
              index: delta.toolCall.index,
              id: delta.toolCall.id,
              name: delta.toolCall.name,
            });
          }
          if (delta.type === "tool_call_delta" && delta.content) {
            sse.write("tool_call_args", {
              index: delta.toolCall?.index,
              content: delta.content,
            });
          }
          if (delta.type === "tool_call_done" && delta.toolCall) {
            sse.write("tool_call_ready", {
              index: delta.toolCall.index,
              id: delta.toolCall.id,
              name: delta.toolCall.name,
              arguments: delta.toolCall.arguments,
            });
          }
        },
      });

      assistantToolCalls = result.toolCalls;

      if (result.usage) {
        await trackTokens(
          sessionId,
          result.usage.prompt_tokens ?? 0,
          result.usage.completion_tokens ?? 0,
          result.usage.total_tokens ?? 0,
        );
      }

      const assistantMsg: AgentMessageDoc = {
        id: uuidv4(),
        role: "assistant",
        content: assistantContent || null,
        toolCalls: assistantToolCalls.length ? assistantToolCalls : undefined,
        timestamp: new Date(),
        turnIndex,
      };
      messages.push(assistantMsg);
      newMessages.push(assistantMsg);

      if (result.finishReason === "length") {
        sse.write("summarizing", { message: "Hit token limit, summarizing..." });
        const { preservedMessages } = await summarizeMessages(messages);
        messages = preservedMessages;
        await replaceMessages(sessionId, messages);
        newMessages.length = 0;
        continue;
      }

      if (result.finishReason === "stop" || assistantToolCalls.length === 0) {
        break;
      }

      const callbacks: ToolExecutionCallbacks = {
        onToolStart(id, name, args) {
          sse.write("tool_start", { id, name, args });
        },
        onToolOutput(id, chunk) {
          sse.write("tool_output", { id, chunk });
        },
        onToolDone(id, result) {
          sse.write("tool_done", { id, exitCode: result.exitCode, outputLength: result.output.length });
        },
        onToolError(id, error) {
          sse.write("tool_error", { id, error });
        },
        onConsentRequired(id, name, args) {
          sse.write("consent_required", { id, name, args });
        },
      };

      const toolResults = await executeToolCalls(
        sessionId,
        assistantToolCalls,
        callbacks,
        executionCtx,
        requireConsentForAllTools,
      );

      // Track spawned subagents
      for (const tr of toolResults) {
        if (tr.toolName === "spawn_subagent" && tr.result.output.includes("subagent_id:")) {
          const match = tr.result.output.match(/subagent_id:\s*(\S+)/);
          if (match) {
            spawnedSubagentIds.push(match[1]);
          }
        }
      }

      const needsConsent = toolResults.find((r) => r.needsConsent);
      if (needsConsent) {
        // Append tool result messages for all non-consent tool calls that
        // already completed, so the assistant message's tool_calls all have
        // matching tool responses when the loop resumes after consent.
        for (const tr of toolResults) {
          if (tr.needsConsent) continue;
          const toolMsg: AgentMessageDoc = {
            id: uuidv4(),
            role: "tool",
            content: tr.result.output,
            toolCallId: tr.toolCallId,
            toolName: tr.toolName,
            timestamp: new Date(),
            turnIndex,
          };
          messages.push(toolMsg);
          newMessages.push(toolMsg);
        }

        await appendMessages(sessionId, newMessages);
        await SessionsModel.updateOne(
          { sessionId },
          {
            $set: {
              agentState: "waiting_consent",
              pendingConsent: {
                toolCallId: needsConsent.toolCallId,
                toolName: needsConsent.toolName,
                arguments: JSON.parse(
                  assistantToolCalls.find((tc) => tc.id === needsConsent.toolCallId)?.arguments ?? "{}",
                ),
              },
            },
          },
        );
        sse.end();
        return;
      }

      for (const tr of toolResults) {
        const toolMsg: AgentMessageDoc = {
          id: uuidv4(),
          role: "tool",
          content: tr.result.output,
          toolCallId: tr.toolCallId,
          toolName: tr.toolName,
          timestamp: new Date(),
          turnIndex,
        };
        messages.push(toolMsg);
        newMessages.push(toolMsg);
      }

      const askedUser = toolResults.find((r) => r.toolName === "ask_user");
      if (askedUser) {
        break;
      }

      // If subagents are running and the agent has no more tool calls to make,
      // wait for them to complete before the next iteration
      if (spawnedSubagentIds.length > 0 && assistantToolCalls.every((tc) => tc.name === "spawn_subagent")) {
        const results = await subagentManager.waitFor([...spawnedSubagentIds]);
        for (const r of results) {
          const resultMsg: AgentMessageDoc = {
            id: uuidv4(),
            role: "user",
            content: `[Subagent ${r.subagentId} completed (${r.status})]\n\n${r.result}`,
            timestamp: new Date(),
            turnIndex,
          };
          messages.push(resultMsg);
          newMessages.push(resultMsg);
        }
        spawnedSubagentIds.length = 0;
      }
    }

    if (iteration >= MAX_ITERATIONS) {
      sse.write("error", { message: `Agent reached maximum iteration limit (${MAX_ITERATIONS})` });
    }

    // Wait for remaining subagents before ending
    if (spawnedSubagentIds.length > 0) {
      sse.write("thinking", { content: "\n\nWaiting for subagents to complete..." });
      const results = await subagentManager.waitFor(spawnedSubagentIds);
      for (const r of results) {
        const resultMsg: AgentMessageDoc = {
          id: uuidv4(),
          role: "user",
          content: `[Subagent ${r.subagentId} completed (${r.status})]\n\n${r.result}`,
          timestamp: new Date(),
          turnIndex: session.turnIndex,
        };
        newMessages.push(resultMsg);
      }
    }

    await appendMessages(sessionId, newMessages);

    if (params.abortSignal?.aborted) {
      await subagentManager.cancelAll();
      await setAgentState(sessionId, "paused");
      sse.write("paused", { message: "Agent paused by user" });
    } else {
      await setAgentState(sessionId, "idle");
      sse.write("done", { message: "Agent turn completed", iterations: iteration });
    }
    sse.end();
  } catch (err: any) {
    console.error("[agent] Loop error:", err);
    await appendMessages(sessionId, newMessages);
    const isAbort = err?.name === "AbortError" || params.abortSignal?.aborted;
    await subagentManager.cancelAll();
    await setAgentState(sessionId, isAbort ? "paused" : "idle");
    if (isAbort) {
      sse.write("paused", { message: "Agent paused by user" });
    } else {
      sse.write("error", { message: err.message ?? "Agent loop error" });
    }
    sse.end();
  }
}

// ─── Initialize a new session and start the agent ────────────────────

export async function initAndRun(params: {
  sessionId: string;
  userId: string;
  userMessage: string;
  sse: SSEWriter;
  abortSignal?: AbortSignal;
}): Promise<void> {
  const { sessionId, userId, userMessage, sse, abortSignal } = params;

  const session = await SessionsModel.findOne({ sessionId });
  if (!session) {
    sse.write("error", { message: "Session not found" });
    sse.end();
    return;
  }

  if (session.messages.length === 0) {
    const sysMsg = await buildSystemMessage(sessionId, userId);
    session.messages.push(sysMsg);
  }

  const userMsg: AgentMessageDoc = {
    id: uuidv4(),
    role: "user",
    content: userMessage,
    timestamp: new Date(),
    turnIndex: session.turnIndex,
  };
  session.messages.push(userMsg);
  session.turnIndex += 1;
  await session.save();

  sse.write("user_message_ack", { id: userMsg.id });

  await runAgentLoop({ sessionId, userId, sse, abortSignal });
}

// ─── Handle consent response and resume ──────────────────────────────

export async function handleConsent(params: {
  sessionId: string;
  userId: string;
  approved: boolean;
  sse: SSEWriter;
  abortSignal?: AbortSignal;
}): Promise<void> {
  const { sessionId, userId, approved, sse, abortSignal } = params;

  const session = await SessionsModel.findOne({ sessionId });
  if (!session || !session.pendingConsent) {
    sse.write("error", { message: "No pending consent" });
    sse.end();
    return;
  }

  const { toolCallId, toolName, arguments: toolArgs } = session.pendingConsent;

  session.pendingConsent = undefined;
  await session.save();

  if (!approved) {
    const denialMsg: AgentMessageDoc = {
      id: uuidv4(),
      role: "tool",
      content: "User denied permission to install this tool.",
      toolCallId,
      toolName,
      timestamp: new Date(),
      turnIndex: session.turnIndex,
    };
    await appendMessages(sessionId, [denialMsg]);
    await setAgentState(sessionId, "idle");
    await runAgentLoop({ sessionId, userId, sse, abortSignal });
    return;
  }

  const shellManager = await sessionLifecycle.getShellManager(sessionId);
  if (!shellManager.isConnected) {
    try { await shellManager.connect(); } catch { /* handled below */ }
  }

  const ctx = buildExecutionContext({
    sessionId,
    agentId: "main",
    shellManager,
    abortSignal,
  });

  const callbacks: ToolExecutionCallbacks = {
    onToolStart(id, name, args) { sse.write("tool_start", { id, name, args }); },
    onToolOutput(id, chunk) { sse.write("tool_output", { id, chunk }); },
    onToolDone(id, result) { sse.write("tool_done", { id, exitCode: result.exitCode }); },
    onToolError(id, error) { sse.write("tool_error", { id, error }); },
    onConsentRequired() {},
  };

  const result = await executeConsentedTool(sessionId, toolCallId, toolName, toolArgs, callbacks, ctx);

  const toolMsg: AgentMessageDoc = {
    id: uuidv4(),
    role: "tool",
    content: result.output,
    toolCallId,
    toolName,
    timestamp: new Date(),
    turnIndex: session.turnIndex,
  };
  await appendMessages(sessionId, [toolMsg]);

  await runAgentLoop({ sessionId, userId, sse, abortSignal });
}

// ─── Handle manual execution output submission ───────────────────────

export async function handleManualOutput(params: {
  sessionId: string;
  userId: string;
  output: string;
  sse: SSEWriter;
  abortSignal?: AbortSignal;
}): Promise<void> {
  const { sessionId, userId, output, sse, abortSignal } = params;

  const session = await SessionsModel.findOne({ sessionId });
  if (!session || !session.pendingManualExecution) {
    sse.write("error", { message: "No pending manual execution" });
    sse.end();
    return;
  }

  const { toolCallId, toolName } = session.pendingManualExecution;

  session.pendingManualExecution = undefined;
  await session.save();

  const toolMsg: AgentMessageDoc = {
    id: uuidv4(),
    role: "tool",
    content: output || "(no output)",
    toolCallId,
    toolName,
    timestamp: new Date(),
    turnIndex: session.turnIndex,
  };
  await appendMessages(sessionId, [toolMsg]);

  sse.write("tool_done", { id: toolCallId, exitCode: 0, outputLength: output.length });

  await runAgentLoop({ sessionId, userId, sse, abortSignal });
}
