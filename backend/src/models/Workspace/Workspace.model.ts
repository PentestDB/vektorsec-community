import mongoose from "mongoose";
import { CtfConfigDoc } from "../Sessions/Sessions.model";

const Schema = mongoose.Schema;

export type WorkspaceType = "ctf" | "pentest" | "general";
export type WorkHostKind = "local" | "ssh";

export interface WorkHostDoc {
  kind: WorkHostKind;
  workFolder: string;
  sshProfileAlias?: string;
  configuredAt: Date;
}

export interface WorkspaceAgentConfigDoc {
  // Max agentic turns per orchestrator run for sessions in this workspace.
  // One of WORKSPACE_MAX_TURNS_CHOICES ([25, 50, 100]). When undefined the
  // user-level maxAgentIterations (Settings → Agent Behavior) is used.
  maxTurns?: number;
  // Autonomous mode: when true the agent does NOT stop for authorization
  // confirmation on high-risk (but non-destructive, in-scope) actions such as
  // WAF bypass, origin-IP discovery or active recon — it proceeds immediately.
  autonomousMode?: boolean;
  // Workspace-level target scope (whitelist). When scope.enabled is true this
  // list is authoritative for all sessions in the workspace; otherwise the
  // global Admin > Scope config applies.
  scope?: {
    enabled?: boolean;
    strictMode?: boolean;
    entriesRaw?: string;
  };
}

export interface WorkspaceDoc extends mongoose.Document {
  uid: mongoose.Types.ObjectId;
  workspaceId: string;
  name: string;
  description: string;
  type: WorkspaceType;
  createdAt: Date;
  status: "active" | "archived";
  workHost?: WorkHostDoc;
  ctfConfig?: CtfConfigDoc;
  agentConfig?: WorkspaceAgentConfigDoc;
}

const WorkspaceSchema = new Schema({
  uid: { type: mongoose.Types.ObjectId, required: true },
  workspaceId: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  description: { type: String, default: "" },
  type: { type: String, default: "general", enum: ["ctf", "pentest", "general"] },
  createdAt: { type: Date, default: Date.now },
  status: { type: String, default: "active", enum: ["active", "archived"] },
  workHost: {
    type: {
      kind: { type: String, required: true, enum: ["local", "ssh"] },
      workFolder: { type: String, required: true },
      // Only the public ~/.ssh/config alias is persisted. Credentials remain in
      // the SSH agent/config/key mounts owned by the runtime.
      sshProfileAlias: { type: String },
      configuredAt: { type: Date, default: Date.now },
    },
    default: undefined,
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
    },
    default: undefined,
  },
  // Per-workspace agent settings (Workspace Settings UI). Currently supports
  // the max agentic turns preset, autonomous mode and a target scope
  // allowlist; extend here when more fields are needed.
  agentConfig: {
    type: {
      maxTurns: { type: Number },
      autonomousMode: { type: Boolean, default: false },
      scope: {
        type: {
          enabled: { type: Boolean, default: false },
          strictMode: { type: Boolean, default: false },
          entriesRaw: { type: String, default: "" },
        },
        default: undefined,
      },
    },
    default: undefined,
  },
});

WorkspaceSchema.index({ uid: 1, status: 1 });
WorkspaceSchema.index({ workspaceId: 1 }, { unique: true });

export default mongoose.model<WorkspaceDoc>("Workspace", WorkspaceSchema);
