import { Client as SSHClient } from "ssh2";
import { buildSSHConfig } from "../utils/sshConfig";
import { toolRegistry } from "../tools/registry";
import { ExecutionContext, ToolResult } from "../tools/types";
import { ToolCallData } from "../utils/llm/providers";

const ANSI_REGEX = /\x1B\[[0-?]*[-\[\]#-~]/g;
const MAX_OUTPUT_CHARS = 12_000;

export class SSHUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SSHUnavailableError";
  }
}

export interface ToolExecutionCallbacks {
  onToolStart: (toolCallId: string, toolName: string, args: Record<string, any>) => void;
  onToolOutput: (toolCallId: string, chunk: string) => void;
  onToolDone: (toolCallId: string, result: ToolResult) => void;
  onToolError: (toolCallId: string, error: string) => void;
  onConsentRequired: (toolCallId: string, toolName: string, args: Record<string, any>) => void;
  onManualExecutionRequired: (toolCallId: string, toolName: string, command: string) => void;
}

export interface ToolExecutionResult {
  toolCallId: string;
  toolName: string;
  result: ToolResult;
  needsConsent: boolean;
  needsManualExecution: boolean;
  manualCommand?: string;
}

function runSSHCommand(
  command: string,
  timeoutMs: number = 300_000,
  onChunk?: (chunk: string) => void,
): Promise<{ output: string; exitCode: number }> {
  const sshConfig = buildSSHConfig();

  return new Promise((resolve, reject) => {
    let output = "";
    let exitCode = 0;
    const ssh = new SSHClient();
    let timer: NodeJS.Timeout | null = null;
    let resolved = false;

    const finish = (out: string, code: number) => {
      if (resolved) return;
      resolved = true;
      if (timer) clearTimeout(timer);
      ssh.end();
      resolve({ output: out, exitCode: code });
    };

    ssh
      .on("ready", () => {
        ssh.exec(command, (err: Error | undefined, stream: any) => {
          if (err) {
            finish(`SSH exec error: ${err.message}`, 1);
            return;
          }

          if (timeoutMs > 0) {
            timer = setTimeout(() => {
              stream.destroy();
              finish(
                output + `\n[TIMEOUT: command exceeded ${Math.round(timeoutMs / 1000)}s limit]`,
                124,
              );
            }, timeoutMs);
          }

          stream.on("data", (data: Buffer) => {
            const text = data.toString();
            output += text;
            onChunk?.(text);
          });

          stream.stderr.on("data", (data: Buffer) => {
            const text = data.toString();
            output += text;
            onChunk?.(text);
          });

          stream.on("close", (code: number | null) => {
            exitCode = code ?? 0;
            finish(output, exitCode);
          });
        });
      })
      .on("error", (err: Error) => {
        if (resolved) return;
        resolved = true;
        if (timer) clearTimeout(timer);
        reject(new SSHUnavailableError(`SSH connection error: ${err.message}`));
      })
      .connect(sshConfig);
  });
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

function buildExecutionContext(
  sessionId: string,
  onChunk?: (chunk: string) => void,
): ExecutionContext {
  return {
    sessionId,
    runCommand: (command: string, timeoutMs?: number) =>
      runSSHCommand(command, timeoutMs, onChunk),
    onOutput: onChunk,
  };
}

export async function executeToolCall(
  sessionId: string,
  toolCall: ToolCallData,
  callbacks: ToolExecutionCallbacks,
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
      needsManualExecution: false,
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
      needsManualExecution: false,
    };
  }

  if (toolDef.requiresConsent) {
    callbacks.onConsentRequired(toolCall.id, toolCall.name, args);
    return {
      toolCallId: toolCall.id,
      toolName: toolCall.name,
      result: { output: "", exitCode: 0 },
      needsConsent: true,
      needsManualExecution: false,
    };
  }

  callbacks.onToolStart(toolCall.id, toolCall.name, args);

  try {
    const ctx = buildExecutionContext(sessionId, (chunk) => {
      callbacks.onToolOutput(toolCall.id, chunk);
    });

    const result = await toolDef.execute(args, ctx);
    result.output = truncateOutput(result.output);

    callbacks.onToolDone(toolCall.id, result);
    return {
      toolCallId: toolCall.id,
      toolName: toolCall.name,
      result,
      needsConsent: false,
      needsManualExecution: false,
    };
  } catch (err: any) {
    if (err instanceof SSHUnavailableError) {
      const commandTools = ["run_bash", "run_python_script", "run_install_tool", "msfvenom_payload", "netcat_listener"];
      if (commandTools.includes(toolCall.name)) {
        const command = args.command ?? args.script ?? JSON.stringify(args);
        callbacks.onManualExecutionRequired(toolCall.id, toolCall.name, command);
        return {
          toolCallId: toolCall.id,
          toolName: toolCall.name,
          result: { output: "", exitCode: 0 },
          needsConsent: false,
          needsManualExecution: true,
          manualCommand: command,
        };
      }
    }

    const error = `Tool execution error: ${err.message ?? err}`;
    callbacks.onToolError(toolCall.id, error);
    return {
      toolCallId: toolCall.id,
      toolName: toolCall.name,
      result: { output: error, exitCode: 1 },
      needsConsent: false,
      needsManualExecution: false,
    };
  }
}

export async function executeToolCalls(
  sessionId: string,
  toolCalls: ToolCallData[],
  callbacks: ToolExecutionCallbacks,
): Promise<ToolExecutionResult[]> {
  const results = await Promise.all(
    toolCalls.map((tc) => executeToolCall(sessionId, tc, callbacks)),
  );
  return results;
}

export async function executeConsentedTool(
  sessionId: string,
  toolCallId: string,
  toolName: string,
  args: Record<string, any>,
  callbacks: ToolExecutionCallbacks,
): Promise<ToolResult> {
  const toolDef = toolRegistry.get(toolName);
  if (!toolDef) {
    return { output: `Unknown tool: ${toolName}`, exitCode: 1 };
  }

  callbacks.onToolStart(toolCallId, toolName, args);

  try {
    const ctx = buildExecutionContext(sessionId, (chunk) => {
      callbacks.onToolOutput(toolCallId, chunk);
    });

    const result = await toolDef.execute(args, ctx);
    result.output = truncateOutput(result.output);

    callbacks.onToolDone(toolCallId, result);
    return result;
  } catch (err: any) {
    const error = `Tool execution error: ${err.message ?? err}`;
    callbacks.onToolError(toolCallId, error);
    return { output: error, exitCode: 1 };
  }
}
