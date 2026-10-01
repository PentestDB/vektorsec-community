import type { Connection } from "mongoose";
import { Migration } from "./types";
import { assertValidMigrations, formatPlanSummary, MigrationPlan, planMigrations } from "./plan";

/**
 * Migration runner.
 *
 * Keeps a ledger in the `migrations` collection so every migration runs exactly
 * once per database. The runner is deliberately dependency-free at import time
 * (no model imports, no auto-connect) so it can be used from the CLI, from a
 * test and — if needed — from server bootstrap.
 */

/** Name of the ledger collection. */
export const MIGRATIONS_COLLECTION = "migrations";

export interface RunMigrationsOptions {
  /** Plan only: report what would run without touching the data. */
  dryRun?: boolean;
  /** Called before each migration (useful for progress output). */
  onStart?: (migration: Migration, index: number, total: number) => void;
  /** Called after each migration. */
  onDone?: (migration: Migration, durationMs: number) => void;
  /** Injected clock — makes the ledger deterministic in tests. */
  now?: () => Date;
}

export interface RunMigrationsResult {
  plan: MigrationPlan;
  applied: string[];
  failed: { id: string; error: string } | null;
  dryRun: boolean;
}

/** Read the applied-migration ledger (missing collection = no migrations yet). */
export async function readAppliedMigrations(connection: Connection) {
  return connection
    .collection(MIGRATIONS_COLLECTION)
    .find({}, { projection: { id: 1, description: 1, appliedAt: 1, durationMs: 1 } })
    .sort({ id: 1 })
    .toArray();
}

/**
 * Run every pending migration in order.
 *
 * Stops at the first failure (the data may be half-migrated, so the operator
 * must look before continuing) and never marks a failed migration as applied.
 */
export async function runMigrations(
  connection: Connection,
  migrations: Migration[],
  options: RunMigrationsOptions = {},
): Promise<RunMigrationsResult> {
  assertValidMigrations(migrations);

  const now = options.now ?? (() => new Date());
  const dryRun = options.dryRun === true;

  const appliedRecords = await readAppliedMigrations(connection);
  const plan = planMigrations(migrations, appliedRecords);

  if (plan.unknownApplied.length > 0) {
    console.warn(
      `[migrate] ledger contains ids that no longer exist in the code: ${plan.unknownApplied.join(", ")}`,
    );
  }

  const result: RunMigrationsResult = {
    plan,
    applied: [],
    failed: null,
    dryRun,
  };

  if (dryRun) {
    return result;
  }

  const ledger = connection.collection(MIGRATIONS_COLLECTION);

  for (let index = 0; index < plan.pending.length; index += 1) {
    const migration = plan.pending[index];
    options.onStart?.(migration, index, plan.pending.length);
    const startedAt = Date.now();
    try {
      await migration.up(connection);
    } catch (error: any) {
      const message = error?.message ?? String(error);
      result.failed = { id: migration.id, error: message };
      console.error(`[migrate] ${migration.id} failed: ${message}`);
      return result;
    }
    const durationMs = Date.now() - startedAt;
    await ledger.insertOne({
      id: migration.id,
      description: migration.description,
      appliedAt: now(),
      durationMs,
    });
    result.applied.push(migration.id);
    options.onDone?.(migration, durationMs);
  }

  return result;
}

export { formatPlanSummary, planMigrations, assertValidMigrations };
export type { MigrationPlan };
