/**
 * Scope Guard unlock tokens — offline activation with a cryptographic proof.
 *
 * The Scope Guard (see `utils/securityPolicy.ts`) can only be switched off when
 * a deployment presents an **unlock token** that was issued by the vendor's
 * master key. Tokens are minted offline on the maintainer's machine with
 * `scripts/gen-unlock-token.js` (never committed — see `.gitignore`) and pasted
 * into the customer's env file as `SCOPE_GUARD_UNLOCK_TOKEN`.
 *
 * Token format (two segments of `base64url` after a mode prefix):
 *
 *   VEK1.<payload>.<signature>   HMAC-SHA256, key = MASTER_SECRET_KEY
 *   VEK2.<payload>.<signature>   Ed25519,     key = MASTER_UNLOCK_PUBLIC_KEY
 *
 * - `signature` covers the ASCII string `<PREFIX>.<payload>` — exactly the first
 *   two segments, so the payload cannot be swapped or re-generated.
 * - `payload` is `JSON` — `{ v, sub, c, ui, iat, exp }`:
 *   `v` token version, `sub` fixed subject, `c` licensed client/org name,
 *   `ui` assertion that the frontend was built with `build:unlocked`,
 *   `iat`/`exp` issued-at / expiry (unix seconds).
 * - Nothing here is a secret: the *format* is public on purpose (Kerckhoffs's
 *   principle). Only the master key is secret. That is why `VEK2` (Ed25519) is
 *   the recommended mode for customer instances — they receive the **public**
 *   key only and therefore cannot mint tokens themselves, while `VEK1` (HMAC)
 *   requires the shared secret on the server (simpler, but the customer could
 *   re-issue tokens with it).
 *
 * Verification is strictly fail-closed: any malformed, unsigned, wrongly signed
 * or expired token returns `valid: false` (and a machine-readable `reason`), so
 * the caller keeps the guard ON.
 */

import {
  createHmac,
  createPrivateKey,
  createPublicKey,
  sign,
  timingSafeEqual,
  verify,
} from "node:crypto";
import type { KeyObject } from "node:crypto";

/** Env var carrying the token on the deployment (`backend/.env`). */
export const UNLOCK_TOKEN_ENV = "SCOPE_GUARD_UNLOCK_TOKEN";

/** Shared secret for `VEK1` tokens (generator + server). */
export const UNLOCK_MASTER_KEY_ENV = "MASTER_SECRET_KEY";

/** Ed25519 public key for `VEK2` tokens (server side only needs this). */
export const UNLOCK_PUBLIC_KEY_ENV = "MASTER_UNLOCK_PUBLIC_KEY";

/** Token layout version — bumped only when the payload shape changes. */
export const UNLOCK_TOKEN_VERSION = 1;

/** Fixed subject: a token issued for anything else is rejected. */
export const UNLOCK_TOKEN_SUBJECT = "scope-guard-unlock";

/** The frontend-build assertion a token must carry. */
export const UNLOCK_TOKEN_UI_MARKER = "unlocked";

/** Mode prefixes, also used as the signature domain separator. */
export const UNLOCK_TOKEN_PREFIX = { hmac: "VEK1", ed25519: "VEK2" } as const;

export type UnlockTokenMode = keyof typeof UNLOCK_TOKEN_PREFIX;

/** Default validity of a freshly minted token (1 year). */
export const UNLOCK_TOKEN_DEFAULT_TTL_SECONDS = 365 * 24 * 60 * 60;

/** Minimum master-secret length — a short secret is treated as "not configured". */
export const UNLOCK_MASTER_KEY_MIN_LENGTH = 16;

/** Hard cap so a hostile env value cannot make us parse megabytes. */
export const UNLOCK_TOKEN_MAX_LENGTH = 4096;

/** SPKI/DER prefix of a raw 32-byte Ed25519 public key. */
const ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

export interface UnlockTokenPayload {
  v: number;
  sub: string;
  c: string;
  ui: string;
  iat: number;
  exp: number;
}

export type UnlockTokenFailure =
  | "missing"
  | "malformed"
  | "unsupported-version"
  | "wrong-subject"
  | "no-verification-key"
  | "bad-signature"
  | "expired";

export interface UnlockTokenVerification {
  /** true only when signature, subject, payload and expiry all check out. */
  valid: boolean;
  /** false when no token was configured at all. */
  present: boolean;
  mode?: UnlockTokenMode;
  client?: string;
  issuedAt?: string;
  expiresAt?: string;
  reason?: UnlockTokenFailure;
}

const FAILURE_HINTS: Record<UnlockTokenFailure, string> = {
  missing: "no token is configured",
  malformed: "the token is not a valid unlock token",
  "unsupported-version": "the token version is not supported by this build",
  "wrong-subject": "the token was not issued for Scope Guard",
  "no-verification-key": `neither ${UNLOCK_MASTER_KEY_ENV} nor ${UNLOCK_PUBLIC_KEY_ENV} is configured on the server`,
  "bad-signature": "the token signature does not match this instance's key",
  expired: "the token has expired",
};

