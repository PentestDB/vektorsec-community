/**
 * Unit tests for the agent tools panel helpers (`src/utils/agentTools.js`).
 *
 * These are pure functions, so they run on plain Node (no build step, no deps):
 *   cd frontend && node --test tests/
 *
 * Regression focus: every tool returned by the backend must be rendered
 * somewhere in the panel — a tool that is missing from the curated metadata
 * ends up in the "Other tools" group instead of disappearing.
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  TOOL_GROUP_META,
  TOOL_META,
  OTHER_GROUP_ID,
  buildToolGroups,
  buildDisabledToolNames,
  countTools,
} from "../src/utils/agentTools.js";

const backendPayload = [
  { name: "run_bash", description: "Run a command", enabled: true, configured: true },
  { name: "nmap_scan", description: "Port scan", enabled: true, configured: true },
  { name: "nuclei_scan", description: "Template scan", enabled: false, configured: true },
  { name: "mythic_task", description: "Task an implant", enabled: true, configured: false },
  { name: "brand_new_tool_from_backend", description: "Registered later", enabled: true, configured: true },
];

test("metadata is internally consistent", () => {
  const groupIds = new Set(TOOL_GROUP_META.map((group) => group.id));
  assert.ok(groupIds.has(OTHER_GROUP_ID), "the fallback group must exist");

  for (const [toolName, meta] of Object.entries(TOOL_META)) {
    assert.ok(groupIds.has(meta.group), `${toolName} points at unknown group "${meta.group}"`);
    assert.equal(typeof meta.label, "string");
    assert.ok(meta.label.length > 0, `${toolName} needs a label`);
  }
});

test("every tool from the backend is rendered exactly once", () => {
  const groups = buildToolGroups(backendPayload);
  const rendered = groups.flatMap((group) => group.tools.map((tool) => tool.name));
  assert.equal(rendered.length, backendPayload.length);
  assert.deepEqual(
    [...rendered].sort(),
    backendPayload.map((tool) => tool.name).sort(),
  );
  assert.equal(new Set(rendered).size, rendered.length, "no duplicates");
});

test("unknown tools fall back to the Other tools group", () => {
  const groups = buildToolGroups([
    { name: "brand_new_tool_from_backend", enabled: true },
  ]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].id, OTHER_GROUP_ID);
  assert.equal(groups[0].tools[0].label, "brand_new_tool_from_backend");
});

test("empty groups are dropped and order follows TOOL_GROUP_META", () => {
  const groups = buildToolGroups(backendPayload);
  assert.ok(groups.every((group) => group.tools.length > 0));

  const expectedOrder = TOOL_GROUP_META.map((group) => group.id).filter((id) =>
    groups.some((group) => group.id === id),
  );
  assert.deepEqual(groups.map((group) => group.id), expectedOrder);
});

test("tools are sorted by label inside a group", () => {
  const recon = buildToolGroups(backendPayload).find((group) => group.id === "recon");
  assert.deepEqual(
    recon.tools.map((tool) => tool.label),
    ["Nmap Scan", "Nuclei Scan"],
  );
});

test("enabled/configured default to true when the backend omits them", () => {
  const [group] = buildToolGroups([{ name: "run_bash" }]);
  assert.equal(group.tools[0].enabled, true);
  assert.equal(group.tools[0].configured, true);
});

test("countTools reports enabled vs total", () => {
  assert.deepEqual(countTools(backendPayload), { total: 5, enabled: 4 });
  assert.deepEqual(countTools(undefined), { total: 0, enabled: 0 });
});

test("buildDisabledToolNames is the exact API payload for disabled tools", () => {
  assert.deepEqual(buildDisabledToolNames(backendPayload), ["nuclei_scan"]);
  assert.deepEqual(buildDisabledToolNames([]), []);
});

test("malformed entries are ignored instead of crashing the panel", () => {
  const groups = buildToolGroups([null, undefined, {}, { name: "run_bash" }, "nope"]);
  const rendered = groups.flatMap((group) => group.tools.map((tool) => tool.name));
  assert.deepEqual(rendered, ["run_bash"]);
});
