import { v4 as uuidv4 } from "uuid";
import { Response } from "express";
import { redisClient } from "../server";
import SessionsModel, {
  AgentMessageDoc,
  AgentState,
} from "../models/Sessions/Sessions.model";
import {
  invoke_llm_streaming,
  ToolCallData,
  ReasoningMode,
  getUserModels,
  presetToProviderConfig,
  ProviderConfig,
} from "../utils/llm/providers";

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
import { SwarmManager, CtfSwarmContext, SwarmResult } from "./swarm.manager";
import { EngagementState } from "./engagement-state";
import { getModelContextLimit } from "../utils/modelMetadata";
import { parseToolArguments } from "../utils/toolArguments";
import { normalizeMaxAgentIterations } from "../utils/agentConfig";

const PAUSE_CHECK_KEY = (id: string) => `agent:pause:${id}`;
const RACER_ORCHESTRATOR_PROMPT_ID = "sys_racer_orchestrator";

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

export function hasActiveController(sessionId: string): boolean {
  const ctrl = abortControllers.get(sessionId);
  return !!ctrl && !ctrl.signal.aborted;
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

async function buildAgentPromptConfig(
  sessionId: string,
  userId: string,
  envInfo?: BoxEnvInfo,
): Promise<AgentPromptConfig> {
  const user = await UserModel.findById(userId);
  const session = await SessionsModel.findOne({ sessionId }).select("ctfConfig workspaceId").lean();
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

  try {
    const models = await getUserModels(userId);
    promptConfig.racerModels = models.racers.map((r) => ({
      label: r.label,
      provider: r.provider,
      model: r.model,
    }));
  } catch {
    // Model setup is handled by the normal setup gate. Prompt construction
    // should remain available for sessions created before configuration.
  }

  let ctfConfig = session?.ctfConfig;
  if (!ctfConfig?.ctfName && session?.workspaceId) {
    const WorkspaceModel = (await import("../models/Workspace/Workspace.model")).default;
    const workspace = await WorkspaceModel.findOne({ workspaceId: session.workspaceId }).select("ctfConfig").lean();
    if (workspace?.ctfConfig?.ctfName) {
      ctfConfig = workspace.ctfConfig as any;
    }
  }

  if (ctfConfig?.ctfName) {
    const safeName = ctfConfig.ctfName
      .replace(/[\/\\:*?"<>|]/g, "_")
      .replace(/\s+/g, "_");
    const wsBase = envInfo?.workspacePath ?? "~/pentest-workspace";
    promptConfig.ctfConfig = {
      ctfName: ctfConfig.ctfName,
      workspacePath: `${wsBase}/${safeName}`,
      flagFormat: ctfConfig.flagFormat,
    };

    if (ctfConfig.activeSolve) {
      promptConfig.ctfConfig.activeSolve = {
        name: ctfConfig.activeSolve.name,
        challengeTxt: ctfConfig.activeSolve.challengeTxt,
        files: ctfConfig.activeSolve.files,
        challengeDir: `${wsBase}/${safeName}/${ctfConfig.activeSolve.safeDir}`,
        category: ctfConfig.activeSolve.category,
        connectionInfo: ctfConfig.activeSolve.connectionInfo,
        points: ctfConfig.activeSolve.points,
        userNotes: ctfConfig.activeSolve.userNotes,
      };
    }
  }

  return promptConfig;
}

async function buildSystemMessage(
  sessionId: string,
  userId: string,
  envInfo?: BoxEnvInfo,
): Promise<AgentMessageDoc> {
  const promptConfig = await buildAgentPromptConfig(sessionId, userId, envInfo);
  return {
    id: `sys_${sessionId}`,
    role: "system",
    content: buildSystemPrompt(promptConfig),
    timestamp: new Date(),
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

function buildRacerOrchestratorMessage(
  turnIndex: number,
  roster: Array<{ agentId: string; modelLabel: string }>,
  sessionContext?: { sessionId?: string; ctfName?: string; challengeName?: string },
  depthInfo?: { iteration: number; maxIterations: number; racerMaxIterations: number },
): AgentMessageDoc {
  const rosterBlock = roster.length > 0
    ? roster.map((r) => `- Racer ${r.modelLabel} (${r.agentId})`).join("\n")
    : "- (no racers registered yet)";

  const ctfLine = sessionContext?.ctfName
    ? `\nCTF: ${sessionContext.ctfName}${sessionContext.challengeName ? ` — Challenge: ${sessionContext.challengeName}` : ""}`
    : "";

  return {
    id: RACER_ORCHESTRATOR_PROMPT_ID,
    role: "system",
    content: `<role>
You are the Pentest Copilot orchestrator. You coordinate racer agents — you do NOT solve tasks yourself.
</role>
${ctfLine ? `\n<context>${ctfLine}\nSession: ${sessionContext?.sessionId ?? "unknown"}\n</context>\n` : ""}
<roster>
${rosterBlock}
</roster>

<tools>
You have EXACTLY these tools: get_solve_status, bump_racer, broadcast, read_racer_trace, wait

MANDATORY: You MUST call at least one tool every turn. NEVER produce a text-only response.
If you have nothing specific to do, call wait(seconds=30).
</tools>

<workflow>
Phase 1 — INITIAL (iterations 1-2):
  1. Call get_solve_status to see the initial state.
  2. Call wait(seconds=30) to let racers start working. Do NOT bump or read traces yet.

Phase 2 — MONITORING (iterations 3+):
  Loop: wait(seconds=30) → get_solve_status → DECIDE:
    - If a racer's iteration >= 8 with no findings → read_racer_trace, then consider bump_racer.
    - If a racer reported a SUCCESS finding → present result to user immediately.
    - If all racers completed → summarize results and stop.
    - Otherwise → wait(seconds=30) again. Patience is critical.

WHEN TO BUMP (and ONLY when):
  - A racer has used 8+ iterations without ANY findings or progress.
  - A racer is clearly stuck in a loop (repeating the same approach).
  - Cross-racer intel would meaningfully change a racer's direction.
  Do NOT bump racers that are making steady progress. Do NOT bump before iteration 5.

WHEN NOT TO BUMP:
  - Racer is on iteration 1-5 (let it explore independently first).
  - Racer is actively running tools and making progress.
  - You just want to "encourage" or provide generic advice.
</workflow>

<depth>
${depthInfo ? `Orchestrator iteration ${depthInfo.iteration}/${depthInfo.maxIterations}. Racers have ${depthInfo.racerMaxIterations} iterations each.` : ""}
YOUR iterations are precious. Every LLM call costs money and time.
- Prefer long waits (20-30s) over short ones.
- Most turns should be: wait → get_solve_status → wait again.
- Only ~20% of your turns should involve bump_racer or broadcast.
</depth>

<rules>
CRITICAL:
- NEVER produce a text-only response. Always call a tool.
- NEVER solve tasks yourself — no exploit commands, scans, or scripts.
- You are NOT a racer — do not count yourself in the racer list.
- Refer to racers by their exact model names from the roster.
- NEVER rename racers as "Racer A", "Racer B", etc.
- When a racer succeeds, credit it clearly: "Racer {model_name} found the flag: ..."
- When all racers complete, summarize and stop.
</rules>`,
    timestamp: new Date(),
    turnIndex,
    isSummary: false,
  };
}

function upsertRacerOrchestratorPrompt(
  messages: AgentMessageDoc[],
  turnIndex: number,
  roster: Array<{ agentId: string; modelLabel: string }>,
  sessionContext?: { sessionId?: string; ctfName?: string; challengeName?: string },
  depthInfo?: { iteration: number; maxIterations: number; racerMaxIterations: number },
): boolean {
  const idx = messages.findIndex((m) => m.id === RACER_ORCHESTRATOR_PROMPT_ID);
  const prompt = buildRacerOrchestratorMessage(turnIndex, roster, sessionContext, depthInfo);
  if (idx === -1) {
    messages.push(prompt);
    return true;
  }
  messages[idx] = prompt;
  return false;
}

function removeRacerOrchestratorPrompt(messages: AgentMessageDoc[]): void {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].id === RACER_ORCHESTRATOR_PROMPT_ID) messages.splice(i, 1);
  }
}

function appendSwarmResultMessages(
  messages: AgentMessageDoc[],
  newMessages: AgentMessageDoc[],
  sr: SwarmResult,
  turnIndex: number,
): void {
  for (const ar of sr.agentResults ?? []) {
    const racerTranscriptMsg: AgentMessageDoc = {
      id: uuidv4(),
      role: "assistant",
      content: `**[Racer ${ar.modelLabel}]** ${ar.status}${sr.winner === ar.agentId ? " (winner)" : ""}\n\n${ar.result || "(no result)"}`,
      timestamp: new Date(),
      turnIndex,
    };
    messages.push(racerTranscriptMsg);
    newMessages.push(racerTranscriptMsg);
  }

  const swarmSummaryMsg: AgentMessageDoc = {
    id: uuidv4(),
    role: "user",
    content: `[Swarm ${sr.swarmId} completed (${sr.status})${sr.winner ? ` — Winner: ${sr.winner}` : ""}]\n\n${sr.summary}`,
    timestamp: new Date(),
    turnIndex,
  };
  messages.push(swarmSummaryMsg);
  newMessages.push(swarmSummaryMsg);
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
  const maxAgentIterations = normalizeMaxAgentIterations(
    user?.configs?.maxAgentIterations,
  );
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

  // Racer coordination is transient execution context. Older versions stored
  // this prompt in session history, where its mandatory-tool instruction could
  // keep affecting normal chat after a swarm had finished.
  const hadPersistedRacerPrompt = messages.some((m) => m.id === RACER_ORCHESTRATOR_PROMPT_ID);
  removeRacerOrchestratorPrompt(messages);
  if (hadPersistedRacerPrompt) {
    await SessionsModel.updateOne(
      { sessionId },
      { $pull: { messages: { id: RACER_ORCHESTRATOR_PROMPT_ID } } },
    );
  }

  // Refresh the system message on every turn so model/racer assignments changed
  // in Settings are immediately visible to the orchestrator.
  if (messages.length > 0 && messages[0].role === "system") {
    const updatedSysMsg = await buildSystemMessage(sessionId, userId, envInfo);
    messages[0] = updatedSysMsg;
  }

  const subagentManager = new SubagentManager(sessionId, shellManager);
  subagentManager.envInfo = envInfo;
  const swarmManager = new SwarmManager(sessionId, shellManager);
  swarmManager.envInfo = envInfo;
  const spawnedSubagentIds: string[] = [];
  const spawnedSwarmIds: string[] = [];
  const turnIndex = session.turnIndex;
  let iteration = 0;
  let lastPromptTokens: number | undefined;
  const newMessages: AgentMessageDoc[] = [];
  let completedNormally = false;

  // ─── Resolve user model config for orchestrator + auto-spawn racers ──
  const userModels = await getUserModels(userId);
  const orchestratorConfig: ProviderConfig = await presetToProviderConfig(userModels.orchestrator);
  const orchestratorReasoningMode: ReasoningMode =
    (userModels.orchestrator.reasoningMode as ReasoningMode) || "off";

  let ctfSwarmContext: CtfSwarmContext | undefined;
  const sessionCtf = session.ctfConfig;
  if (sessionCtf?.activeSolve) {
    const solve = sessionCtf.activeSolve;
    const safeName = (sessionCtf.ctfName || "")
      .replace(/[\/\\:*?"<>|]/g, "_")
      .replace(/\s+/g, "_");
    const wsBase = envInfo?.workspacePath ?? "~/pentest-workspace";
    ctfSwarmContext = {
      challengeName: solve.name,
      category: solve.category,
      points: solve.points,
      challengeTxt: solve.challengeTxt ?? "",
      files: solve.files ?? [],
      connectionInfo: solve.connectionInfo,
      challengeDir: `${wsBase}/${safeName}/${solve.safeDir}`,
      flagFormat: sessionCtf.flagFormat,
      userNotes: solve.userNotes,
    };
  }

  const racerPresets = userModels.racers.map((r) => ({
    label: r.label,
    provider: r.provider,
    model: r.model,
    apiKey: r.apiKey,
    baseURL: r.baseURL,
    reasoningMode: r.reasoningMode,
  }));
  const racerPromptConfig = await buildAgentPromptConfig(sessionId, userId, envInfo);

  const engagementMode = session.ctfConfig?.ctfName ? "ctf" : "pentest";
  const engagementState = new EngagementState(engagementMode as "pentest" | "ctf");
  engagementState.vulnerabilities = (session.vulnerabilities ?? []).map((vulnerability) => ({
    vulnerabilityId: vulnerability.vulnerabilityId,
    fingerprint: vulnerability.fingerprint,
    host: vulnerability.host,
    service: vulnerability.service,
    endpoint: vulnerability.endpoint,
    title: vulnerability.title,
    severity: vulnerability.severity,
    cvssScore: vulnerability.cvssScore,
    cvssVector: vulnerability.cvssVector,
    cwe: vulnerability.cwe,
    evidence: vulnerability.evidence,
    stepsToReproduce: vulnerability.stepsToReproduce,
    contextSummary: vulnerability.contextSummary,
    impact: vulnerability.impact,
    remediation: vulnerability.remediation,
    exploited: vulnerability.exploited,
    cve: vulnerability.cve,
    status: vulnerability.status,
    source: vulnerability.source,
    createdAt: vulnerability.createdAt,
    updatedAt: vulnerability.updatedAt,
  }));
  if (engagementMode === "ctf" && session.ctfConfig?.activeSolve) {
    const solve = session.ctfConfig.activeSolve;
    engagementState.challengeName = solve.name;
    engagementState.category = solve.category;
    engagementState.points = solve.points;
    engagementState.connectionInfo = solve.connectionInfo;
  } else if (engagementMode === "ctf" && session.ctfConfig?.solveHistory?.length) {
    const sh = session.ctfConfig.solveHistory as { challengeName: string; status: string; category?: string }[];
    const latest = [...sh].reverse().find((r) => r.status === "solving");
    if (latest?.challengeName) {
      engagementState.challengeName = latest.challengeName;
      engagementState.category = latest.category;
    }
  }

  const executionCtx = buildExecutionContext({
    sessionId,
    agentId: "main",
    agentRole: "main",
    shellManager,
    subagentManager,
    swarmManager,
    sse,
    userId,
    abortSignal: params.abortSignal,
    engagementState,
    swarmDefaults: {
      modelPresets: racerPresets,
      ctfContext: ctfSwarmContext,
      agentPromptConfig: racerPromptConfig,
    },
  });

  try {
    while (iteration < maxAgentIterations) {
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

      // Collect completed swarm results and inject into messages
      if (spawnedSwarmIds.length > 0) {
        const completedSwarmIds = spawnedSwarmIds.filter((id) => !swarmManager.isRunning(id));
        if (completedSwarmIds.length > 0) {
          const swarmResults = await swarmManager.waitFor(completedSwarmIds);
          for (const sr of swarmResults) {
            appendSwarmResultMessages(messages, newMessages, sr, turnIndex);
          }
          for (const id of completedSwarmIds) {
            spawnedSwarmIds.splice(spawnedSwarmIds.indexOf(id), 1);
          }
        }
      }

      if (await shouldSummarize(messages, lastPromptTokens)) {
        sse.write("summarizing", { message: "Context approaching limit, summarizing..." });

        const { summaryMessage, preservedMessages } = await summarizeMessages(
          messages,
          { sessionId, userId },
          engagementState,
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

      // Inject structured engagement state into the system message
      if (!engagementState.isEmpty() && messages.length > 0 && messages[0].role === "system") {
        const stateBlock = engagementState.toPromptBlock();
        const sysContent = messages[0].content ?? "";
        const markerStart = sysContent.indexOf("<engagement_state");
        if (markerStart !== -1) {
          const markerEnd = sysContent.indexOf("</engagement_state>") + "</engagement_state>".length;
          messages[0] = { ...messages[0], content: sysContent.slice(0, markerStart) + stateBlock + sysContent.slice(markerEnd) };
        } else {
          messages[0] = { ...messages[0], content: sysContent + "\n\n" + stateBlock };
        }
      }

      const hasActiveRacers =
        spawnedSwarmIds.length > 0 && spawnedSwarmIds.some((id) => swarmManager.isRunning(id));
      const racerOrchestratorMode = hasActiveRacers;
      if (racerOrchestratorMode) {
        const roster = swarmManager.getActiveRoster(spawnedSwarmIds);
        const sessionCtfInfo = session.ctfConfig;
        upsertRacerOrchestratorPrompt(messages, turnIndex, roster, {
          sessionId,
          ctfName: sessionCtfInfo?.ctfName,
          challengeName: sessionCtfInfo?.activeSolve?.name,
        }, {
          iteration,
          maxIterations: maxAgentIterations,
          racerMaxIterations: swarmManager.getMaxIterations(),
        });
        // This system prompt is deliberately not persisted. It only applies
        // while racers are active in the current execution loop.
      } else {
        removeRacerOrchestratorPrompt(messages);
        removeRacerOrchestratorPrompt(newMessages);
      }

      const openaiMessages = messagesToOpenAI(messages, orchestratorConfig.provider === "kimi");
      const unconfiguredTools = getUnconfiguredToolNames();
      const tools = racerOrchestratorMode
        ? toolRegistry.toOpenAISchemas({ agentRole: "orchestrator" })
        : toolRegistry.toOpenAISchemas({
          agentRole: "main",
          disabledTools: disabledAgentTools,
          unconfiguredTools,
        });

      let assistantContent = "";
      let assistantReasoning = "";
      let assistantToolCalls: ToolCallData[] = [];

      const { tags: traceTags, phase } = buildTraceTags("agent", messages, [
        `session_id:${sessionId}`,
        `workspace_id:${session.workspaceId ?? "unknown"}`,
        racerOrchestratorMode ? "agent_role:racer_orchestrator" : "agent_role:main_orchestrator",
      ]);

      const result = await invoke_llm_streaming({
        messages: openaiMessages,
        tools,
        temperature: 0.7,
        reasoningMode: orchestratorReasoningMode,
        providerOverride: orchestratorConfig,
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

        const contextLimit = getModelContextLimit(orchestratorConfig.model);
        sse.write("token_usage", {
          totalTokens: lastPromptTokens,
          promptTokens: lastPromptTokens,
          completionTokens: result.usage.completion_tokens ?? 0,
          contextLimit,
          iteration,
          maxIterations: maxAgentIterations,
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
          engagementState,
        );
        messages = preservedMessages;
        await replaceMessages(sessionId, messages);
        newMessages.length = 0;
        continue;
      }

      if (result.finishReason === "stop" || assistantToolCalls.length === 0) {
        if (hasActiveRacers) {
          const completedSwarmIds = spawnedSwarmIds.filter((id) => !swarmManager.isRunning(id));
          if (completedSwarmIds.length > 0) {
            const swarmResults = await swarmManager.waitFor(completedSwarmIds);
            for (const sr of swarmResults) {
              appendSwarmResultMessages(messages, newMessages, sr, turnIndex);
            }
            for (const id of completedSwarmIds) {
              spawnedSwarmIds.splice(spawnedSwarmIds.indexOf(id), 1);
            }
          }

          // Orchestrator produced text but no tool calls — inject a nudge so the
          // next LLM call sees it should use tools, and auto-wait to avoid a
          // tight loop that burns iterations.
          const nudge: AgentMessageDoc = {
            id: `orch_nudge_${Date.now()}`,
            role: "user",
            content:
              "[System] You produced text without calling any tools. As orchestrator you MUST " +
              "call a tool every turn. Use `wait` to pause, `get_solve_status` to check progress, " +
              "or `read_racer_trace` to inspect a racer. Do NOT generate text-only responses.",
            timestamp: new Date(),
            turnIndex,
            isSummary: false,
          };
          messages.push(nudge);
          newMessages.push(nudge);

          // Auto-wait 15s to avoid burning iterations when the LLM is looping
          await new Promise((resolve) => setTimeout(resolve, 15_000));

          continue;
        }
        completedNormally = true;
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
        onInstallSuggestion(suggestion) {
          sse.write("install_suggestion", suggestion);
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

      // Track spawned subagents and swarms
      for (const tr of toolResults) {
        if (tr.toolName === "spawn_subagent" && tr.result.output.includes("subagent_id:")) {
          const match = tr.result.output.match(/subagent_id:\s*(\S+)/);
          if (match) {
            spawnedSubagentIds.push(match[1]);
          }
        }
        if (tr.toolName === "spawn_swarm" && tr.result.output.includes("swarm_id:")) {
          const match = tr.result.output.match(/swarm_id:\s*(\S+)/);
          if (match) {
            spawnedSwarmIds.push(match[1]);
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
          arguments: parseToolArguments(
            assistantToolCalls.find((tc) => tc.id === cr.toolCallId)?.arguments ?? "{}",
          ).args,
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
                arguments: parseToolArguments(
                  assistantToolCalls.find((tc) => tc.id === firstConsent.toolCallId)?.arguments ?? "{}",
                ).args,
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
        completedNormally = true;
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

      // If swarms are running and the agent only spawned swarms this iteration,
      // wait for them to complete before the next iteration
      if (spawnedSwarmIds.length > 0 && assistantToolCalls.every((tc) => tc.name === "spawn_swarm" || tc.name === "spawn_subagent")) {
        const swarmResults = await swarmManager.waitFor([...spawnedSwarmIds]);
        for (const sr of swarmResults) {
          appendSwarmResultMessages(messages, newMessages, sr, turnIndex);
        }
        spawnedSwarmIds.length = 0;
      }
    }

    const reachedIterationLimit =
      iteration >= maxAgentIterations &&
      !completedNormally &&
      !params.abortSignal?.aborted;

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

    if (spawnedSwarmIds.length > 0) {
      if (params.abortSignal?.aborted) {
        await swarmManager.pauseAll();
      } else {
        await swarmManager.cancelAll();
      }
      const swarmResults = await swarmManager.waitFor([...spawnedSwarmIds]);
      for (const sr of swarmResults) {
        appendSwarmResultMessages(messages, newMessages, sr, session.turnIndex);
      }
    }

    await appendMessages(sessionId, newMessages);

    if (params.abortSignal?.aborted) {
      await subagentManager.cancelAll();
      await setAgentState(sessionId, "paused");
      sse.write("paused", { message: "Agent paused by user" });
    } else {
      await setAgentState(sessionId, "idle");
      if (reachedIterationLimit) {
        sse.write("iteration_limit", {
          maxIterations: maxAgentIterations,
          message: `The agent used all ${maxAgentIterations} configured turns.`,
        });
      }
      sse.write("done", {
        message: reachedIterationLimit
          ? "Agent paused at the configured turn limit"
          : "Agent turn completed",
        iterations: iteration,
        reachedIterationLimit,
      });
    }
    sse.end();
  } catch (err: any) {
    console.error("[agent] Loop error:", err);
    await appendMessages(sessionId, newMessages);
    const isAbort = err?.name === "AbortError" || params.abortSignal?.aborted;
    await subagentManager.cancelAll();
    if (isAbort) {
      await swarmManager.pauseAll();
    } else {
      await swarmManager.cancelAll();
    }
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
