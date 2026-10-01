import { Request, Response, NextFunction } from "express";
import { getRedisClientOrNull } from "../utils/redis/client";
import { logger } from "../utils/logger";

/**
 * Rate limiting with a pluggable counter backend.
 *
 * - Redis (INCR + PEXPIRE) when a client is available, so the limit is shared by
 *   every backend replica.
 * - In-process Map otherwise (single instance, tests, Redis outage).
 *
 * If the Redis call fails the request is still counted in memory and allowed
 * through: a rate limiter must not take the API down with it (fail-open), but it
 * logs the degradation.
 */

export interface RateLimitCounterResult {
  /** Requests seen in the current window (including this one). */
  count: number;
  /** Milliseconds until the window resets. */
  resetInMs: number;
}

export interface RateLimitCounter {
  increment(key: string, windowMs: number): Promise<RateLimitCounterResult>;
}

/** In-process counter (single instance / fallback). */
export function createMemoryCounter(now: () => number = Date.now): RateLimitCounter {
  const store = new Map<string, { count: number; resetAt: number }>();

  // Periodic cleanup so long-running processes do not grow unbounded.
  const timer = setInterval(() => {
    const current = now();
    for (const [key, entry] of store.entries()) {
      if (entry.resetAt <= current) store.delete(key);
    }
  }, 60_000);
  // @ts-ignore Node returns a Timeout; @types/node may type it as number.
  timer.unref?.();

  return {
    async increment(key, windowMs) {
      const current = now();
      const entry = store.get(key);

      if (!entry || entry.resetAt <= current) {
        store.set(key, { count: 1, resetAt: current + windowMs });
        return { count: 1, resetInMs: windowMs };
      }

      entry.count += 1;
      return { count: entry.count, resetInMs: Math.max(0, entry.resetAt - current) };
    },
  };
}

/** Minimal shape of the Redis commands this limiter needs. */
export interface RateLimitRedisClient {
  incr(key: string): Promise<number>;
  pexpire(key: string, ms: number): Promise<unknown>;
  pttl(key: string): Promise<number>;
}

/**
 * Redis-backed counter: one key per `prefix:ip`, expiring with the window.
 * `PEXPIRE` is only issued when the key is created (count === 1).
 */
export function createRedisCounter(client: RateLimitRedisClient): RateLimitCounter {
  return {
    async increment(key, windowMs) {
      const count = await client.incr(key);
      if (count === 1) {
        await client.pexpire(key, windowMs);
        return { count, resetInMs: windowMs };
      }

      const ttl = await client.pttl(key);
      // -1 = key without expiry (a window that started before a restart), -2 = gone.
      const resetInMs = ttl > 0 ? ttl : windowMs;
      if (ttl === -1) await client.pexpire(key, windowMs);
      return { count, resetInMs };
    },
  };
}

const memoryCounter = createMemoryCounter();
let counterOverride: RateLimitCounter | null = null;

/** Inject a counter (tests) or reset to automatic resolution with `null`. */
export function setRateLimitCounter(counter: RateLimitCounter | null): void {
  counterOverride = counter;
}

/** Redis when available, otherwise the shared in-process counter. */
export function resolveRateLimitCounter(): RateLimitCounter {
  if (counterOverride) return counterOverride;
  const client = getRedisClientOrNull();
  if (client) return createRedisCounter(client as unknown as RateLimitRedisClient);
  return memoryCounter;
}

/** Client IP used for the bucket key (proxy aware). */
export function getClientIp(req: Request): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string") {
    const first = forwarded.split(",")[0].trim();
    if (first) return first;
  }
  return req.socket?.remoteAddress || "unknown";
}

/**
 * Create a rate limiter middleware.
 * @param windowMs  Time window in milliseconds
 * @param max       Maximum number of requests allowed per window
 * @param keyPrefix Prefix for the store key (per-route)
 */
export function rateLimit(options: {
  windowMs: number;
  max: number;
  keyPrefix: string;
  message?: string;
}) {
  const { windowMs, max, keyPrefix, message } = options;

  return async (req: Request, res: Response, next: NextFunction) => {
    const key = `${keyPrefix}:${getClientIp(req)}`;

    let result: RateLimitCounterResult;
    try {
      result = await resolveRateLimitCounter().increment(key, windowMs);
    } catch (err) {
      logger.warn("rate limit backend failed; counting in memory for this request", { err, keyPrefix });
      result = await memoryCounter.increment(key, windowMs);
    }

    if (result.count > max) {
      res.setHeader("Retry-After", String(Math.max(1, Math.ceil(result.resetInMs / 1000))));
      return res.status(429).json({
        message: message || "Too many requests, please try again later.",
      });
    }

    next();
  };
}

/** Pre-configured limiters for common use cases. */
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // 20 login/register attempts per 15 min
  keyPrefix: "auth",
  message: "Too many authentication attempts. Please try again in 15 minutes.",
});

export const apiRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 120, // 120 requests per minute
  keyPrefix: "api",
  message: "Too many requests. Please slow down.",
});

export const agentRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30, // 30 agent actions per minute
  keyPrefix: "agent",
  message: "Too many agent actions. Please wait a moment.",
});