/** Human sentence for a failed verification (logs, admin API, support). */
export function describeUnlockTokenFailure(reason?: UnlockTokenFailure): string {
  if (!reason) return "the token could not be verified";
  return FAILURE_HINTS[reason];
}

/** `base64url` without padding (works on every supported Node version). */
export function base64UrlEncode(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** Decode `base64`/`base64url` leniently; never throws (garbage → bytes). */
export function base64UrlDecode(value: string): Buffer {
  const normalised = value.replace(/-/g, "+").replace(/_/g, "/");
  const padding = normalised.length % 4;
  const padded = padding === 0 ? normalised : normalised + "=".repeat(4 - padding);
  return Buffer.from(padded, "base64");
}

/** Serialise the payload deterministically (stable key order). */
export function encodeUnlockPayload(payload: UnlockTokenPayload): string {
  return base64UrlEncode(
    JSON.stringify({
      v: payload.v,
      sub: payload.sub,
      c: payload.c,
      ui: payload.ui,
      iat: payload.iat,
      exp: payload.exp,
    }),
  );
}

/** Bytes that are signed/verified: `<PREFIX>.<payload>`. */
export function unlockTokenMessage(prefix: string, payloadB64: string): Buffer {
  return Buffer.from(`${prefix}.${payloadB64}`, "utf8");
}

function readSecret(env: NodeJS.ProcessEnv): string {
  return (env[UNLOCK_MASTER_KEY_ENV] ?? "").trim();
}

/** PEM or raw `base64` → Ed25519 private key; `null` when unusable. */
function toPrivateKey(input: string | KeyObject | undefined): KeyObject | null {
  if (!input) return null;
  if (typeof input !== "string") return input;
  const value = input.trim().replace(/\\n/g, "\n");
  if (!value) return null;
  try {
    if (value.includes("BEGIN PRIVATE KEY")) {
      return createPrivateKey({ key: value, format: "pem" });
    }
    return createPrivateKey({ key: base64UrlDecode(value), format: "der", type: "pkcs8" });
  } catch {
    return null;
  }
}

/**
 * PEM / SPKI-DER / raw-32-byte public key → Ed25519 public key; `null` when the
 * value cannot be interpreted (fail-closed).
 */
export function toUnlockPublicKey(input: string | KeyObject | undefined): KeyObject | null {
  if (!input) return null;
  if (typeof input !== "string") return input;
  const value = input.trim().replace(/\\n/g, "\n");
  if (!value) return null;
  try {
    if (value.includes("BEGIN PUBLIC KEY")) {
      return createPublicKey({ key: value, format: "pem" });
    }
    const der = base64UrlDecode(value);
    if (der.length === 32) {
      return createPublicKey({
        key: Buffer.concat([ED25519_SPKI_PREFIX, der]),
        format: "der",
        type: "spki",
      });
    }
    return createPublicKey({ key: der, format: "der", type: "spki" });
  } catch {
    return null;
  }
}

function toMillis(value?: Date | number): number {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return Date.now();
}

export interface UnlockTokenSignOptions {
  /** Licensed client/org name baked into the token (`c`). */
  client: string;
  /** `VEK1` HMAC-SHA256 key (shared secret). */
  secret?: string;
  /** `VEK2` Ed25519 private key (PEM, DER or `KeyObject`) — preferred. */
  privateKey?: string | KeyObject;
  /** Validity window in seconds (default 1 year). */
  ttlSeconds?: number;
  /** Issue time override (tests / reproducible tokens). */
  now?: Date | number;
  /** Explicit `iat` (tests / golden vectors). */
  issuedAtSeconds?: number;
}

/**
 * Mint a token from the vendor's key material. Ed25519 is used when a private
 * key is supplied, otherwise HMAC-SHA256. Throws when the key material is
 * missing or too short — a weak key must never silently produce a token.
 */
export function signUnlockToken(options: UnlockTokenSignOptions): string {
  const client = String(options.client ?? "").trim();
  if (!client) throw new Error("signUnlockToken: client name is required");

  const ttl = options.ttlSeconds ?? UNLOCK_TOKEN_DEFAULT_TTL_SECONDS;
  if (!Number.isFinite(ttl) || ttl <= 0) {
    throw new Error("signUnlockToken: ttlSeconds must be a positive number");
  }

  const issuedAt =
    typeof options.issuedAtSeconds === "number" && Number.isFinite(options.issuedAtSeconds)
      ? Math.floor(options.issuedAtSeconds)
      : Math.floor(toMillis(options.now) / 1000);

  const payload = encodeUnlockPayload({
    v: UNLOCK_TOKEN_VERSION,
    sub: UNLOCK_TOKEN_SUBJECT,
    c: client,
    ui: UNLOCK_TOKEN_UI_MARKER,
    iat: issuedAt,
    exp: issuedAt + Math.floor(ttl),
  });

  if (options.privateKey) {
    const key = toPrivateKey(options.privateKey);
    if (!key) throw new Error("signUnlockToken: MASTER_UNLOCK_PRIVATE_KEY is not usable");
    const prefix = UNLOCK_TOKEN_PREFIX.ed25519;
    const signature = sign(null, unlockTokenMessage(prefix, payload), key);
    return `${prefix}.${payload}.${base64UrlEncode(signature)}`;
  }

  const secret = (options.secret ?? "").trim();
  if (secret.length < UNLOCK_MASTER_KEY_MIN_LENGTH) {
    throw new Error(
      `signUnlockToken: ${UNLOCK_MASTER_KEY_ENV} must be at least ${UNLOCK_MASTER_KEY_MIN_LENGTH} characters`,
    );
  }
  const prefix = UNLOCK_TOKEN_PREFIX.hmac;
  const signature = createHmac("sha256", secret)
    .update(unlockTokenMessage(prefix, payload))
    .digest();
  return `${prefix}.${payload}.${base64UrlEncode(signature)}`;
}

export interface UnlockTokenVerifyOptions {
  /** `VEK1` shared secret (default: `MASTER_SECRET_KEY` from `env`). */
  secret?: string;
  /** `VEK2` Ed25519 public key (default: `MASTER_UNLOCK_PUBLIC_KEY`). */
  publicKey?: string | KeyObject;
  /** Clock override (tests). */
  now?: Date | number;
  /** Environment to read the key material from (default: `process.env`). */
  env?: NodeJS.ProcessEnv;
}

/**
 * Verify an unlock token against this instance's key material.
 *
 * Never throws: every failure is reported as `{ valid: false, reason }` so the
 * caller (see `resolveScopeGuardState`) stays fail-closed.
 */
export function verifyUnlockToken(
  token: string | null | undefined,
  options: UnlockTokenVerifyOptions = {},
): UnlockTokenVerification {
  const env = options.env ?? process.env;
  const nowMs = toMillis(options.now);
  const raw = typeof token === "string" ? token.trim() : "";

  if (!raw) return { valid: false, present: false, reason: "missing" };
  if (raw.length > UNLOCK_TOKEN_MAX_LENGTH) {
    return { valid: false, present: true, reason: "malformed" };
  }

  const parts = raw.split(".");
  if (parts.length !== 3) return { valid: false, present: true, reason: "malformed" };

  const prefix = parts[0].trim();
  const payloadB64 = parts[1].trim();
  const signatureB64 = parts[2].trim();
  const mode: UnlockTokenMode | undefined =
    prefix === UNLOCK_TOKEN_PREFIX.hmac
      ? "hmac"
      : prefix === UNLOCK_TOKEN_PREFIX.ed25519
        ? "ed25519"
        : undefined;
  if (!mode || !payloadB64 || !signatureB64) {
    return { valid: false, present: true, reason: "malformed" };
  }

  let payload: UnlockTokenPayload;
  try {
    payload = JSON.parse(base64UrlDecode(payloadB64).toString("utf8")) as UnlockTokenPayload;
  } catch {
    return { valid: false, present: true, mode, reason: "malformed" };
  }
  if (!payload || typeof payload !== "object") {
    return { valid: false, present: true, mode, reason: "malformed" };
  }
  if (payload.v !== UNLOCK_TOKEN_VERSION) {
    return { valid: false, present: true, mode, reason: "unsupported-version" };
  }
  if (payload.sub !== UNLOCK_TOKEN_SUBJECT || payload.ui !== UNLOCK_TOKEN_UI_MARKER) {
    return { valid: false, present: true, mode, reason: "wrong-subject" };
  }
  if (
    typeof payload.c !== "string" ||
    !payload.c.trim() ||
    typeof payload.iat !== "number" ||
    typeof payload.exp !== "number" ||
    !Number.isFinite(payload.iat) ||
    !Number.isFinite(payload.exp) ||
    payload.exp <= payload.iat
  ) {
    return { valid: false, present: true, mode, reason: "malformed" };
  }

  const message = unlockTokenMessage(prefix, payloadB64);
  if (mode === "hmac") {
    const secret = (options.secret ?? readSecret(env)).trim();
    if (secret.length < UNLOCK_MASTER_KEY_MIN_LENGTH) {
      return { valid: false, present: true, mode, reason: "no-verification-key" };
    }
    const expected = createHmac("sha256", secret).update(message).digest();
    const provided = base64UrlDecode(signatureB64);
    if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
      return { valid: false, present: true, mode, reason: "bad-signature" };
    }
  } else {
    const publicKey = toUnlockPublicKey(options.publicKey ?? env[UNLOCK_PUBLIC_KEY_ENV]);
    if (!publicKey) {
      return { valid: false, present: true, mode, reason: "no-verification-key" };
    }
    let ok = false;
    try {
      ok = verify(null, message, publicKey, base64UrlDecode(signatureB64));
    } catch {
      ok = false;
    }
    if (!ok) return { valid: false, present: true, mode, reason: "bad-signature" };
  }

  const issuedAt = new Date(payload.iat * 1000).toISOString();
  const expiresAt = new Date(payload.exp * 1000).toISOString();
  if (payload.exp * 1000 <= nowMs) {
    return {
      valid: false,
      present: true,
      mode,
      client: payload.c.trim(),
      issuedAt,
      expiresAt,
      reason: "expired",
    };
  }

  return { valid: true, present: true, mode, client: payload.c.trim(), issuedAt, expiresAt };
}

