import { v4 as uuidv4 } from "uuid";
import { EventEmitter } from "events";
import SessionsModel, {
  AgentMessageDoc,
  SubagentStatus,
  SwarmWinCondition,
  SwarmStatus,
} from "../models/Sessions/Sessions.model";
import { ShellManager } from "./shell.manager";
import { SSEWriter, buildTraceTags } from "./agent.service";
import { SubagentManager } from "./subagent.manager";
import { FindingsBus, Finding } from "./findings-bus";
import { toolRegistry } from "../tools/registry";
import { getUnconfiguredToolNames } from "../utils/toolAvailability";
import {
  invoke_llm_streaming,
  ToolCallData,
  ProviderConfig,
  ReasoningMode,
  getProvider,
  getUserModels,
  presetToProviderConfig,
} from "../utils/llm/providers";
import { shouldSummarize, summarizeMessages, messagesToOpenAI } from "./context.service";
import { ExecutionContext, ToolResult } from "../tools/types";
import UserModel from "../models/User/User.model";
import {
  buildFileHints,
  buildCategoryTactics,
  buildConnectionHints,
  buildSystemPrompt,
  AgentPromptConfig,
} from "../utils/copilot/prompts";
import { EngagementState } from "./engagement-state";
import { getModelContextLimit } from "../utils/modelMetadata";

