/**
 * Security distribution policy — mirror of
 * `backend/src/utils/securityPolicy.ts` (keep both files in sync).
 *
 * Scope Guard is enforced in this build and cannot be switched off from the
 * admin UI. Need a build without it? Contact the maintainers.
 *
 * ── Unlocked (vendor) builds ──
 * The backend is the enforcement point; this file only drives the UI, so it
 * needs its own *build-time* flag (Next.js inlines `NEXT_PUBLIC_*` into the
 * bundle, so a runtime env change would need a rebuild anyway). Since the
 * unlock-token change the flags alone no longer unlock anything — the backend
 * requires **all three** conditions at once:
 *
 *   1. backend : SCOPE_GUARD_LOCK=0                  (runtime env)
 *   2. both    : NEXT_PUBLIC_SCOPE_GUARD_LOCK=0      (this flag + backend env)
 *   3. backend : SCOPE_GUARD_UNLOCK_TOKEN=VEK1.…     (signed by the maintainers)
 *                verified with MASTER_SECRET_KEY (VEK1) or
 *                MASTER_UNLOCK_PUBLIC_KEY (VEK2 / Ed25519)
 *
 *   both    : SCOPE_GUARD_LOCKED_IN_CODE = false below = permanently unlocked
 *
 * Only an explicit off-value (0/false/off/no) counts; anything else keeps the
 * guard ON (fail-closed). A missing/forged/expired token keeps the guard ON too
 * and the API reports it in `scope.unlock` — see {@link scopeUnlockWarning}.
 */
export const SECURITY_CONTACT_URL = "https://www.facebook.com/Pentestdb/";

/** Build flag mirrored from the backend's `SCOPE_GUARD_LOCK`. */
export const SCOPE_GUARD_LOCK_ENV = "NEXT_PUBLIC_SCOPE_GUARD_LOCK";

/** `false` = permanently unlocked UI (vendor build, no flag needed). */
export const SCOPE_GUARD_LOCKED_IN_CODE = true;

/** Off-values accepted by {@link SCOPE_GUARD_LOCKED} (case-insensitive). */
export const SCOPE_GUARD_UNLOCK_VALUES = ["0", "false", "off", "no"];

/** Read the build flag; `process` may be absent in exotic bundler contexts. */
function readUnlockFlag() {
  try {
    return String(process.env.NEXT_PUBLIC_SCOPE_GUARD_LOCK ?? "")
      .trim()
      .toLowerCase();
  } catch {
    return ""; // fail closed
  }
}

/** true = Scope Guard is locked on; the UI must not offer to disable it. */
export const SCOPE_GUARD_LOCKED =
  SCOPE_GUARD_LOCKED_IN_CODE && !SCOPE_GUARD_UNLOCK_VALUES.includes(readUnlockFlag());

/**
 * Human-readable warning for an unlock attempt the backend refused.
 *
 * `GET /api/admin/scope` returns the per-condition result in `scope.unlock`
 * (`attempted`, `lockFlagOff`, `uiBuildUnlocked`, `tokenPresent`, `tokenValid`,
 * `tokenMode`, `tokenReason`, `tokenClient`, `tokenExpiresAt`, `reason`,
 * `detail`, `message`). Returns `null` for a normally locked instance (nothing
 * was attempted) and for an instance that is actually unlocked — so it is safe
 * to render whenever it is non-null.
 *
 * Mirrors `scopeGuardUnlockWarning()` / `scopeGuardUnlockFailureDetail()` in
 * `backend/src/utils/securityPolicy.ts`.
 */
export function scopeUnlockWarning(unlock) {
  if (!unlock || !unlock.attempted) return null;

  const message = String(unlock.message || "").trim();
  const detail = String(unlock.detail || "").trim();
  if (message && detail && !message.includes(detail)) return `${message} Missing: ${detail}.`;

  return (
    message ||
    detail ||
    "Scope Guard unlock attempt failed — the guard stays ENABLED (fail-closed)."
  );
}
