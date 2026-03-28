import { v4 as uuidv4 } from "uuid";
import { Response } from "express";
import { redisClient } from "../server";
import SessionsModel, {
  AgentMessageDoc,
  AgentState,
} from "../models/Sessions/Sessions.model";
import { invoke_llm_streaming, ToolCallData, ReasoningMode, getProvider } from "../utils/llm/providers";
import { readEnvFile } from "../utils/envWriter";
import { getUnconfiguredToolNames } from "../utils/toolAvailability";
import { toolRegistry } from "../tools/registry";
import {
  executeToolCalls,
  executeConsentedTool,
  buildExecutionContext,
  ToolExecutionCallbacks,
} from "./agent.tools";
import { shouldSummarize, summarizeMessages, messagesToOpenAI } from "./context.service";
import { buildSystemPrompt, AgentPromptConfig, BoxEnvInfo } from "../utils/copilot/prompts";
import { WORKSPACE_DIR } from "../utils/commandSafety";
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

const MODEL_CONTEXT_LIMITS: Record<string, number> = {
  "gpt-4o": 128_000,
  "gpt-4o-mini": 128_000,
  "gpt-4-turbo": 128_000,
  "gpt-4": 8_192,
  "gpt-3.5-turbo": 16_385,
  "gpt-5-nano": 128_000,
  "claude-sonnet-4-20250514": 200_000,
  "claude-3-5-sonnet-20241022": 200_000,
  "claude-3-opus-20240229": 200_000,
  "claude-3-haiku-20240307": 200_000,
};

