/**
 * Migration: ensure the indexes the query paths rely on exist.
 *
 * Mongoose creates schema indexes automatically (`autoIndex`) in development,
 * but production deployments often disable that (and an index added to a schema
 * later never reaches an existing database). This migration calls
 * `createIndexes()` explicitly for the collections that grow with usage, so a
 * self-hosted instance gets them even with `autoIndex: false`.
 *
 * Idempotent — MongoDB ignores an existing identical index.
 */

import SessionsModel from "../models/Sessions/Sessions.model";
import HistoryArchiveModel from "../models/HistoryArchive/HistoryArchive.model";
import UsageRecordModel from "../models/UsageRecord/UsageRecord.model";
import SubscriptionModel from "../models/Subscription/Subscription.model";
import NotificationLogModel from "../models/NotificationLog/NotificationLog.model";
import UserModel from "../models/User/User.model";
import WorkspaceModel from "../models/Workspace/Workspace.model";
import { Migration } from "./types";

const MODELS: Array<{
  label: string;
  model: {
    createIndexes(): Promise<unknown>;
    collection: { indexes(): Promise<Array<{ name?: string }>> };
  };
}> = [
  { label: "Users", model: UserModel as any },
  { label: "Workspaces", model: WorkspaceModel as any },
  { label: "Sessions", model: SessionsModel as any },
  { label: "HistoryArchive", model: HistoryArchiveModel as any },
  { label: "UsageRecord", model: UsageRecordModel as any },
  { label: "Subscription", model: SubscriptionModel as any },
  { label: "NotificationLog", model: NotificationLogModel as any },
];

export const migration: Migration = {
  id: "002-ensure-indexes",
  description: "Create the indexes used by session, usage and billing queries",

  async up(): Promise<void> {
    for (const { label, model } of MODELS) {
      try {
        await model.createIndexes();
        // `createIndexes()` does not return the index list on every driver
        // version, so read it back from the collection to verify + report.
        const indexes = await model.collection.indexes();
        const names = indexes.map((index) => index.name ?? "?").sort();
        console.log(`[migrate] ${label}: ${names.length} index(es) — ${names.join(", ")}`);
      } catch (err: any) {
        // A duplicate-key failure on a unique index means dirty data; report it
        // instead of failing the whole migration.
        console.warn(`[migrate] ${label}: index creation issue — ${err.message}`);
      }
    }
  },
};

export default migration;
