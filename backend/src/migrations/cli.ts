import mongoose from "mongoose";
import { loadConfig } from "../utils/loadConfig";
import { logger } from "../utils/logger";
import {
  formatPlanSummary,
  migrations,
  planMigrations,
  readAppliedMigrations,
  runMigrations,
} from "./index";

/**
 * Migration CLI.
 *
 *   pnpm migrate                 # apply every pending migration
 *   pnpm migrate -- --dry-run    # show what would run
 *   pnpm migrate -- --list       # show the ledger + pending migrations
 *   pnpm migrate -- --uri <uri>  # override MONGO_URI
 *
 * In a container / production build use the compiled entry point:
 *   node dist/migrations/cli.js --list
 */

interface CliOptions {
  list: boolean;
  dryRun: boolean;
  uri?: string;
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = { list: false, dryRun: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--list" || arg === "-l") options.list = true;
    else if (arg === "--dry-run" || arg === "-n") options.dryRun = true;
    else if (arg === "--uri") options.uri = argv[++i];
    else if (arg.startsWith("--uri=")) options.uri = arg.slice("--uri=".length);
    else if (arg === "--help" || arg === "-h") {
      console.log(
        [
          "VektorSec migration runner",
          "",
          "Usage: pnpm migrate [--list] [--dry-run] [--uri <mongodb-uri>]",
          "",
          "  --list      show applied + pending migrations, run nothing",
          "  --dry-run   plan the run and exit without writing",
          "  --uri       override MONGO_URI (defaults to config.toml / .env)",
        ].join("\n"),
      );
      process.exit(0);
    } else {
      logger.warn("ignoring unknown command line argument", { scope: "migrate", argument: arg });
    }
  }
  return options;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));

  // Pull MONGO_URI from config.toml / DATA_DIR/.env when it is not already set.
  loadConfig();
  const uri = options.uri ?? process.env.MONGO_URI;

  if (!uri) {
    logger.error(
      "no MongoDB URI found (set MONGO_URI or database.mongo_uri in config.toml)",
      { scope: "migrate" },
    );
    process.exit(1);
  }

  await mongoose.connect(uri, { serverSelectionTimeoutMS: 15_000 });
  logger.info("connected", { scope: "migrate", host: uri.replace(/\/\/[^@]*@/, "//***@") });

  try {
    const applied = await readAppliedMigrations(mongoose.connection);
    const plan = planMigrations(migrations, applied);

    if (options.list) {
      logger.info("migration status", {
        scope: "migrate",
        registry: migrations.length,
        pending: plan.pending.length,
        applied: plan.alreadyApplied.length,
        unknown: plan.unknownApplied.length,
      });
      console.log(`[migrate] registry: ${migrations.length} migration(s) — ${formatPlanSummary(plan)}`);
      for (const migration of migrations) {
        const record = applied.find((entry: any) => entry.id === migration.id);
        const state = record
          ? `applied ${new Date(record.appliedAt as any).toISOString()}`
          : "PENDING";
        console.log(`  ${migration.id}  ${state}  — ${migration.description}`);
      }
      if (plan.unknownApplied.length > 0) {
        console.log(`  (in the ledger but not in the code: ${plan.unknownApplied.join(", ")})`);
      }
      return;
    }

    const result = await runMigrations(mongoose.connection, migrations, {
      dryRun: options.dryRun,
      onStart: (migration, index, total) =>
        logger.info("applying migration", {
          scope: "migrate",
          migration: migration.id,
          description: migration.description,
          position: `${index + 1}/${total}`,
        }),
      onDone: (migration, durationMs) =>
        logger.info("migration applied", { scope: "migrate", migration: migration.id, durationMs }),
    });

    if (result.dryRun) {
      console.log(`[migrate] dry run — ${formatPlanSummary(result.plan)}`);
      for (const migration of result.plan.pending) {
        console.log(`  would run ${migration.id} — ${migration.description}`);
      }
      return;
    }

    if (result.failed) {
      logger.error("migration failed; nothing after it was applied", {
        scope: "migrate",
        migration: result.failed.id,
        error: result.failed.error,
        next: "fix the issue and re-run `pnpm migrate`",
      });
      process.exitCode = 1;
      return;
    }

    if (result.applied.length === 0) {
      logger.info("nothing to do; database is up to date", { scope: "migrate" });
    } else {
      logger.info("migrations applied", { scope: "migrate", applied: result.applied });
    }
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((error) => {
  logger.error("unexpected migration error", { scope: "migrate", err: error });
  process.exit(1);
});
