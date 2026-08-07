import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// The Mythic client resolves its config from <DATA_DIR>/.env, so point DATA_DIR at a
// scratch directory before anything imports it. This keeps the tests deterministic
// regardless of whether the developer has a real Mythic server configured.
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "mythic-tools-test-"));
process.env.DATA_DIR = dataDir;

function writeEnv(vars: Record<string, string>) {
  const body = Object.entries(vars)
    .map(([key, value]) => `${key}="${value}"`)
    .join("\n");
  fs.writeFileSync(path.join(dataDir, ".env"), `${body}\n`, "utf8");
}

writeEnv({});

/* eslint-disable @typescript-eslint/no-var-requires */
const mythicCallbacks = require("../src/tools/handlers/mythic-callbacks").default;
const mythicTask = require("../src/tools/handlers/mythic-task").default;
const mythicTaskResults = require("../src/tools/handlers/mythic-task-results").default;
const mythicPivot = require("../src/tools/handlers/mythic-pivot").default;
const mythicPayload = require("../src/tools/handlers/mythic-payload").default;
const mythicLoot = require("../src/tools/handlers/mythic-loot").default;
const mythicGraphqlTool = require("../src/tools/handlers/mythic-graphql").default;
const { getUnconfiguredToolNames, MYTHIC_TOOLS } = require("../src/utils/toolAvailability");
/* eslint-enable @typescript-eslint/no-var-requires */

import type { ExecutionContext } from "../src/tools/types";

const ctx = { sessionId: "session-1" } as ExecutionContext;

test("every Mythic tool refuses cleanly when unconfigured", async () => {
  writeEnv({});
  const tools = [
    mythicCallbacks,
    mythicTask,
    mythicTaskResults,
    mythicPivot,
    mythicPayload,
    mythicLoot,
    mythicGraphqlTool,
  ];
  for (const tool of tools) {
    const result = await tool.execute(
      { action: "list", query: "{ __typename }", callback_display_id: 1, command: "ls" },
      ctx,
    );
    assert.equal(result.exitCode, 1, `${tool.name} should fail when unconfigured`);
    assert.match(result.output, /not configured/i, `${tool.name} should say it is not configured`);
  }
});

test("Mythic tools are hidden from the LLM until URL and token are both set", () => {
  writeEnv({});
  let unconfigured = getUnconfiguredToolNames();
  for (const name of MYTHIC_TOOLS) {
    assert.ok(unconfigured.includes(name), `${name} should be unconfigured with no env`);
  }

  // URL alone is not enough — a token is required too.
  writeEnv({ MYTHIC_URL: "https://mythic.example:7443" });
  unconfigured = getUnconfiguredToolNames();
  assert.ok(unconfigured.includes("mythic_task"), "URL without a token must still count as unconfigured");

  writeEnv({ MYTHIC_URL: "https://mythic.example:7443", MYTHIC_API_TOKEN: "mtk_test" });
  unconfigured = getUnconfiguredToolNames();
  for (const name of MYTHIC_TOOLS) {
    assert.ok(!unconfigured.includes(name), `${name} should be available once configured`);
  }
});

test("tasking validates its arguments before touching the network", async () => {
  writeEnv({ MYTHIC_URL: "https://127.0.0.1:1", MYTHIC_API_TOKEN: "mtk_test" });

  const missingCallback = await mythicTask.execute({ action: "issue", command: "whoami" }, ctx);
  assert.equal(missingCallback.exitCode, 1);
  assert.match(missingCallback.output, /callback_display_id is required/);

  const missingCommand = await mythicTask.execute({ action: "issue", callback_display_id: 1 }, ctx);
  assert.equal(missingCommand.exitCode, 1);
  assert.match(missingCommand.output, /command is required/);

  const unknownAction = await mythicTask.execute({ action: "nope" }, ctx);
  assert.equal(unknownAction.exitCode, 1);
  assert.match(unknownAction.output, /Unknown action/);

  const missingTaskId = await mythicTaskResults.execute({ action: "output" }, ctx);
  assert.equal(missingTaskId.exitCode, 1);
  assert.match(missingTaskId.output, /task_display_id is required/);
});

