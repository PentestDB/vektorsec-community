/**
 * Legacy copilot services — gutted.
 * Metasploit RAG and old command generation removed.
 * Only re-exports types for backward compatibility.
 */

export interface HistoryData {
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  isContextual?: boolean;
  loopStep?: number;
}

export interface ContextData {
  summary: string;
  nextSteps: string;
}

export interface SingleCommandData {
  tool_name: string;
  args: Record<string, string>;
  file_name?: string[];
  active: boolean;
  loop?: number;
}

export interface CopilotSessionData {
  uid: string;
  sessionId: string;
  history: HistoryData[];
  context?: ContextData;
  command?: any;
  subprocess?: any;
  isMainThread: number;
  todo: any;
  mainSessionId?: string;
  [key: string]: any;
}

export { runCommandOnKali } from "./ssh.service";
