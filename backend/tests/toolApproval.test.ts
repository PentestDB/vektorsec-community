import assert from "node:assert/strict";
import test from "node:test";
import type { ExecutionContext, ToolDefinition } from "../src/tools/types";
import {
  decideToolConsent,
  parseToolSafetyAssessment,
} from "../src/services/tool-approval.service";
import { buildPendingConsentBatch } from "../src/services/agent.tools";

const tool: ToolDefinition = {
  name: "run_bash",
  description: "Run a command",
  parameters: { type: "object" },
  requiresConsent: true,
  async execute() {
    return { output: "ok", exitCode: 0 };
  },
};

const context = { sessionId: "session-1" } as ExecutionContext;

test("auto mode preserves automatic execution for consent-marked tools", async () => {
  const result = await decideToolConsent({
    mode: "auto", tool, args: { command: "pwd" }, context, safetyTriggered: false,
  });
  assert.equal(result.requireConsent, false);
});

test("requires consent mode asks for every action", async () => {
  const result = await decideToolConsent({
    mode: "requires_consent", tool, args: {}, context, safetyTriggered: false,
  });
  assert.equal(result.requireConsent, true);
  assert.equal(result.source, "mode");
});

test("built-in safety block overrides every execution mode", async () => {
  let called = false;
  const result = await decideToolConsent({
    mode: "auto_approve",
    tool,
    args: { command: "rm -rf /" },
    context,
    safetyTriggered: true,
    evaluator: async () => {
      called = true;
      return { safe: true, reason: "incorrect" };
    },
  });
  assert.equal(result.requireConsent, true);
  assert.equal(result.source, "safety");
  assert.equal(called, false);
});

test("auto approve runs only an explicitly safe AI verdict", async () => {
  const safe = await decideToolConsent({
    mode: "auto_approve",
    tool,
    args: { command: "pwd" },
    context,
    safetyTriggered: false,
    evaluator: async () => ({ safe: true, reason: "Read-only workspace inspection." }),
  });
  const unsafe = await decideToolConsent({
    mode: "auto_approve",
    tool,
    args: { command: "sudo reboot" },
    context,
    safetyTriggered: false,
    evaluator: async () => ({ safe: false, reason: "Disruptive system action." }),
  });
  assert.equal(safe.requireConsent, false);
  assert.equal(unsafe.requireConsent, true);
  assert.match(unsafe.reason, /Disruptive/);
});

test("auto approve fails closed when review is unavailable or throws", async () => {
  const unavailable = await decideToolConsent({
    mode: "auto_approve", tool, args: {}, context, safetyTriggered: false,
  });
  const failed = await decideToolConsent({
    mode: "auto_approve",
    tool,
    args: {},
    context,
    safetyTriggered: false,
    evaluator: async () => { throw new Error("provider offline"); },
  });
  assert.equal(unavailable.requireConsent, true);
  assert.equal(unavailable.source, "fallback");
  assert.equal(failed.requireConsent, true);
  assert.match(failed.reason, /provider offline/);
});

test("AI response parser accepts strict boolean JSON and rejects ambiguity", () => {
  assert.deepEqual(
    parseToolSafetyAssessment('{"safe":true,"reason":"Read only"}'),
    { safe: true, reason: "Read only" },
  );
  assert.throws(
    () => parseToolSafetyAssessment('{"safe":"true","reason":"maybe"}'),
    /boolean safe verdict/,
  );
  assert.throws(() => parseToolSafetyAssessment("probably safe"), /not JSON/);
});

test("consent batches retain every action, reason, arguments, and safety flag", () => {
  const batch = buildPendingConsentBatch(
    [
      {
        toolCallId: "one",
        toolName: "run_bash",
        result: { output: "", exitCode: 0 },
        needsConsent: true,
        approvalReason: "Writes outside the workspace.",
        safetyBlock: false,
      },
      {
        toolCallId: "two",
        toolName: "write_to_shell",
        result: { output: "", exitCode: 0 },
        needsConsent: true,
        approvalReason: "Potentially destructive command.",
        safetyBlock: true,
      },
    ],
    [
      { id: "one", name: "run_bash", arguments: '{"command":"touch /tmp/a"}' },
      { id: "two", name: "write_to_shell", arguments: '{"shell_id":"s1","input":"rm -rf /"}' },
    ],
  );
  assert.equal(batch.length, 2);
  assert.deepEqual(batch[0].arguments, { command: "touch /tmp/a" });
  assert.equal(batch[0].approvalReason, "Writes outside the workspace.");
  assert.equal(batch[1].safetyBlock, true);
  assert.match(batch[1].approvalReason ?? "", /destructive/);
});
