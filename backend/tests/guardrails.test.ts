import assert from "node:assert/strict";
import test from "node:test";
import {
  resolveEffectiveScopeConfig,
  buildGuardrailPromptBlock,
  scopeBlockedResult,
} from "../src/utils/guardrails";
import {
  validateCommandScope,
  parseScopeString,
  createDefaultScopeConfig,
  buildScopeConfig,
} from "../src/utils/scopeValidator";
import {
  getScopeGuardState,
  isScopeGuardLocked,
  isScopeGuardUnlockFlagOff,
  resolveScopeGuardState,
  scopeGuardNotice,
  scopeGuardUnlockFailureDetail,
  scopeGuardUnlockWarning,
  SCOPE_GUARD_LOCK_ENV,
  SCOPE_GUARD_NOTICE,
  SCOPE_GUARD_UI_LOCK_ENV,
  SCOPE_GUARD_UNLOCK_TOKEN_ENV,
  SCOPE_GUARD_UNLOCK_TOKEN_FAILED_LOG,
  SCOPE_GUARD_UNLOCKED_NOTICE,
  SECURITY_CONTACT_URL,
} from "../src/utils/securityPolicy";
import { UNLOCK_MASTER_KEY_ENV, signUnlockToken } from "../src/utils/unlockToken";

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

