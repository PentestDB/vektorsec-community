import assert from "node:assert/strict";
import { test } from "node:test";
import {
  assertValidMigrations,
  formatPlanSummary,
  planMigrations,
} from "../src/migrations/plan";
import type { Migration } from "../src/migrations/types";

const noop = async () => {};

const migration = (id: string, description = `does ${id}`): Migration => ({
  id,
  description,
  up: noop,
});

const registry: Migration[] = [
  migration("001-create-workspaces"),
  migration("002-add-something"),
  migration("003-add-something-else"),
];

test("accepts a well-formed, ordered registry", () => {
  assert.doesNotThrow(() => assertValidMigrations(registry));
});

test("rejects duplicate ids", () => {
  assert.throws(
    () => assertValidMigrations([migration("001-a"), migration("001-a")]),
    /duplicate migration id/,
  );
});

test("rejects out-of-order ids", () => {
  assert.throws(
    () => assertValidMigrations([migration("002-b"), migration("001-a")]),
    /out of order/,
  );
});

test("rejects malformed ids and missing metadata", () => {
  assert.throws(
    () => assertValidMigrations([{ id: "create-workspaces", description: "x", up: noop }]),
    /must look like 001-lowercase-kebab-case/,
  );
  assert.throws(
    () => assertValidMigrations([{ id: "001-a", description: "", up: noop }]),
    /has no description/,
  );
  assert.throws(
    () => assertValidMigrations([{ id: "001-a", description: "x" } as any]),
    /has no up\(\) function/,
  );
});

test("plans only the migrations that are not in the ledger yet", () => {
  const plan = planMigrations(registry, ["001-create-workspaces"]);

  assert.deepEqual(
    plan.pending.map((item) => item.id),
    ["002-add-something", "003-add-something-else"],
  );
  assert.deepEqual(plan.alreadyApplied, ["001-create-workspaces"]);
  assert.deepEqual(plan.unknownApplied, []);
});

test("accepts both ledger documents and plain id strings", () => {
  const fromDocuments = planMigrations(registry, [
    { id: "001-create-workspaces", appliedAt: new Date("2026-01-01T00:00:00Z") },
    { id: "002-add-something", appliedAt: new Date("2026-01-02T00:00:00Z") },
  ]);
  const fromIds = planMigrations(registry, ["001-create-workspaces", "002-add-something"]);

  assert.deepEqual(
    fromDocuments.pending.map((item) => item.id),
    fromIds.pending.map((item) => item.id),
  );
});

test("reports ledger entries that no longer exist in the code", () => {
  const plan = planMigrations(registry, [
    "001-create-workspaces",
    "002-add-something",
    "003-add-something-else",
    "004-removed-long-ago",
  ]);

  assert.deepEqual(plan.pending, []);
  assert.deepEqual(plan.unknownApplied, ["004-removed-long-ago"]);
});

test("an empty ledger plans everything, a full ledger plans nothing", () => {
  assert.equal(planMigrations(registry, []).pending.length, registry.length);
  assert.equal(
    planMigrations(registry, registry.map((item) => item.id)).pending.length,
    0,
  );
});

test("formatPlanSummary reports pending / applied / unknown counts", () => {
  assert.equal(formatPlanSummary(planMigrations(registry, [])), "3 pending, 0 applied");
  assert.equal(
    formatPlanSummary(planMigrations(registry, ["001-create-workspaces", "009-gone"])),
    "2 pending, 1 applied, 1 unknown",
  );
});
