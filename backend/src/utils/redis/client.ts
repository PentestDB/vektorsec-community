import type { RedisClientType } from "redis";

/**
 * Shared Redis client holder.
 *
 * `server.ts` creates the client at boot and publishes it here; application code
 * reads it through these accessors instead of importing the server module. That
 * keeps `import { createApp } from "./app"` free of side effects, so the API can
 * be mounted by tests (and by future workers) without starting the process.
 */

let client: RedisClientType | null = null;

/** Publish the boot-time client (called once by `server.ts`). */
export function setRedisClient(value: RedisClientType | null): void {
  client = value;
}

/** The client, or null when the process has not initialised Redis yet. */
export function getRedisClientOrNull(): RedisClientType | null {
  return client;
}

/** True when a Redis client has been published. */
export function hasRedisClient(): boolean {
  return client !== null;
}

/** The client, or a clear error when Redis was never initialised. */
export function getRedisClient(): RedisClientType {
  if (!client) {
    throw new Error(
      "Redis client is not initialised. Call setRedisClient() during startup before using Redis.",
    );
  }
  return client;
}

/**
 * Lazy proxy over the shared client.
 *
 * Property access (and method calls) resolve the client at call time, so a
 * module can keep `redisClient.HSET(...)`-style code while still being imported
 * before Redis is connected — which is what makes the API testable.
 */
export function lazyRedisClient(): RedisClientType {
  return new Proxy({} as RedisClientType, {
    get(_target, property) {
      const resolved = getRedisClient() as unknown as Record<PropertyKey, unknown>;
      const value = resolved[property];
      return typeof value === "function" ? (value as Function).bind(resolved) : value;
    },
  }) as RedisClientType;
}
