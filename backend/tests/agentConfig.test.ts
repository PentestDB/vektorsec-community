import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_MAX_AGENT_ITERATIONS,
  normalizeMaxAgentIterations,
  DEFAULT_WORKSPACE_MAX_TURNS,
  WORKSPACE_MAX_TURNS_CHOICES,
  normalizeWorkspaceMaxTurns,
} from "../src/utils/agentConfig";

test("normalizes configured agent iteration limits", () => {
  assert.equal(normalizeMaxAgentIterations(undefined), DEFAULT_MAX_AGENT_ITERATIONS);
  assert.equal(normalizeMaxAgentIterations("40"), 40);
  assert.equal(normalizeMaxAgentIterations(2), 5);
  assert.equal(normalizeMaxAgentIterations(999), 200);
  assert.equal(normalizeMaxAgentIterations(25.6), 26);
});

test("workspace max turns accepts only the 25/50/100 presets", () => {
  assert.deepEqual(WORKSPACE_MAX_TURNS_CHOICES, [25, 50, 100]);
  assert.equal(DEFAULT_WORKSPACE_MAX_TURNS, 25);

  // Unset / empty → workspace does not override (falls back to user level).
  assert.equal(normalizeWorkspaceMaxTurns(undefined), undefined);
  assert.equal(normalizeWorkspaceMaxTurns(null), undefined);
  assert.equal(normalizeWorkspaceMaxTurns(""), undefined);
  assert.equal(normalizeWorkspaceMaxTurns("abc"), undefined);

  // Allowed presets.
  assert.equal(normalizeWorkspaceMaxTurns(25), 25);
  assert.equal(normalizeWorkspaceMaxTurns("25"), 25);
  assert.equal(normalizeWorkspaceMaxTurns(50), 50);
  assert.equal(normalizeWorkspaceMaxTurns("100"), 100);

  // Anything else falls back to the workspace default (25).
  assert.equal(normalizeWorkspaceMaxTurns(40), DEFAULT_WORKSPACE_MAX_TURNS);
  assert.equal(normalizeWorkspaceMaxTurns(1), DEFAULT_WORKSPACE_MAX_TURNS);
  assert.equal(normalizeWorkspaceMaxTurns("200"), DEFAULT_WORKSPACE_MAX_TURNS);
});
