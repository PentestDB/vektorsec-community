import OpenAI from "openai";
import { ShellInfo, ShellPurpose } from "../services/shell.manager";
import { EngagementState } from "../services/engagement-state";

export interface InstallSuggestion {
  name: string;
  label: string;
  installCommand: string;
  size: string;
}

export interface ToolResult {
  output: string;
  exitCode?: number;
  files?: string[];
  installSuggestion?: InstallSuggestion;
}

export type AgentRole = "main" | "swarm_agent" | "subagent" | "orchestrator";

export interface ExecutionContext {
  sessionId: string;
  agentId: string;
  agentRole: AgentRole;
  runCommand: (command: string, timeoutMs?: number) => Promise<{ output: string; exitCode: number }>;
  spawnShell: (label: string, type?: "pty" | "exec", purpose?: ShellPurpose) => Promise<string>;
  writeToShell: (shellId: string, data: string) => Promise<void>;
  readShellOutput: (shellId: string, fromOffset?: number) => Promise<{ data: string; offset: number }>;
  closeShell: (shellId: string) => Promise<void>;
  resizeShell: (shellId: string, cols: number, rows: number) => void;
  listShells: () => ShellInfo[];
  getShellInfo: (shellId: string) => ShellInfo | undefined;
  spawnSubagent?: (task: string) => Promise<string>;
  spawnSwarm?: (params: {
    goal: string;
    agents: Array<{ task: string; context?: string }>;
    winCondition?: string;
    timeoutMinutes?: number;
  }) => Promise<string>;
  reportFinding?: (finding: string, isSuccess?: boolean) => void;
  checkFindings?: () => string;
  getSwarmStatus?: () => any[];
  bumpRacer?: (racerId: string, insights: string) => string;
  broadcastToRacers?: (message: string) => string;
  readRacerTrace?: (racerId: string, lastN: number) => any[];
  waitForRacers?: (seconds: number) => Promise<void>;
  onOutput?: (chunk: string) => void;
  engagementState?: EngagementState;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, any>;
  requiresConsent?: boolean;
  timeoutMs?: number;
  allowedRoles?: AgentRole[];
  shouldRequireConsent?: (args: Record<string, any>, ctx: ExecutionContext) => boolean;
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
