/**
 * Scope Guard × DRM license integration tests (see `src/utils/securityPolicy.ts`).
 *
 * Pins the fail-closed wiring: when DRM is active, an invalid/expired/mismatched
 * license keeps the guard locked even if every legacy unlock condition is met;
 * when DRM is not active, behaviour is unchanged.
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  SCOPE_GUARD_LOCK_ENV,
  SCOPE_GUARD_UI_LOCK_ENV,
  SCOPE_GUARD_UNLOCK_TOKEN_ENV,
  resolveScopeGuardState,
  scopeGuardUnlockFailureDetail,
} from "../src/utils/securityPolicy";
import { signUnlockToken, UNLOCK_MASTER_KEY_ENV } from "../src/utils/unlockToken";
import type { LicenseState } from "../src/utils/drm/licenseManager";

const SECRET = "unit-test-master-secret-key-0123456789";

const NOT_ENFORCED: LicenseState = { enforced: false, valid: false, reason: "not-enforced", source: "none" };
const VALID_LICENSE: LicenseState = { enforced: true, valid: true, reason: "valid-license", source: "license-key" };
const EXPIRED_LICENSE: LicenseState = { enforced: true, valid: false, reason: "expired", source: "none" };

function validUnlockEnv(): NodeJS.ProcessEnv {
  const nowSec = Math.floor(Date.now() / 1000);
  const token = signUnlockToken({
    client: "Acme",
    secret: SECRET,
    issuedAtSeconds: nowSec,
    ttlSeconds: 365 * 86_400,
  });
  return {
    [SCOPE_GUARD_LOCK_ENV]: "0",
    [SCOPE_GUARD_UI_LOCK_ENV]: "0",
    [SCOPE_GUARD_UNLOCK_TOKEN_ENV]: token,
    [UNLOCK_MASTER_KEY_ENV]: SECRET,
  };
}

test("DRM not active → the three legacy conditions still unlock the guard", () => {
  const state = resolveScopeGuardState(validUnlockEnv(), true, NOT_ENFORCED);
  assert.equal(state.locked, false);
  assert.equal(state.reason, "unlock-conditions-met");
});

test("DRM active + invalid license → locked immediately (fail-closed)", () => {
  const state = resolveScopeGuardState(validUnlockEnv(), true, EXPIRED_LICENSE);
  assert.equal(state.locked, true);
  assert.equal(state.reason, "license-invalid");
  assert.equal(state.unlockFailed, true);
  assert.match(scopeGuardUnlockFailureDetail(state), /DRM license: expired/);
});

test("DRM active + valid license → unlocked when the other conditions hold", () => {
  const state = resolveScopeGuardState(validUnlockEnv(), true, VALID_LICENSE);
  assert.equal(state.locked, false);
  assert.equal(state.reason, "unlock-conditions-met");
});

test("DRM active + valid license but missing flags → still locked", () => {
  const env: NodeJS.ProcessEnv = { [SCOPE_GUARD_LOCK_ENV]: "1" };
  const state = resolveScopeGuardState(env, true, VALID_LICENSE);
  assert.equal(state.locked, true);
  assert.equal(state.reason, "lock-flag-on");
});

test("a plain locked instance (no DRM) still reports the legacy reason", () => {
  const state = resolveScopeGuardState({}, true, NOT_ENFORCED);
  assert.equal(state.locked, true);
  assert.equal(state.reason, "lock-flag-on");
});
