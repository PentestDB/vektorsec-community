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

export type AgentState =
  | "idle"
  | "running"
  | "paused"
  | "waiting_consent"
  | "waiting_manual_execution";

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

export type SubagentStatus =
  | "running"
  | "completed"
  | "failed"
  | "cancelled"
  | "paused";

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

export type SwarmWinCondition = "first_success" | "all_complete";
export type SwarmStatus =
  | "running"
  | "completed"
  | "cancelled"
  | "timed_out"
  | "paused";

export interface SwarmAgentDoc {
  agentId: string;
  task: string;
  modelLabel: string;
  modelSpec: {
    provider: string;
    model: string;
  };
  status: SubagentStatus;
  result?: string;
  messages: AgentMessageDoc[];
  subagents: SubagentDoc[];
  shells: string[];
  createdAt: Date;
  completedAt?: Date;
}

export interface SwarmFindingDoc {
  agentId: string;
  content: string;
  isSuccess: boolean;
  timestamp: Date;
}

export interface SwarmDoc {
  swarmId: string;
  goal: string;
  winCondition: SwarmWinCondition;
  status: SwarmStatus;
  agents: SwarmAgentDoc[];
  findings: SwarmFindingDoc[];
  winner?: string;
  timeoutMs?: number;
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
  status: "solving" | "flag_found" | "incorrect" | "solved" | "submitted";
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
  flagFormat?: string;
  activeSolve?: CtfActiveSolveDoc;
  solveHistory?: CtfSolveRecord[];
}

export interface SessionFindingDoc {
  findingId: string;
  title: string;
  content: string;
  severity: "info" | "low" | "medium" | "high" | "critical";
  status: "open" | "closed";
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface McpContextDoc {
  target?: string;
  scope?: string;
  notes?: string;
  credentials?: string;
  labels?: string[];
  metadata?: Record<string, string>;
}

export interface SessionArtifactDoc {
  artifactId: string;
  type: "note" | "file" | "image" | "browser_observation" | "request" | "other";
  title: string;
  content?: string;
  url?: string;
  path?: string;
  mimeType?: string;
  createdBy: string;
  createdAt: Date;
  metadata?: Record<string, string>;
}

export interface SessionDoc extends mongoose.Document {
  uid: mongoose.Types.ObjectId;
  sessionId: string;
  workspaceId: string;
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
  swarms: SwarmDoc[];
  connectionState: ConnectionStateDoc;
  disabledAgentTools?: string[];
  ctfConfig?: CtfConfigDoc;
  mcpFindings?: SessionFindingDoc[];
  mcpContext?: McpContextDoc;
  mcpArtifacts?: SessionArtifactDoc[];
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
    role: {
      type: String,
      required: true,
      enum: ["system", "user", "assistant", "tool"],
    },
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
    createdBy: {
      type: String,
      required: true,
      enum: ["user", "agent", "subagent"],
    },
    subagentId: { type: String },
    createdAt: { type: Date, default: Date.now },
    closedAt: { type: Date },
  },
  { _id: false },
);

const SubagentMessageSchema = new Schema(
  {
    id: { type: String, required: true },
    role: {
      type: String,
      required: true,
      enum: ["system", "user", "assistant", "tool"],
    },
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
    status: {
      type: String,
      default: "running",
      enum: ["running", "completed", "failed", "cancelled"],
    },
    result: { type: String },
    messages: { type: [SubagentMessageSchema], default: [] },
    shells: { type: [String], default: [] },
    createdAt: { type: Date, default: Date.now },
    completedAt: { type: Date },
  },
  { _id: false },
);

const SwarmAgentSchema = new Schema(
  {
    agentId: { type: String, required: true },
    task: { type: String, required: true },
    modelLabel: { type: String, required: true },
    modelSpec: {
      type: {
        provider: { type: String, required: true },
        model: { type: String, required: true },
      },
      required: true,
    },
    status: {
      type: String,
      default: "running",
      enum: ["running", "completed", "failed", "cancelled"],
    },
    result: { type: String },
    messages: { type: [SubagentMessageSchema], default: [] },
    subagents: { type: [SubagentSchema], default: [] },
    shells: { type: [String], default: [] },
    createdAt: { type: Date, default: Date.now },
    completedAt: { type: Date },
  },
  { _id: false },
);

