import assert from "node:assert/strict";
import { createServer, Server } from "node:http";
import { AddressInfo } from "node:net";
import { after, before, test } from "node:test";
import mongoose from "mongoose";
import session from "express-session";

import { createApp } from "../src/app";

/**
 * HTTP integration tests — the real Express app (middleware, session, routes,
 * error handling) driven over a real socket.
 *
 * Opt-in so `pnpm test` still works without infrastructure:
 *
 *   MONGO_TEST_URI=mongodb://127.0.0.1:27017 pnpm test
 *
 * CI provides a MongoDB service container and sets MONGO_TEST_URI. The session
 * store is an in-memory store and Redis is faked, so no Redis is required.
 */
const MONGO_TEST_URI = process.env.MONGO_TEST_URI?.trim();

const skip = MONGO_TEST_URI
  ? false
  : "set MONGO_TEST_URI=mongodb://host:port to run the HTTP integration tests";

const dbName = `vektorsec_http_test_${Date.now().toString(36)}`;

let server: Server;
let baseUrl: string;

/** Configured so the browser-style redirect can be asserted. */
const FRONTEND_BASE_URL = "https://app.example.test";

/** Fake redis used by GET /api/ready. */
const redisStub = {
  healthy: true,
  async ping(): Promise<string> {
    if (!this.healthy) throw new Error("redis down");
    return "PONG";
  },
};

before(async () => {
  if (!MONGO_TEST_URI) return;

  process.env.BASE_URL_FRONTEND = FRONTEND_BASE_URL;

  await mongoose.connect(MONGO_TEST_URI, {
    dbName,
    serverSelectionTimeoutMS: 15_000,
  });

  // Seed the default plans so the public pricing endpoint has something to return.
  const { ensureDefaultPlans } = await import("../src/services/plan.service");
  await ensureDefaultPlans();

  const { app, sessionMiddleware } = createApp({
    sessionStore: new session.MemoryStore(),
    sessionSecret: "test-session-secret-that-is-long-enough-0000",
    deployment: "LOCAL",
    redisClient: redisStub,
  });
  assert.ok(sessionMiddleware, "createApp must return the session middleware");

  server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${port}`;
});

after(async () => {
  if (server) {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
  if (mongoose.connection.readyState === 1) {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
});

test("root and liveness endpoints answer without touching the database", { skip }, async () => {
  const root = await fetch(`${baseUrl}/`);
  assert.equal(root.status, 200);
  assert.equal(await root.text(), "Hello World!");

  const health = await fetch(`${baseUrl}/api/healthcheck`);
  assert.equal(health.status, 200);
  assert.equal(await health.text(), "OK");
});

test("readiness reports dependencies and flips to 503 when Redis is down", { skip }, async () => {
  redisStub.healthy = true;
  const ready = await fetch(`${baseUrl}/api/ready`);
  assert.equal(ready.status, 200);
  const body = await ready.json();
  assert.equal(body.status, "ready");
  assert.equal(body.checks.mongo.ok, true);
  assert.equal(body.checks.redis.ok, true);
  assert.equal(typeof body.uptimeSeconds, "number");

  redisStub.healthy = false;
  const degraded = await fetch(`${baseUrl}/api/ready`);
  assert.equal(degraded.status, 503);
  const degradedBody = await degraded.json();
  assert.equal(degradedBody.status, "not-ready");
  assert.equal(degradedBody.checks.redis.ok, false);
  assert.match(degradedBody.checks.redis.detail, /redis down/);

  redisStub.healthy = true;
});

test("public pricing endpoint returns the seeded plans", { skip }, async () => {
  const res = await fetch(`${baseUrl}/api/billing/plans`);
  assert.equal(res.status, 200);

  const body = await res.json();
  assert.ok(Array.isArray(body.plans), "expected a plans array");
  assert.ok(body.plans.length > 0, "default plans must be seeded");
  assert.ok(
    body.plans.some((plan: any) => plan.id === "free"),
    "the free plan should exist",
  );
});

test("protected routes reject anonymous callers with 401", { skip }, async () => {
  const protectedRoutes: Array<[string, string]> = [
    ["GET", "/api/subscriptions/me"],
    ["GET", "/api/user/get-agent-tools-config"],
    ["POST", "/api/agent/sessions"],
  ];

  for (const [method, path] of protectedRoutes) {
    const res = await fetch(`${baseUrl}${path}`, {
      method,
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: method === "POST" ? "{}" : undefined,
    });
    assert.equal(res.status, 401, `${method} ${path} should require a session`);
    const body = await res.json();
    assert.equal(body.message, "Unauthorized");
  }
});

test("browser navigations are redirected to the frontend login page", { skip }, async () => {
  const res = await fetch(`${baseUrl}/api/subscriptions/me`, {
    headers: { Accept: "text/html,application/xhtml+xml" },
    redirect: "manual",
  });

  assert.equal(res.status, 302);
  assert.equal(res.headers.get("location"), `${FRONTEND_BASE_URL}/login`);
});

test("AJAX requests are never redirected even with an HTML-ish Accept header", { skip }, async () => {
  const res = await fetch(`${baseUrl}/api/subscriptions/me`, {
    headers: {
      Accept: "text/html,application/xhtml+xml",
      "X-Requested-With": "XMLHttpRequest",
    },
    redirect: "manual",
  });

  assert.equal(res.status, 401);
});

test("login with wrong credentials fails cleanly (no 5xx)", { skip }, async () => {
  const res = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "nobody@example.com", password: "wrong-password" }),
  });

  assert.ok(res.status >= 400 && res.status < 500, `unexpected status ${res.status}`);
  const body = await res.json();
  assert.equal(typeof body.message, "string");
  assert.ok(body.message.length > 0);
});

test("invalid JSON bodies are rejected by the parser wrapper", { skip }, async () => {
  const res = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: '{ "email": "broken", ',
  });

  assert.equal(res.status, 400);
  const body = await res.json();
  assert.equal(body.message, "Invalid JSON");
});

test("unknown routes return 404", { skip }, async () => {
  const res = await fetch(`${baseUrl}/api/definitely-not-a-route`);
  assert.equal(res.status, 404);
});

test("CORS preflight is answered for an allowed origin", { skip }, async () => {
  const res = await fetch(`${baseUrl}/api/healthcheck`, {
    method: "OPTIONS",
    headers: {
      Origin: "http://localhost:3001",
      "Access-Control-Request-Method": "GET",
    },
  });

  assert.ok(res.status === 204 || res.status === 200, `unexpected status ${res.status}`);
  assert.equal(res.headers.get("access-control-allow-origin"), "http://localhost:3001");
  assert.equal(res.headers.get("access-control-allow-credentials"), "true");
});
