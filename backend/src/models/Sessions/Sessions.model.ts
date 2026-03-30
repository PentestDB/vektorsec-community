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
  reasoning?: string;
  toolCalls?: AgentToolCallData[];
  toolCallId?: string;
  toolName?: string;
  timestamp: Date;
  turnIndex: number;
  isSummary?: boolean;
}

export interface PendingConsentToolCall {
  toolCallId: string;
  toolName: string;
  arguments: Record<string, any>;
}

export interface PendingConsentDoc {
  toolCallId: string;
  toolName: string;
  arguments: Record<string, any>;
  batch?: PendingConsentToolCall[];
}

export interface PendingManualExecutionDoc {
  toolCallId: string;
  toolName: string;
  command: string;
}

export type AgentState = "idle" | "running" | "paused" | "waiting_consent" | "waiting_manual_execution";

export type ShellType = "pty" | "exec";
export type ShellStatus = "active" | "closed";
export type ShellCreator = "user" | "agent" | "subagent";

export interface ShellDoc {
  shellId: string;
  label: string;
  type: ShellType;
  status: ShellStatus;
  createdBy: ShellCreator;
  subagentId?: string;
  createdAt: Date;
  closedAt?: Date;
}

export type SubagentStatus = "running" | "completed" | "failed" | "cancelled";

export interface SubagentDoc {
  subagentId: string;
  parentId: string;
  task: string;
  status: SubagentStatus;
  result?: string;
  messages: AgentMessageDoc[];
  shells: string[];
  createdAt: Date;
  completedAt?: Date;
}

export interface ConnectionStateDoc {
  sshConnected: boolean;
  lastConnectedAt?: Date;
  lastError?: string;
}

export interface CtfActiveSolveDoc {
  name: string;
  safeDir: string;
  challengeTxt: string;
  files: string[];
  category?: string;
  points?: number;
  connectionInfo?: string;
  userNotes?: string;
  setAt: Date;
}

export interface CtfSolveRecord {
  challengeName: string;
  challengeId?: number;
  safeDir: string;
  category: string;
  status: "solving" | "solved" | "submitted";
  confirmedFlag?: string;
  attempts: number;
  startedAt: Date;
  solvedAt?: Date;
  submittedToCtfd: boolean;
  ctfdResult?: string;
}

export interface CtfConfigDoc {
  url: string;
  ctfName: string;
  authMethod: "token" | "credentials";
  apiToken?: string;
  username?: string;
  sessionCookie?: string;
  lastSynced?: Date;
  activeSolve?: CtfActiveSolveDoc;
  solveHistory?: CtfSolveRecord[];
}

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
  shells: ShellDoc[];
  subagents: SubagentDoc[];
  connectionState: ConnectionStateDoc;
  disabledAgentTools?: string[];
  ctfConfig?: CtfConfigDoc;
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
    reasoning: { type: String },
    toolCalls: { type: [ToolCallSchema], default: undefined },
    toolCallId: { type: String },
    toolName: { type: String },
    timestamp: { type: Date, default: Date.now },
    turnIndex: { type: Number, default: 0 },
    isSummary: { type: Boolean, default: false },
  },
  { _id: false },
);

const ShellSchema = new Schema(
  {
    shellId: { type: String, required: true },
    label: { type: String, required: true },
    type: { type: String, required: true, enum: ["pty", "exec"] },
    status: { type: String, default: "active", enum: ["active", "closed"] },
    createdBy: { type: String, required: true, enum: ["user", "agent", "subagent"] },
    subagentId: { type: String },
    createdAt: { type: Date, default: Date.now },
    closedAt: { type: Date },
  },
  { _id: false },
);

const SubagentMessageSchema = new Schema(
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

const SubagentSchema = new Schema(
  {
    subagentId: { type: String, required: true },
    parentId: { type: String, required: true },
    task: { type: String, required: true },
    status: { type: String, default: "running", enum: ["running", "completed", "failed", "cancelled"] },
    result: { type: String },
    messages: { type: [SubagentMessageSchema], default: [] },
    shells: { type: [String], default: [] },
    createdAt: { type: Date, default: Date.now },
    completedAt: { type: Date },
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
      batch: {
        type: [
          {
            toolCallId: { type: String, required: true },
            toolName: { type: String, required: true },
            arguments: { type: Schema.Types.Mixed, required: true },
          },
        ],
        default: undefined,
      },
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
  shells: { type: [ShellSchema], default: [] },
  subagents: { type: [SubagentSchema], default: [] },
  connectionState: {
    type: {
      sshConnected: { type: Boolean, default: false },
      lastConnectedAt: { type: Date },
      lastError: { type: String },
    },
    default: { sshConnected: false },
  },
  disabledAgentTools: {
    type: [{ type: String }],
    default: [],
  },
  ctfConfig: {
    type: {
      url: { type: String, required: true },
      ctfName: { type: String, required: true },
      authMethod: { type: String, required: true, enum: ["token", "credentials"] },
      apiToken: { type: String },
      username: { type: String },
      sessionCookie: { type: String },
      lastSynced: { type: Date },
      activeSolve: {
        type: {
          name: { type: String, required: true },
          safeDir: { type: String, required: true },
          challengeTxt: { type: String, required: true },
          files: { type: [String], default: [] },
          category: { type: String },
          points: { type: Number },
          connectionInfo: { type: String },
          userNotes: { type: String },
          setAt: { type: Date, default: Date.now },
        },
        default: undefined,
      },
      solveHistory: {
        type: [
          {
            challengeName: { type: String, required: true },
            challengeId: { type: Number },
            safeDir: { type: String, required: true },
            category: { type: String, default: "" },
            status: { type: String, required: true, enum: ["solving", "solved", "submitted"] },
            confirmedFlag: { type: String },
            attempts: { type: Number, default: 0 },
            startedAt: { type: Date, default: Date.now },
            solvedAt: { type: Date },
            submittedToCtfd: { type: Boolean, default: false },
            ctfdResult: { type: String },
          },
        ],
        default: [],
      },
    },
    default: undefined,
  },
});

export { AgentMessageSchema };
export default mongoose.model<SessionDoc>("Session", SessionSchema);
