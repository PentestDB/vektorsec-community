import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createLogger,
  isSensitiveKey,
  redactSecrets,
  renderLogEvent,
  LogEvent,
} from "../src/utils/logger";

/** Logger that records events instead of writing to the console. */
function capture(options: Parameters<typeof createLogger>[0] = {}) {
  const events: LogEvent[] = [];
  const rendered: string[] = [];
  const log = createLogger({
    ...options,
    sink: (event, line) => {
      events.push(event);
      rendered.push(line);
    },
    now: () => new Date("2026-09-22T10:00:00.000Z"),
  });
  return { log, events, rendered };
}

test("isSensitiveKey matches credential-ish names regardless of separators", () => {
  for (const key of [
    "password",
    "passwordHash",
    "PASSWORD",
    "api_key",
    "apiKey",
    "API-KEY",
    "refresh_token",
    "authorization",
    "userPassword",
    "clientSecret",
    "TELEGRAM_BOT_TOKEN",
    "set-cookie",
  ]) {
    assert.equal(isSensitiveKey(key), true, `${key} should be sensitive`);
  }

  for (const key of ["userId", "sessionId", "model", "tool", "email", "hostname"]) {
    assert.equal(isSensitiveKey(key), false, `${key} should not be sensitive`);
  }
});

test("isSensitiveKey does not redact usage counters (observability guard)", () => {
  for (const key of [
    "tokens",
    "tokensIn",
    "tokensOut",
    "maxTokens",
    "maxTokensPerDay",
    "tokenCount",
    "totalTokens",
    "otpRequired", // not a secret value itself
  ]) {
    assert.equal(isSensitiveKey(key), false, `${key} must stay loggable`);
  }
});

test("redactSecrets scrubs nested objects, arrays and keeps safe data", () => {
  const redacted = redactSecrets({
    email: "user@example.com",
    password: "hunter2",
    nested: { apiKey: "sk-123", tokens: ["a", "b"] },
    list: [{ refreshToken: "rt-1" }, { note: "fine" }],
  }) as Record<string, any>;

  assert.equal(redacted.email, "user@example.com");
  assert.equal(redacted.password, "[REDACTED]");
  assert.equal(redacted.nested.apiKey, "[REDACTED]");
  assert.deepEqual(redacted.nested.tokens, ["a", "b"]);
  assert.equal(redacted.list[0].refreshToken, "[REDACTED]");
  assert.equal(redacted.list[1].note, "fine");
});

test("redactSecrets serialises Errors and survives circular references", () => {
  const error = new Error("boom");
  const serialised = redactSecrets({ err: error }) as Record<string, any>;
  assert.equal(serialised.err.name, "Error");
  assert.equal(serialised.err.message, "boom");
  assert.match(serialised.err.stack, /boom/);

  const circular: Record<string, unknown> = { name: "loop" };
  circular.self = circular;
  const handled = redactSecrets(circular) as Record<string, any>;
  assert.equal(handled.name, "loop");
  assert.equal(handled.self, "[Circular]");
});

test("redactSecrets truncates deeply nested structures instead of exploding", () => {
  let deep: Record<string, unknown> = { value: "end" };
  for (let i = 0; i < 12; i += 1) deep = { nested: deep };

  const redacted = JSON.stringify(redactSecrets(deep));
  assert.match(redacted, /\[Truncated\]/);
});

test("logger filters events below the configured level", () => {
  const { log, events } = capture({ level: "warn" });

  log.debug("dropped");
  log.info("dropped");
  log.warn("kept");
  log.error("kept");

  assert.deepEqual(
    events.map((event) => event.level),
    ["warn", "error"],
  );
});

test("logger emits one JSON line per event with time, level and fields", () => {
  const { log, rendered } = capture({ json: true });

  log.info("run started", { sessionId: "s1", model: "claude" });

  const parsed = JSON.parse(rendered[0]);
  assert.equal(parsed.time, "2026-09-22T10:00:00.000Z");
  assert.equal(parsed.level, "info");
  assert.equal(parsed.message, "run started");
  assert.equal(parsed.sessionId, "s1");
  assert.equal(parsed.model, "claude");
  assert.equal(rendered[0].includes("\n"), false, "one line per event");
});

test("logger redacts secrets before they reach the sink", () => {
  const { log, events } = capture({ json: true });

  log.error("login failed", {
    email: "user@example.com",
    password: "hunter2",
    headers: { authorization: "Bearer abc", cookie: "sid=123" },
  });

  const [event] = events;
  assert.equal(event.email, "user@example.com");
  assert.equal(event.password, "[REDACTED]");
  assert.equal((event.headers as any).authorization, "[REDACTED]");
  assert.equal((event.headers as any).cookie, "[REDACTED]");
});

test("child loggers merge context without leaking into siblings", () => {
  const { log, events } = capture({ json: true });

  const sessionLog = log.child({ sessionId: "s-1" });
  const toolLog = log.child({ tool: "run_bash" });

  sessionLog.info("a");
  toolLog.info("b");
  log.info("c");

  assert.equal(events[0].sessionId, "s-1");
  assert.equal(events[0].tool, undefined);
  assert.equal(events[1].tool, "run_bash");
  assert.equal(events[1].sessionId, undefined);
  assert.equal(events[2].sessionId, undefined);
  assert.equal(events[2].tool, undefined);
});

test("renderLogEvent produces a compact human line outside JSON mode", () => {
  const line = renderLogEvent(
    { time: "2026-09-22T10:00:00.000Z", level: "warn", message: "slow tool", tool: "nmap" },
    false,
  );

  assert.match(line, /^10:00:00\.000 WARN {2}slow tool/);
  assert.match(line, /"tool":"nmap"/);
});
