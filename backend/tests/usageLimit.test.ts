import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluateUsageLimit,
  UsageCounts,
  UsageLimits,
} from "../src/middlewares/UsageLimit.middleware";

/**
 * Unit tests for the plan-limit evaluation used by `enforceUsageLimit`.
 *
 * `evaluateUsageLimit` is deliberately pure (counts are passed in), which is
 * what lets the multi-resource rewrite be validated without a MongoDB instance.
 * The middleware only adds: auth lookup, admin bypass, the COUNT queries and the
 * 403 response shape — all of which are asserted here on the returned violation.
 */

const limits = (overrides: Partial<UsageLimits> = {}): UsageLimits => ({
  maxConcurrentSessions: 3,
  maxSessionsPerPeriod: 10,
  maxWorkspaces: 2,
  maxMcpTokens: 5,
  ...overrides,
});

const counts = (overrides: Partial<UsageCounts> = {}): UsageCounts => ({
  workspaces: 0,
  concurrentSessions: 0,
  sessionsThisPeriod: 0,
  mcpTokens: 0,
  ...overrides,
});

test("a resource below its limit is allowed", () => {
  assert.equal(
    evaluateUsageLimit("concurrent_sessions", limits(), counts({ concurrentSessions: 2 })),
    null,
  );
  assert.equal(
    evaluateUsageLimit("sessions", limits(), counts({ sessionsThisPeriod: 9 })),
    null,
  );
  assert.equal(evaluateUsageLimit("workspaces", limits(), counts({ workspaces: 1 })), null);
  assert.equal(evaluateUsageLimit("mcp_tokens", limits(), counts({ mcpTokens: 4 })), null);
});

test("reaching the limit blocks the next create (>= is not <)", () => {
  const concurrent = evaluateUsageLimit(
    "concurrent_sessions",
    limits(),
    counts({ concurrentSessions: 3 }),
  );
  assert.deepEqual(concurrent, {
    code: "PLAN_LIMIT_CONCURRENT_SESSIONS",
    message:
      "Concurrent session limit reached (3). Upgrade your plan to run more sessions in parallel.",
    limit: 3,
    current: 3,
  });

  const sessions = evaluateUsageLimit(
    "sessions",
    limits(),
    counts({ sessionsThisPeriod: 10 }),
  );
  assert.equal(sessions?.code, "PLAN_LIMIT_SESSIONS");
  assert.equal(sessions?.limit, 10);
  assert.equal(sessions?.current, 10);

  const workspaces = evaluateUsageLimit("workspaces", limits(), counts({ workspaces: 2 }));
  assert.equal(workspaces?.code, "PLAN_LIMIT_WORKSPACES");
  assert.equal(workspaces?.current, 2);
});

test("over-quota usage keeps reporting the real count", () => {
  const violation = evaluateUsageLimit(
    "concurrent_sessions",
    limits(),
    counts({ concurrentSessions: 7 }),
  );
  assert.equal(violation?.current, 7);
  assert.equal(violation?.limit, 3);
});

test("0, negative and non-finite limits mean unlimited", () => {
  for (const unlimited of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.equal(
      evaluateUsageLimit(
        "concurrent_sessions",
        limits({ maxConcurrentSessions: unlimited }),
        counts({ concurrentSessions: 500 }),
      ),
      null,
      `maxConcurrentSessions=${unlimited} must be unlimited`,
    );
    assert.equal(
      evaluateUsageLimit(
        "sessions",
        limits({ maxSessionsPerPeriod: unlimited }),
        counts({ sessionsThisPeriod: 500 }),
      ),
      null,
      `maxSessionsPerPeriod=${unlimited} must be unlimited`,
    );
    assert.equal(
      evaluateUsageLimit(
        "workspaces",
        limits({ maxWorkspaces: unlimited }),
        counts({ workspaces: 500 }),
      ),
      null,
      `maxWorkspaces=${unlimited} must be unlimited`,
    );
    assert.equal(
      evaluateUsageLimit(
        "mcp_tokens",
        limits({ maxMcpTokens: unlimited }),
        counts({ mcpTokens: 500 }),
      ),
      null,
      `maxMcpTokens=${unlimited} must be unlimited`,
    );
  }
});

test("the admin MCP token override wins over the plan limit", () => {
  const violation = evaluateUsageLimit("mcp_tokens", limits(), counts({ mcpTokens: 2 }), {
    maxMcpTokensOverride: 2,
  });
  assert.equal(violation?.code, "PLAN_LIMIT_MCP_TOKENS");
  assert.equal(violation?.limit, 2, "override is reported, not the plan limit");

  assert.equal(
    evaluateUsageLimit("mcp_tokens", limits(), counts({ mcpTokens: 4 }), {
      maxMcpTokensOverride: 4,
    })?.limit,
    4,
  );

  // Override of 0 stays unlimited (explicit "no limit" for that user).
  assert.equal(
    evaluateUsageLimit("mcp_tokens", limits({ maxMcpTokens: 1 }), counts({ mcpTokens: 9 }), {
      maxMcpTokensOverride: 0,
    }),
    null,
  );

  // Unset override falls back to the plan.
  const planLimited = evaluateUsageLimit(
    "mcp_tokens",
    limits({ maxMcpTokens: 1 }),
    counts({ mcpTokens: 1 }),
  );
  assert.equal(planLimited?.limit, 1);
});

test("each resource is evaluated independently (multi-resource mount)", () => {
  // Sessions are exhausted but workspaces are not: creating a workspace inside
  // an existing workspace must not be blocked by an unrelated session quota.
  const current = counts({ workspaces: 0, concurrentSessions: 3, sessionsThisPeriod: 10 });

  assert.notEqual(evaluateUsageLimit("concurrent_sessions", limits(), current), null);
  assert.notEqual(evaluateUsageLimit("sessions", limits(), current), null);
  assert.equal(evaluateUsageLimit("workspaces", limits(), current), null);
});

test("agent_iterations is never blocked by the middleware", () => {
  assert.equal(
    evaluateUsageLimit(
      "agent_iterations",
      limits({ maxSessionsPerPeriod: 1 }),
      counts({ sessionsThisPeriod: 99 }),
    ),
    null,
  );
});
