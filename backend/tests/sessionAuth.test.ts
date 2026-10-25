import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import UserModel from "../src/models/User/User.model";
import { setRedisClient } from "../src/utils/redis/client";
import {
  buildSessionCookieOptions,
  isSessionVersionStale,
  revokeAllUserSessions,
  sessionMaxAgeMs,
  sessionVersionOf,
  trackUserSession,
  untrackUserSession,
} from "../src/services/session.auth";

/**
 * Unit tests for the auth-session hardening helpers (`services/session.auth.ts`).
 *
 * A fake Redis client + a monkey-patched `UserModel.findByIdAndUpdate` let the
 * revocation logic be exercised without a real datastore. Redis is best-effort
 * by design, so one test also covers the degraded (no Redis) path.
 */

interface FakeRedis {
  sAdd(key: string, value: string): Promise<number>;
  sRem(key: string, value: string): Promise<number>;
  sMembers(key: string): Promise<string[]>;
  del(keys: string | string[]): Promise<number>;
  expire(key: string, seconds: number): Promise<number>;
}

interface FakeRedisState {
  sets: Map<string, Set<string>>;
  deleted: string[];
  expires: string[];
}

function fakeRedis(overrides: Partial<FakeRedis> = {}) {
  const state: FakeRedisState = { sets: new Map(), deleted: [], expires: [] };

  const client: FakeRedis = {
    async sAdd(key, value) {
      const set = state.sets.get(key) ?? new Set<string>();
      const had = set.has(value);
      set.add(value);
      state.sets.set(key, set);
      return had ? 0 : 1;
    },
    async sRem(key, value) {
      const set = state.sets.get(key);
      if (!set) return 0;
      return set.delete(value) ? 1 : 0;
    },
    async sMembers(key) {
      return Array.from(state.sets.get(key) ?? []);
    },
    async del(keys) {
      const list = Array.isArray(keys) ? keys : [keys];
      for (const key of list) state.deleted.push(key);
      return list.length;
    },
    async expire(key, seconds) {
      state.expires.push(`${key}:${seconds}`);
      return 1;
    },
    ...overrides,
  };

  return { client, state };
}

const realFindByIdAndUpdate = UserModel.findByIdAndUpdate;

function stubVersionUpdate(sessionVersion = 1) {
  const calls: any[] = [];
  (UserModel as any).findByIdAndUpdate = async (id: string, update: any, options: any) => {
    calls.push({ id, update, options });
    return { sessionVersion };
  };
  return calls;
}

afterEach(() => {
  setRedisClient(null);
  (UserModel as any).findByIdAndUpdate = realFindByIdAndUpdate;
});

test("sessionVersionOf normalises missing / legacy values to 0", () => {
  assert.equal(sessionVersionOf(undefined), 0);
  assert.equal(sessionVersionOf(null), 0);
  assert.equal(sessionVersionOf("not-a-number"), 0);
  assert.equal(sessionVersionOf(Number.NaN), 0);
  assert.equal(sessionVersionOf(0), 0);
  assert.equal(sessionVersionOf("3"), 3);
  assert.equal(sessionVersionOf(4), 4);
});

test("isSessionVersionStale only rejects older-version sessions", () => {
  // Pre-feature cookie (no version) and pre-feature user (version 0) match.
  assert.equal(isSessionVersionStale(undefined, 0), false);
  assert.equal(isSessionVersionStale(0, undefined), false);
  assert.equal(isSessionVersionStale(2, "2"), false);

  // Password reset / logout-all bumps the user, older cookies must die.
  assert.equal(isSessionVersionStale(1, 2), true);
  assert.equal(isSessionVersionStale(undefined, 1), true);
});

test("sessionMaxAgeMs defaults to 12h and honours SESSION_MAX_AGE_HOURS", () => {
  assert.equal(sessionMaxAgeMs({} as NodeJS.ProcessEnv), 12 * 60 * 60 * 1000);

  assert.equal(
    sessionMaxAgeMs({ SESSION_MAX_AGE_HOURS: "1" } as NodeJS.ProcessEnv),
    60 * 60 * 1000,
  );
  assert.equal(
    sessionMaxAgeMs({ SESSION_MAX_AGE_HOURS: "0.5" } as NodeJS.ProcessEnv),
    30 * 60 * 1000,
  );

  // Invalid values fall back instead of producing a 0/NaN cookie lifetime.
  for (const invalid of ["", "0", "-4", "abc"]) {
    assert.equal(
      sessionMaxAgeMs({ SESSION_MAX_AGE_HOURS: invalid } as NodeJS.ProcessEnv),
      12 * 60 * 60 * 1000,
      `${JSON.stringify(invalid)} must keep the default`,
    );
  }
});