const SwarmFindingSchema = new Schema(
  {
    agentId: { type: String, required: true },
    content: { type: String, required: true },
    isSuccess: { type: Boolean, default: false },
    timestamp: { type: Date, default: Date.now },
  },
  { _id: false },
);

const SwarmSchema = new Schema(
  {
    swarmId: { type: String, required: true },
    goal: { type: String, required: true },
    winCondition: {
      type: String,
      required: true,
      enum: ["first_success", "all_complete"],
    },
    status: {
      type: String,
      default: "running",
      enum: ["running", "completed", "cancelled", "timed_out"],
    },
    agents: { type: [SwarmAgentSchema], default: [] },
    findings: { type: [SwarmFindingSchema], default: [] },
    winner: { type: String },
    timeoutMs: { type: Number },
    createdAt: { type: Date, default: Date.now },
    completedAt: { type: Date },
  },
  { _id: false },
);

const SessionFindingSchema = new Schema(
  {
    findingId: { type: String, required: true },
    title: { type: String, required: true },
    content: { type: String, required: true },
    severity: {
      type: String,
      required: true,
      enum: ["info", "low", "medium", "high", "critical"],
      default: "info",
    },
    status: {
      type: String,
      required: true,
      enum: ["open", "closed"],
      default: "open",
    },
    createdBy: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const McpContextSchema = new Schema(
  {
    target: { type: String },
    scope: { type: String },
    notes: { type: String },
    credentials: { type: String },
    labels: { type: [String], default: [] },
    metadata: { type: Map, of: String, default: {} },
  },
  { _id: false },
);

const SessionArtifactSchema = new Schema(
  {
    artifactId: { type: String, required: true },
    type: {
      type: String,
      required: true,
      enum: [
        "note",
        "file",
        "image",
        "browser_observation",
        "request",
        "other",
      ],
      default: "other",
    },
    title: { type: String, required: true },
    content: { type: String },
    url: { type: String },
    path: { type: String },
    mimeType: { type: String },
    createdBy: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
    metadata: { type: Map, of: String, default: {} },
  },
  { _id: false },
);

const SessionSchema = new Schema({
  uid: { type: mongoose.Types.ObjectId, required: true },
  sessionId: { type: String, required: true, unique: true },
  workspaceId: { type: String, default: "" },
  name: { type: String, required: true },
  description: { type: String, default: "" },
  boxId: { type: mongoose.Types.ObjectId },
  createdAt: { type: Date, default: Date.now },
  status: { type: String, default: "active", enum: ["active", "archived"] },
  agentState: {
    type: String,
    default: "idle",
    enum: [
      "idle",
      "running",
      "paused",
      "waiting_consent",
      "waiting_manual_execution",
    ],
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
  swarms: { type: [SwarmSchema], default: [] },
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
      authMethod: {
        type: String,
        required: true,
        enum: ["token", "credentials"],
      },
      apiToken: { type: String },
      username: { type: String },
      sessionCookie: { type: String },
      lastSynced: { type: Date },
      flagFormat: { type: String },
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
            status: {
              type: String,
              required: true,
              enum: [
                "solving",
                "flag_found",
                "incorrect",
                "solved",
                "submitted",
              ],
            },
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
  mcpFindings: {
    type: [SessionFindingSchema],
    default: [],
  },
  mcpContext: {
    type: McpContextSchema,
    default: undefined,
  },
  mcpArtifacts: {
    type: [SessionArtifactSchema],
    default: [],
  },
});

SessionSchema.index({ workspaceId: 1, status: 1 });

export { AgentMessageSchema };
export default mongoose.model<SessionDoc>("Session", SessionSchema);