test("resolveEffectiveScopeConfig falls back to the locked global default", () => {
  const cfg = resolveEffectiveScopeConfig({ enabled: false, entriesRaw: "only.invalid" });
  // Scope Guard is locked on in this distribution: a workspace scope that is
  // switched off falls back to the global default, which is always enforced.
  assert.equal(cfg.enabled, true);
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
  // Built directly: the global default can no longer be disabled, so this
  // exercises the builder's "nothing enforced" branch.
  const scope = { enabled: false, strictMode: false, entries: [] };
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

test("Scope Guard cannot be disabled: SCOPE_ENABLED=0 is ignored", () => {
  const previous = process.env.SCOPE_ENABLED;
  process.env.SCOPE_ENABLED = "0";
  try {
    // Global default, workspace fallback and an explicit "off" all stay on.
    assert.equal(createDefaultScopeConfig().enabled, true);
    assert.equal(resolveEffectiveScopeConfig({ enabled: false }).enabled, true);
    assert.equal(buildScopeConfig({ enabled: false, entries: "example.com" }).enabled, true);
  } finally {
    if (previous === undefined) delete process.env.SCOPE_ENABLED;
    else process.env.SCOPE_ENABLED = previous;
  }
});

test("a locked build ignores an enabled-but-empty workspace override", () => {
  const previous = process.env.SCOPE_ENTRIES;
  process.env.SCOPE_ENTRIES = "global.example.com";
  try {
    const cfg = resolveEffectiveScopeConfig({ enabled: true, entriesRaw: "   " });
    // Not "everything allowed": the global (locked) allowlist takes over.
    assert.equal(cfg.enabled, true);
    assert.deepEqual(
      cfg.entries.map((e) => e.value),
      ["global.example.com"],
    );
  } finally {
    if (previous === undefined) delete process.env.SCOPE_ENTRIES;
    else process.env.SCOPE_ENTRIES = previous;
  }
});

test("the locked distribution publishes a contact channel", () => {
  assert.equal(isScopeGuardLocked(), true);
  assert.match(SECURITY_CONTACT_URL, /^https:\/\//);
  assert.match(SCOPE_GUARD_NOTICE, /Scope Guard is enforced/);
  assert.ok(
    SCOPE_GUARD_NOTICE.includes(SECURITY_CONTACT_URL),
    "the notice must tell operators where to ask for an unrestricted build",
  );
});

const MASTER_SECRET = "unit-test-master-secret-0123456789";

test("the unlock flag is fail-closed: only explicit off-values count", () => {
  assert.equal(SCOPE_GUARD_LOCK_ENV, "SCOPE_GUARD_LOCK");

  // Only an explicit off-value unlocks (case/space-insensitive).
  for (const off of ["0", "false", "FALSE", "off", " no "]) {
    assert.equal(isScopeGuardUnlockFlagOff(off), true, `${off} should count as off`);
  }

  // Anything else — including a typo or an empty value — keeps the guard ON.
  for (const on of ["1", "true", "yes", "", "  ", undefined, "please-unlock"]) {
    assert.equal(isScopeGuardUnlockFlagOff(on), false, `${String(on)} should count as on`);
  }
});

test("both flags together do NOT unlock: the token is required", () => {
  // Conditions 1 + 2 only → no token configured at all.
  const flagged: NodeJS.ProcessEnv = {
    [SCOPE_GUARD_LOCK_ENV]: "0",
    [SCOPE_GUARD_UI_LOCK_ENV]: "0",
  };
  const missing = resolveScopeGuardState(flagged);
  assert.equal(missing.locked, true);
  assert.equal(missing.reason, "token-missing");
  assert.equal(missing.unlockFailed, true);
  assert.equal(missing.token.present, false);
  assert.equal(missing.token.valid, false);

  // A syntactically plausible token whose payload carries no unlock claims.
  const forged = resolveScopeGuardState({
    ...flagged,
    [SCOPE_GUARD_UNLOCK_TOKEN_ENV]: "VEK1.eyJ2IjoxfQ.BBBB",
  });
  assert.equal(forged.locked, true);
  assert.equal(forged.reason, "token-invalid");
  assert.equal(forged.token.reason, "wrong-subject");

  // A payload that is not even decodable/parseable.
  const malformed = resolveScopeGuardState({
    ...flagged,
    [SCOPE_GUARD_UNLOCK_TOKEN_ENV]: "VEK1.####.BBBB",
  });
  assert.equal(malformed.locked, true);
  assert.equal(malformed.reason, "token-invalid");
  assert.equal(malformed.token.reason, "malformed");

  // A well-formed token signed by the WRONG key (attacker / leaked key file).
  const wrongKey = resolveScopeGuardState({
    ...flagged,
    [SCOPE_GUARD_UNLOCK_TOKEN_ENV]: signUnlockToken({
      client: "Pirate Inc",
      secret: "attacker-master-secret-0123456789",
    }),
    [UNLOCK_MASTER_KEY_ENV]: MASTER_SECRET,
  });
  assert.equal(wrongKey.locked, true);
  assert.equal(wrongKey.reason, "token-invalid");
  assert.equal(wrongKey.token.reason, "bad-signature");

  // A token that is valid but expired.
  const expired = resolveScopeGuardState({
    ...flagged,
    [SCOPE_GUARD_UNLOCK_TOKEN_ENV]: signUnlockToken({
      client: "Acme",
      secret: MASTER_SECRET,
      ttlSeconds: 60,
      issuedAtSeconds: 1,
    }),
    [UNLOCK_MASTER_KEY_ENV]: MASTER_SECRET,
  });
  assert.equal(expired.locked, true);
  assert.equal(expired.token.reason, "expired");

  // …and the guard is ON in every one of those cases.
  assert.equal(isScopeGuardLocked(), true);
});

test("all three conditions together unlock — and any missing one re-locks", () => {
  const token = signUnlockToken({ client: "Acme Corp", secret: MASTER_SECRET, ttlSeconds: 3600 });
  const base: NodeJS.ProcessEnv = {
    [SCOPE_GUARD_LOCK_ENV]: "0",
    [SCOPE_GUARD_UI_LOCK_ENV]: "0",
    [SCOPE_GUARD_UNLOCK_TOKEN_ENV]: token,
    [UNLOCK_MASTER_KEY_ENV]: MASTER_SECRET,
  };

  // Condition 1 + 2 + 3 → unlocked.
  const unlocked = resolveScopeGuardState(base);
  assert.equal(unlocked.locked, false);
  assert.equal(unlocked.reason, "unlock-conditions-met");
  assert.equal(unlocked.unlockFailed, false);
  assert.equal(unlocked.token.valid, true);
  assert.equal(unlocked.token.client, "Acme Corp");

  // Condition 1 missing / not an off-value → locked.
  const lockFlagOn = resolveScopeGuardState({ ...base, [SCOPE_GUARD_LOCK_ENV]: "1" });
  assert.equal(lockFlagOn.locked, true);
  assert.equal(lockFlagOn.reason, "lock-flag-on");
  for (const value of [undefined, "true", "maybe"]) {
    const state = resolveScopeGuardState({ ...base, [SCOPE_GUARD_LOCK_ENV]: value });
    assert.equal(state.locked, true, `SCOPE_GUARD_LOCK=${String(value)} must stay locked`);
  }

  // Condition 2 missing: the deployed UI was not built with build:unlocked.
  const noUi = resolveScopeGuardState({ ...base, [SCOPE_GUARD_UI_LOCK_ENV]: undefined });
  assert.equal(noUi.locked, true);
  assert.equal(noUi.reason, "ui-build-locked");

  // Condition 3 missing: both flags set, token never deployed.
  const noToken = resolveScopeGuardState({ ...base, [SCOPE_GUARD_UNLOCK_TOKEN_ENV]: undefined });
  assert.equal(noToken.locked, true);
  assert.equal(noToken.reason, "token-missing");
  assert.equal(noToken.lockFlagOff, true);
  assert.equal(noToken.uiBuildUnlocked, true);
  assert.equal(noToken.unlockFailed, true);

  // Condition 3 invalid: the master key was rotated (or the token forged).
  const rotated = resolveScopeGuardState({
    ...base,
    [UNLOCK_MASTER_KEY_ENV]: "rotated-master-secret-0123456789",
  });
  assert.equal(rotated.locked, true);
  assert.equal(rotated.reason, "token-invalid");
  assert.equal(rotated.token.reason, "bad-signature");
});

test("a failed unlock attempt is announced (console + admin notice)", () => {
  const state = resolveScopeGuardState({
    [SCOPE_GUARD_LOCK_ENV]: "0",
    [SCOPE_GUARD_UI_LOCK_ENV]: "0",
    [SCOPE_GUARD_UNLOCK_TOKEN_ENV]: "VEK1.eyJ2IjoxfQ.BBBB",
  });

  assert.match(scopeGuardUnlockWarning(state) ?? "", /^WARN: Scope Guard unlock attempt failed/);
  assert.match(SCOPE_GUARD_UNLOCK_TOKEN_FAILED_LOG, /Invalid or missing UNLOCK_TOKEN/);
  assert.match(scopeGuardNotice(state), /Invalid or missing UNLOCK_TOKEN/);
  assert.match(scopeGuardNotice(state), /fail-closed/);
  assert.match(scopeGuardUnlockFailureDetail(state), /SCOPE_GUARD_UNLOCK_TOKEN/);

  // A healthy locked instance stays quiet about failed attempts…
  assert.equal(scopeGuardUnlockWarning(resolveScopeGuardState({})), null);
  // …and never claims the guard is off.
  assert.match(scopeGuardNotice(resolveScopeGuardState({})), /Scope Guard is enforced/);
});

test("the code switch unlocks without flag or token (vendor builds)", () => {
  const state = resolveScopeGuardState({}, false);
  assert.equal(state.locked, false);
  assert.equal(state.reason, "unlocked-in-code");
  assert.equal(state.unlockFailed, false);
});

test("getScopeGuardState() resolves lazily from the live environment", () => {
  const previousLock = process.env[SCOPE_GUARD_LOCK_ENV];
  const previousUi = process.env[SCOPE_GUARD_UI_LOCK_ENV];
  const previousToken = process.env[SCOPE_GUARD_UNLOCK_TOKEN_ENV];
  try {
    process.env[SCOPE_GUARD_LOCK_ENV] = "0";
    process.env[SCOPE_GUARD_UI_LOCK_ENV] = "0";
    delete process.env[SCOPE_GUARD_UNLOCK_TOKEN_ENV];

    const state = getScopeGuardState();
    assert.equal(state.locked, true);
    assert.equal(state.reason, "token-missing");
    assert.equal(isScopeGuardLocked(), true);
  } finally {
    const restore = (name: string, value: string | undefined) => {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    };
    restore(SCOPE_GUARD_LOCK_ENV, previousLock);
    restore(SCOPE_GUARD_UI_LOCK_ENV, previousUi);
    restore(SCOPE_GUARD_UNLOCK_TOKEN_ENV, previousToken);
  }
});

test("the unlocked notice names the flag that produced it", () => {
  assert.match(SCOPE_GUARD_UNLOCKED_NOTICE, /NOT enforced/);
  assert.ok(
    SCOPE_GUARD_UNLOCKED_NOTICE.includes(SCOPE_GUARD_LOCK_ENV),
    "unlocked builds must tell the operator which flag turned the guard off",
  );
});