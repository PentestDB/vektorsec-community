import mongoose from "mongoose";

export interface HistoryData {
  role: "user" | "assistant" | "system";
  content: string;
  isContextual?: boolean;
  loopStep?: number;
}

export interface ContextData {
  summary: string;
  nextSteps: string;
}

export interface SingleCommandData {
  _id?: mongoose.Types.ObjectId;
  tool_name: string;
  args: {
    [key: string]: string;
  };
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
  scans?: any;
  subprocess?: any;
  netcat?: any;
  previousContexts?: ContextData[];
}
