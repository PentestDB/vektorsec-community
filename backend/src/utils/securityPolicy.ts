/**
 * Security distribution policy for this build.
 *
 * Scope Guard (the global / per-workspace target allowlist that is verified
 * before any security tool runs) is part of this distribution's security
 * baseline: it is enforced unconditionally and cannot be switched off through
 * the admin UI, `config.toml` or the `SCOPE_ENABLED` variable. Operators can
 * only *tighten* it — add allowlist entries, enable strict mode, narrow it.
 *
 * Need a build without the Scope Guard? Contact the maintainers:
 *   https://www.facebook.com/Pentestdb/
 *
 * ── Unlocking Scope Guard (licensed / vendor instances) ─────────────────────
 * Strict matching: the guard stays ON unless **all** conditions hold at once.
 *
 *   1. Deployment flag — `SCOPE_GUARD_LOCK=0` in the backend runtime environment
 *      (`/srv/data/.env`). Same artifact, unlocked at runtime.
 *   2. UI build mode — `NEXT_PUBLIC_SCOPE_GUARD_LOCK=0` (`npm run build:unlocked`)
 *      **also present in the backend runtime environment**, so the backend knows
 *      which UI build is deployed (Next.js only inlines `NEXT_PUBLIC_*` into the
 *      bundle; the backend never sees the bundle).
 *   3. Unlock token — `SCOPE_GUARD_UNLOCK_TOKEN` must verify against the vendor
 *      master key: `MASTER_SECRET_KEY` for `VEK1` (HMAC-SHA256) tokens,
 *      `MASTER_UNLOCK_PUBLIC_KEY` for `VEK2` (Ed25519) tokens. Tokens are issued
 *      offline on the maintainer's machine with `scripts/gen-unlock-token.js`
 *      (gitignored), bound to a licensed client name and an expiry date.
 *      Format + verifier: `utils/unlockToken.ts`.
 *   4. Code switch — `SCOPE_GUARD_LOCKED_IN_CODE = false` below bakes an unlocked
 *      build that needs no flag and no token (a deliberate vendor rebuild).
 *
 * Only explicit off-values (`0`, `false`, `off`, `no`) count; every other value
 * — including a typo or an empty value — keeps the guard ON (fail-closed), and a
 * half-configured unlock is reported as a failed attempt in the startup log
 * (`WARN: Scope Guard unlock attempt failed …`), by the admin API and in the UI.
 *
 * Keep `frontend/src/constants/security.js` in sync: the UI only *reflects* the
 * backend state (`scope.locked`); this file is the enforcement point.
 */

import {
  UNLOCK_MASTER_KEY_ENV,
  UNLOCK_PUBLIC_KEY_ENV,
  UNLOCK_TOKEN_ENV,
  describeUnlockTokenFailure,
  verifyUnlockToken,
  type UnlockTokenVerification,
} from "./unlockToken";

/** Single source of truth for the "I need an unrestricted build" channel. */
export const SECURITY_CONTACT_URL = "https://www.facebook.com/Pentestdb/";

/** Backend deployment flag: an off-value starts an unlock attempt. */
export const SCOPE_GUARD_LOCK_ENV = "SCOPE_GUARD_LOCK";

/**
 * Frontend build flag, repeated in the **backend runtime environment** so both
 * halves of a deployment agree that the UI was built with `build:unlocked`.
 * (Next.js only inlines `NEXT_PUBLIC_*` into the bundle; the backend never sees
 * the bundle, so it has to be told which UI mode is deployed.)
 */
export const SCOPE_GUARD_UI_LOCK_ENV = "NEXT_PUBLIC_SCOPE_GUARD_LOCK";

/** Unlock token minted by the vendor master key (see `utils/unlockToken.ts`). */
export const SCOPE_GUARD_UNLOCK_TOKEN_ENV = UNLOCK_TOKEN_ENV;

/** Key material the server needs in order to verify a token. */
export const SCOPE_GUARD_VERIFY_KEY_ENVS: readonly string[] = [
  UNLOCK_MASTER_KEY_ENV,
  UNLOCK_PUBLIC_KEY_ENV,
];

/** Off-values accepted by the unlock flags (case-insensitive). */
export const SCOPE_GUARD_UNLOCK_VALUES: readonly string[] = ["0", "false", "off", "no"];

/**
 * Compile-time switch: `false` = permanently unlocked build (no flag/no token).
 * Keep `true` to ship the locked distribution.
 */
export const SCOPE_GUARD_LOCKED_IN_CODE = true;

/**
 * Fail-closed flag test: only an explicit off-value (`0`/`false`/`off`/`no`)
 * counts as "switched off" — a typo, an empty value or a missing variable are
 * all treated as "still on".
 */
