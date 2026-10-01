import assert from "node:assert/strict";
import { after, test } from "node:test";
import { Request } from "express";
import {
  createMemoryCounter,
  createRedisCounter,
  getClientIp,
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
    async incr(key) {
      calls.push(`incr:${key}`);
      const entry = state.get(key) ?? { count: 0, ttl: -1 };
      entry.count += 1;
      state.set(key, entry);
      return entry.count;
    },
    async pexpire(key, ms) {
      calls.push(`pexpire:${key}:${ms}`);
      const entry = state.get(key) ?? { count: 0, ttl: ms };
      entry.ttl = ms;
      state.set(key, entry);
      return 1;
    },
    async pttl(key) {
      calls.push(`pttl:${key}`);
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

  assert.deepEqual(calls, ["incr:rl:ip", "pexpire:rl:ip:60000", "incr:rl:ip", "pttl:rl:ip"]);
});

test("redis counter repairs a key that lost its expiry", async () => {
  const { client, calls } = fakeRedis();
  // INCR returns 5 (key survived a restart) and PTTL reports "no expiry".
  client.incr = async () => 5;
  client.pttl = async () => -1;

  const result = await createRedisCounter(client).increment("rl:stale", 30_000);

  assert.deepEqual(result, { count: 5, resetInMs: 30_000 });
  assert.ok(calls.includes("pexpire:rl:stale:30000"));
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
