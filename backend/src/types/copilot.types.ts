/**
 * Legacy copilot types — kept for backward compatibility with any remaining imports.
 * The canonical types now live in models/Sessions/Sessions.model.ts.
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

export interface CommandData {
  thoughts: {
    text: string;
    reasoning: string;
    criticism: string;
    speak: string;
  };
  commands: SingleCommandData[];
}

export interface CopilotSessionData {
  uid: string;
  sessionId: string;
  history: HistoryData[];
  context?: ContextData;
  command: CommandData;
  isMainThread: number;
  todo: any;
  mainSessionId?: string;
}
