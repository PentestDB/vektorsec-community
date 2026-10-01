import { v4 as uuidv4 } from "uuid";
import { Response } from "express";
import { lazyRedisClient } from "../utils/redis/client";
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
  buildPendingConsentBatch,
  ToolExecutionCallbacks,
} from "./agent.tools";
import { shouldSummarize, summarizeMessages, messagesToOpenAI } from "./context.service";
import { buildSystemPrompt, AgentPromptConfig, BoxEnvInfo } from "../utils/copilot/prompts";
import UserModel from "../models/User/User.model";
import WorkspaceModel from "../models/Workspace/Workspace.model";
import { sessionLifecycle } from "./session.lifecycle";
import { SubagentManager } from "./subagent.manager";
import { SwarmManager, CtfSwarmContext, SwarmResult } from "./swarm.manager";
import { EngagementState } from "./engagement-state";
import {
  formatAttackChainState,
  formatTargetMemoryEntries,
} from "./attackChain";
import { getModelContextLimit } from "../utils/modelMetadata";
import { parseToolArguments } from "../utils/toolArguments";
import {
  normalizeMaxAgentIterations,
  normalizeMaxSubagentIterations,
  normalizeMaxSwarmIterations,
  normalizeWorkspaceMaxTurns,
} from "../utils/agentConfig";
import { recordUsage } from "./usageTracker.service";
import { createAiToolSafetyEvaluator } from "./tool-approval.service";
import {
  buildGuardrailPromptBlock,
  resolveEffectiveScopeConfig,
} from "../utils/guardrails";
import type { GuardrailRuntimeConfig, WorkspaceAgentSettings } from "../utils/guardrails";

const PAUSE_CHECK_KEY = (id: string) => `agent:pause:${id}`;
const RACER_ORCHESTRATOR_PROMPT_ID = "sys_racer_orchestrator";

// ─── Short-lived user cache ─────────────────────────────────────────
// `UserModel.findById` is called several times per agent turn (prompt config,
// consent flags, model config). A short TTL avoids redundant DB round-trips
// within a single turn while still picking up config changes quickly.
const USER_CACHE_TTL_MS = 5_000;
const userCache = new Map<string, { value: any; expiresAt: number }>();

async function cachedUser(userId: string): Promise<any> {
  const now = Date.now();
  const hit = userCache.get(userId);
  if (hit && hit.expiresAt > now) return hit.value;
  const user = await UserModel.findById(userId).lean();
  userCache.set(userId, { value: user, expiresAt: now + USER_CACHE_TTL_MS });
  return user;
}


// ─── Abort controller registry (for immediate pause) ───────────────────

// In-memory abort controllers + run "generation" bookkeeping.
//
// Why a generation counter?
//   When a run is force-reset or superseded (new message while an old,
//   unresponsive loop is still unwinding) the old loop must not be allowed to
//   overwrite the new run's persisted state. Every registerAbortController()
//   bumps the session generation; agentState writes made by a run are gated
//   through isRunCurrent() so a stale loop can never clobber a newer run.

const abortControllers = new Map<string, AbortController>();
const runGenerations = new Map<string, number>();

// Session "presence" leases. A lease is held while a *user-originated* run has
// a live SSE client (see registerUserRunPresence / touchUserRunPresence). The
// watchdog uses these to tell "run still being watched" from "orphaned run".
const userRunLeases = new Map<string, { gen: number; lastSeen: number }>();

export const STALE_RUN_GRACE_MS = 30_000;
const WATCHDOG_INTERVAL_MS = 10_000;

export interface RunOriginOptions {
  origin?: "user" | "server";
}

export function registerAbortController(
  sessionId: string,
  opts?: RunOriginOptions,
): AbortController {
  const gen = (runGenerations.get(sessionId) ?? 0) + 1;
  runGenerations.set(sessionId, gen);
  const ctrl = new AbortController();
  (ctrl as any).__runGen = gen;
  (ctrl as any).__runOrigin = opts?.origin ?? "server";
  (ctrl as any).__runCreatedAt = Date.now();
  abortControllers.set(sessionId, ctrl);
  return ctrl;
}

export function getRunGeneration(sessionId: string): number {
  return runGenerations.get(sessionId) ?? 0;
}

/** True when `signal` belongs to the latest registered run for this session. */
export function isRunCurrent(sessionId: string, signal?: AbortSignal): boolean {
  if (!signal) return true;
  const ctrlGen = (signal as any).__runGen as number | undefined;
  if (ctrlGen === undefined) return true; // untracked external signal – assume current
  return ctrlGen === runGenerations.get(sessionId);
}

