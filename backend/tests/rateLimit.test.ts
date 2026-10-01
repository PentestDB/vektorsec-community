import assert from "node:assert/strict";
import { after, test } from "node:test";
import { Request } from "express";
import {
  apiRateLimiter,
  createMemoryCounter,
  createRedisCounter,
  getClientIp,
  rateLimitDefaults,
  rateLimitEnvInt,
  RateLimitCounter,
  RateLimitRedisClient,
  rateLimit,
  setRateLimitCounter,
} from "../src/middlewares/RateLimit.middleware";

after(() => setRateLimitCounter(null));

function fakeReq(overrides: Partial<Request> = {}): Request {
  return {
    headers: {},
    socket: { remoteAddress: "10.0.0.1" },
    ...overrides,
  } as unknown as Request;
}

interface FakeRes {
  statusCode: number;
  body: any;
  headers: Record<string, string>;
  setHeader(name: string, value: string): void;
  status(code: number): FakeRes;
  json(payload: any): FakeRes;
}

function fakeRes(): FakeRes {
  const res: FakeRes = {
    statusCode: 200,
    body: null,
    headers: {},
    setHeader(name, value) {
      res.headers[name] = value;
    },
    status(code) {
      res.statusCode = code;
      return res;
    },
    json(payload) {
      res.body = payload;
      return res;
    },
  };
  return res;
}

/** Run the middleware once and report whether it called next(). */
async function hit(
  limiter: ReturnType<typeof rateLimit>,
  req: Request = fakeReq(),
): Promise<{ passed: boolean; res: FakeRes }> {
  const res = fakeRes();
  let passed = false;
  await limiter(req, res as any, () => {
    passed = true;
  });
  return { passed, res };
}

/** Fake Redis client that records the commands it receives. */
function fakeRedis(overrides: Partial<RateLimitRedisClient> = {}) {
  const calls: string[] = [];
  const state = new Map<string, { count: number; ttl: number }>();

  const client: RateLimitRedisClient = {
    async INCR(key) {
      calls.push(`INCR:${key}`);
      const entry = state.get(key) ?? { count: 0, ttl: -1 };
      entry.count += 1;
      state.set(key, entry);
      return entry.count;
    },
    async PEXPIRE(key, ms) {
      calls.push(`PEXPIRE:${key}:${ms}`);
      const entry = state.get(key) ?? { count: 0, ttl: ms };
      entry.ttl = ms;
      state.set(key, entry);
      return 1;
    },
    async PTTL(key) {
      calls.push(`PTTL:${key}`);
      const entry = state.get(key);
      return entry ? entry.ttl : -2;
    },
    ...overrides,
  };

  return { client, calls, state };
}

test("memory counter starts a window, counts up and resets after it expires", async () => {
  let now = 1_000;
  const counter = createMemoryCounter(() => now);

  assert.deepEqual(await counter.increment("k", 500), { count: 1, resetInMs: 500 });
  assert.deepEqual(await counter.increment("k", 500), { count: 2, resetInMs: 500 });

  now = 1_400;
  assert.deepEqual(await counter.increment("k", 500), { count: 3, resetInMs: 100 });

  now = 1_600; // window over
  assert.deepEqual(await counter.increment("k", 500), { count: 1, resetInMs: 500 });
});

test("redis counter sets the expiry on the first hit and reads the TTL afterwards", async () => {
  const { client, calls } = fakeRedis();
  const counter = createRedisCounter(client);

  assert.deepEqual(await counter.increment("rl:ip", 60_000), { count: 1, resetInMs: 60_000 });
  assert.deepEqual(await counter.increment("rl:ip", 60_000), { count: 2, resetInMs: 60_000 });

  assert.deepEqual(calls, ["INCR:rl:ip", "PEXPIRE:rl:ip:60000", "INCR:rl:ip", "PTTL:rl:ip"]);
});

/**
 * Regression guard for the commands the counter sends to the real client.
 *
 * node-redis v4 exposes the raw commands in upper case (`PEXPIRE`, `PTTL` — the
 * same style as `utils/redis/store.ts`). The lower-case multi-word spellings used
 * before this fix are `undefined` on the client, so every request threw
 * ("client.pttl is not a function") and the shared limiter silently fell back to
 * counting per process.
 */
test("the counter only uses commands the installed redis client exposes", async () => {
  const { createClient } = await import("redis");
  const client = createClient({ url: "redis://127.0.0.1:0" }) as unknown as Record<string, unknown>;

  const { client: fake, calls } = fakeRedis();
  const counter = createRedisCounter(fake);
  await counter.increment("rl:real", 1_000);
  await counter.increment("rl:real", 1_000);

  // The names come from what the counter actually sent, so the assertion cannot
  // drift away from the implementation.
  const commands = [...new Set(calls.map((call) => call.split(":")[0]))].sort();
  assert.deepEqual(commands, ["INCR", "PEXPIRE", "PTTL"]);

  for (const command of commands) {
    assert.equal(
      typeof client[command],
      "function",
      `the redis client has no ${command}(); the counter sent ${calls.join(", ")}`,
    );
  }
});