function getModelContextLimit(model: string): number {
  for (const [key, limit] of Object.entries(MODEL_CONTEXT_LIMITS)) {
    if (model.includes(key)) return limit;
  }
  return 128_000;
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
  envInfo?: BoxEnvInfo,
): Promise<AgentMessageDoc> {
  const user = await UserModel.findById(userId);
  const session = await SessionsModel.findOne({ sessionId }).select("ctfConfig").lean();
  const now = new Date();
  const promptConfig: AgentPromptConfig = {
    sessionId,
    installedCapabilities: user?.configs?.installedCapabilities ?? [],
    selectedCapabilities: user?.configs?.capabilities ?? [],
    currentDate: now.toISOString().split("T")[0],
    currentDay: now.toLocaleDateString("en-US", { weekday: "long" }),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    envInfo,
  };

  if (session?.ctfConfig?.ctfName) {
    const safeName = session.ctfConfig.ctfName
      .replace(/[\/\\:*?"<>|]/g, "_")
      .replace(/\s+/g, "_");
    const wsBase = envInfo?.workspacePath ?? "~/pentest-workspace";
    promptConfig.ctfConfig = {
      ctfName: session.ctfConfig.ctfName,
      workspacePath: `${wsBase}/${safeName}`,
    };

    if (session.ctfConfig.activeSolve) {
      promptConfig.ctfConfig.activeSolve = {
        name: session.ctfConfig.activeSolve.name,
        challengeTxt: session.ctfConfig.activeSolve.challengeTxt,
        files: session.ctfConfig.activeSolve.files,
        challengeDir: `${wsBase}/${safeName}/${session.ctfConfig.activeSolve.safeDir}`,
        userNotes: session.ctfConfig.activeSolve.userNotes,
      };
    }
  }

  return {
    id: `sys_${sessionId}`,
    role: "system",
    content: buildSystemPrompt(promptConfig),
    timestamp: now,
    turnIndex: 0,
  };
}

// ─── Build dynamic trace tags from preceding tool results ───────────

export function buildTraceTags(
  prefix: string,
  messages: AgentMessageDoc[],
  extra?: string[],
): { tags: string[]; phase: string } {
  const trailingTools: string[] = [];
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "tool" && messages[i].toolName) {
      trailingTools.push(messages[i].toolName!);
    } else {
      break;
    }
  }

  const tags = [prefix];
  if (extra) tags.push(...extra);

  if (trailingTools.length === 0) {
    tags.push("planning");
    return { tags, phase: "plan" };
  }

  tags.push("analyze");
  const uniqueTools = [...new Set(trailingTools)];
  tags.push(...uniqueTools);
  return { tags, phase: "analyze" };
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
  const disableSafetyProtections = user?.configs?.disableSafetyProtections ?? false;
  const disabledAgentTools: string[] = session.disabledAgentTools ?? [];

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

  // Detect attack box environment and rebuild system message with real info
  let envInfo: BoxEnvInfo | undefined;
  if (shellManager.isConnected) {
    try {
      const { output: envOut } = await shellManager.execInShell(
        `echo "$USER|||$HOME|||$(uname -s)|||$(uname -m)"`,
        10_000,
      );
      const parts = envOut.trim().split("|||");
      if (parts.length >= 4) {
        const home = parts[1];
        const resolvedWs = WORKSPACE_DIR.replace(/^~/, home);
        envInfo = {
          user: parts[0],
          home,
          os: `${parts[2]} (${parts[3]})`,
          workspacePath: resolvedWs,
        };
      }
    } catch (err: any) {
      console.warn(`[agent] Failed to detect box environment: ${err.message}`);
    }
  }

  let messages = [...session.messages];

  // Replace system message with one that has resolved environment info
  if (envInfo && messages.length > 0 && messages[0].role === "system") {
    const updatedSysMsg = await buildSystemMessage(sessionId, userId, envInfo);
    messages[0] = updatedSysMsg;
  }

  const subagentManager = new SubagentManager(sessionId, shellManager);
  subagentManager.envInfo = envInfo;
  const spawnedSubagentIds: string[] = [];
  const turnIndex = session.turnIndex;
  let iteration = 0;
  let lastPromptTokens: number | undefined;
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

      if (await shouldSummarize(messages, lastPromptTokens)) {
        sse.write("summarizing", { message: "Context approaching limit, summarizing..." });

        const { summaryMessage, preservedMessages } = await summarizeMessages(
          messages,
          { sessionId, userId },
        );
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
      const unconfiguredTools = getUnconfiguredToolNames();
      const tools = toolRegistry.toOpenAISchemas({
        disabledTools: disabledAgentTools,
        unconfiguredTools,
      });

      const env = readEnvFile();
      const reasoningMode = (env.REASONING_MODE || "medium") as ReasoningMode;

      let assistantContent = "";
      let assistantReasoning = "";
      let assistantToolCalls: ToolCallData[] = [];

      const { tags: traceTags, phase } = buildTraceTags("agent", messages);

      const result = await invoke_llm_streaming({
        messages: openaiMessages,
        tools,
        temperature: 0.7,
        reasoningMode,
        sessionId,
        userId: session.uid.toString(),
        tags: traceTags,
        generationName: `agent-${phase}-step-${iteration}`,
        abortSignal: params.abortSignal,
        onDelta(delta) {
          if (delta.type === "reasoning" && delta.content) {
            assistantReasoning += delta.content;
            sse.write("reasoning", { content: delta.content });
          }
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
        lastPromptTokens = result.usage.prompt_tokens ?? 0;

        await trackTokens(
          sessionId,
          lastPromptTokens,
          result.usage.completion_tokens ?? 0,
          result.usage.total_tokens ?? 0,
        );

        const config = await getProvider();
        const contextLimit = getModelContextLimit(config.model);
        sse.write("token_usage", {
          totalTokens: lastPromptTokens,
          promptTokens: lastPromptTokens,
          completionTokens: result.usage.completion_tokens ?? 0,
          contextLimit,
        });
      }

      const assistantMsg: AgentMessageDoc = {
        id: uuidv4(),
        role: "assistant",
        content: assistantContent || null,
        reasoning: assistantReasoning || undefined,
        toolCalls: assistantToolCalls.length ? assistantToolCalls : undefined,
        timestamp: new Date(),
        turnIndex,
      };
      messages.push(assistantMsg);
      newMessages.push(assistantMsg);

      if (result.finishReason === "length") {
        sse.write("summarizing", { message: "Hit token limit, summarizing..." });
        const { preservedMessages } = await summarizeMessages(
          messages,
          { sessionId, userId },
        );
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
          sse.write("tool_done", { id, exitCode: result.exitCode, output: result.output, outputLength: result.output.length });
        },
        onToolError(id, error) {
          sse.write("tool_error", { id, error });
        },
        onConsentRequired(id, name, args, safetyBlock) {
          sse.write("consent_required", { id, name, args, safetyBlock: safetyBlock ?? false });
        },
      };

      const toolResults = await executeToolCalls(
        sessionId,
        assistantToolCalls,
        callbacks,
        executionCtx,
        requireConsentForAllTools,
        disableSafetyProtections,
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

      const consentResults = toolResults.filter((r) => r.needsConsent);
      if (consentResults.length > 0) {
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

        const firstConsent = consentResults[0];
        const batch = consentResults.map((cr) => ({
          toolCallId: cr.toolCallId,
          toolName: cr.toolName,
          arguments: JSON.parse(
            assistantToolCalls.find((tc) => tc.id === cr.toolCallId)?.arguments ?? "{}",
          ),
        }));

        await appendMessages(sessionId, newMessages);
        await SessionsModel.updateOne(
          { sessionId },
          {
            $set: {
              agentState: "waiting_consent",
              pendingConsent: {
                toolCallId: firstConsent.toolCallId,
                toolName: firstConsent.toolName,
                arguments: JSON.parse(
                  assistantToolCalls.find((tc) => tc.id === firstConsent.toolCallId)?.arguments ?? "{}",
                ),
                batch: batch.length > 1 ? batch : undefined,
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

  const { toolCallId, toolName, arguments: toolArgs, batch } = session.pendingConsent;

  const allPending = batch && batch.length > 1
    ? batch
    : [{ toolCallId, toolName, arguments: toolArgs }];

  session.pendingConsent = undefined;
  await session.save();

  if (!approved) {
    const denialMessages: AgentMessageDoc[] = allPending.map((p) => ({
      id: uuidv4(),
      role: "tool" as const,
      content: "User denied permission to run this tool.",
      toolCallId: p.toolCallId,
      toolName: p.toolName,
      timestamp: new Date(),
      turnIndex: session.turnIndex,
    }));
    await appendMessages(sessionId, denialMessages);
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
    onToolDone(id, result) { sse.write("tool_done", { id, exitCode: result.exitCode, output: result.output, outputLength: result.output.length }); },
    onToolError(id, error) { sse.write("tool_error", { id, error }); },
    onConsentRequired() {},
  };

  const toolMessages: AgentMessageDoc[] = [];
  for (const pending of allPending) {
    const result = await executeConsentedTool(
      sessionId,
      pending.toolCallId,
      pending.toolName,
      pending.arguments,
      callbacks,
      ctx,
    );
    toolMessages.push({
      id: uuidv4(),
      role: "tool",
      content: result.output,
      toolCallId: pending.toolCallId,
      toolName: pending.toolName,
      timestamp: new Date(),
      turnIndex: session.turnIndex,
    });
  }

  await appendMessages(sessionId, toolMessages);
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