/** Marks a user-originated run as "being watched" by a live SSE client. */
export function registerUserRunPresence(sessionId: string): void {
  const gen = runGenerations.get(sessionId) ?? 0;
  userRunLeases.set(sessionId, { gen, lastSeen: Date.now() });
}

/** Refreshes the presence lease (called on every SSE heartbeat). */
export function touchUserRunPresence(sessionId: string): void {
  const lease = userRunLeases.get(sessionId);
  if (lease) lease.lastSeen = Date.now();
}

export function clearUserRunPresence(sessionId: string): void {
  userRunLeases.delete(sessionId);
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

/**
 * Hard-reset a session's agent runtime:
 *  - aborts any in-flight run (an unresponsive loop stops at its next
 *    checkpoint),
 *  - clears the Redis pause flag,
 *  - sets agentState to "idle" and drops any pending consent / manual prompt,
 *  - bumps the run generation so a stale loop can no longer overwrite state.
 *
 * Safe to call at any time. Used by the REST + WS "force-reset-agent" actions
 * and by the `/reset` slash command.
 */
export async function forceResetAgent(sessionId: string): Promise<{ agentState: string }> {
  abortSession(sessionId);
  clearUserRunPresence(sessionId);
  try {
    await setPaused(sessionId, false);
  } catch {
    // Redis unreachable – ignore, the DB reset below is the source of truth.
  }
  runGenerations.set(sessionId, (runGenerations.get(sessionId) ?? 0) + 1);
  await SessionsModel.updateOne(
    { sessionId },
    {
      $set: { agentState: "idle" },
      $unset: { pendingConsent: 1, pendingManualExecution: 1 },
    },
  );
  console.log(`[agent] forceResetAgent: ${sessionId} -> idle`);
  return { agentState: "idle" };
}

// ─── Stale-run watchdog ──────────────────────────────────────────────
// Sweeps persisted sessions that are still "running" but have no live run:
//   - a run with an ACTIVE controller whose origin is "user" but nobody has
//     been watching it for > STALE_RUN_GRACE_MS  -> abort + pause (orphaned),
//   - a session with NO active controller while the DB still says "running"
//     (stuck state from a crash / unresponsive loop / backend restart)
//     -> reset to idle.
let watchdogStarted = false;
let watchdogTimer: NodeJS.Timeout | null = null;

async function sweepStuckRuns(): Promise<void> {
  try {
    const docs = await SessionsModel.find({ agentState: "running" })
      .select("sessionId")
      .lean();

    for (const doc of docs) {
      const sessionId = (doc as any).sessionId as string;
      const ctrl = abortControllers.get(sessionId);
      const lease = userRunLeases.get(sessionId);
      const now = Date.now();

      if (ctrl && !ctrl.signal.aborted) {
        const origin = (ctrl as any).__runOrigin as string | undefined;
        const createdAt = (ctrl as any).__runCreatedAt as number | undefined;
        const orphaned =
          origin === "user" &&
          (!lease || now - lease.lastSeen > STALE_RUN_GRACE_MS) &&
          createdAt !== undefined &&
          now - createdAt > STALE_RUN_GRACE_MS;
        if (orphaned) {
          console.warn(
            `[agent] Watchdog: pausing orphaned user run for ${sessionId} (unwatched > ${STALE_RUN_GRACE_MS / 1000}s)`,
          );
          abortSession(sessionId);
          try {
            await setPaused(sessionId, true);
          } catch {
            // ignore
          }
        }
        continue;
      }

      // No in-flight controller but the DB says running → stuck state.
      const unwatchedFor = lease ? now - lease.lastSeen : Number.MAX_SAFE_INTEGER;
      if (unwatchedFor >= STALE_RUN_GRACE_MS) {
        console.warn(`[agent] Watchdog: resetting stale "running" state for ${sessionId}`);
        try {
          await setPaused(sessionId, false);
        } catch {
          // ignore
        }
        await SessionsModel.updateOne({ sessionId }, { $set: { agentState: "idle" } });
      }
    }
  } catch (err) {
    console.warn("[agent] Watchdog sweep error:", err);
  }
}

export function startAgentStateWatchdog(): void {
  if (watchdogStarted) return;
  watchdogStarted = true;
  watchdogTimer = setInterval(() => {
    sweepStuckRuns().catch((err) => console.warn("[agent] Watchdog sweep failed:", err));
  }, WATCHDOG_INTERVAL_MS);
  watchdogTimer.unref?.();
  console.log(`[agent] Agent state watchdog started (sweep every ${WATCHDOG_INTERVAL_MS / 1000}s)`);
}

/**
 * List currently active agent sessions (sessions with a registered, non-aborted
 * abort controller). Used by the admin "Pentest Tasks" monitor.
 */
export function listActiveAgentSessions(): { sessionId: string; activeSince: number }[] {
  const now = Date.now();
  const out: { sessionId: string; activeSince: number }[] = [];
  abortControllers.forEach((ctrl, sessionId) => {
    if (!ctrl.signal.aborted) {
      out.push({ sessionId, activeSince: now });
    }
  });
  return out;
}


// ─── SSE helpers ─────────────────────────────────────────────────────

export interface SSEWriter {
  write: (event: string, data: any) => void;
  end: () => void;
  /**
   * Optional liveness probe. Returns true when the underlying response is
   * destroyed/ended (client disconnected) so run loops can stop heartbeating
   * and unwind instead of leaving a session stuck in "running".
   */
  clientGone?: () => boolean;
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
    clientGone() {
      return res.destroyed || res.writableEnded;
    },
  };
}

