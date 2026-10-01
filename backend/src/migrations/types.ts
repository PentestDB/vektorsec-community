import type { Connection } from "mongoose";

/**
 * A database migration.
 *
 * Conventions:
 *  - `id` is a stable, zero-padded, sortable identifier (`001-create-workspaces`).
 *    Never rename an id that has already been applied in production.
 *  - `up()` MUST be idempotent: migrations are tracked, but a partially applied
 *    migration may be re-run by an operator after a failure.
 *  - Migrations receive the live connection; do not open/close your own.
 */
export interface Migration {
  id: string;
  description: string;
  up(connection: Connection): Promise<void>;
}

/** One row of the `migrations` collection (the applied-migration ledger). */
export interface AppliedMigration {
  id: string;
  description?: string;
  appliedAt?: Date | string | null;
  durationMs?: number;
}
