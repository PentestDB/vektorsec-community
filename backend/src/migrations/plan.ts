import { AppliedMigration, Migration } from "./types";

/**
 * Pure planning helpers for the migration runner.
 *
 * Everything here is dependency-free so it can be unit tested without a
 * database (see `backend/tests/migrationPlan.test.ts`).
 */

export interface MigrationPlan {
  /** Migrations that have not been recorded yet, in execution order. */
  pending: Migration[];
  /** Ids already recorded in the ledger. */
  alreadyApplied: string[];
  /** Ledger ids that no longer exist in the code (renamed/removed migrations). */
  unknownApplied: string[];
}

/**
 * Validate the migration registry: ids must be present, unique and sorted
 * ascending. Running migrations out of order is a data-corruption risk, so the
 * runner refuses to start instead of guessing.
 *
 * @throws Error listing every problem found.
 */
export function assertValidMigrations(all: Migration[]): void {
  const problems: string[] = [];
  const seen = new Set<string>();

  all.forEach((migration, index) => {
    if (!migration?.id || typeof migration.id !== "string") {
      problems.push(`migration at index ${index} has no id`);
      return;
    }
    if (!/^[0-9]{3}-[a-z0-9-]+$/.test(migration.id)) {
      problems.push(`"${migration.id}" must look like 001-lowercase-kebab-case`);
    }
    if (seen.has(migration.id)) {
      problems.push(`duplicate migration id "${migration.id}"`);
    }
    seen.add(migration.id);

    if (typeof migration.up !== "function") {
      problems.push(`"${migration.id}" has no up() function`);
    }
    if (!migration.description) {
      problems.push(`"${migration.id}" has no description`);
    }

    const previous = all[index - 1];
    if (previous?.id && previous.id > migration.id) {
      problems.push(
        `"${migration.id}" is out of order (comes after "${previous.id}")`,
      );
    }
  });

  if (problems.length > 0) {
    throw new Error(`Invalid migration registry:\n  - ${problems.join("\n  - ")}`);
  }
}

/**
 * Ledger rows come straight from MongoDB, so they carry `_id` and possibly
 * extra fields. Only `id` matters for planning; plain id strings are accepted
 * too (handy in tests). The parameter is typed loosely on purpose so the driver
 * document type (`WithId<AnyObject>`) is assignable — the shape is validated at
 * runtime below.
 */
export type AppliedMigrationLike = AppliedMigration | string | { id?: unknown };

/** Extract the migration id from a ledger row, or "" when it has none. */
function readAppliedId(entry: unknown): string {
  if (typeof entry === "string") return entry;
  const id = (entry as { id?: unknown } | null | undefined)?.id;
  return id === undefined || id === null ? "" : String(id);
}

/**
 * Compute which migrations still have to run.
 *
 * Accepts either the raw ledger documents or a list of ids, so it is easy to
 * call from tests and from the CLI.
 */
export function planMigrations(
  all: Migration[],
  applied: readonly unknown[] | null | undefined,
): MigrationPlan {
  const appliedIds = (Array.isArray(applied) ? applied : [])
    .map(readAppliedId)
    .filter(Boolean);
  const appliedSet = new Set(appliedIds);
  const knownIds = new Set(all.map((migration) => migration.id));

  return {
    pending: all.filter((migration) => !appliedSet.has(migration.id)),
    alreadyApplied: all
      .filter((migration) => appliedSet.has(migration.id))
      .map((migration) => migration.id),
    unknownApplied: appliedIds.filter((id) => !knownIds.has(id)).sort(),
  };
}

/** Human-readable single-line summary used by the CLI output. */
export function formatPlanSummary(plan: MigrationPlan): string {
  const parts = [
    `${plan.pending.length} pending`,
    `${plan.alreadyApplied.length} applied`,
  ];
  if (plan.unknownApplied.length > 0) {
    parts.push(`${plan.unknownApplied.length} unknown`);
  }
  return parts.join(", ");
}
