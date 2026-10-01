import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import mongoose from "mongoose";

/**
 * Database integration tests — real MongoDB, real models, real services.
 *
 * They are opt-in so `pnpm test` still works on a laptop with no database:
 *
 *   MONGO_TEST_URI=mongodb://127.0.0.1:27017 pnpm test
 *
 * CI provides a MongoDB service container and sets MONGO_TEST_URI, so these
 * cases run on every push. Each run uses its own database name and drops it
 * afterwards, so a shared server stays clean.
 */
const MONGO_TEST_URI = process.env.MONGO_TEST_URI?.trim();

const skip = MONGO_TEST_URI
  ? false
  : "set MONGO_TEST_URI=mongodb://host:port to run the database integration tests";

const dbName = `vektorsec_test_${Date.now().toString(36)}`;

before(async () => {
  if (!MONGO_TEST_URI) return;
  await mongoose.connect(MONGO_TEST_URI, {
    dbName,
    serverSelectionTimeoutMS: 15_000,
  });
});

after(async () => {
  if (mongoose.connection.readyState !== 1) return;
  try {
    await mongoose.connection.dropDatabase();
  } finally {
    await mongoose.disconnect();
  }
});

test("subscription service: trial lifecycle against a real database", { skip }, async () => {
  const {
    startTrial,
    getSubscription,
    hasActiveAccess,
    isTrialActive,
    getEffectivePlanId,
    cancelSubscription,
  } = await import("../src/services/subscription.service");

  const userId = new mongoose.Types.ObjectId();

  const trial = await startTrial(userId, "online");
  assert.equal(trial.status, "trial");
  assert.equal(trial.channel, "online");
  assert.equal(trial.endsAt ?? null, null, "trials have no time-based expiry");
  assert.equal(trial.trialUsed, true, "claiming a trial is recorded on the row");

  assert.equal(await hasActiveAccess(userId, "online"), true);
  assert.equal(await isTrialActive(userId, "online"), true);

  // Starting the trial again is idempotent (same record, still one trial).
  const again = await startTrial(userId, "online");
  assert.equal(String(again._id), String(trial._id));
  assert.equal(
    (await mongoose.connection.collection("subscriptions").countDocuments({ userId })).toString(),
    "1",
  );

  // After cancelling, the one-off trial cannot be restarted.
  await cancelSubscription(userId, "online");
  assert.equal(await hasActiveAccess(userId, "online"), false);
  await assert.rejects(() => startTrial(userId, "online"), /already used/i);

  // An inactive subscription falls back to the free plan.
  assert.equal(await getEffectivePlanId(userId, "online"), "free");

  const stored = await getSubscription(userId, "online");
  assert.ok(stored, "the subscription row must still exist after cancelling");
  assert.equal(stored!.status, "canceled");
});

test("usage tracker: records and aggregates daily usage", { skip }, async () => {
  const { recordUsage, getTodayUsage, getUserTotalUsage } = await import(
    "../src/services/usageTracker.service"
  );

  const userId = new mongoose.Types.ObjectId();

  await recordUsage(userId, "telegram", {
    requests: 2,
    tokensIn: 100,
    tokensOut: 40,
    costUsd: 0.02,
  });
  await recordUsage(userId, "telegram", {
    requests: 1,
    tokensIn: 50,
    tokensOut: 10,
    costUsd: 0.01,
  });

  const today = await getTodayUsage(userId, "telegram");
  assert.equal(today.requests, 3);
  assert.equal(today.tokensIn, 150);
  assert.equal(today.tokensOut, 50);
  assert.ok(Math.abs(today.costUsd - 0.03) < 1e-9);

  const total = await getUserTotalUsage(userId, 30);
  assert.equal(total.requests, 3);
  assert.equal(total.tokensIn, 150);
});

test("migration runner: applies pending migrations once and keeps a ledger", { skip }, async () => {
  const { migrations, readAppliedMigrations, runMigrations } = await import("../src/migrations/index");

  assert.ok(migrations.length > 0, "the registry must not be empty");

  const first = await runMigrations(mongoose.connection, migrations);
  assert.equal(first.failed, null);
  assert.deepEqual(
    first.applied,
    migrations.map((migration) => migration.id),
  );

  const ledger = await readAppliedMigrations(mongoose.connection);
  assert.equal(ledger.length, migrations.length);
  assert.ok(
    ledger.every((entry: any) => entry.appliedAt instanceof Date || typeof entry.appliedAt === "string"),
    "every ledger row records when it was applied",
  );

  // Second run: nothing pending, ledger unchanged (idempotent).
  const second = await runMigrations(mongoose.connection, migrations);
  assert.deepEqual(second.applied, []);
  assert.equal(second.plan.pending.length, 0);
  assert.equal(
    await mongoose.connection.collection("migrations").countDocuments(),
    migrations.length,
  );
});

test("migration runner: a failing migration is not recorded", { skip }, async () => {
  const { runMigrations } = await import("../src/migrations/runner");

  const failing = [
    {
      id: "900-always-fails",
      description: "test double that throws",
      up: async () => {
        throw new Error("boom");
      },
    },
  ];

  const result = await runMigrations(mongoose.connection, failing as any);
  assert.deepEqual(result.failed, { id: "900-always-fails", error: "boom" });
  assert.deepEqual(result.applied, []);
  assert.equal(
    await mongoose.connection.collection("migrations").countDocuments({ id: "900-always-fails" }),
    0,
  );
});
