import mongoose from "mongoose";
import {
  HistoryData,
  SingleCommandData,
} from "../../services/copilot.services";
const Schema = mongoose.Schema;

export interface loopHistoryDoc {
  _id?: mongoose.Types.ObjectId;
  stepType: "init" | "command" | "output" | "summary" | "todo";
  status: "not-started" | "processing" | "pending" | "completed";
  data: {
    content?: string;
    choice?: string;
    tool?: string;
    additionalContext?: string;
    fileAnalysis?: string;
    siteContext?: string;
  };
  loop: number;
  action?: "like" | "dislike";
}

export interface StoreCommandData extends SingleCommandData {
  boxId?: string;
}

export interface TokenHistoryData {
  content: string;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface SessionDoc extends mongoose.Document {
  uid: mongoose.Types.ObjectId;
  sessionId: string;
  mainSessionId?: string;
  name: string;
  description: string;
  boxId?: mongoose.Types.ObjectId;
  createdAt: string;
  status: "active" | "archived";
  type: "main" | "sub";
  loopHistory: loopHistoryDoc[];
  archiveHistoryId: mongoose.Types.ObjectId;
  loopStepsPerformed: number;
  history: HistoryData[];
  tokenHistory: TokenHistoryData[];
  tokenHistory3: TokenHistoryData[];
  totalTokens: number;
  totalTokens3: number;
  storeCommands: StoreCommandData[];
  loops: {
    startTimestamp: Date;
    endTimestamp?: Date;
    loop: number;
  }[];
  redoContext: string | null;
}

const SessionSchema = new Schema({
  uid: { type: mongoose.Types.ObjectId, required: true },
  sessionId: { type: String, required: true },
  mainSessionId: { type: String },
  name: { type: String, required: true },
  description: { type: String, default: "" },
  boxId: { type: mongoose.Types.ObjectId },
  createdAt: { type: Date, default: Date.now },
  status: { type: String, default: "active", enum: ["active", "archived"] },
  type: { type: String, required: true, enum: ["main", "sub"] },
  loopHistory: [
    {
      stepType: {
        type: String,
        enum: ["init", "command", "output", "summary", "todo"],
        required: true,
      },
      status: {
        type: String,
        enum: ["not-started", "processing", "pending", "completed"],
        default: "not-started",
      },
      data: {
        content: {
          type: String,
        },
        choice: {
          type: String,
          enum: ["yes", "no", "edit", "provide_output", "provide_guidance"],
        },
        tool: {
          type: String,
        },
        additionalContext: {
          type: String,
        },
        fileAnalysis: {
          type: String,
        },
        siteContext: {
          type: String,
        },
      },
      loop: {
        type: Number,
        default: 0,
      },
      action: {
        type: String,
        enum: ["like", "dislike"],
      },
    },
  ],
  archiveHistoryId: { type: mongoose.Types.ObjectId, required: true },
  loopStepsPerformed: { type: Number, required: true, default: 0 },
  storeCommands: {
    type: [
      {
        tool_name: { type: String, required: true },
        args: { type: Object, required: true },
        file_name: { type: [String], required: false },
        active: { type: Boolean, required: true, default: false },
        boxId: { type: mongoose.Types.ObjectId },
        loop: { type: Number, required: true, default: 0 },
      },
    ],
  },

  history: {
    type: [
      {
        role: { type: String, required: true },
        content: { type: String, required: true },
        isContextual: { type: Boolean },
        loopStep: { type: Number },
      },
    ],
  },

  loops: {
    type: [
      {
        startTimestamp: { type: Date, required: true },
        endTimestamp: { type: Date },
        loop: { type: Number, required: true },
      },
    ],
  },
  tokenHistory: {
    type: [
      {
        content: { type: String, required: true },
        usage: {
          prompt_tokens: { type: Number, required: true },
          completion_tokens: { type: Number, required: true },
          total_tokens: { type: Number, required: true },
        },
      },
    ],
  },
  tokenHistory3: {
    type: [
      {
        content: { type: String, required: true },
        usage: {
          prompt_tokens: { type: Number, required: true },
          completion_tokens: { type: Number, required: true },
          total_tokens: { type: Number, required: true },
        },
      },
    ],
  },
  totalTokens: { type: Number, required: true, default: 0 },
  totalTokens3: { type: Number, required: true, default: 0 },
  redoContext: {
    type: String,
  },
});

export default mongoose.model<SessionDoc>("Session", SessionSchema);
