import assert from "node:assert/strict";
import test from "node:test";
import {
  resolveEffectiveScopeConfig,
  buildGuardrailPromptBlock,
  scopeBlockedResult,
} from "../src/utils/guardrails";
import { validateCommandScope, parseScopeString } from "../src/utils/scopeValidator";

test("resolveEffectiveScopeConfig prefers an enabled workspace scope", () => {
  const cfg = resolveEffectiveScopeConfig({
    enabled: true,
    strictMode: true,
    entriesRaw: "example.com 10.0.0.0/24 *.corp.test",
  });
  assert.equal(cfg.enabled, true);
  assert.equal(cfg.strictMode, true);
  assert.deepEqual(
    cfg.entries.map((e) => e.value),
    ["example.com", "10.0.0.0/24", "corp.test"],
  );
});

test("resolveEffectiveScopeConfig falls back to global env when workspace scope is disabled", () => {
  const cfg = resolveEffectiveScopeConfig({ enabled: false, entriesRaw: "only.invalid" });
  // Global env default scope is disabled unless SCOPE_ENABLED=1.
  assert.equal(cfg.enabled, false);
});

test("guardrails prompt block renders scope + autonomous instructions", () => {
  const scope = resolveEffectiveScopeConfig({
    enabled: true,
    strictMode: true,
    entriesRaw: "example.com 10.10.0.0/16",
  });

  const autoBlock = buildGuardrailPromptBlock({ autonomousMode: true, scope });
  assert.match(autoBlock, /<authorized_scope>/);
  assert.match(autoBlock, /<autonomous_mode>/);
  assert.match(autoBlock, /WAF bypass/);
  assert.match(autoBlock, /origin-IP/);
  assert.match(autoBlock, /AUTONOMOUS MODE/);
  assert.match(autoBlock, /never covers/i);
});

test("guardrails prompt block is empty when nothing is enforced", () => {
  const scope = resolveEffectiveScopeConfig({ enabled: false });
  assert.equal(buildGuardrailPromptBlock({ autonomousMode: false, scope }), "");
});

test("scopeBlockedResult is a non-zero exit with a BLOCKED prefix", () => {
  const res = scopeBlockedResult("Target 8.8.8.8 is OUT OF SCOPE");
  assert.equal(res.exitCode, 1);
  assert.match(res.output, /^BLOCKED:/);
  assert.match(res.output, /OUT OF SCOPE/);
});

test("validateCommandScope blocks out-of-scope targets and allows in-scope ones", () => {
  const scope = {
    enabled: true,
    strictMode: true,
    entries: parseScopeString("example.com 10.10.0.0/16"),
  };
  assert.equal(validateCommandScope("nmap -sV example.com", scope).allowed, true);
  assert.equal(validateCommandScope("nmap -sV 10.10.5.5", scope).allowed, true);
  assert.equal(validateCommandScope("nmap -sV 8.8.8.8", scope).allowed, false);
  assert.equal(validateCommandScope("nmap -sV sub.example.com", scope).allowed, true);
});