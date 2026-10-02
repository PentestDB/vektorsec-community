import assert from "node:assert/strict";
import { test } from "node:test";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { scopeUnlockWarning } from "../src/constants/security.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SECURITY_MODULE = pathToFileURL(
  path.join(HERE, "..", "src", "constants", "security.js"),
).href;

/** Read `SCOPE_GUARD_LOCKED` from a fresh process with a given build flag. */
function readLockedWithFlag(value) {
  const code =
    `import { SCOPE_GUARD_LOCKED } from ${JSON.stringify(SECURITY_MODULE)};` +
    `process.stdout.write(String(SCOPE_GUARD_LOCKED));`;
  return execFileSync(process.execPath, ["--input-type=module", "-e", code], {
    env: { ...process.env, NEXT_PUBLIC_SCOPE_GUARD_LOCK: value },
    encoding: "utf8",
  }).trim();
}

test("a healthy locked instance produces no unlock warning", () => {
  assert.equal(scopeUnlockWarning(null), null);
  assert.equal(scopeUnlockWarning(undefined), null);
  assert.equal(scopeUnlockWarning({}), null);
  // `attempted: false` = nobody tried to unlock (the normal distribution case).
  assert.equal(
    scopeUnlockWarning({
      attempted: false,
      tokenValid: false,
      message: null,
      detail: null,
    }),
    null,
  );
});

test("a refused unlock attempt surfaces the backend message", () => {
  const warning = scopeUnlockWarning({
    attempted: true,
    lockFlagOff: true,
    uiBuildUnlocked: true,
    tokenPresent: false,
    tokenValid: false,
    tokenReason: null,
    reason: "token-missing",
    detail: "SCOPE_GUARD_UNLOCK_TOKEN: the token is not configured on this instance",
    message: "WARN: Scope Guard unlock attempt failed — Invalid or missing UNLOCK_TOKEN",
  });

  assert.match(warning, /^WARN: Scope Guard unlock attempt failed/);
  assert.match(warning, /Invalid or missing UNLOCK_TOKEN/);
  assert.match(warning, /SCOPE_GUARD_UNLOCK_TOKEN: the token is not configured/);
});

test("the details of the missing conditions are appended once", () => {
  const shared = {
    attempted: true,
    detail: "SCOPE_GUARD_LOCK=0 is not set",
  };

  const appended = scopeUnlockWarning({
    ...shared,
    message: "Scope Guard unlock attempt failed",
  });
  assert.equal(appended, "Scope Guard unlock attempt failed Missing: SCOPE_GUARD_LOCK=0 is not set.");

  // …and never duplicated when the message already spells the detail out.
  const message = "Scope Guard unlock attempt failed — SCOPE_GUARD_LOCK=0 is not set";
  assert.equal(scopeUnlockWarning({ ...shared, message }), message);
});

test("a bare attempt still explains the fail-closed outcome", () => {
  assert.match(
    scopeUnlockWarning({ attempted: true }),
    /stays ENABLED \(fail-closed\)/,
  );
  assert.equal(scopeUnlockWarning({ attempted: true, detail: "token has expired" }), "token has expired");
});

test("a locked instance is reported even with an actually valid token", () => {
  // UI built locked but the token verifies: the flags are what is missing.
  const warning = scopeUnlockWarning({
    attempted: true,
    lockFlagOff: false,
    uiBuildUnlocked: false,
    tokenValid: true,
    tokenClient: "Acme Corp",
    reason: "ui-build-locked",
    message: "Scope Guard unlock attempt failed — unlock conditions not all met",
    detail: "NEXT_PUBLIC_SCOPE_GUARD_LOCK=0 is not set",
  });

  assert.match(warning, /unlock conditions not all met/);
  assert.match(warning, /NEXT_PUBLIC_SCOPE_GUARD_LOCK=0 is not set/);
});

test("the UI build flag stays fail-closed: only explicit off-values unlock", () => {
  // No flag, a typo or an empty value → the UI keeps reporting "locked".
  for (const value of ["", "1", "true", "yes", "please-unlock"]) {
    assert.equal(readLockedWithFlag(value), "true", `NEXT_PUBLIC_SCOPE_GUARD_LOCK=${value} must stay locked`);
  }
  // An explicit off-value is the only thing that flips the build flag.
  for (const value of ["0", "false", "FALSE", "off", "no"]) {
    assert.equal(readLockedWithFlag(value), "false", `NEXT_PUBLIC_SCOPE_GUARD_LOCK=${value} should unlock`);
  }
});
