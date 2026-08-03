import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_MAX_AGENT_ITERATIONS,
  normalizeMaxAgentIterations,
} from "../src/utils/agentConfig";

test("normalizes configured agent iteration limits", () => {
  assert.equal(normalizeMaxAgentIterations(undefined), DEFAULT_MAX_AGENT_ITERATIONS);
  assert.equal(normalizeMaxAgentIterations("40"), 40);
  assert.equal(normalizeMaxAgentIterations(2), 5);
  assert.equal(normalizeMaxAgentIterations(999), 200);
  assert.equal(normalizeMaxAgentIterations(25.6), 26);
});
