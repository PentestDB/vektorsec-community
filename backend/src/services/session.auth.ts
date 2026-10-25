import { Request, Response } from "express";
import UserModel from "../models/User/User.model";
import { getRedisClientOrNull } from "../utils/redis/client";

/**
 * Auth-session helpers for the express-session + Redis layer.
 *
 * Three properties this module guarantees:
 *
 *  1. **No session fixation** — a login always regenerates the session id
 *     (`req.session.regenerate`) before the user id is stored, so a session id
 *     planted by an attacker is worthless after authentication.
 *  2. **Revocation** — every session carries the user's `sessionVersion`.
 *     `verifySess` rejects sessions whose version is older than the user's, so
 *     a password reset, an admin block or "log out everywhere" ends *all*
 *     existing logins (not just the cookies the user happens to still hold).
 *  3. **Enumeration** — the session ids of a user are tracked in a Redis set so
 *     "log out everywhere" can delete them instead of waiting for the TTL.
 *
 * All Redis access is best-effort: when Redis is unavailable (tests, degraded
 * deployments) the version check alone still revokes sessions.
 */

/** Name of the session cookie (`buildSessionMiddleware` in `app.ts`). */
export const SESSION_COOKIE_NAME = "sid";

/**
 * Key prefix used by `connect-redis`. Keep in sync with `new RedisStore(...)`
 * in `server.ts` (default prefix, no option is passed there).
 */
const REDIS_SESSION_PREFIX = "sess:";

/** Lifetime of the per-user session-id set (must outlive the cookie). */
const USER_SESSION_SET_TTL_SECONDS = 60 * 60 * 24;

/** Fallback when `SESSION_MAX_AGE_HOURS` is unset / invalid. */
const DEFAULT_SESSION_MAX_AGE_HOURS = 12;

/** Redis key holding the session ids that belong to a user. */
function userSessionSetKey(userId: string): string {
  return `user:sessions:${userId}`;
}

/**
 * Normalise a `sessionVersion` value coming from MongoDB / an old session
 * cookie. Users that predate the field (and their sessions) are version `0`.
 */
export function sessionVersionOf(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * True when a session was issued for an older version of the user's account,
 * i.e. it must be rejected. `undefined`/`null` counts as `0`, which keeps
 * sessions issued before this feature deployed working.
 */
export function isSessionVersionStale(
  sessionVersion: unknown,
  userVersion: unknown,
): boolean {
  return sessionVersionOf(sessionVersion) !== sessionVersionOf(userVersion);
}

/** Cookie lifetime in ms, from `SESSION_MAX_AGE_HOURS` (default 12h). */
export function sessionMaxAgeMs(env: NodeJS.ProcessEnv = process.env): number {
  const raw = Number(env.SESSION_MAX_AGE_HOURS);
  const hours = Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_SESSION_MAX_AGE_HOURS;
  return Math.round(hours * 60 * 60 * 1000);
}

/**
 * The cookie policy for the session cookie. `secure` is relaxed only in LOCAL
 * deployments (plain-http localhost); everything else requires TLS.
 */
export function buildSessionCookieOptions(
  deployment?: string,
  env: NodeJS.ProcessEnv = process.env,
) {
  return {
    httpOnly: true,
    sameSite: "strict" as const,
    secure: deployment !== "LOCAL",
    path: "/",
    maxAge: sessionMaxAgeMs(env),
  };
}


/** Persist the session, resolving once the store acknowledged the write. */
async function saveSession(req: Request): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    req.session.save((err) => (err ? reject(err) : resolve()));
  });
}

/**
 * Start an authenticated session for `user`.
 *
 * Regenerates the session id first (session-fixation defence), stores the
 * user's current `sessionVersion` so later revocations can be detected, saves
 * and registers the new id for "log out everywhere".
 */
export async function establishAuthenticatedSession(
  req: Request,
  user: { _id?: unknown; id?: string; sessionVersion?: number },
): Promise<void> {
  const userId = String(user._id ?? user.id ?? "");
  const version = sessionVersionOf(user.sessionVersion);

  await new Promise<void>((resolve, reject) => {
    req.session.regenerate((err) => (err ? reject(err) : resolve()));
  });

  req.session.user = { userId };
  req.session.sessionVersion = version;

  await saveSession(req);
  await trackUserSession(userId, req.sessionID);
}

/** Destroy the current session (browser-agnostic helper). */
export async function destroySession(req: Request): Promise<void> {
  if (!req.session) return;
  await new Promise<void>((resolve) => {
    req.session.destroy(() => resolve());
  });
}

/** Clear the session cookie with the same path it was issued for. */
export function clearSessionCookie(res: Response): void {
  res.clearCookie(SESSION_COOKIE_NAME, { path: "/" });
}

/** Remember that `sessionId` belongs to `userId` (best effort). */
export async function trackUserSession(
  userId: string,
  sessionId: string | undefined,
): Promise<void> {
  const client = getRedisClientOrNull();
  if (!client || !userId || !sessionId) return;

  try {
    const key = userSessionSetKey(userId);
    await client.sAdd(key, sessionId);
    await client.expire(key, USER_SESSION_SET_TTL_SECONDS);
  } catch (err) {
    console.warn("[session.auth] failed to track session:", (err as Error)?.message ?? err);
  }
}

/** Forget a single session id (normal logout). */
export async function untrackUserSession(
  userId: string,
  sessionId: string | undefined,
): Promise<void> {
  const client = getRedisClientOrNull();
  if (!client || !userId || !sessionId) return;

  try {
    await client.sRem(userSessionSetKey(userId), sessionId);
  } catch (err) {
    console.warn("[session.auth] failed to untrack session:", (err as Error)?.message ?? err);
  }
}


export interface RevokeAllResult {
  /** The user's new `sessionVersion` after the bump. */
  sessionVersion: number;
  /** Number of session records deleted from the store. */
  revokedSessions: number;
}

/**
 * Revoke every active session of a user.
 *
 * Deletes the tracked session records from Redis (so cookies stop resolving
 * immediately) and increments `sessionVersion` (so even a session record that
 * survived — e.g. Redis was down — is rejected by `verifySess`).
 */
export async function revokeAllUserSessions(
  userId: string,
  opts: { bumpVersion?: boolean } = {},
): Promise<RevokeAllResult> {
  let revokedSessions = 0;
  const client = getRedisClientOrNull();

  if (client && userId) {
    try {
      const setKey = userSessionSetKey(userId);
      const sessionIds = await client.sMembers(setKey);
      const keys = [...new Set(sessionIds)]
        .filter(Boolean)
        .map((sid) => `${REDIS_SESSION_PREFIX}${sid}`);

      if (keys.length > 0) {
        revokedSessions = Number(await client.del(keys));
      }
      await client.del(setKey);
    } catch (err) {
      console.warn(
        "[session.auth] failed to delete stored sessions:",
        (err as Error)?.message ?? err,
      );
    }
  }

  if (opts.bumpVersion === false) {
    return { sessionVersion: 0, revokedSessions };
  }

  const updated = await UserModel.findByIdAndUpdate(
    userId,
    { $inc: { sessionVersion: 1 } },
    { new: true, projection: { sessionVersion: 1 } },
  );

  return {
    sessionVersion: sessionVersionOf(updated?.sessionVersion),
    revokedSessions,
  };
}
