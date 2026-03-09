import mongoose from "mongoose";
const Schema = mongoose.Schema;

// ─── Message types (mirrors OpenAI chat completion message format) ────

export interface AgentToolCallData {
  id: string;
  name: string;
  arguments: string;
}

export interface AgentMessageDoc {
  _id?: mongoose.Types.ObjectId;
  id: string;
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  toolCalls?: AgentToolCallData[];
  toolCallId?: string;
  toolName?: string;
  timestamp: Date;
  turnIndex: number;
  isSummary?: boolean;
}

export interface PendingConsentDoc {
  toolCallId: string;
  toolName: string;
  arguments: Record<string, any>;
}

export interface PendingManualExecutionDoc {
  toolCallId: string;
  toolName: string;
  command: string;
}

export type AgentState = "idle" | "running" | "paused" | "waiting_consent" | "waiting_manual_execution";

export interface SessionDoc extends mongoose.Document {
  uid: mongoose.Types.ObjectId;
  sessionId: string;
  name: string;
  description: string;
  boxId?: mongoose.Types.ObjectId;
  createdAt: Date;
  status: "active" | "archived";
  agentState: AgentState;
  messages: AgentMessageDoc[];
  pendingConsent?: PendingConsentDoc;
  pendingManualExecution?: PendingManualExecutionDoc;
  turnIndex: number;
  totalTokens: number;
  tokenHistory: Array<{
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    timestamp: Date;
  }>;
}

const ToolCallSchema = new Schema(
  {
    id: { type: String, required: true },
    name: { type: String, required: true },
    arguments: { type: String, required: true },
  },
  { _id: false },
);

const AgentMessageSchema = new Schema(
  {
    id: { type: String, required: true },
    role: { type: String, required: true, enum: ["system", "user", "assistant", "tool"] },
    content: { type: String, default: null },
    toolCalls: { type: [ToolCallSchema], default: undefined },
    toolCallId: { type: String },
    toolName: { type: String },
    timestamp: { type: Date, default: Date.now },
    turnIndex: { type: Number, default: 0 },
    isSummary: { type: Boolean, default: false },
  },
  { _id: false },
);

const SessionSchema = new Schema({
  uid: { type: mongoose.Types.ObjectId, required: true },
  sessionId: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  description: { type: String, default: "" },
  boxId: { type: mongoose.Types.ObjectId },
  createdAt: { type: Date, default: Date.now },
  status: { type: String, default: "active", enum: ["active", "archived"] },
  agentState: {
    type: String,
    default: "idle",
    enum: ["idle", "running", "paused", "waiting_consent", "waiting_manual_execution"],
  },
  messages: { type: [AgentMessageSchema], default: [] },
  pendingConsent: {
    type: {
      toolCallId: { type: String, required: true },
      toolName: { type: String, required: true },
      arguments: { type: Schema.Types.Mixed, required: true },
    },
    default: undefined,
  },
  pendingManualExecution: {
    type: {
      toolCallId: { type: String, required: true },
      toolName: { type: String, required: true },
      command: { type: String, required: true },
    },
    default: undefined,
  },
  turnIndex: { type: Number, default: 0 },
  totalTokens: { type: Number, default: 0 },
  tokenHistory: {
    type: [
      {
        promptTokens: { type: Number },
        completionTokens: { type: Number },
        totalTokens: { type: Number },
        timestamp: { type: Date, default: Date.now },
      },
    ],
    default: [],
  },
});

export default mongoose.model<SessionDoc>("Session", SessionSchema);