const MAX_SWARM_AGENT_ITERATIONS = 25;
const DEFAULT_SWARM_TIMEOUT_MS = 15 * 60 * 1000;
const ANSI_REGEX = /\x1B\[[0-?]*[-\[\]#-~]/g;
const MAX_OUTPUT_CHARS = 12_000;
const DEFAULT_TOOL_TIMEOUT_MS = 60_000;

function executeWithTimeout(
  toolDef: import("../tools/types").ToolDefinition,
  args: Record<string, any>,
  ctx: import("../tools/types").ExecutionContext,
): Promise<import("../tools/types").ToolResult> {
  const timeoutMs = toolDef.timeoutMs ?? DEFAULT_TOOL_TIMEOUT_MS;
  return Promise.race([
    toolDef.execute(args, ctx),
    new Promise<import("../tools/types").ToolResult>((_, reject) =>
      setTimeout(() => reject(new Error(`Tool '${toolDef.name}' timed out after ${timeoutMs / 1000}s`)), timeoutMs),
    ),
  ]);
}


export interface SwarmResult {
  swarmId: string;
  status: SwarmStatus;
  winner?: string;
  summary: string;
  agentResults: Array<{
    agentId: string;
    modelLabel: string;
    status: string;
    result: string;
  }>;
}

interface SwarmAgentSpec {
  task: string;
  context?: string;
}

export interface CtfSwarmContext {
  challengeName: string;
  category?: string;
  points?: number;
  challengeTxt: string;
  files: string[];
  connectionInfo?: string;
  challengeDir: string;
  flagFormat?: string;
  userNotes?: string;
}

export interface ModelPreset {
  id?: string;
  label: string;
  provider: string;
  model: string;
  apiKey?: string;
  baseURL?: string;
  reasoningMode?: ReasoningMode;
}

function truncateOutput(output: string): string {
  const cleaned = output.replace(ANSI_REGEX, "").trim();
  if (cleaned.length <= MAX_OUTPUT_CHARS) return cleaned;
  const half = Math.floor(MAX_OUTPUT_CHARS / 2);
  return (
    cleaned.slice(0, half) +
    `\n\n... [truncated ${cleaned.length - MAX_OUTPUT_CHARS} chars] ...\n\n` +
    cleaned.slice(-half)
  );
}

function buildSwarmAgentPrompt(params: {
  goal: string;
  task: string;
  modelLabel: string;
  winCondition: SwarmWinCondition;
  parentSessionId: string;
  envInfo?: { user: string; home: string; os: string; workspacePath: string };
  ctfContext?: CtfSwarmContext;
}): string {
  const { goal, task, modelLabel, winCondition, parentSessionId, envInfo, ctfContext } = params;
  const boxDesc = envInfo ? `${envInfo.os} attack box` : "attack box";
  const userDesc = envInfo ? ` as ${envInfo.user}` : "";

  if (ctfContext) {
    return buildCtfSwarmPrompt({ modelLabel, winCondition, envInfo, ctfContext });
  }

  const winInstructions = winCondition === "first_success"
    ? `- If you achieve the swarm goal, call report_finding with is_success=true immediately.
- Other agents will be cancelled when any agent succeeds.`
    : `- Report all findings using report_finding so the orchestrator gets a complete picture.`;

  return `<role>
You are a Pentest Copilot swarm agent (${modelLabel}). You are one of several agents racing in parallel to achieve a shared goal, each running on a different model.
</role>

<swarm_goal>
${goal}
</swarm_goal>

<your_task>
${task}
</your_task>

<behavior>
- Focus on your specific task. Be thorough and autonomous.
- Use report_finding to share discoveries with sibling agents.
- Use check_findings every few steps to see what siblings have found — avoid duplicating work.
${winInstructions}
- You can spawn subagents for focused sub-tasks using spawn_subagent.
- You have access to the ${boxDesc}${userDesc}.
- When done, provide a structured summary of your findings.
</behavior>

<environment>
- Parent Session ID: ${parentSessionId}
- Model: ${modelLabel}
- Attack box: ${boxDesc}${envInfo ? `\n- User: ${envInfo.user} (home: ${envInfo.home})` : ""}
- Working directory: ${envInfo?.workspacePath ?? "~/pentest-workspace"}
</environment>

<output_format>
When you complete your investigation, provide:
- FINDINGS: Key discoveries
- EVIDENCE: Commands and output
- RECOMMENDATIONS: Next steps
- FILES: Any output files created
</output_format>`;
}

function buildCtfSwarmPrompt(params: {
  modelLabel: string;
  winCondition: SwarmWinCondition;
  envInfo?: { user: string; home: string; os: string; workspacePath: string };
  ctfContext: CtfSwarmContext;
}): string {
  const { modelLabel, winCondition, envInfo, ctfContext } = params;
  const boxDesc = envInfo ? `${envInfo.os} attack box` : "attack box";
  const connHints = buildConnectionHints(ctfContext.connectionInfo ?? "");
  const categoryTactics = buildCategoryTactics(ctfContext.category ?? "");
  const fileHints = buildFileHints(ctfContext.files);

  const flagFormatNote = ctfContext.flagFormat
    ? `\n**Flag format:** \`${ctfContext.flagFormat}\` — flags will match this prefix/pattern.`
    : "";

  const approachSteps: string[] = [];
  if (connHints) {
    approachSteps.push("1. Connect to the service NOW — your first tool call must reach the target.");
    approachSteps.push("2. If distfiles exist, inspect them for source code or config that reveals the vulnerability.");
    approachSteps.push("3. Identify the vulnerability or puzzle mechanism.");
    approachSteps.push("4. Develop and execute your exploit or solution.");
    approachSteps.push("5. Call report_finding with is_success=true and the flag in the finding text.");
  } else {
    approachSteps.push("1. Inspect the distfiles NOW — read source, examine binaries, check file types.");
    approachSteps.push("2. Identify the vulnerability or puzzle mechanism.");
    approachSteps.push("3. Develop and execute your exploit or solution.");
    approachSteps.push("4. Call report_finding with is_success=true and the flag in the finding text.");
  }

  return `<role>
You are an expert CTF solver (${modelLabel}). You are one of several agents racing in parallel to solve this challenge. The first agent to find the flag wins.
</role>

<challenge>
**Name:** ${ctfContext.challengeName}${ctfContext.points ? ` (${ctfContext.points} pts)` : ""}${ctfContext.category ? ` [${ctfContext.category}]` : ""}
**Working directory:** ${ctfContext.challengeDir}
Always \`cd ${ctfContext.challengeDir}\` before running any commands.${flagFormatNote}

${connHints ? connHints + "\n" : ""}
${ctfContext.challengeTxt}

${fileHints}
${categoryTactics ? "\n" + categoryTactics : ""}
</challenge>

<behavior>
- Be creative, thorough, and autonomous. Try the obvious path first, then explore systematically.
- Ignore placeholder flags like \`flag{placeholder}\`, \`CTF{flag}\`, or \`FLAG{example}\` — only report real flags.
- If an approach is not working after 2-3 attempts, pivot to a different technique.
- Use check_findings every few steps to see what sibling agents have discovered — avoid duplicating work.
- Use report_finding to share discoveries with sibling agents.
- **When you find the flag:** Do BOTH of these in the same turn:
  1. Call update_engagement_state with action="confirm_flag" and data={"value":"THE_FLAG","challengeName":"CHALLENGE_NAME"} to auto-submit to CTFd.
  2. Call report_finding with is_success=true and include the flag in your finding text (e.g. "FLAG: CTF{the_actual_flag}").
- ${winCondition === "first_success" ? "Other agents will be cancelled when any agent succeeds." : "Report all findings for a complete picture."}
- You can spawn subagents for focused sub-tasks using spawn_subagent.
</behavior>

<approach>
${approachSteps.join("\n")}
</approach>
${ctfContext.userNotes ? `\n<user_notes>\n${ctfContext.userNotes}\n</user_notes>\n` : ""}
<environment>
- Model: ${modelLabel}
- Attack box: ${boxDesc}${envInfo ? `\n- User: ${envInfo.user} (home: ${envInfo.home})` : ""}
</environment>`;
}

async function buildProviderConfig(
  preset: ModelPreset,
): Promise<ProviderConfig> {
  return presetToProviderConfig({ ...preset, id: preset.id || "runtime-racer" });
}

export class SwarmManager extends EventEmitter {
  private sessionId: string;
  private shellManager: ShellManager;
  private runningSwarms: Map<string, AbortController> = new Map();
  private completionCallbacks: Map<string, Array<(result: SwarmResult) => void>> = new Map();
  private findingsBuses: Map<string, FindingsBus> = new Map();
  private swarmAgents: Map<string, Array<{ agentId: string; modelLabel: string }>> = new Map();
  private liveAgentState: Map<string, {
    messages: AgentMessageDoc[];
    iteration: number;
    status: string;
    pendingBump?: string;
  }> = new Map();
  envInfo?: { user: string; home: string; os: string; workspacePath: string };

  constructor(sessionId: string, shellManager: ShellManager) {
    super();
    this.sessionId = sessionId;
    this.shellManager = shellManager;
  }

  checkAllFindings(): string {
    const allFindings: Finding[] = [];
    for (const [, bus] of this.findingsBuses) {
      const unread = bus.check("orchestrator");
      allFindings.push(...unread);
    }
    if (allFindings.length === 0) return "No new findings from racer agents.";
    const lines = allFindings.map(
      (f) => `[Racer ${f.modelLabel || f.agentId}]${f.isSuccess ? " [SUCCESS]" : ""} ${f.content}`,
    );
    return `**Findings from racer agents:**\n${lines.join("\n")}`;
  }

  async spawn(params: {
    goal: string;
    agentSpecs: SwarmAgentSpec[];
    winCondition: SwarmWinCondition;
    timeoutMs?: number;
    sse: SSEWriter;
    userId: string;
    modelPresets?: ModelPreset[];
    ctfContext?: CtfSwarmContext;
    agentPromptConfig?: AgentPromptConfig;
  }): Promise<string> {
    const swarmId = `swarm_${uuidv4().slice(0, 8)}`;
    const { goal, agentSpecs, winCondition, timeoutMs, sse, userId } = params;

    let presets: ModelPreset[] = params.modelPresets ? [...params.modelPresets] : [];

    if (presets.length === 0) {
      const defaultConfig = await getProvider();
      presets.push({
        label: defaultConfig.model,
        provider: defaultConfig.provider,
        model: defaultConfig.model,
      });
    }

    const agents = agentSpecs.map((spec, i) => {
      const preset = presets[i % presets.length];
      return {
        agentId: `sa_${uuidv4().slice(0, 8)}`,
        task: spec.task,
        context: spec.context,
        modelLabel: preset.label,
        modelSpec: { provider: preset.provider, model: preset.model },
        preset,
      };
    });

    await SessionsModel.updateOne(
      { sessionId: this.sessionId },
      {
        $push: {
          swarms: {
            swarmId,
            goal,
            winCondition,
            status: "running",
            agents: agents.map((a) => ({
              agentId: a.agentId,
              task: a.task,
              modelLabel: a.modelLabel,
              modelSpec: a.modelSpec,
              status: "running",
              messages: [],
              subagents: [],
              shells: [],
              createdAt: new Date(),
            })),
            findings: [],
            timeoutMs,
            createdAt: new Date(),
          },
        },
      },
    );

    sse.write("swarm_spawned", {
      swarmId,
      goal,
      winCondition,
      agents: agents.map((a) => ({
        agentId: a.agentId,
        task: a.task,
        model: a.modelLabel,
      })),
    });

    this.swarmAgents.set(swarmId, agents.map((a) => ({ agentId: a.agentId, modelLabel: a.modelLabel })));

    const abortCtrl = new AbortController();
    this.runningSwarms.set(swarmId, abortCtrl);

    const wallClockTimer = timeoutMs
      ? setTimeout(() => {
          console.warn(`[SwarmManager] Swarm ${swarmId} hit timeout (${timeoutMs / 1000}s), aborting`);
          abortCtrl.abort();
        }, timeoutMs)
      : undefined;

    this.runSwarm({
      swarmId,
      goal,
      agents,
      winCondition,
      sse,
      userId,
      abortSignal: abortCtrl.signal,
      agentPromptConfig: params.agentPromptConfig,
      ctfContext: params.ctfContext,
    })
      .catch((err) => {
        console.error(`[SwarmManager] Swarm ${swarmId} error:`, err);
      })
      .finally(() => {
        clearTimeout(wallClockTimer);
      });

    return swarmId;
  }

  private async runSwarm(params: {
    swarmId: string;
    goal: string;
    agents: Array<{
      agentId: string;
      task: string;
      context?: string;
      modelLabel: string;
      modelSpec: { provider: string; model: string };
      preset: ModelPreset;
    }>;
    winCondition: SwarmWinCondition;
    sse: SSEWriter;
    userId: string;
    abortSignal: AbortSignal;
    ctfContext?: CtfSwarmContext;
    agentPromptConfig?: AgentPromptConfig;
    engagementState?: EngagementState;
  }): Promise<void> {
    const { swarmId, goal, agents, winCondition, sse, userId, abortSignal } = params;
    const findingsBus = new FindingsBus();
    this.findingsBuses.set(swarmId, findingsBus);
    const cancelEvent = { cancelled: false };

    const engState = params.engagementState ?? await this.buildSwarmEngagementState();

    const agentPromises = agents.map((agent) =>
      this.runSwarmAgent({
        swarmId,
        goal,
        agent,
        winCondition,
        findingsBus,
        cancelEvent,
        sse,
        userId,
        abortSignal,
        engagementState: engState,
        ctfContext: params.ctfContext,
        agentPromptConfig: params.agentPromptConfig,
      }),
    );

    const results = await Promise.allSettled(agentPromises);

    let winner: string | undefined;
    const abortReason = (abortSignal as any).reason;
    let status: SwarmStatus = abortSignal.aborted
      ? (abortReason === "orchestrator_done" ? "completed" : abortReason === "paused" ? "paused" : "timed_out")
      : "completed";
    const agentResults: SwarmResult["agentResults"] = [];

    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      const agent = agents[i];
      if (r.status === "fulfilled") {
        agentResults.push({
          agentId: agent.agentId,
          modelLabel: agent.modelLabel,
          status: r.value.status,
          result: r.value.result,
        });
        if (r.value.isWinner) winner = agent.agentId;
      } else {
        agentResults.push({
          agentId: agent.agentId,
          modelLabel: agent.modelLabel,
          status: "failed",
          result: r.reason?.message ?? "Unknown error",
        });
      }
    }

    if (cancelEvent.cancelled && winner) {
      status = "completed";
    }

    const allFindings = findingsBus.getAll();
    const summaryLines = [
      `## Swarm Results: ${goal}`,
      `**Status:** ${status}${winner ? ` | **Winner:** ${winner}` : ""}`,
      "",
      "### Agent Results",
    ];
    for (const ar of agentResults) {
      summaryLines.push(`\n#### ${ar.agentId} (${ar.modelLabel}) — ${ar.status}`);
      summaryLines.push(ar.result || "(no result)");
    }
    if (allFindings.length > 0) {
      summaryLines.push("\n### Shared Findings");
      for (const f of allFindings) {
        summaryLines.push(`- [${f.agentId}]${f.isSuccess ? " **SUCCESS**" : ""}: ${f.content}`);
      }
    }
    const summary = summaryLines.join("\n");

    await SessionsModel.updateOne(
      { sessionId: this.sessionId, "swarms.swarmId": swarmId },
      {
        $set: {
          "swarms.$.status": status,
          "swarms.$.winner": winner,
          "swarms.$.findings": allFindings.map((f) => ({
            agentId: f.agentId,
            content: f.content,
            isSuccess: f.isSuccess,
            timestamp: f.timestamp,
          })),
          "swarms.$.completedAt": new Date(),
        },
      },
    );

    if (status === "paused") {
      sse.write("swarm_paused", { swarmId, status: "paused" });
    } else {
      sse.write("swarm_completed", { swarmId, status, winner, summary });
    }

    this.runningSwarms.delete(swarmId);
    this.findingsBuses.delete(swarmId);
    for (const a of agents) {
      this.liveAgentState.delete(`${swarmId}:${a.agentId}`);
    }
    this.swarmAgents.delete(swarmId);
    const swResult: SwarmResult = { swarmId, status, winner, summary, agentResults };
    this.notifyCompletion(swarmId, swResult);
  }

  private async runSwarmAgent(params: {
    swarmId: string;
    goal: string;
    agent: {
      agentId: string;
      task: string;
      context?: string;
      modelLabel: string;
      modelSpec: { provider: string; model: string };
      preset: ModelPreset;
    };
    winCondition: SwarmWinCondition;
    findingsBus: FindingsBus;
    cancelEvent: { cancelled: boolean };
    sse: SSEWriter;
    userId: string;
    abortSignal: AbortSignal;
    ctfContext?: CtfSwarmContext;
    agentPromptConfig?: AgentPromptConfig;
    resumeMessages?: AgentMessageDoc[];
    engagementState?: EngagementState;
  }): Promise<{ status: string; result: string; isWinner: boolean }> {
    const {
      swarmId, goal, agent, winCondition, findingsBus,
      cancelEvent, sse, userId, abortSignal,
    } = params;
    const { agentId, task, context, modelLabel, preset } = agent;

    const providerConfig = await buildProviderConfig(preset);

    const session = await SessionsModel.findOne({ sessionId: this.sessionId }).lean();
    const disabledAgentTools: string[] = session?.disabledAgentTools ?? [];

    const fullTask = context ? `${task}\n\nContext:\n${context}` : task;

    const winInstructions = winCondition === "first_success"
      ? `- If you achieve the goal, call report_finding with is_success=true immediately.\n- Other agents will be cancelled when any agent succeeds.`
      : `- Report all findings using report_finding so the orchestrator gets a complete picture.`;

    const racerSuffix = `\n\n<racer_mode>
You are running as racer agent "${modelLabel}" in a parallel swarm. Goal: ${goal}
${winInstructions}
- Use report_finding to share discoveries with sibling agents.
- Use check_findings every few steps to see what siblings have found — avoid duplicating work.
- You can spawn subagents for focused sub-tasks using spawn_subagent.
- When done, provide a structured summary of your findings.

FLAG SUBMISSION — CRITICAL:
- When you find a flag, you MUST call update_engagement_state with action="confirm_flag" and data={"value":"THE_FLAG","challengeName":"CHALLENGE_NAME"}.
- This triggers automatic submission to CTFd. Do NOT skip this step.
- ALSO call report_finding with is_success=true and include the flag text.
- Both calls are required: confirm_flag for submission, report_finding to signal success.

ITERATION EFFICIENCY:
- You have a MAXIMUM of ${MAX_SWARM_AGENT_ITERATIONS} iterations. Every iteration counts.
- Use PARALLEL tool calls whenever possible — call multiple independent tools in a single turn.
- Do NOT waste iterations on unnecessary confirmations or redundant checks.
- If an approach isn't working after 2-3 attempts, pivot immediately to a different technique.
- Prioritize high-impact actions: exploit first, enumerate only what's necessary.
</racer_mode>`;

    let systemContent: string;
    if (params.agentPromptConfig) {
      systemContent = buildSystemPrompt(params.agentPromptConfig) + racerSuffix;
    } else if (params.ctfContext) {
      systemContent = buildCtfSwarmPrompt({ modelLabel, winCondition, envInfo: this.envInfo, ctfContext: params.ctfContext });
    } else {
      systemContent = buildSwarmAgentPrompt({
        goal,
        task: fullTask,
        modelLabel,
        winCondition,
        parentSessionId: this.sessionId,
        envInfo: this.envInfo,
      });
    }

    let messages: AgentMessageDoc[];
    if (params.resumeMessages && params.resumeMessages.length > 0) {
      messages = [...params.resumeMessages];
    } else {
      const systemMsg: AgentMessageDoc = {
        id: `sys_${agentId}`,
        role: "system",
        content: systemContent,
        timestamp: new Date(),
        turnIndex: 0,
      };

      const userMsg: AgentMessageDoc = {
        id: uuidv4(),
        role: "user",
        content: fullTask,
        timestamp: new Date(),
        turnIndex: 0,
      };
      messages = [systemMsg, userMsg];
    }
    const shellsCreated: string[] = [];
    let iteration = 0;
    let finalResult = "";
    let isWinner = false;

    const liveKey = `${swarmId}:${agentId}`;
    this.liveAgentState.set(liveKey, { messages, iteration: 0, status: "running" });

    const innerSubagentMgr = new SubagentManager(this.sessionId, this.shellManager);
    innerSubagentMgr.envInfo = this.envInfo;

    const buildCtx = (onChunk?: (chunk: string) => void): ExecutionContext => ({
      sessionId: this.sessionId,
      agentId,
      agentRole: "swarm_agent",
      engagementState: params.engagementState,
      runCommand: (cmd, timeoutMs) =>
        this.shellManager.execInShell(cmd, timeoutMs, onChunk, abortSignal),
      spawnShell: async (label, type, purpose) => {
        const id = await this.shellManager.spawnShell({
          label: `[${agentId}] ${label}`,
          type,
          purpose,
          createdBy: "subagent",
          subagentId: agentId,
        });
        shellsCreated.push(id);
        return id;
      },
      writeToShell: (shellId, data) => this.shellManager.writeToShell(shellId, data),
      readShellOutput: (shellId, fromOffset) =>
        Promise.resolve(this.shellManager.readOutput(shellId, fromOffset)),
      closeShell: (shellId) => this.shellManager.closeShell(shellId),
      resizeShell: (shellId, cols, rows) => this.shellManager.resizeShell(shellId, cols, rows),
      listShells: () => this.shellManager.getShellList(),
      getShellInfo: (shellId) => this.shellManager.getShell(shellId),
      spawnSubagent: async (subTask: string) => {
        return innerSubagentMgr.spawn({
          parentId: agentId,
          task: subTask,
          sse,
          userId,
        });
      },
      reportFinding: (finding: string, success?: boolean) => {
        const f = findingsBus.post(agentId, finding, success, modelLabel);
        sse.write("swarm_finding", {
          swarmId,
          agentId,
          model: modelLabel,
          finding,
          isSuccess: f.isSuccess,
        });
        if (f.isSuccess && winCondition === "first_success") {
          isWinner = true;
          cancelEvent.cancelled = true;
        }
      },
      checkFindings: () => {
        const unread = findingsBus.check(agentId);
        return findingsBus.formatUnread(unread);
      },
      onOutput: onChunk,
    });

    try {
      while (iteration < MAX_SWARM_AGENT_ITERATIONS) {
        iteration++;
        const liveState = this.liveAgentState.get(liveKey);
        if (liveState) {
          liveState.iteration = iteration;
          liveState.messages = messages;
        }

        if (abortSignal.aborted || cancelEvent.cancelled) break;

        const pendingBump = this.consumePendingBump(swarmId, agentId);
        if (pendingBump) {
          const bumpMsg: AgentMessageDoc = {
            id: uuidv4(),
            role: "user",
            content: `[Orchestrator coaching]\n${pendingBump}`,
            timestamp: new Date(),
            turnIndex: 0,
          };
          messages.push(bumpMsg);
        }

        if (await shouldSummarize(messages)) {
          const { preservedMessages } = await summarizeMessages(
            messages,
            { sessionId: this.sessionId, userId },
          );
          messages = preservedMessages;
        }

        const openaiMessages = messagesToOpenAI(messages, providerConfig.provider === "kimi");
        const unconfiguredTools = getUnconfiguredToolNames();
        const tools = toolRegistry.toOpenAISchemas({
          agentRole: "swarm_agent",
          disabledTools: disabledAgentTools,
          unconfiguredTools,
        });

        let assistantContent = "";
        let assistantReasoning = "";
        let assistantToolCalls: ToolCallData[] = [];

        const racerNameTag = modelLabel.replace(/\s+/g, "_");
        const { tags: traceTags, phase } = buildTraceTags("swarm", messages, [
          `session_id:${this.sessionId}`,
          `workspace_id:${session?.workspaceId ?? "unknown"}`,
          "agent_role:racer",
          `swarm_id:${swarmId}`,
          `swarm_agent_id:${agentId}`,
          `racer_name:${racerNameTag}`,
        ]);

        const agentReasoningMode = (preset.reasoningMode || "off") as ReasoningMode;

        const result = await invoke_llm_streaming({
          messages: openaiMessages,
          tools,
          temperature: 0.7,
          reasoningMode: agentReasoningMode,
          providerOverride: providerConfig,
          sessionId: this.sessionId,
          userId,
          tags: traceTags,
          generationName: `swarm-${swarmId}-${agentId}-${phase}-step-${iteration}`,
          abortSignal,
          onDelta(delta) {
            if (delta.type === "reasoning" && delta.content) {
              assistantReasoning += delta.content;
              sse.write("swarm_agent_progress", {
                swarmId,
                agentId,
                model: modelLabel,
                type: "reasoning",
                content: delta.content,
              });
            }
            if (delta.type === "text" && delta.content) {
              assistantContent += delta.content;
              sse.write("swarm_agent_progress", {
                swarmId,
                agentId,
                model: modelLabel,
                type: "assistant_text",
                content: delta.content,
              });
            }
            if (delta.type === "tool_call_start" && delta.toolCall) {
              sse.write("swarm_agent_progress", {
                swarmId,
                agentId,
                model: modelLabel,
                type: "tool_call_start",
                content: JSON.stringify({ id: delta.toolCall.id, name: delta.toolCall.name }),
              });
            }
            if (delta.type === "tool_call_done" && delta.toolCall) {
              sse.write("swarm_agent_progress", {
                swarmId,
                agentId,
                model: modelLabel,
                type: "tool_call_ready",
                content: JSON.stringify({
                  id: delta.toolCall.id,
                  name: delta.toolCall.name,
                  arguments: delta.toolCall.arguments,
                }),
              });
            }
          },
        });

        assistantToolCalls = result.toolCalls.map((tc) => ({
          ...tc,
          arguments: tc.arguments || "{}",
        }));

        if (result.usage) {
          const promptTokens = result.usage.prompt_tokens ?? 0;
          const completionTokens = result.usage.completion_tokens ?? 0;
          const totalTokens = result.usage.total_tokens ?? (promptTokens + completionTokens);
          sse.write("swarm_agent_token_usage", {
            swarmId,
            agentId,
            model: modelLabel,
            promptTokens,
            completionTokens,
            totalTokens,
            contextLimit: getModelContextLimit(result.model || providerConfig.model),
            iteration,
            maxIterations: MAX_SWARM_AGENT_ITERATIONS,
          });
        }

        messages.push({
          id: uuidv4(),
          role: "assistant",
          content: assistantContent || null,
          reasoning: assistantReasoning || undefined,
          toolCalls: assistantToolCalls.length ? assistantToolCalls : undefined,
          timestamp: new Date(),
          turnIndex: 0,
        });

        if (result.finishReason === "stop" || assistantToolCalls.length === 0) {
          finalResult = assistantContent;
          break;
        }

        for (const tc of assistantToolCalls) {
          if (abortSignal.aborted || cancelEvent.cancelled) break;

          const toolDef = toolRegistry.get(tc.name);
          if (!toolDef) {
            messages.push({
              id: uuidv4(),
              role: "tool",
              content: `Unknown tool: ${tc.name}`,
              toolCallId: tc.id,
              toolName: tc.name,
              timestamp: new Date(),
              turnIndex: 0,
            });
            continue;
          }

          let args: Record<string, any>;
          try {
            args = JSON.parse(tc.arguments);
          } catch {
            messages.push({
              id: uuidv4(),
              role: "tool",
              content: `Failed to parse arguments: ${tc.arguments}`,
              toolCallId: tc.id,
              toolName: tc.name,
              timestamp: new Date(),
              turnIndex: 0,
            });
            continue;
          }

          const user = await UserModel.findById(userId).lean();
          const disableSafety = user?.configs?.disableSafetyProtections ?? false;

          // Throttle live tool output to the browser: emit one SSE event per 4 KB
          // accumulated, not per raw chunk. This prevents OOM when a tool (e.g. nc,
          // nmap, feroxbuster) produces continuous high-volume output.
          const TOOL_OUTPUT_EMIT_BYTES = 4096;
          let toolOutputAccumulator = "";
          let toolOutputEmitted = 0;
          const ctx = buildCtx((chunk) => {
            toolOutputAccumulator += chunk;
            const newBytes = toolOutputAccumulator.length - toolOutputEmitted;
            if (newBytes >= TOOL_OUTPUT_EMIT_BYTES) {
              // Send only the tail — browser only needs the latest window for display.
              const tail = toolOutputAccumulator.slice(-TOOL_OUTPUT_EMIT_BYTES);
              sse.write("swarm_agent_progress", {
                swarmId,
                agentId,
                model: modelLabel,
                type: "tool_output",
                content: tail,
              });
              toolOutputEmitted = toolOutputAccumulator.length;
            }
          });

          if (!disableSafety && toolDef.shouldRequireConsent?.(args, ctx)) {
            messages.push({
              id: uuidv4(),
              role: "tool",
              content: "Blocked: this command was flagged as potentially destructive. Swarm agents cannot execute dangerous commands without user approval.",
              toolCallId: tc.id,
              toolName: tc.name,
              timestamp: new Date(),
              turnIndex: 0,
            });
            continue;
          }

          sse.write("swarm_agent_progress", {
            swarmId,
            agentId,
            model: modelLabel,
            type: "tool_start",
            content: JSON.stringify({ name: tc.name, args }),
          });

          try {
            const toolResult = await executeWithTimeout(toolDef, args, ctx);
            toolResult.output = truncateOutput(toolResult.output);

            sse.write("swarm_agent_progress", {
              swarmId,
              agentId,
              model: modelLabel,
              type: "tool_done",
              content: JSON.stringify({
                name: tc.name,
                exitCode: toolResult.exitCode,
                output: toolResult.output.slice(0, 3000),
              }),
            });

            messages.push({
              id: uuidv4(),
              role: "tool",
              content: toolResult.output,
              toolCallId: tc.id,
              toolName: tc.name,
              timestamp: new Date(),
              turnIndex: 0,
            });

            if (tc.name === "report_finding" && isWinner) break;
          } catch (err: any) {
            messages.push({
              id: uuidv4(),
              role: "tool",
              content: `Tool error: ${err.message}`,
              toolCallId: tc.id,
              toolName: tc.name,
              timestamp: new Date(),
              turnIndex: 0,
            });
          }
        }

        if (isWinner) break;
      }

      if (!finalResult && iteration >= MAX_SWARM_AGENT_ITERATIONS) {
        finalResult = `Agent reached max iterations (${MAX_SWARM_AGENT_ITERATIONS}). Last response:\n${messages.filter((m) => m.role === "assistant").pop()?.content ?? "none"}`;
      }
      const abortReason = (abortSignal as any).reason;
      const wasPaused = abortSignal.aborted && abortReason === "paused";

      if (!finalResult && (abortSignal.aborted || cancelEvent.cancelled)) {
        const reason = abortSignal.aborted
          ? (abortReason === "orchestrator_done" ? "orchestrator finished" : abortReason === "paused" ? "paused" : "timeout")
          : "swarm cancelled";
        finalResult = `Agent was stopped (${reason}). Last response:\n${messages.filter((m) => m.role === "assistant").pop()?.content ?? "none"}`;
      }

      const agentStatus: SubagentStatus =
        isWinner ? "completed" :
        wasPaused ? ("paused" as SubagentStatus) :
        cancelEvent.cancelled ? "cancelled" :
        abortSignal.aborted ? "cancelled" : "completed";

      const liveStateFinal = this.liveAgentState.get(liveKey);
      if (liveStateFinal) liveStateFinal.status = agentStatus;

      await SessionsModel.updateOne(
        { sessionId: this.sessionId, "swarms.swarmId": params.swarmId, "swarms.agents.agentId": agentId },
        {
          $set: {
            "swarms.$[sw].agents.$[ag].status": agentStatus,
            "swarms.$[sw].agents.$[ag].result": finalResult,
            "swarms.$[sw].agents.$[ag].messages": messages,
            "swarms.$[sw].agents.$[ag].shells": shellsCreated,
            "swarms.$[sw].agents.$[ag].completedAt": new Date(),
          },
        },
        {
          arrayFilters: [
            { "sw.swarmId": params.swarmId },
            { "ag.agentId": agentId },
          ],
        },
      );

      sse.write("swarm_agent_completed", {
        swarmId: params.swarmId,
        agentId,
        status: agentStatus,
        result: finalResult,
        model: modelLabel,
        isWinner,
      });

      await innerSubagentMgr.cancelAll();

      return { status: agentStatus, result: finalResult, isWinner };
    } catch (err: any) {
      console.error(`[SwarmManager] Agent ${agentId} error:`, err);

      await SessionsModel.updateOne(
        { sessionId: this.sessionId, "swarms.swarmId": params.swarmId, "swarms.agents.agentId": agentId },
        {
          $set: {
            "swarms.$[sw].agents.$[ag].status": "failed",
            "swarms.$[sw].agents.$[ag].result": err.message,
            "swarms.$[sw].agents.$[ag].messages": messages,
            "swarms.$[sw].agents.$[ag].completedAt": new Date(),
          },
        },
        {
          arrayFilters: [
            { "sw.swarmId": params.swarmId },
            { "ag.agentId": agentId },
          ],
        },
      );

      sse.write("swarm_agent_completed", {
        swarmId: params.swarmId,
        agentId,
        status: "failed",
        result: err.message,
        model: modelLabel,
      });

      await innerSubagentMgr.cancelAll();

      return { status: "failed", result: err.message, isWinner: false };
    }
  }

  waitFor(swarmIds: string[]): Promise<SwarmResult[]> {
    return Promise.all(
      swarmIds.map(
        (id) =>
          new Promise<SwarmResult>((resolve) => {
            if (!this.runningSwarms.has(id)) {
              resolve({
                swarmId: id,
                status: "completed",
                summary: "Swarm already completed",
                agentResults: [],
              });
              return;
            }
            const cbs = this.completionCallbacks.get(id) ?? [];
            cbs.push(resolve);
            this.completionCallbacks.set(id, cbs);
          }),
      ),
    );
  }

  private notifyCompletion(swarmId: string, result: SwarmResult): void {
    const cbs = this.completionCallbacks.get(swarmId);
    if (cbs) {
      for (const cb of cbs) cb(result);
      this.completionCallbacks.delete(swarmId);
    }
  }

  isRunning(swarmId: string): boolean {
    return this.runningSwarms.has(swarmId);
  }

  getRunningSwarmIds(): string[] {
    return Array.from(this.runningSwarms.keys());
  }

  getMaxIterations(): number {
    return MAX_SWARM_AGENT_ITERATIONS;
  }

  getActiveRoster(swarmIds: string[]): Array<{ agentId: string; modelLabel: string; swarmId: string }> {
    const roster: Array<{ agentId: string; modelLabel: string; swarmId: string }> = [];
    for (const sid of swarmIds) {
      if (!this.runningSwarms.has(sid)) continue;
      const agents = this.swarmAgents.get(sid);
      if (agents) {
        for (const a of agents) {
          roster.push({ ...a, swarmId: sid });
        }
      }
    }
    return roster;
  }

  getSwarmStatus(swarmIds: string[]): Array<{
    agentId: string; modelLabel: string; swarmId: string;
    iteration: number; status: string; lastFinding?: string;
  }> {
    const result: Array<{
      agentId: string; modelLabel: string; swarmId: string;
      iteration: number; status: string; lastFinding?: string;
    }> = [];
    for (const sid of swarmIds) {
      const agents = this.swarmAgents.get(sid);
      if (!agents) continue;
      const bus = this.findingsBuses.get(sid);
      const allFindings = bus?.getAll() ?? [];
      for (const a of agents) {
        const key = `${sid}:${a.agentId}`;
        const live = this.liveAgentState.get(key);
        const agentFindings = allFindings.filter((f) => f.agentId === a.agentId);
        const lastFinding = agentFindings.length > 0
          ? agentFindings[agentFindings.length - 1].content
          : undefined;
        result.push({
          agentId: a.agentId,
          modelLabel: a.modelLabel,
          swarmId: sid,
          iteration: live?.iteration ?? 0,
          status: live?.status ?? (this.runningSwarms.has(sid) ? "running" : "completed"),
          lastFinding,
        });
      }
    }
    return result;
  }

  bumpAgent(agentId: string, insights: string): string {
    for (const [key, state] of this.liveAgentState) {
      if (key.endsWith(`:${agentId}`)) {
        state.pendingBump = insights;
        return `Bump queued for ${agentId}`;
      }
    }
    return `Agent ${agentId} not found or not running`;
  }

  broadcastToAll(swarmIds: string[], message: string): string {
    let count = 0;
    for (const sid of swarmIds) {
      const bus = this.findingsBuses.get(sid);
      if (bus) {
        bus.broadcast(message, "orchestrator");
        count++;
      }
    }
    return `Broadcast sent to ${count} swarm(s)`;
  }

  getAgentMessages(agentId: string, lastN: number = 20): AgentMessageDoc[] {
    for (const [key, state] of this.liveAgentState) {
      if (key.endsWith(`:${agentId}`)) {
        const msgs = state.messages;
        return msgs.slice(-lastN);
      }
    }
    return [];
  }

  consumePendingBump(swarmId: string, agentId: string): string | undefined {
    const key = `${swarmId}:${agentId}`;
    const state = this.liveAgentState.get(key);
    if (!state?.pendingBump) return undefined;
    const bump = state.pendingBump;
    state.pendingBump = undefined;
    return bump;
  }

  /** Load current racer presets from env, keyed by label and model for lookup. */
  private async buildCurrentPresetIndex(userId: string): Promise<Map<string, ModelPreset>> {
    try {
      const userModels = await getUserModels(userId);
      const all = [userModels.orchestrator, ...userModels.racers];
      const index = new Map<string, ModelPreset>();
      for (const p of all) {
        if (p.label) index.set(p.label, p);
        if (p.model) index.set(p.model, p);
      }
      return index;
    } catch {
      return new Map();
    }
  }

  async resumePausedSwarms(params: {
    sse: SSEWriter;
    userId: string;
    agentPromptConfig?: AgentPromptConfig;
    ctfContext?: CtfSwarmContext;
  }): Promise<string[]> {
    const session = await SessionsModel.findOne({ sessionId: this.sessionId }).lean();
    if (!session?.swarms) return [];

    const pausedSwarms = (session.swarms as any[]).filter((sw) => sw.status === "paused");
    if (pausedSwarms.length === 0) return [];

    // Re-load current presets so apiKey/baseURL (not stored in DB) are restored
    const presetIndex = await this.buildCurrentPresetIndex(params.userId);

    const resumedIds: string[] = [];
    for (const sw of pausedSwarms) {
      const pausedAgents = (sw.agents ?? []).filter((a: any) => a.status === "paused");
      if (pausedAgents.length === 0) continue;

      const swarmId = sw.swarmId;

      const agents = pausedAgents.map((a: any) => {
        const currentPreset = presetIndex.get(a.modelLabel) ?? presetIndex.get(a.modelSpec?.model);
        return {
          agentId: a.agentId,
          task: a.task ?? "",
          modelLabel: a.modelLabel,
          modelSpec: a.modelSpec ?? { provider: "openai", model: a.modelLabel },
          preset: {
            label: a.modelLabel,
            provider: currentPreset?.provider ?? a.modelSpec?.provider ?? "openai",
            model: currentPreset?.model ?? a.modelSpec?.model ?? a.modelLabel,
            apiKey: currentPreset?.apiKey,
            baseURL: currentPreset?.baseURL,
            reasoningMode: currentPreset?.reasoningMode,
          } as ModelPreset,
          resumeMessages: (a.messages ?? []) as AgentMessageDoc[],
        };
      });

      await SessionsModel.updateOne(
        { sessionId: this.sessionId, "swarms.swarmId": swarmId },
        { $set: { "swarms.$.status": "running" } },
      );
      for (const a of agents) {
        await SessionsModel.updateOne(
          { sessionId: this.sessionId, "swarms.swarmId": swarmId, "swarms.agents.agentId": a.agentId },
          { $set: { "swarms.$[sw].agents.$[ag].status": "running" } },
          { arrayFilters: [{ "sw.swarmId": swarmId }, { "ag.agentId": a.agentId }] },
        );
      }

      params.sse.write("swarm_spawned", {
        swarmId,
        goal: sw.goal,
        winCondition: sw.winCondition,
        agents: agents.map((a: any) => ({
          agentId: a.agentId,
          task: a.task,
          model: a.modelLabel,
        })),
        resumed: true,
      });

      this.swarmAgents.set(swarmId, agents.map((a: any) => ({ agentId: a.agentId, modelLabel: a.modelLabel })));

      const abortCtrl = new AbortController();
      this.runningSwarms.set(swarmId, abortCtrl);

      const findingsBus = new FindingsBus();
      this.findingsBuses.set(swarmId, findingsBus);
      const cancelEvent = { cancelled: false };
      const engState = await this.buildSwarmEngagementState();

      const agentPromises = agents.map((agent: any) =>
        this.runSwarmAgent({
          swarmId,
          goal: sw.goal,
          agent,
          winCondition: sw.winCondition,
          findingsBus,
          cancelEvent,
          sse: params.sse,
          userId: params.userId,
          abortSignal: abortCtrl.signal,
          ctfContext: params.ctfContext,
          agentPromptConfig: params.agentPromptConfig,
          resumeMessages: agent.resumeMessages,
          engagementState: engState,
        }),
      );

      const wallClockTimer = sw.timeoutMs
        ? setTimeout(() => { abortCtrl.abort(); }, sw.timeoutMs)
        : undefined;

      this._handleResumedSwarmCompletion(
        swarmId, sw.goal, agents, sw.winCondition,
        agentPromises, abortCtrl.signal, findingsBus, params.sse,
        wallClockTimer,
      );

      resumedIds.push(swarmId);
    }

    return resumedIds;
  }

  /**
   * Re-activates all completed/timed-out swarms for a session, injecting new user
   * guidance into each agent's message history so they continue from where they
   * left off rather than starting fresh. Uses the same swarmId/agentIds so the
   * frontend swarm cards update in place.
   */
  async continueCompletedSwarms(params: {
    newGuidance: string;
    sse: SSEWriter;
    userId: string;
    agentPromptConfig?: AgentPromptConfig;
    ctfContext?: CtfSwarmContext;
  }): Promise<string[]> {
    const session = await SessionsModel.findOne({ sessionId: this.sessionId }).lean();
    if (!session?.swarms) return [];

    const completedSwarms = (session.swarms as any[]).filter(
      (sw) => sw.status === "completed" || sw.status === "timed_out",
    );
    if (completedSwarms.length === 0) return [];

    // Re-load current presets so apiKey/baseURL (not stored in DB) are restored
    const presetIndex = await this.buildCurrentPresetIndex(params.userId);

    const continuedIds: string[] = [];

    for (const sw of completedSwarms) {
      const doneAgents = (sw.agents ?? []).filter(
        (a: any) => a.status === "completed" || a.status === "cancelled" || a.status === "timed_out",
      );
      if (doneAgents.length === 0) continue;

      const swarmId = sw.swarmId;

      const agents = doneAgents.map((a: any) => {
        const currentPreset = presetIndex.get(a.modelLabel) ?? presetIndex.get(a.modelSpec?.model);
        // Build continuation history: all prior messages + a new user turn with guidance
        const priorMessages: AgentMessageDoc[] = (a.messages ?? []).filter(
          (m: any) => m.role !== "system",
        );

        let guidanceContent = params.newGuidance;
        if (a.result) {
          guidanceContent =
            `New guidance from user: ${params.newGuidance}\n\n` +
            `Your prior run summary: ${a.result}`;
        }

        const guidanceMsg: AgentMessageDoc = {
          id: uuidv4(),
          role: "user",
          content: guidanceContent,
          timestamp: new Date(),
          turnIndex: 0,
        };

        return {
          agentId: a.agentId,
          task: a.task ?? "",
          modelLabel: a.modelLabel,
          modelSpec: a.modelSpec ?? { provider: "openai", model: a.modelLabel },
          preset: {
            label: a.modelLabel,
            provider: currentPreset?.provider ?? a.modelSpec?.provider ?? "openai",
            model: currentPreset?.model ?? a.modelSpec?.model ?? a.modelLabel,
            apiKey: currentPreset?.apiKey,
            baseURL: currentPreset?.baseURL,
            reasoningMode: currentPreset?.reasoningMode,
          } as ModelPreset,
          resumeMessages: [...priorMessages, guidanceMsg],
        };
      });

      // Reset swarm and agents back to "running" in DB
      await SessionsModel.updateOne(
        { sessionId: this.sessionId, "swarms.swarmId": swarmId },
        { $set: { "swarms.$.status": "running", "swarms.$.completedAt": null } },
      );
      for (const a of agents) {
        await SessionsModel.updateOne(
          { sessionId: this.sessionId, "swarms.swarmId": swarmId, "swarms.agents.agentId": a.agentId },
          { $set: { "swarms.$[sw].agents.$[ag].status": "running", "swarms.$[sw].agents.$[ag].result": null } },
          { arrayFilters: [{ "sw.swarmId": swarmId }, { "ag.agentId": a.agentId }] },
        );
      }

      // Emit swarm_spawned with same swarmId — frontend updates existing card in place
      params.sse.write("swarm_spawned", {
        swarmId,
        goal: sw.goal,
        winCondition: sw.winCondition,
        agents: agents.map((a: { agentId: string; task: string; modelLabel: string }) => ({
          agentId: a.agentId,
          task: a.task,
          model: a.modelLabel,
        })),
        resumed: true,
        continued: true,
      });

      this.swarmAgents.set(swarmId, agents.map((a: { agentId: string; modelLabel: string }) => ({ agentId: a.agentId, modelLabel: a.modelLabel })));

      const abortCtrl = new AbortController();
      this.runningSwarms.set(swarmId, abortCtrl);

      const findingsBus = new FindingsBus();
      this.findingsBuses.set(swarmId, findingsBus);
      const cancelEvent = { cancelled: false };
      const engState = await this.buildSwarmEngagementState();

      const agentPromises = agents.map((agent: any) =>
        this.runSwarmAgent({
          swarmId,
          goal: sw.goal,
          agent,
          winCondition: sw.winCondition,
          findingsBus,
          cancelEvent,
          sse: params.sse,
          userId: params.userId,
          abortSignal: abortCtrl.signal,
          ctfContext: params.ctfContext,
          agentPromptConfig: params.agentPromptConfig,
          resumeMessages: agent.resumeMessages,
          engagementState: engState,
        }),
      );

      const wallClockTimer = sw.timeoutMs
        ? setTimeout(() => { abortCtrl.abort(); }, sw.timeoutMs)
        : undefined;

      this._handleResumedSwarmCompletion(
        swarmId, sw.goal, agents, sw.winCondition,
        agentPromises, abortCtrl.signal, findingsBus, params.sse,
        wallClockTimer,
      );

      continuedIds.push(swarmId);
    }

    return continuedIds;
  }

  private _handleResumedSwarmCompletion(
    swarmId: string,
    goal: string,
    agents: Array<{ agentId: string; modelLabel: string }>,
    winCondition: SwarmWinCondition,
    agentPromises: Promise<any>[],
    abortSignal: AbortSignal,
    findingsBus: FindingsBus,
    sse: SSEWriter,
    wallClockTimer: ReturnType<typeof setTimeout> | undefined,
  ): void {
    void Promise.allSettled(agentPromises)
      .then(async (results) => {
        clearTimeout(wallClockTimer);

        let winner: string | undefined;
        const abortReason = (abortSignal as any).reason;
        let status: SwarmStatus = abortSignal.aborted
          ? (abortReason === "orchestrator_done" ? "completed" : abortReason === "paused" ? "paused" : "timed_out")
          : "completed";
        const agentResults: SwarmResult["agentResults"] = [];

        for (let i = 0; i < results.length; i++) {
          const r = results[i];
          const agent = agents[i];
          if (r.status === "fulfilled") {
            agentResults.push({
              agentId: agent.agentId,
              modelLabel: agent.modelLabel,
              status: r.value.status,
              result: r.value.result,
            });
            if (r.value.isWinner) winner = agent.agentId;
          } else {
            agentResults.push({
              agentId: agent.agentId,
              modelLabel: agent.modelLabel,
              status: "failed",
              result: r.reason?.message ?? "Unknown error",
            });
          }
        }

        const summary = `Resumed swarm ${swarmId} ${status}`;

        await SessionsModel.updateOne(
          { sessionId: this.sessionId, "swarms.swarmId": swarmId },
          { $set: { "swarms.$.status": status, "swarms.$.winner": winner } },
        );

        if (status !== "paused") {
          sse.write("swarm_completed", { swarmId, status, winner, summary });
          this.findingsBuses.delete(swarmId);
          for (const a of agents) {
            this.liveAgentState.delete(`${swarmId}:${a.agentId}`);
          }
          this.swarmAgents.delete(swarmId);
        }

        this.runningSwarms.delete(swarmId);
        const swResult: SwarmResult = { swarmId, status, winner, summary, agentResults };
        this.notifyCompletion(swarmId, swResult);
      })
      .catch((err) => {
        clearTimeout(wallClockTimer);
        console.error(`[SwarmManager] Resumed swarm ${swarmId} error:`, err);
      });
  }

  async pauseAll(): Promise<void> {
    for (const [, ctrl] of this.runningSwarms) {
      ctrl.abort("paused");
    }
  }

  async cancelAll(): Promise<void> {
    for (const [, ctrl] of this.runningSwarms) {
      ctrl.abort("orchestrator_done");
    }
  }

  private async buildSwarmEngagementState(): Promise<EngagementState> {
    const session = await SessionsModel.findOne({ sessionId: this.sessionId })
      .select("ctfConfig")
      .lean();
    const isCtf = !!session?.ctfConfig?.ctfName;
    const state = new EngagementState(isCtf ? "ctf" : "pentest");
    if (isCtf && session?.ctfConfig?.activeSolve) {
      state.challengeName = (session.ctfConfig as any).activeSolve.name;
      state.category = (session.ctfConfig as any).activeSolve.category;
    } else if (isCtf && (session?.ctfConfig as any)?.solveHistory?.length) {
      const history: any[] = (session!.ctfConfig as any).solveHistory;
      const latest = [...history].reverse().find((r) => r.status === "solving");
      if (latest?.challengeName) {
        state.challengeName = latest.challengeName;
        state.category = latest.category;
      }
    }
    return state;
  }
}
