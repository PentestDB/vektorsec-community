import mongoose from "mongoose";
import bcrypt from "bcryptjs";
const Schema = mongoose.Schema;

export interface ModelPresetDoc {
  id?: string;
  label: string;
  provider: string;
  model: string;
  apiKey?: string;
  baseURL?: string;
  reasoningMode?: string;
  isOrchestrator?: boolean;
}

export interface McpTokenDoc {
  tokenId: string;
  label: string;
  token: string;
  createdAt: Date;
  lastUsedAt?: Date;
  revokedAt?: Date | null;
}

export type UserRole = "admin" | "pentester" | "viewer";

export type UserPlan = "free" | "pro" | "team" | "enterprise";

export type ToolExecutionMode = "auto" | "auto_approve" | "requires_consent";

export interface UserDoc extends mongoose.Document {
  email: string;
  name: string;
  password: string;
  profilePicture: string;
  openvpnFile: string;
  role: UserRole;
  plan: UserPlan;
  planExpiresAt?: Date;
  twoFactorEnabled: boolean;
  twoFactorSecret?: string;
  /** OAuth provider link (Google / GitHub sign-in). */
  googleId?: string;
  githubId?: string;
  firstLogin?: boolean;
  isBlocked?: boolean;
   blockedAt?: Date;
   blockedReason?: string;
  /** Optional admin override for the MCP token limit (overrides plan limit). */
  mcpTokenLimit?: number;


   ipLocation: {

    ip: string;
    range: [number, number];
    country: string;
    region: string;
    eu: string;
    timezone: string;
    city: string;
    ll: [number, number];
    metro: number;
    area: number;
  };
  ip: string;
  configs: {
    tools: string[];
    capabilities: string[];
    installedCapabilities: string[];
    requireConsentForAllTools?: boolean;
    toolExecutionMode?: ToolExecutionMode;
    disableSafetyProtections?: boolean;
    disabledAgentTools?: string[];
    maxAgentIterations?: number;
    maxSubagentIterations?: number;
    maxSwarmIterations?: number;
    models?: ModelPresetDoc[];
    mcpTokens?: McpTokenDoc[];
  };
  referredBy: mongoose.Types.ObjectId;
  workingIndustry: string;
  workingExperience: string;
  referralSource: string;
  credits: number;
  creditsUsed: number;
  creditsPeriodStart: Date;
}

const UserSchema = new Schema({
  email: {
    type: String,
    unique: true,
    required: true,
    match: /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,20})+$/,
  },
  name: { type: String, required: true },
  password: { type: String, required: true },
  profilePicture: { type: String },
  openvpnFile: { type: String },
  role: {
    type: String,
    enum: ["admin", "pentester", "viewer"],
    default: "pentester",
  },
  plan: {
    type: String,
    enum: ["free", "pro", "team", "enterprise"],
    default: "free",
  },
  planExpiresAt: { type: Date },
  twoFactorEnabled: { type: Boolean, default: false },
  twoFactorSecret: { type: String },
  googleId: { type: String, index: true },
  githubId: { type: String, index: true },
  firstLogin: { type: Boolean, default: true },
  isBlocked: { type: Boolean, default: false },
  blockedAt: { type: Date },
  blockedReason: { type: String },
  /** Optional admin override for the MCP token limit (overrides plan limit). */
  mcpTokenLimit: { type: Number },

  ipLocation: {


    ip: { type: String },
    range: [Number, Number],
    country: { type: String },
    region: { type: String },
    eu: { type: String },
    timezone: { type: String },
    city: { type: String },
    ll: [Number, Number],
    metro: Number,
    area: Number,
  },
  ip: { type: String },
  configs: {
    tools: {
      type: [
        {
          type: String,
        },
      ],
      default: ["nmap", "feroxbuster", "subfinder", "hydra", "sqlmap"],
    },
    capabilities: {
      type: [{ type: String }],
      default: [
        "python3",
        "gcc",
        "make",
        "git",
        "curl",
        "nc",
        "socat",
        "ssh",
        "file",
        "strings",
        "xxd",
        "openssl",
        "jq",
        "tmux",
        "requests",
        "pyyaml",
        "beautifulsoup4",
        "Pillow",
        "python-magic",
        "chepy",
        "nmap",
        "feroxbuster",
        "subfinder",
        "hydra",
        "sqlmap",
      ],
    },
    installedCapabilities: {
      type: [{ type: String }],
      default: [],
    },
    requireConsentForAllTools: {
      type: Boolean,
      default: false,
    },
    toolExecutionMode: {
      type: String,
      enum: ["auto", "auto_approve", "requires_consent"],
      default: "auto",
    },
    disableSafetyProtections: {
      type: Boolean,
      default: false,
    },
    disabledAgentTools: {
      type: [{ type: String }],
      default: [],
    },
    maxAgentIterations: {
      type: Number,
      min: 5,
      max: 200,
      default: 25,
    },
    maxSubagentIterations: {
      type: Number,
      min: 3,
      max: 100,
      default: 15,
    },
    maxSwarmIterations: {
      type: Number,
      min: 5,
      max: 150,
      default: 25,
    },
    models: {
      type: [
        {
          id: { type: String },
          label: { type: String, required: true },
          provider: { type: String, required: true },
          model: { type: String, required: true },
          apiKey: { type: String },
          baseURL: { type: String },
          reasoningMode: {
            type: String,
            enum: ["off", "low", "medium", "high", "xhigh", "max"],
            default: "off",
          },
          isOrchestrator: { type: Boolean, default: false },
        },
      ],
      default: [],
    },
    mcpTokens: {
      type: [
        {
          tokenId: { type: String, required: true },
          label: { type: String, required: true },
          token: { type: String, required: true },
          createdAt: { type: Date, default: Date.now },
          lastUsedAt: { type: Date },
          revokedAt: { type: Date, default: null },
        },
      ],
      default: [],
    },
  },
  referredBy: { type: mongoose.Schema.Types.ObjectId },
  workingIndustry: { type: String },
  workingExperience: { type: String },
  referralSource: { type: String },
  credits: { type: Number, default: 0 },
  creditsUsed: { type: Number, default: 0 },
  creditsPeriodStart: { type: Date, default: Date.now },
});

export default mongoose.model<UserDoc>("User", UserSchema);
