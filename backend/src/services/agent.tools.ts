import { toolRegistry } from "../tools/registry";
import { ExecutionContext, ToolResult, AgentRole } from "../tools/types";
import { ToolCallData } from "../utils/llm/providers";
import { ShellManager, ShellPurpose } from "./shell.manager";
import { SubagentManager } from "./subagent.manager";
import { SwarmManager, CtfSwarmContext, ModelPreset } from "./swarm.manager";
import { SSEWriter } from "./agent.service";
import { EngagementState } from "./engagement-state";
import { SwarmWinCondition } from "../models/Sessions/Sessions.model";
import { AgentPromptConfig } from "../utils/copilot/prompts";
import { parseToolArguments } from "../utils/toolArguments";
import type { ToolExecutionMode } from "../models/User/User.model";
import { decideToolConsent, ToolSafetyEvaluator } from "./tool-approval.service";

const ANSI_REGEX = /\x1B\[[0-?]*[-\[\]#-~]/g;
const MAX_OUTPUT_CHARS = 12_000;
const DEFAULT_TOOL_TIMEOUT_MS = 60_000; // 1 min hard cap if no timeoutMs on the definition

function executeWithTimeout(
  toolDef: import("../tools/types").ToolDefinition,
  args: Record<string, any>,
  ctx: ExecutionContext,
): Promise<ToolResult> {
  const timeoutMs = toolDef.timeoutMs ?? DEFAULT_TOOL_TIMEOUT_MS;
  return Promise.race([
    toolDef.execute(args, ctx),
    new Promise<ToolResult>((_, reject) =>
      setTimeout(() => reject(new Error(`Tool '${toolDef.name}' timed out after ${timeoutMs / 1000}s`)), timeoutMs),
    ),
  ]);
}

export interface ToolExecutionCallbacks {
  onToolStart: (toolCallId: string, toolName: string, args: Record<string, any>) => void;
  onToolOutput: (toolCallId: string, chunk: string) => void;
  onToolDone: (toolCallId: string, result: ToolResult) => void;
  onToolError: (toolCallId: string, error: string) => void;
  onConsentRequired: (
    toolCallId: string,
    toolName: string,
    args: Record<string, any>,
    safetyBlock?: boolean,
    approvalReason?: string,
  ) => void;
  onInstallSuggestion?: (suggestion: { name: string; label: string; installCommand: string; size: string }) => void;
}

export interface ToolExecutionResult {
  toolCallId: string;
  toolName: string;
  result: ToolResult;
  needsConsent: boolean;
  approvalReason?: string;
  safetyBlock?: boolean;
}

export interface PendingConsentBatchItem {
  toolCallId: string;
  toolName: string;
  arguments: Record<string, any>;
  safetyBlock: boolean;
  approvalReason?: string;
}

/** Build the exact set presented to the user and later executed on approval. */
export function buildPendingConsentBatch(
  results: ToolExecutionResult[],
  toolCalls: ToolCallData[],
): PendingConsentBatchItem[] {
  const callsById = new Map(toolCalls.map((call) => [call.id, call]));
  return results
    .filter((result) => result.needsConsent)
    .map((result) => ({
      toolCallId: result.toolCallId,
      toolName: result.toolName,
      arguments: parseToolArguments(callsById.get(result.toolCallId)?.arguments ?? "{}").args,
      safetyBlock: result.safetyBlock ?? false,
      approvalReason: result.approvalReason,
    }));
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

export function buildExecutionContext(params: {
  sessionId: string;
  agentId: string;
  agentRole?: AgentRole;
  shellManager: ShellManager;
  subagentManager?: SubagentManager;
  swarmManager?: SwarmManager;
  sse?: SSEWriter;
  userId?: string;
  onChunk?: (chunk: string) => void;
  abortSignal?: AbortSignal;
  engagementState?: EngagementState;
  swarmDefaults?: {
    modelPresets: ModelPreset[];
    ctfContext?: CtfSwarmContext;
    agentPromptConfig?: AgentPromptConfig;
  };
}): ExecutionContext {
  const {
    sessionId, agentId, shellManager, subagentManager, swarmManager,
    sse, userId, onChunk, abortSignal, engagementState, swarmDefaults,
  } = params;
  const agentRole = params.agentRole ?? "main";

  return {
    sessionId,
    agentId,
    agentRole,
    runCommand: (command: string, timeoutMs?: number) =>
      shellManager.execInShell(command, timeoutMs, onChunk, abortSignal),
    spawnShell: (label: string, type?: "pty" | "exec", purpose?: ShellPurpose) =>
      shellManager.spawnShell({ label, type, purpose, createdBy: agentId === "main" ? "agent" : "subagent", subagentId: agentId !== "main" ? agentId : undefined }),
    writeToShell: (shellId: string, data: string) =>
      shellManager.writeToShell(shellId, data),
    readShellOutput: (shellId: string, fromOffset?: number) =>
      Promise.resolve(shellManager.readOutput(shellId, fromOffset)),
    closeShell: (shellId: string) =>
      shellManager.closeShell(shellId),
    resizeShell: (shellId: string, cols: number, rows: number) =>
      shellManager.resizeShell(shellId, cols, rows),
    listShells: () =>
      shellManager.getShellList(),
    getShellInfo: (shellId: string) =>
      shellManager.getShell(shellId),
    spawnSubagent: subagentManager && sse && userId
      ? (task: string) =>
          subagentManager.spawn({
            parentId: agentId,
            task,
            sse,
            userId,
          })
      : undefined,
    spawnSwarm: swarmManager && sse && userId
      ? async (swarmParams) => {
          if (agentRole === "main" && !swarmDefaults?.modelPresets.length) {
            throw new Error("No racer models are configured in Settings > Models.");
          }

          const modelPresets = swarmDefaults?.modelPresets;
          const requestedSpecs = swarmParams.agents;
          // The configured roster is authoritative: launch each selected racer
          // once, using orchestrator-authored strategies where available.
          const agentSpecs = modelPresets?.length
            ? modelPresets.map((preset, index) => {
                const requested = requestedSpecs[index] ?? requestedSpecs[0];
                return {
                  task: requested?.task ?? swarmParams.goal,
                  context: [
                    requested?.context,
                    `Configured racer: ${preset.label}`,
                  ].filter(Boolean).join("\n"),
                };
              })
            : requestedSpecs;

          return swarmManager.spawn({
            goal: swarmParams.goal,
            agentSpecs,
            winCondition: (swarmParams.winCondition as SwarmWinCondition) || "all_complete",
            timeoutMs: swarmParams.timeoutMinutes ? swarmParams.timeoutMinutes * 60 * 1000 : undefined,
            sse,
            userId,
            modelPresets,
            ctfContext: swarmDefaults?.ctfContext,
            agentPromptConfig: swarmDefaults?.agentPromptConfig,
          });
        }
      : undefined,
    checkFindings: swarmManager
      ? () => swarmManager.checkAllFindings()
      : undefined,
    getSwarmStatus: swarmManager
      ? () => swarmManager.getSwarmStatus(swarmManager.getRunningSwarmIds())
      : undefined,
    bumpRacer: swarmManager
      ? (racerId: string, insights: string) => swarmManager.bumpAgent(racerId, insights)
      : undefined,
    broadcastToRacers: swarmManager
      ? (message: string) => swarmManager.broadcastToAll(swarmManager.getRunningSwarmIds(), message)
      : undefined,
    readRacerTrace: swarmManager
      ? (racerId: string, lastN: number) => swarmManager.getAgentMessages(racerId, lastN)
      : undefined,
    waitForRacers: async (seconds: number) => {
      await new Promise((resolve) => setTimeout(resolve, seconds * 1000));
    },
    onOutput: onChunk,
    engagementState,
  };
}

export async function executeToolCall(
  sessionId: string,
  toolCall: ToolCallData,
  callbacks: ToolExecutionCallbacks,
  ctx: ExecutionContext,
  requireConsentForAllTools?: boolean,
  disableSafetyProtections?: boolean,
  toolExecutionMode?: ToolExecutionMode,
  toolSafetyEvaluator?: ToolSafetyEvaluator,
): Promise<ToolExecutionResult> {
  const toolDef = toolRegistry.get(toolCall.name);

  if (!toolDef) {
    const error = `Unknown tool: ${toolCall.name}`;
    callbacks.onToolError(toolCall.id, error);
    return {
      toolCallId: toolCall.id,
      toolName: toolCall.name,
      result: { output: error, exitCode: 1 },
      needsConsent: false,
    };
  }

  let args: Record<string, any>;
  try {
    const parsed = parseToolArguments(toolCall.arguments);
    args = parsed.args;
    // Keep the repaired form in the assistant trace as well. Otherwise the
    // next model turn would receive the original truncated JSON again.
    if (parsed.repaired) toolCall.arguments = JSON.stringify(args);
  } catch (err: any) {
    const detail = err instanceof Error ? err.message : String(err);
    const error = `Failed to parse tool arguments for '${toolCall.name}': ${detail}`;
    callbacks.onToolError(toolCall.id, error);
    return {
      toolCallId: toolCall.id,
      toolName: toolCall.name,
      result: { output: error, exitCode: 1 },
      needsConsent: false,
    };
  }

  const safetyTriggered = !disableSafetyProtections && (toolDef.shouldRequireConsent?.(args, ctx) ?? false);
  const mode: ToolExecutionMode = toolExecutionMode ??
    (requireConsentForAllTools === true
      ? "requires_consent"
      : requireConsentForAllTools === false
        ? "auto"
        : (toolDef.requiresConsent ? "requires_consent" : "auto"));
  const approval = await decideToolConsent({
    mode,
    tool: toolDef,
    args,
    context: ctx,
    safetyTriggered,
    evaluator: toolSafetyEvaluator,
  });
  const needsConsent = approval.requireConsent;
  if (needsConsent) {
    callbacks.onConsentRequired(toolCall.id, toolCall.name, args, safetyTriggered, approval.reason);
    return {
      toolCallId: toolCall.id,
      toolName: toolCall.name,
      result: { output: "", exitCode: 0 },
      needsConsent: true,
      approvalReason: approval.reason,
      safetyBlock: safetyTriggered,
    };
  }

  callbacks.onToolStart(toolCall.id, toolCall.name, args);

  try {
    const toolCtx: ExecutionContext = {
      ...ctx,
      onOutput: (chunk) => callbacks.onToolOutput(toolCall.id, chunk),
    };

    const result = await executeWithTimeout(toolDef, args, toolCtx);
    result.output = truncateOutput(result.output);

    if (result.installSuggestion && callbacks.onInstallSuggestion) {
      callbacks.onInstallSuggestion(result.installSuggestion);
    }

    callbacks.onToolDone(toolCall.id, result);
    return {
      toolCallId: toolCall.id,
      toolName: toolCall.name,
      result,
      needsConsent: false,
    };
  } catch (err: any) {
    const error = `Tool execution error: ${err.message ?? err}`;
    callbacks.onToolError(toolCall.id, error);
    return {
      toolCallId: toolCall.id,
      toolName: toolCall.name,
      result: { output: error, exitCode: 1 },
      needsConsent: false,
    };
  }
}

export async function executeToolCalls(
  sessionId: string,
  toolCalls: ToolCallData[],
  callbacks: ToolExecutionCallbacks,
  ctx: ExecutionContext,
  requireConsentForAllTools?: boolean,
  disableSafetyProtections?: boolean,
  toolExecutionMode?: ToolExecutionMode,
  toolSafetyEvaluator?: ToolSafetyEvaluator,
): Promise<ToolExecutionResult[]> {
  const results = await Promise.all(
    toolCalls.map((tc) =>
      executeToolCall(
        sessionId,
        tc,
        callbacks,
        ctx,
        requireConsentForAllTools,
        disableSafetyProtections,
        toolExecutionMode,
        toolSafetyEvaluator,
      ),
    ),
  );
  return results;
}

export async function executeConsentedTool(
  sessionId: string,
  toolCallId: string,
  toolName: string,
  args: Record<string, any>,
  callbacks: ToolExecutionCallbacks,
  ctx: ExecutionContext,
): Promise<ToolResult> {
  const toolDef = toolRegistry.get(toolName);
  if (!toolDef) {
    return { output: `Unknown tool: ${toolName}`, exitCode: 1 };
  }

  callbacks.onToolStart(toolCallId, toolName, args);

  try {
    const toolCtx: ExecutionContext = {
      ...ctx,
      onOutput: (chunk) => callbacks.onToolOutput(toolCallId, chunk),
    };

    const result = await executeWithTimeout(toolDef, args, toolCtx);
    result.output = truncateOutput(result.output);

    callbacks.onToolDone(toolCallId, result);
    return result;
  } catch (err: any) {
    const error = `Tool execution error: ${err.message ?? err}`;
    callbacks.onToolError(toolCallId, error);
    return { output: error, exitCode: 1 };
  }
}