export function isScopeGuardUnlockFlagOff(rawFlag: string | undefined): boolean {
  return SCOPE_GUARD_UNLOCK_VALUES.includes(String(rawFlag ?? "").trim().toLowerCase());
}

/** Which condition decided the outcome. */
export type ScopeGuardLockReason =
  | "unlocked-in-code" // code switch off → permanent vendor build
  | "unlock-conditions-met" // all three conditions passed
  | "lock-flag-on" // SCOPE_GUARD_LOCK missing / not an off-value
  | "ui-build-locked" // NEXT_PUBLIC_SCOPE_GUARD_LOCK missing / not an off-value
  | "token-missing" // SCOPE_GUARD_UNLOCK_TOKEN not configured
  | "token-invalid"; // token configured but not verifiable

export interface ScopeGuardState {
  /** true = Scope Guard is enforced (the safe default). */
  locked: boolean;
  /** Which condition decided the outcome (logs, admin API, support). */
  reason: ScopeGuardLockReason;
  /** The operator configured unlock inputs but the guard stayed ON. */
  unlockFailed: boolean;
  /** `SCOPE_GUARD_LOCK` carries an explicit off-value. */
  lockFlagOff: boolean;
  /** `NEXT_PUBLIC_SCOPE_GUARD_LOCK` carries an explicit off-value. */
  uiBuildUnlocked: boolean;
  /** Result of verifying `SCOPE_GUARD_UNLOCK_TOKEN`. */
  token: UnlockTokenVerification;
}

/**
 * Resolve the lock state — pure and **strictly fail-closed**.
 *
 * The guard is only switched off when *all* conditions hold at once:
 *
 *   1. `SCOPE_GUARD_LOCK=0` (backend deployment flag)
 *   2. `NEXT_PUBLIC_SCOPE_GUARD_LOCK=0` (the deployed UI was built unlocked)
 *   3. `SCOPE_GUARD_UNLOCK_TOKEN` verifies against the vendor master key
 *
 * …or when the code switch is flipped off (a deliberate rebuild by the vendor,
 * which cannot be reached through env/admin settings at all).
 */
export function resolveScopeGuardState(
  env: NodeJS.ProcessEnv = process.env,
  codeLock: boolean = SCOPE_GUARD_LOCKED_IN_CODE,
): ScopeGuardState {
  const lockFlagOff = isScopeGuardUnlockFlagOff(env[SCOPE_GUARD_LOCK_ENV]);
  const uiBuildUnlocked = isScopeGuardUnlockFlagOff(env[SCOPE_GUARD_UI_LOCK_ENV]);
  const token = verifyUnlockToken(env[SCOPE_GUARD_UNLOCK_TOKEN_ENV], { env });
  const conditions = { lockFlagOff, uiBuildUnlocked, token };

  if (!codeLock) {
    return { ...conditions, locked: false, reason: "unlocked-in-code", unlockFailed: false };
  }

  if (lockFlagOff && uiBuildUnlocked && token.valid) {
    return { ...conditions, locked: false, reason: "unlock-conditions-met", unlockFailed: false };
  }

  const reason: ScopeGuardLockReason = !lockFlagOff
    ? "lock-flag-on"
    : !uiBuildUnlocked
      ? "ui-build-locked"
      : token.present
        ? "token-invalid"
        : "token-missing";

  return {
    ...conditions,
    locked: true,
    reason,
    // Any half-configured unlock input counts as a failed attempt, so it is
    // reported loudly instead of looking like an ordinary locked instance.
    unlockFailed: lockFlagOff || uiBuildUnlocked || token.present,
  };
}

/** Memoisation: recompute only when the relevant env inputs change. */
let cachedKey = "";
let cachedState: ScopeGuardState | null = null;

/**
 * Current policy state, resolved lazily (per call, not at import time) so flags
 * coming from the runtime env file (`/srv/data/.env`, loaded by `loadConfig()` a
 * moment after the process starts) take effect — memoised per input set.
 */
export function getScopeGuardState(): ScopeGuardState {
  const env = process.env;
  const key = [
    env[SCOPE_GUARD_LOCK_ENV],
    env[SCOPE_GUARD_UI_LOCK_ENV],
    env[SCOPE_GUARD_UNLOCK_TOKEN_ENV],
    env[UNLOCK_MASTER_KEY_ENV],
    env[UNLOCK_PUBLIC_KEY_ENV],
  ].join("\u0000");
  if (cachedState && key === cachedKey) return cachedState;
  cachedState = resolveScopeGuardState(env);
  cachedKey = key;
  return cachedState;
}

/** True unless this instance met *every* unlock condition. */
export function isScopeGuardLocked(): boolean {
  return getScopeGuardState().locked;
}