test("pivot validates the port before tasking", async () => {
  writeEnv({ MYTHIC_URL: "https://127.0.0.1:1", MYTHIC_API_TOKEN: "mtk_test" });

  const noPort = await mythicPivot.execute({ action: "socks_start", callback_display_id: 1 }, ctx);
  assert.equal(noPort.exitCode, 1);
  assert.match(noPort.output, /valid port is required/);

  const badPort = await mythicPivot.execute(
    { action: "socks_start", callback_display_id: 1, port: 99999 },
    ctx,
  );
  assert.equal(badPort.exitCode, 1);
  assert.match(badPort.output, /valid port is required/);
});

test("an unreachable Mythic server produces a friendly message, not a stack", async () => {
  // Port 1 on loopback refuses immediately, exercising the transport error mapping.
  writeEnv({ MYTHIC_URL: "https://127.0.0.1:1", MYTHIC_API_TOKEN: "mtk_test" });

  const result = await mythicCallbacks.execute({ action: "list" }, ctx);
  assert.equal(result.exitCode, 1);
  assert.match(result.output, /unreachable|TLS error/i);
  assert.doesNotMatch(result.output, /at Object\.|node_modules|Error:\s*connect/i);
});

test("all tasking is consent-gated; high-impact commands are additionally hard-gated", () => {
  // Every task issued to a live implant goes through the approval ladder...
  assert.equal(mythicTask.requiresConsent, true);

  // ...and dangerous commands additionally trip the deterministic safety hook, which
  // cannot be auto-approved and blocks subagents and swarm racers outright.
  assert.equal(
    mythicTask.shouldRequireConsent!({ action: "issue", command: "execute_assembly" }, ctx),
    true,
  );
  assert.equal(mythicTask.shouldRequireConsent!({ action: "issue_and_wait", command: "psexec" }, ctx), true);
  assert.equal(mythicTask.shouldRequireConsent!({ action: "issue", command: "ls" }, ctx), false);
});

test("read-only tools never prompt", () => {
  // requiresConsent is tool-level, so reads live in their own tools to keep polling
  // and enumeration free of approval prompts.
  for (const tool of [mythicCallbacks, mythicTaskResults, mythicGraphqlTool]) {
    assert.notEqual(tool.requiresConsent, true, `${tool.name} should not be tool-level consent-gated`);
  }
  assert.equal(mythicTaskResults.shouldRequireConsent, undefined);
  assert.equal(mythicCallbacks.shouldRequireConsent, undefined);
});

test("mixed read/write tools gate only their write actions", () => {
  for (const tool of [mythicPivot, mythicPayload, mythicLoot]) {
    assert.notEqual(tool.requiresConsent, true, `${tool.name} must not prompt on its read actions`);
  }

  assert.equal(mythicPivot.shouldRequireConsent!({ action: "socks_start" }, ctx), true);
  assert.equal(mythicPivot.shouldRequireConsent!({ action: "rpfwd_start" }, ctx), true);
  assert.equal(mythicPivot.shouldRequireConsent!({ action: "list" }, ctx), false);

  assert.equal(mythicPayload.shouldRequireConsent!({ action: "create" }, ctx), true);
  assert.equal(mythicPayload.shouldRequireConsent!({ action: "download" }, ctx), true);
  assert.equal(mythicPayload.shouldRequireConsent!({ action: "list" }, ctx), false);

  assert.equal(mythicLoot.shouldRequireConsent!({ action: "upload_file" }, ctx), true);
  assert.equal(mythicLoot.shouldRequireConsent!({ action: "download_file" }, ctx), false);
  assert.equal(mythicLoot.shouldRequireConsent!({ action: "list_credentials" }, ctx), false);
});

test("raw GraphQL passthrough hard-gates mutations but not queries", () => {
  assert.equal(mythicGraphqlTool.shouldRequireConsent!({ query: "{ callback { id } }" }, ctx), false);
  assert.equal(
    mythicGraphqlTool.shouldRequireConsent!({ query: "mutation { createTask(command: \"ls\") { id } }" }, ctx),
    true,
  );
  assert.equal(
    mythicGraphqlTool.shouldRequireConsent!({ query: "  mutation Foo($a: Int) { bar }" }, ctx),
    true,
  );
});

test.after(() => {
  fs.rmSync(dataDir, { recursive: true, force: true });
});