/**
 * An SSEWriter with no client attached, for agent runs started by the server
 * rather than by a streaming request (e.g. CTF "solve all"). The agent loop
 * already persists messages and state to the session document, so the UI picks
 * the run up from session history — these events simply have nowhere to go.
 *
 * `error` events are logged, since with no client there is otherwise no trace
 * of why a detached run died.
 */
export function createDetachedSSEWriter(label: string): SSEWriter {
  return {
    write(event: string, data: any) {
      if (event === "error") {
        console.error(`[agent:detached:${label}] ${data?.message ?? JSON.stringify(data)}`);
      }
    },
    end() {},
  };
}

// ─── State helpers ───────────────────────────────────────────────────

// Resolved per call so importing this module never requires a live Redis.
const redisClient = lazyRedisClient();

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

async function setAgentState(
  sessionId: string,
  state: AgentState,
  signal?: AbortSignal,
): Promise<void> {
  if (signal && !isRunCurrent(sessionId, signal)) {
    // A newer run superseded this one — do not clobber its persisted state.
    return;
  }
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

export async function trackTokens(
  sessionId: string,
  promptTokens: number,
  completionTokens: number,
  totalTokens: number,
  channel: "telegram" | "online" | "platform" = "platform",
): Promise<void> {

  // Record usage into the UsageRecord collection so plan-based daily/trial
  // token limits can be enforced (admin-configurable).
  try {
    const session = await SessionsModel.findOne({ sessionId }).select("uid");
    if (session?.uid) {
      await recordUsage(session.uid.toString(), channel, {
        tokensIn: promptTokens,
        tokensOut: completionTokens,
        requests: 1,
      });
    }
  } catch (err) {
    console.warn("[usage] trackTokens recordUsage error:", err);
  }

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
  const user = await cachedUser(userId);
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
  guardrails?: GuardrailRuntimeConfig | null,
): Promise<AgentMessageDoc> {
  const promptConfig = await buildAgentPromptConfig(sessionId, userId, envInfo);
  let systemContent = buildSystemPrompt(promptConfig);

  // Inject the persisted attack chain + target memory so the agent keeps
  // multi-step context across turns and summarizations.
  try {
    const session = await SessionsModel.findOne({ sessionId })
      .select("attackChain targetMemory")
      .lean();
    if (session) {
      const blocks: string[] = [];
      const chainBlock = formatAttackChainState(session.attackChain as any);
      if (chainBlock) blocks.push(chainBlock);
      const memoryBlock = formatTargetMemoryEntries(session.targetMemory as any);
      if (memoryBlock) blocks.push(memoryBlock);
      if (blocks.length) systemContent += "\n\n" + blocks.join("\n\n");
    }
  } catch (err) {
    console.error("[agent] failed to inject attack chain into system prompt:", err);
  }

  // Append workspace guardrails (autonomous mode / authorized scope) so the
  // model behaves consistently with the enforced consent + scope rules.
  if (guardrails) {
    const grBlock = buildGuardrailPromptBlock(guardrails);
    if (grBlock) systemContent += grBlock;
  }

  return {
    id: `sys_${sessionId}`,
    role: "system",
    content: systemContent,
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
You are the VektorSec orchestrator. You coordinate racer agents — you do NOT solve tasks yourself.
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

export interface RunAgentLoopParams {
  sessionId: string;
  userId: string;
  sse: SSEWriter;
  abortSignal?: AbortSignal;
  channel?: "telegram" | "online" | "platform";
}

const SSE_HEARTBEAT_MS = 15_000;

/**
 * Heartbeat wrapper around the core agent loop.
 *
 * - Sends SSE `heartbeat` events every 15s so proxies / load balancers do not
 *   kill an idle stream, and refreshes the user-run presence lease.
 * - When the underlying response is gone (client disconnected without a req
 *   close) it aborts the run and marks the session paused instead of leaving
 *   it stuck in "running".
 */
export async function runAgentLoop(params: RunAgentLoopParams): Promise<void> {
  const heartbeat = setInterval(() => {
    try {
      if (typeof params.sse.clientGone === "function" && params.sse.clientGone()) {
        clearInterval(heartbeat);
        abortSession(params.sessionId);
        clearUserRunPresence(params.sessionId);
        setPaused(params.sessionId, true).catch(() => {});
        console.warn(`[agent] SSE client for ${params.sessionId} is gone — pausing run`);
        return;
      }
      params.sse.write("heartbeat", { t: Date.now() });
      touchUserRunPresence(params.sessionId);
    } catch {
      // ignore – the loop cleans up on exit
    }
  }, SSE_HEARTBEAT_MS);
  heartbeat.unref?.();
  try {
    await runAgentLoopCore(params);
  } finally {
    clearInterval(heartbeat);
  }
}

/**
 * Load the per-workspace agent settings (maxTurns / autonomousMode / scope)
 * for a session and resolve the effective guardrail runtime config. Falls back
 * to the global Admin > Scope env config when the workspace scope is disabled.
 */
export async function loadSessionWorkspaceGuardrails(
  sessionId: string,
): Promise<{ settings: WorkspaceAgentSettings | null; guardrails: GuardrailRuntimeConfig }> {
  let settings: WorkspaceAgentSettings | null = null;

  try {
    const session = await SessionsModel.findOne({ sessionId })
      .select("workspaceId")
      .lean();
    if (session?.workspaceId) {
      const ws = await WorkspaceModel.findOne({ workspaceId: session.workspaceId })
        .select("agentConfig")
        .lean();
      settings = ((ws as any)?.agentConfig as WorkspaceAgentSettings | undefined) ?? null;
    }
  } catch (err) {
    console.warn(`[agent] Failed to load workspace guardrails for ${sessionId}:`, err);
  }

  return {
    settings,
    guardrails: {
      autonomousMode: settings?.autonomousMode === true,
      scope: resolveEffectiveScopeConfig(settings?.scope),
    },
  };
}

async function runAgentLoopCore(params: RunAgentLoopParams): Promise<void> {
  const { sessionId, userId, sse, channel = "platform" } = params;

  const session = await SessionsModel.findOne({ sessionId });
  if (!session) {
    sse.write("error", { message: "Session not found" });
    sse.end();
    return;
  }

  const user = await cachedUser(session.uid.toString());
  const requireConsentForAllTools = user?.configs?.requireConsentForAllTools ?? false;

  const toolExecutionMode = user?.configs?.toolExecutionMode ??
    (requireConsentForAllTools ? "requires_consent" : "auto");
  const disableSafetyProtections = user?.configs?.disableSafetyProtections ?? false;
  // Turn-limit resolution order:
  //   1. Workspace agent settings (Workspace Settings → Agent Max Turns —
  //      presets 25/50/100) when the session belongs to a workspace that has
  //      one set;
  //   2. user-level maxAgentIterations (Settings → Agent Behavior);
  //   3. default (25).
  // Workspace settings: turn limit + guardrails (autonomous mode / scope).
  const { settings: workspaceAgentConfig, guardrails } =
    await loadSessionWorkspaceGuardrails(sessionId);
  const workspaceMaxTurns = normalizeWorkspaceMaxTurns(workspaceAgentConfig?.maxTurns);
  const maxAgentIterations =
    workspaceMaxTurns ?? normalizeMaxAgentIterations(user?.configs?.maxAgentIterations);
  // Autonomous workspace mode auto-executes high-risk (non-destructive)
  // in-scope actions immediately. It never downgrades an explicit
  // requires_consent policy chosen by the user.
  const autonomousExecution =
    guardrails.autonomousMode &&
    toolExecutionMode !== "requires_consent" &&
    requireConsentForAllTools !== true;
  const effectiveToolExecutionMode = autonomousExecution ? "auto" : toolExecutionMode;
  const maxSubagentIterations = normalizeMaxSubagentIterations(
    user?.configs?.maxSubagentIterations,
  );
  const maxSwarmIterations = normalizeMaxSwarmIterations(
    user?.configs?.maxSwarmIterations,
  );
  const disabledAgentTools: string[] = session.disabledAgentTools ?? [];


  await setAgentState(sessionId, "running", params.abortSignal);
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
        const resolvedWs = shellManager.remoteWorkspaceDir.replace(/^~/, home);
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

  // Refresh the system message on every turn so model/racer assignments and
  // workspace guardrails (autonomous mode / authorized scope) are current.
  if (messages.length > 0 && messages[0].role === "system") {
    const updatedSysMsg = await buildSystemMessage(sessionId, userId, envInfo, guardrails);
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
  const toolSafetyEvaluator = effectiveToolExecutionMode === "auto_approve"
    ? createAiToolSafetyEvaluator({
        provider: orchestratorConfig,
        userId: session.uid.toString(),
        abortSignal: params.abortSignal,
      })
    : undefined;

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
    links: vulnerability.links,
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
    maxSubagentIterations,
    maxSwarmIterations,
    guardrails,
  });


  try {
    while (iteration < maxAgentIterations) {
      iteration++;

      // Flush whatever the previous iteration produced. Without this, messages
      // only reach the database when the run ends, so the UI shows an empty
      // chat for the whole run (server-started runs have no SSE stream either),
      // and a crash or restart discards every message since turn one.
      //
      // Sits at the top of the loop so it also covers iterations that ended via
      // `continue`; the final iteration is still flushed by the exit paths.
      if (newMessages.length > 0) {
        await appendMessages(sessionId, newMessages);
        newMessages.length = 0;
      }

      if (await isPaused(sessionId)) {
        await appendMessages(sessionId, newMessages);
        await setAgentState(sessionId, "paused", params.abortSignal);
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
          channel,
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
        onConsentRequired(id, name, args, safetyBlock, approvalReason) {
          // Emitted once as a complete batch below. Streaming individual
          // requests here could briefly hide siblings behind one approval.
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
        effectiveToolExecutionMode,
        toolSafetyEvaluator,
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
        const batch = buildPendingConsentBatch(consentResults, assistantToolCalls);
        const firstBatchItem = batch[0];

        sse.write("consent_required", {
          id: firstBatchItem.toolCallId,
          name: firstBatchItem.toolName,
          args: firstBatchItem.arguments,
          safetyBlock: firstBatchItem.safetyBlock,
          approvalReason: firstBatchItem.approvalReason,
          batch: batch.length > 1 ? batch : undefined,
        });

        await appendMessages(sessionId, newMessages);
        if (isRunCurrent(sessionId, params.abortSignal)) {
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
                  safetyBlock: firstBatchItem.safetyBlock,
                  approvalReason: firstBatchItem.approvalReason,
                  batch: batch.length > 1 ? batch : undefined,
                },
              },
            },
          );
        }
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
      await setAgentState(sessionId, "paused", params.abortSignal);
      sse.write("paused", { message: "Agent paused by user" });
    } else {
      await setAgentState(sessionId, "idle", params.abortSignal);
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
    await setAgentState(sessionId, isAbort ? "paused" : "idle", params.abortSignal);
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
  channel?: "telegram" | "online" | "platform";
}): Promise<void> {
  const { sessionId, userId, userMessage, sse, abortSignal, channel = "platform" } = params;

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

  await runAgentLoop({ sessionId, userId, sse, abortSignal, channel });
}

// ─── Handle consent response and resume ──────────────────────────────

export async function handleConsent(params: {
  sessionId: string;
  userId: string;
  approved: boolean;
  sse: SSEWriter;
  abortSignal?: AbortSignal;
  channel?: "telegram" | "online" | "platform";
}): Promise<void> {
  const { sessionId, userId, approved, sse, abortSignal, channel = "platform" } = params;

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
    await setAgentState(sessionId, "idle", abortSignal);
    await runAgentLoop({ sessionId, userId, sse, abortSignal, channel });
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
    guardrails: (await loadSessionWorkspaceGuardrails(sessionId)).guardrails,
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
  await runAgentLoop({ sessionId, userId, sse, abortSignal, channel });
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
