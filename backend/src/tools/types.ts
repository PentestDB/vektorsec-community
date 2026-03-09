import OpenAI from "openai";

export interface ToolResult {
  output: string;
  exitCode?: number;
  files?: string[];
}

export interface ExecutionContext {
  sessionId: string;
  runCommand: (command: string, timeoutMs?: number) => Promise<{ output: string; exitCode: number }>;
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
