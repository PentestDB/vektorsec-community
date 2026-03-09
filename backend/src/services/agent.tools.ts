import { toolRegistry } from "../tools/registry";
import { ExecutionContext, ToolResult } from "../tools/types";
import { ToolCallData } from "../utils/llm/providers";
import { ShellManager } from "./shell.manager";
import { SubagentManager } from "./subagent.manager";
import { SSEWriter } from "./agent.service";

const ANSI_REGEX = /\x1B\[[0-?]*[-\[\]#-~]/g;
const MAX_OUTPUT_CHARS = 12_000;

export interface ToolExecutionCallbacks {
  onToolStart: (toolCallId: string, toolName: string, args: Record<string, any>) => void;
  onToolOutput: (toolCallId: string, chunk: string) => void;
  onToolDone: (toolCallId: string, result: ToolResult) => void;
  onToolError: (toolCallId: string, error: string) => void;
  onConsentRequired: (toolCallId: string, toolName: string, args: Record<string, any>) => void;
}

export interface ToolExecutionResult {
  toolCallId: string;
  toolName: string;
  result: ToolResult;
  needsConsent: boolean;
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
  shellManager: ShellManager;
  subagentManager?: SubagentManager;
  sse?: SSEWriter;
  userId?: string;
  onChunk?: (chunk: string) => void;
  abortSignal?: AbortSignal;
}): ExecutionContext {
  const { sessionId, agentId, shellManager, subagentManager, sse, userId, onChunk, abortSignal } = params;

  return {
    sessionId,
    agentId,
    runCommand: (command: string, timeoutMs?: number) =>
      shellManager.execInShell(command, timeoutMs, onChunk, abortSignal),
    spawnShell: (label: string, type?: "pty" | "exec") =>
      shellManager.spawnShell({ label, type, createdBy: agentId === "main" ? "agent" : "subagent", subagentId: agentId !== "main" ? agentId : undefined }),
    writeToShell: (shellId: string, data: string) =>
      shellManager.writeToShell(shellId, data),
    readShellOutput: (shellId: string, fromOffset?: number) =>
      Promise.resolve(shellManager.readOutput(shellId, fromOffset)),
    closeShell: (shellId: string) =>
      shellManager.closeShell(shellId),
    listShells: () =>
      shellManager.getShellList(),
    spawnSubagent: subagentManager && sse && userId
      ? (task: string) =>
          subagentManager.spawn({
            parentId: agentId,
            task,
            sse,
            userId,
          })
      : undefined,
    onOutput: onChunk,
  };
}

export async function executeToolCall(
  sessionId: string,
  toolCall: ToolCallData,
  callbacks: ToolExecutionCallbacks,
  ctx: ExecutionContext,
  requireConsentForAllTools?: boolean,
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
    args = JSON.parse(toolCall.arguments);
  } catch {
    const error = `Failed to parse tool arguments: ${toolCall.arguments}`;
    callbacks.onToolError(toolCall.id, error);
    return {
      toolCallId: toolCall.id,
      toolName: toolCall.name,
      result: { output: error, exitCode: 1 },
      needsConsent: false,
    };
  }

  if (requireConsentForAllTools || toolDef.requiresConsent) {
    callbacks.onConsentRequired(toolCall.id, toolCall.name, args);
    return {
      toolCallId: toolCall.id,
      toolName: toolCall.name,
      result: { output: "", exitCode: 0 },
      needsConsent: true,
    };
  }

  callbacks.onToolStart(toolCall.id, toolCall.name, args);

  try {
    const toolCtx: ExecutionContext = {
      ...ctx,
      onOutput: (chunk) => callbacks.onToolOutput(toolCall.id, chunk),
    };

    const result = await toolDef.execute(args, toolCtx);
    result.output = truncateOutput(result.output);

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
): Promise<ToolExecutionResult[]> {
  const results = await Promise.all(
    toolCalls.map((tc) =>
      executeToolCall(sessionId, tc, callbacks, ctx, requireConsentForAllTools),
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

    const result = await toolDef.execute(args, toolCtx);
    result.output = truncateOutput(result.output);

    callbacks.onToolDone(toolCallId, result);
    return result;
  } catch (err: any) {
    const error = `Tool execution error: ${err.message ?? err}`;
    callbacks.onToolError(toolCallId, error);
    return { output: error, exitCode: 1 };
  }
}