/** Operator-facing explanation, surfaced by the admin API + the startup log. */
export const SCOPE_GUARD_NOTICE =
  "Scope Guard is enforced in this build and cannot be disabled from the admin UI, " +
  "the environment or the config files. It stays enforced unless every unlock condition " +
  `is met at once (${SCOPE_GUARD_LOCK_ENV}=0, ${SCOPE_GUARD_UI_LOCK_ENV}=0 and a valid ` +
  `${SCOPE_GUARD_UNLOCK_TOKEN_ENV}). Need a build without it? Contact ${SECURITY_CONTACT_URL}`;

/** The same notice for instances that passed every unlock condition. */
export const SCOPE_GUARD_UNLOCKED_NOTICE =
  `Scope Guard is NOT enforced: this instance presented a valid ${SCOPE_GUARD_UNLOCK_TOKEN_ENV} ` +
  `and was unlocked with ${SCOPE_GUARD_LOCK_ENV}=0 (see backend/src/utils/securityPolicy.ts). ` +
  "Remove the flags to enforce scope checks again.";

/** Console warning for a failed attempt with a missing/invalid token. */
export const SCOPE_GUARD_UNLOCK_TOKEN_FAILED_LOG =
  "WARN: Scope Guard unlock attempt failed — Invalid or missing UNLOCK_TOKEN";

/** Console warning for a failed attempt where the token was fine but a flag was not. */
export const SCOPE_GUARD_UNLOCK_CONDITIONS_FAILED_LOG =
  "WARN: Scope Guard unlock attempt failed — unlock conditions not all met " +
  `(${SCOPE_GUARD_LOCK_ENV}=0, ${SCOPE_GUARD_UI_LOCK_ENV}=0, valid ${SCOPE_GUARD_UNLOCK_TOKEN_ENV})`;

/** Admin-facing notice for a failed attempt with a missing/invalid token. */
export const SCOPE_GUARD_UNLOCK_TOKEN_FAILED_NOTICE =
  `Scope Guard unlock attempt failed — Invalid or missing UNLOCK_TOKEN (${SCOPE_GUARD_UNLOCK_TOKEN_ENV}). ` +
  "The guard stays ENABLED (fail-closed). Ask the maintainers for an unlock token: " +
  SECURITY_CONTACT_URL;

/** Admin-facing notice for a failed attempt where some other condition was missing. */
export const SCOPE_GUARD_UNLOCK_CONDITIONS_FAILED_NOTICE =
  "Scope Guard unlock attempt failed — not every unlock condition was met, so the guard stays " +
  `ENABLED (fail-closed). Required: ${SCOPE_GUARD_LOCK_ENV}=0, ${SCOPE_GUARD_UI_LOCK_ENV}=0 and a ` +
  `valid ${SCOPE_GUARD_UNLOCK_TOKEN_ENV}. Contact ${SECURITY_CONTACT_URL} for help.`;

/**
 * Which conditions are still missing — short, actionable text for the startup
 * log and the admin API (`scope.unlock.detail`).
 */
export function scopeGuardUnlockFailureDetail(state: ScopeGuardState): string {
  const missing: string[] = [];
  if (!state.lockFlagOff) missing.push(`${SCOPE_GUARD_LOCK_ENV}=0 is not set`);
  if (!state.uiBuildUnlocked) missing.push(`${SCOPE_GUARD_UI_LOCK_ENV}=0 is not set`);
  if (!state.token.valid) {
    missing.push(`${SCOPE_GUARD_UNLOCK_TOKEN_ENV}: ${describeUnlockTokenFailure(state.token.reason)}`);
  }
  return missing.join(" · ");
}

/** The console line for a failed unlock attempt (`null` when not applicable). */
export function scopeGuardUnlockWarning(
  state: ScopeGuardState = getScopeGuardState(),
): string | null {
  if (!state.locked || !state.unlockFailed) return null;
  return state.token.valid
    ? SCOPE_GUARD_UNLOCK_CONDITIONS_FAILED_LOG
    : SCOPE_GUARD_UNLOCK_TOKEN_FAILED_LOG;
}

/** The notice that matches the current policy state. */
export function scopeGuardNotice(state: ScopeGuardState = getScopeGuardState()): string {
  if (!state.locked) {
    if (!state.token.valid || !state.token.client) return SCOPE_GUARD_UNLOCKED_NOTICE;
    const expires = state.token.expiresAt ? ` — token expires ${state.token.expiresAt}` : "";
    return `${SCOPE_GUARD_UNLOCKED_NOTICE} Licensed to ${state.token.client}${expires}.`;
  }

  if (state.unlockFailed) {
    const base = state.token.valid
      ? SCOPE_GUARD_UNLOCK_CONDITIONS_FAILED_NOTICE
      : SCOPE_GUARD_UNLOCK_TOKEN_FAILED_NOTICE;
    const detail = scopeGuardUnlockFailureDetail(state);
    return detail ? `${base} Missing: ${detail}.` : base;
  }

  return SCOPE_GUARD_NOTICE;
}
