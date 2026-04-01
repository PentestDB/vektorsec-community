import mongoose from "mongoose";
import { CtfConfigDoc } from "../Sessions/Sessions.model";

const Schema = mongoose.Schema;

export type WorkspaceType = "ctf" | "pentest" | "general";

export interface WorkspaceDoc extends mongoose.Document {
  uid: mongoose.Types.ObjectId;
  workspaceId: string;
  name: string;
  description: string;
  type: WorkspaceType;
  createdAt: Date;
  status: "active" | "archived";
  ctfConfig?: CtfConfigDoc;
}

const WorkspaceSchema = new Schema({
  uid: { type: mongoose.Types.ObjectId, required: true },
  workspaceId: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  description: { type: String, default: "" },
  type: { type: String, default: "general", enum: ["ctf", "pentest", "general"] },
  createdAt: { type: Date, default: Date.now },
  status: { type: String, default: "active", enum: ["active", "archived"] },
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
});

WorkspaceSchema.index({ uid: 1, status: 1 });
WorkspaceSchema.index({ workspaceId: 1 }, { unique: true });

export default mongoose.model<WorkspaceDoc>("Workspace", WorkspaceSchema);
