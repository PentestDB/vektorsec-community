import OpenAI from "openai";
import { ShellInfo } from "../services/shell.manager";

export interface ToolResult {
  output: string;
  exitCode?: number;
  files?: string[];
}

export interface ExecutionContext {
  sessionId: string;
  agentId: string;
  runCommand: (command: string, timeoutMs?: number) => Promise<{ output: string; exitCode: number }>;
  spawnShell: (label: string, type?: "pty" | "exec") => Promise<string>;
  writeToShell: (shellId: string, data: string) => Promise<void>;
  readShellOutput: (shellId: string, fromOffset?: number) => Promise<{ data: string; offset: number }>;
  closeShell: (shellId: string) => Promise<void>;
  listShells: () => ShellInfo[];
  spawnSubagent?: (task: string) => Promise<string>;
  onOutput?: (chunk: string) => void;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, any>;
  requiresConsent?: boolean;
  timeoutMs?: number;
  execute: (args: Record<string, any>, ctx: ExecutionContext) => Promise<ToolResult>;
}

export function toolToOpenAISchema(tool: ToolDefinition): OpenAI.Chat.ChatCompletionTool {
  return {
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  };
}
