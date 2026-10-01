/**
 * Migration: Create Workspace documents for all existing Sessions.
 *
 * For each Session that does not yet have a workspaceId, this migration:
 *   1. Creates a Workspace (same name / description / uid).
 *   2. If the Session had ctfConfig, sets workspace type to "ctf" and copies ctfConfig.
 *   3. Sets session.workspaceId to the new workspace's workspaceId.
 *
 * Idempotent — sessions that already have a workspaceId are skipped.
 *
 * Run it through the runner (preferred):
 *   pnpm migrate                  # applies every pending migration
 * or standalone (legacy):
 *   MONGO_URI=... npx tsx src/migrations/001-create-workspaces.ts
 */

import mongoose from "mongoose";
import { v4 as uuidv4 } from "uuid";
import SessionsModel from "../models/Sessions/Sessions.model";
import WorkspaceModel from "../models/Workspace/Workspace.model";
import { Migration } from "./types";

export const migration: Migration = {
  id: "001-create-workspaces",
  description: "Create a Workspace document for every Session without one",

  async up(): Promise<void> {
    const sessions = await SessionsModel.find({
      $or: [{ workspaceId: { $exists: false } }, { workspaceId: "" }],
    });

    console.log(`[migrate] found ${sessions.length} session(s) without a workspace`);

    let created = 0;
    let skipped = 0;

    for (const session of sessions) {
      try {
        const workspaceId = uuidv4();
        const hasCTF = !!session.ctfConfig?.ctfName;

        const workspace = new WorkspaceModel({
          uid: session.uid,
          workspaceId,
          name: session.name,
          description: session.description || "",
          type: hasCTF ? "ctf" : "general",
          createdAt: session.createdAt,
          status: session.status,
          ctfConfig: hasCTF ? session.ctfConfig : undefined,
        });

        await workspace.save();

        await SessionsModel.updateOne(
          { _id: session._id },
          { $set: { workspaceId } },
        );

        created++;
      } catch (err: any) {
        console.warn(`[migrate] skip session ${session.sessionId}: ${err.message}`);
        skipped++;
      }
    }

    console.log(
      `[migrate] 001-create-workspaces done — created ${created} workspace(s), skipped ${skipped}`,
    );
  },
};

export default migration;

// ─── Standalone execution ────────────────────────────────────────────
// Kept so the historical command in the docs still works:
//   MONGO_URI=... npx tsx src/migrations/001-create-workspaces.ts
if (require.main === module) {
  (async () => {
    const MONGO_URI = process.env.MONGO_URI;
    if (!MONGO_URI) {
      console.error("MONGO_URI environment variable is required");
      process.exit(1);
    }
    await mongoose.connect(MONGO_URI);
    console.log("Connected to MongoDB");
    await migration.up(mongoose.connection);
    await mongoose.disconnect();
  })().catch((err) => {
    console.error("Migration failed:", err);
    process.exit(1);
  });
}
