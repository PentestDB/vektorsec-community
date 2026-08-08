import { Request, Response, NextFunction } from "express";

/**
 * Simple in-memory rate limiter.
 * For production multi-instance deployments, replace with a Redis-backed
 * limiter (e.g. express-rate-limit + rate-limit-redis).
 */
interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const store = new Map<string, RateLimitEntry>();

// Periodic cleanup of expired entries to avoid unbounded memory growth.
const cleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store.entries()) {
    if (entry.resetAt <= now) store.delete(key);
  }
}, 60_000);
// @ts-ignore - Node.js returns a Timeout object, but @types/node may type it as number
(cleanupTimer as any).unref?.();



function getClientIp(req: Request): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string") {
    const first = forwarded.split(",")[0].trim();
    if (first) return first;
  }
  return req.socket.remoteAddress || "unknown";
}

/**
 * Create a rate limiter middleware.
 * @param windowMs  Time window in milliseconds
 * @param max       Maximum number of requests allowed per window
 * @param keyPrefix Prefix for the in-memory store key (per-route)
 */
export function rateLimit(options: {
  windowMs: number;
  max: number;
  keyPrefix: string;
  message?: string;
}) {
  const { windowMs, max, keyPrefix, message } = options;

  return (req: Request, res: Response, next: NextFunction) => {
    const ip = getClientIp(req);
    const key = `${keyPrefix}:${ip}`;
    const now = Date.now();

    const entry = store.get(key);
    if (!entry || entry.resetAt <= now) {
      store.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }

    entry.count += 1;
    if (entry.count > max) {
      const retryAfterSec = Math.ceil((entry.resetAt - now) / 1000);
      res.setHeader("Retry-After", String(retryAfterSec));
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
