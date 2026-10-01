import type { Migration } from "./types";
import createWorkspaces from "./001-create-workspaces";
import ensureIndexes from "./002-ensure-indexes";

/**
 * Ordered migration registry.
 *
 * Append new migrations at the end using the next zero-padded number
 * (`003-...`, `004-...`). Never reorder or rename an id that has already been
 * applied somewhere — the runner refuses to start if the registry is out of
 * order or contains duplicates (see `assertValidMigrations`).
 */
export const migrations: Migration[] = [createWorkspaces, ensureIndexes];

export type { Migration, AppliedMigration } from "./types";
export { runMigrations, readAppliedMigrations, MIGRATIONS_COLLECTION } from "./runner";
export { planMigrations, assertValidMigrations, formatPlanSummary } from "./plan";