test("the session cookie is httpOnly/strict and only insecure on LOCAL", () => {
  const env = { SESSION_MAX_AGE_HOURS: "2" } as NodeJS.ProcessEnv;

  assert.deepEqual(buildSessionCookieOptions("LOCAL", env), {
    httpOnly: true,
    sameSite: "strict",
    secure: false,
    path: "/",
    maxAge: 2 * 60 * 60 * 1000,
  });

  for (const deployment of ["PRODUCTION", "SELFHOSTED", undefined]) {
    assert.equal(
      buildSessionCookieOptions(deployment, env).secure,
      true,
      `${deployment} must require TLS-secured cookies`,
    );
  }

  // Lowercase "local" is not a valid deployment name — stay secure.
  assert.equal(buildSessionCookieOptions("local", env).secure, true);
});

test("trackUserSession records the id in the per-user set with a TTL", async () => {
  const { client, state } = fakeRedis();
  setRedisClient(client as any);

  await trackUserSession("user-1", "sid-123");

  assert.deepEqual(Array.from(state.sets.get("user:sessions:user-1") ?? []), ["sid-123"]);
  assert.deepEqual(state.expires, ["user:sessions:user-1:86400"]);

  // Missing ids / users are ignored instead of writing junk keys.
  await trackUserSession("user-1", undefined);
  await trackUserSession("", "sid-456");
  assert.equal(state.sets.get("user:sessions:user-1")?.size, 1);
  assert.equal(state.sets.has("user:sessions:"), false);
});

test("untrackUserSession removes a single id (normal logout)", async () => {
  const { client, state } = fakeRedis();
  setRedisClient(client as any);
  await trackUserSession("user-2", "sid-a");
  await trackUserSession("user-2", "sid-b");

  await untrackUserSession("user-2", "sid-a");

  assert.deepEqual(Array.from(state.sets.get("user:sessions:user-2") ?? []), ["sid-b"]);
});

test("revokeAllUserSessions deletes tracked sessions and bumps the version", async () => {
  const { client, state } = fakeRedis();
  setRedisClient(client as any);
  await trackUserSession("user-3", "sid-x");
  await trackUserSession("user-3", "sid-y");

  const calls = stubVersionUpdate(7);
  const result = await revokeAllUserSessions("user-3");

  // Both session records and the tracking set are deleted.
  assert.deepEqual(state.deleted.sort(), [
    "sess:sid-x",
    "sess:sid-y",
    "user:sessions:user-3",
  ]);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].id, "user-3");
  assert.deepEqual(calls[0].update, { $inc: { sessionVersion: 1 } });
  assert.equal(result.sessionVersion, 7);
  // Only the two session records count — the tracking set is bookkeeping.
  assert.equal(result.revokedSessions, 2);
});

test("revokeAllUserSessions works when Redis is unavailable", async () => {
  const calls = stubVersionUpdate(2);

  const result = await revokeAllUserSessions("user-4");

  assert.equal(calls.length, 1, "the version bump must still happen");
  assert.equal(result.revokedSessions, 0);
  assert.equal(result.sessionVersion, 2);
});

test("bumpVersion:false only deletes stored sessions", async () => {
  const { client, state } = fakeRedis();
  setRedisClient(client as any);
  await trackUserSession("user-5", "sid-z");

  const calls = stubVersionUpdate(9);
  const result = await revokeAllUserSessions("user-5", { bumpVersion: false });

  assert.equal(calls.length, 0, "no database write when not asked for");
  assert.deepEqual(state.deleted.sort(), ["sess:sid-z", "user:sessions:user-5"]);
  assert.equal(result.sessionVersion, 0);
  assert.equal(result.revokedSessions, 1);
});

test("a failing Redis delete does not stop the version bump", async () => {
  const { client } = fakeRedis({
    async sMembers() {
      throw new Error("redis unavailable");
    },
  });
  setRedisClient(client as any);

  const calls = stubVersionUpdate(5);
  const result = await revokeAllUserSessions("user-6");

  assert.equal(calls.length, 1);
  assert.equal(result.sessionVersion, 5);
  assert.equal(result.revokedSessions, 0);
});
