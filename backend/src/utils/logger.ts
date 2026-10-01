/**
 * Tiny structured logger.
 *
 * Goals (deliberately dependency-free):
 *  - one JSON line per event in production / container logs (`LOG_JSON=1`
 *    forces it), human-readable lines in development;
 *  - **secret redaction**: anything that looks like a credential is replaced
 *    before it can reach a log file or a log aggregator;
 *  - child loggers that carry context (`sessionId`, `tool`, `userId`);
 *  - a pluggable `sink`, so tests can assert on emitted events instead of
 *    capturing stdout.
 *
 * Usage:
 *   const log = createLogger({ context: { scope: "agent" } });
 *   log.info("run started", { sessionId, model });
 *   log.error("tool failed", { tool: "run_bash", err });
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogEvent {
  time: string;
  level: LogLevel;
  message: string;
  [key: string]: unknown;
}

export interface Logger {
  debug(message: string, fields?: Record<string, unknown>): void;
  info(message: string, fields?: Record<string, unknown>): void;
  warn(message: string, fields?: Record<string, unknown>): void;
  error(message: string, fields?: Record<string, unknown>): void;
  /** New logger that merges additional context into every event. */
  child(context: Record<string, unknown>): Logger;
}

export interface LoggerOptions {
  /** Minimum level to emit (default: `LOG_LEVEL` env, else debug in dev). */
  level?: LogLevel;
  /** Emit one JSON object per line (default: `LOG_JSON=1` or NODE_ENV=production). */
  json?: boolean;
  /** Fields merged into every event. */
  context?: Record<string, unknown>;
  /** Where events go (default: console). */
  sink?: (event: LogEvent, rendered: string) => void;
  /** Current time source (tests). */
  now?: () => Date;
}

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

/**
 * Field names whose values are never logged.
 *
 * Matching is case-insensitive and ignores separators, so `api_key`, `apiKey`
 * and `API-KEY` all match. Two rules avoid false positives that would destroy
 * observability (`tokens`, `tokensIn`, `maxTokens` are *counters*, not secrets):
 *   - any of SENSITIVE_SUBSTRINGS anywhere in the normalised name;
 *   - a name that *ends* with "token" (accessToken, botToken, …) or is exactly
 *     one of SENSITIVE_EXACT.
 */
const SENSITIVE_SUBSTRINGS = [
  "password",
  "passwd",
  "secret",
  "apikey",
  "authorization",
  "cookie",
  "setcookie",
  "privatekey",
  "sesssecret",
  "sessionsecret",
  "webhookurl",
  "totpsecret",
  "credential",
  "creditcard",
];

const SENSITIVE_EXACT = new Set(["token", "otp", "pwd", "bearer", "accesstoken"]);

const REDACTED = "[REDACTED]";
const MAX_DEPTH = 6;

function normaliseKey(key: string): string {
  return key.toLowerCase().replace(/[_\-\s.]/g, "");
}

export function isSensitiveKey(key: string): boolean {
  const normalised = normaliseKey(key);
  if (!normalised) return false;
  if (SENSITIVE_EXACT.has(normalised)) return true;
  if (SENSITIVE_SUBSTRINGS.some((sensitive) => normalised.includes(sensitive))) return true;
  return normalised.endsWith("token");
}

/**
 * Recursively redact sensitive values. Handles plain objects, arrays and
 * `Error` instances (which are serialised to name/message/stack), stops at
 * `MAX_DEPTH` and tolerates circular references.
 */
export function redactSecrets(value: unknown, depth = 0, seen = new WeakSet<object>()): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "function") return "[Function]";

  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack };
  }

  if (depth >= MAX_DEPTH) return "[Truncated]";

  if (typeof value === "object") {
    const asObject = value as object;
    if (seen.has(asObject)) return "[Circular]";
    seen.add(asObject);

    if (Array.isArray(value)) {
      return value.map((item) => redactSecrets(item, depth + 1, seen));
    }

    const result: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      result[key] = isSensitiveKey(key) ? REDACTED : redactSecrets(nested, depth + 1, seen);
    }
    return result;
  }

  return String(value);
}

function resolveLevel(level?: LogLevel): LogLevel {
  if (level) return level;
  const fromEnv = (process.env.LOG_LEVEL ?? "").toLowerCase();
  if (fromEnv === "debug" || fromEnv === "info" || fromEnv === "warn" || fromEnv === "error") {
    return fromEnv;
  }
  return process.env.NODE_ENV === "production" ? "info" : "debug";
}

function resolveJson(json?: boolean): boolean {
  if (typeof json === "boolean") return json;
  if (process.env.LOG_JSON === "1") return true;
  return process.env.NODE_ENV === "production";
}

/** Render an event: JSON line for machines, compact line for humans. */
export function renderLogEvent(event: LogEvent, json: boolean): string {
  if (json) return JSON.stringify(event);

  const { time, level, message, ...fields } = event;
  const hasFields = Object.keys(fields).length > 0;
  return (
    `${time.slice(11, 23)} ${level.toUpperCase().padEnd(5)} ${message}` +
    (hasFields ? ` ${JSON.stringify(fields)}` : "")
  );
}

export function createLogger(options: LoggerOptions = {}): Logger {
  const minLevel = LEVEL_ORDER[resolveLevel(options.level)];
  const json = resolveJson(options.json);
  const context = options.context ?? {};
  const now = options.now ?? (() => new Date());
  const sink =
    options.sink ??
    ((_event: LogEvent, rendered: string) => {
      console.log(rendered);
    });

  const emit = (level: LogLevel, message: string, fields?: Record<string, unknown>) => {
    if (LEVEL_ORDER[level] < minLevel) return;

    const event: LogEvent = {
      time: now().toISOString(),
      level,
      message,
      ...(redactSecrets({ ...context, ...(fields ?? {}) }) as Record<string, unknown>),
    };

    sink(event, renderLogEvent(event, json));
  };

  return {
    debug: (message, fields) => emit("debug", message, fields),
    info: (message, fields) => emit("info", message, fields),
    warn: (message, fields) => emit("warn", message, fields),
    error: (message, fields) => emit("error", message, fields),
    child: (extra) =>
      createLogger({
        level: options.level,
        json: options.json,
        context: { ...context, ...extra },
        sink: options.sink,
        now: options.now,
      }),
  };
}

/** Shared application logger (startup, HTTP plumbing, background jobs). */
export const logger = createLogger({ context: { service: "vektorsec-backend" } });