test("redis counter repairs a key that lost its expiry", async () => {
  const { client, calls } = fakeRedis();
  // INCR returns 5 (key survived a restart) and PTTL reports "no expiry".
  client.INCR = async () => 5;
  client.PTTL = async () => -1;

  const result = await createRedisCounter(client).increment("rl:stale", 30_000);

  assert.deepEqual(result, { count: 5, resetInMs: 30_000 });
  assert.ok(calls.includes("PEXPIRE:rl:stale:30000"));
});

test("middleware allows requests up to the limit, then answers 429 with Retry-After", async () => {
  let now = 0;
  setRateLimitCounter(createMemoryCounter(() => now));
  const limiter = rateLimit({ windowMs: 10_000, max: 2, keyPrefix: "test" });

  assert.equal((await hit(limiter)).passed, true);
  assert.equal((await hit(limiter)).passed, true);

  now = 2_000;
  const blocked = await hit(limiter);
  assert.equal(blocked.passed, false);
  assert.equal(blocked.res.statusCode, 429);
  assert.equal(blocked.res.headers["Retry-After"], "8");
  assert.match(blocked.res.body.message, /Too many requests/);

  setRateLimitCounter(null);
});

test("buckets are per client IP", async () => {
  setRateLimitCounter(createMemoryCounter());
  const limiter = rateLimit({ windowMs: 10_000, max: 1, keyPrefix: "per-ip" });

  assert.equal(
    (await hit(limiter, fakeReq({ socket: { remoteAddress: "1.1.1.1" } } as any))).passed,
    true,
  );
  assert.equal(
    (await hit(limiter, fakeReq({ socket: { remoteAddress: "2.2.2.2" } } as any))).passed,
    true,
  );

  const second = await hit(limiter, fakeReq({ socket: { remoteAddress: "1.1.1.1" } } as any));
  assert.equal(second.passed, false);
  assert.equal(second.res.statusCode, 429);

  setRateLimitCounter(null);
});

test("a failing backend falls back to the in-memory counter instead of erroring", async () => {
  const failing: RateLimitCounter = {
    async increment() {
      throw new Error("redis unavailable");
    },
  };
  setRateLimitCounter(failing);
  const limiter = rateLimit({ windowMs: 10_000, max: 1, keyPrefix: "fallback" });

  // limit is 1 → the first request passes, the second is blocked by the fallback
  assert.equal((await hit(limiter)).passed, true);
  const blocked = await hit(limiter);
  assert.equal(blocked.passed, false);
  assert.equal(blocked.res.statusCode, 429);

  setRateLimitCounter(null);
});

test("getClientIp prefers the first x-forwarded-for entry", () => {
  assert.equal(
    getClientIp(fakeReq({ headers: { "x-forwarded-for": "203.0.113.9, 10.0.0.1" } } as any)),
    "203.0.113.9",
  );
  assert.equal(getClientIp(fakeReq({ headers: {} } as any)), "10.0.0.1");
  assert.equal(getClientIp(fakeReq({ socket: {} } as any)), "unknown");
});

test("rate limit env overrides are validated and fall back to the default", () => {
  const name = "RATE_LIMIT_API_MAX";
  const original = process.env[name];

  try {
    for (const value of [undefined, "", "not-a-number", "0", "-5", "0.5"]) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;

      assert.equal(
        rateLimitEnvInt(name, 120),
        120,
        `${JSON.stringify(value)} must keep the default`,
      );
    }

    process.env[name] = "600";
    assert.equal(rateLimitEnvInt(name, 120), 600);
  } finally {
    if (original === undefined) delete process.env[name];
    else process.env[name] = original;
  }
});

test("pre-configured limiters keep their documented defaults", () => {
  // Guards the production behaviour: tuning is opt-in via the environment, and
  // the numbers below are what the docs and the CHANGELOG promise.
  assert.deepEqual(rateLimitDefaults, {
    auth: { windowMs: 15 * 60 * 1000, max: 20 },
    api: { windowMs: 60 * 1000, max: 120 },
    agent: { windowMs: 60 * 1000, max: 30 },
  });
});

test("apiRateLimiter allows exactly its max per window, then answers 429", async () => {
  let now = 0;
  setRateLimitCounter(createMemoryCounter(() => now));
  const req = fakeReq({ socket: { remoteAddress: "203.0.113.7" } } as any);

  for (let i = 1; i <= rateLimitDefaults.api.max; i += 1) {
    const { passed } = await hit(apiRateLimiter, req);
    assert.equal(passed, true, `request ${i} of ${rateLimitDefaults.api.max} must pass`);
  }

  now = 1_000; // still inside the window
  const blocked = await hit(apiRateLimiter, req);
  assert.equal(blocked.passed, false);
  assert.equal(blocked.res.statusCode, 429);
  assert.match(blocked.res.body.message, /Too many requests/);

  now = rateLimitDefaults.api.windowMs; // window over -> the bucket resets
  assert.equal((await hit(apiRateLimiter, req)).passed, true);

  setRateLimitCounter(null);
});
