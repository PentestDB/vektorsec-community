/**
 * VektorSec hardware-bound license keys.
 *
 * Format: `VEKL1.<payload>.<signature>` — Ed25519-signed, HWID-bound.
 * `payload` is base64url JSON: `{ v, sub, typ, hwid, c, iat, exp }`.
 *   typ: `trial` | `60d` | `1y` | `unlimited`; exp: unix seconds or `null`.
 *
 * The signature covers `<VEKL1>.<payload>` with the vendor's **private** key;
 * customers only receive the **public** key, so they cannot mint/extend keys.
 * Verification is fail-closed: missing/malformed/wrongly-signed/HWID-mismatched
 * or expired keys return `valid: false` with a machine-readable `reason`.
 */

import {
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  sign,
  verify,
  type KeyObject,
} from "node:crypto";

import { normalizeHardwareId } from "./hardwareId";

export const LICENSE_TOKEN_PREFIX = "VEKL1";
export const LICENSE_TOKEN_SUBJECT = "vektorsec-license";
export const LICENSE_TOKEN_VERSION = 1;

export const LICENSE_TYPES = ["trial", "60d", "1y", "unlimited"] as const;
export type LicenseType = (typeof LICENSE_TYPES)[number];

/** A fresh trial lasts 30 days. */
export const TRIAL_DURATION_SECONDS = 30 * 24 * 60 * 60;

/** Hard cap so a hostile env value cannot make us parse megabytes. */
export const LICENSE_TOKEN_MAX_LENGTH = 8192;

/** SPKI/DER prefix of a raw 32-byte Ed25519 public key. */
const ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

const LICENSE_TYPE_DURATION_SECONDS: Record<Exclude<LicenseType, "unlimited">, number> = {
  trial: TRIAL_DURATION_SECONDS,
  "60d": 60 * 24 * 60 * 60,
  "1y": 365 * 24 * 60 * 60,
};

/** Default validity of a non-`unlimited` license, in seconds (or `null`). */
export function licenseTypeDurationSeconds(type: LicenseType): number | null {
  if (type === "unlimited") return null;
  return LICENSE_TYPE_DURATION_SECONDS[type];
}

export interface LicensePayload {
  v: number;
  sub: string;
  typ: LicenseType;
  hwid: string;
  c: string;
  iat: number;
  exp: number | null;
}

export type LicenseFailureReason =
  | "missing"
  | "malformed"
  | "unsupported-version"
  | "wrong-subject"
  | "unknown-type"
  | "no-verification-key"
  | "bad-signature"
  | "hwid-mismatch"
  | "expired";

export interface LicenseVerification {
  valid: boolean;
  present: boolean;
  type?: LicenseType;
  client?: string;
  hwid?: string;
  issuedAt?: string;
  expiresAt?: string | null;
  reason?: LicenseFailureReason;
}

const FAILURE_HINTS: Record<LicenseFailureReason, string> = {
  missing: "no license key is configured",
  malformed: "the license key is not a valid VektorSec license",
  "unsupported-version": "the license version is not supported by this build",
  "wrong-subject": "the token was not issued as a VektorSec license",
  "unknown-type": "the license package type is not recognised",
  "no-verification-key": "no license public key is configured on this machine",
  "bad-signature": "the license signature does not match the vendor's public key",
  "hwid-mismatch": "the license is bound to a different machine (HWID mismatch)",
  expired: "the license has expired",
};

export function describeLicenseFailure(reason?: LicenseFailureReason): string {
  if (!reason) return "the license could not be verified";
  return FAILURE_HINTS[reason];
}

export function licenseBase64UrlEncode(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export function licenseBase64UrlDecode(value: string): Buffer {
  const normalised = value.replace(/-/g, "+").replace(/_/g, "/");
  const padding = normalised.length % 4;
  const padded = padding === 0 ? normalised : normalised + "=".repeat(4 - padding);
  return Buffer.from(padded, "base64");
}

export function encodeLicensePayload(payload: LicensePayload): string {
  return licenseBase64UrlEncode(
    JSON.stringify({
      v: payload.v,
      sub: payload.sub,
      typ: payload.typ,
      hwid: payload.hwid,
      c: payload.c,
      iat: payload.iat,
      exp: payload.exp,
    }),
  );
}

export function licenseTokenMessage(prefix: string, payloadB64: string): Buffer {
  return Buffer.from(`${prefix}.${payloadB64}`, "utf8");
}

function toLicensePrivateKey(input: string | KeyObject | undefined): KeyObject | null {
  if (!input) return null;
  if (typeof input !== "string") return input;
  const value = input.trim().replace(/\\n/g, "\n");
  if (!value) return null;
  try {
    if (value.includes("BEGIN PRIVATE KEY")) {
      return createPrivateKey({ key: value, format: "pem" });
    }
    return createPrivateKey({ key: licenseBase64UrlDecode(value), format: "der", type: "pkcs8" });
  } catch {
    return null;
  }
}

export function toLicensePublicKey(input: string | KeyObject | undefined): KeyObject | null {
  if (!input) return null;
  if (typeof input !== "string") return input;
  const value = input.trim().replace(/\\n/g, "\n");
  if (!value) return null;
  try {
    if (value.includes("BEGIN PUBLIC KEY")) {
      return createPublicKey({ key: value, format: "pem" });
    }
    const der = licenseBase64UrlDecode(value);
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

export interface LicenseSignOptions {
  type: LicenseType;
  /** Machine HWID the key is bound to (any representation is normalised). */
  hwid: string;
  client: string;
  privateKey: string | KeyObject;
  /** Explicit issue time (tests / reproducible keys). */
  issuedAtSeconds?: number;
  /** Override the package default expiry (unix seconds); ignored for `unlimited`. */
  expiresAtSeconds?: number | null;
  now?: Date | number;
}

function toMillis(value?: Date | number): number {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return Date.now();
}

/**
 * Mint a license key with the vendor's Ed25519 **private** key. Throws on
 * missing/invalid inputs — a bad key must never silently produce a license.
 */
export function signLicenseKey(options: LicenseSignOptions): string {
  const type = options.type;
  if (!LICENSE_TYPES.includes(type)) throw new Error("signLicenseKey: unknown license type");
  const client = String(options.client ?? "").trim();
  if (!client) throw new Error("signLicenseKey: client name is required");
  const hwid = normalizeHardwareId(options.hwid);
  if (!hwid) throw new Error("signLicenseKey: a hardware id (HWID) is required");

  const issuedAt =
    typeof options.issuedAtSeconds === "number" && Number.isFinite(options.issuedAtSeconds)
      ? Math.floor(options.issuedAtSeconds)
      : Math.floor(toMillis(options.now) / 1000);

  let exp: number | null;
  if (type === "unlimited") {
    exp = null;
  } else if (typeof options.expiresAtSeconds === "number" && Number.isFinite(options.expiresAtSeconds)) {
    exp = Math.floor(options.expiresAtSeconds);
    if (exp <= issuedAt) throw new Error("signLicenseKey: expiry must be after the issue time");
  } else {
    exp = issuedAt + (licenseTypeDurationSeconds(type) ?? 0);
  }

  const payload = encodeLicensePayload({
    v: LICENSE_TOKEN_VERSION,
    sub: LICENSE_TOKEN_SUBJECT,
    typ: type,
    hwid,
    c: client,
    iat: issuedAt,
    exp,
  });

  const key = toLicensePrivateKey(options.privateKey);
  if (!key) throw new Error("signLicenseKey: the license private key is not usable");

  const signature = sign(null, licenseTokenMessage(LICENSE_TOKEN_PREFIX, payload), key);
  return `${LICENSE_TOKEN_PREFIX}.${payload}.${licenseBase64UrlEncode(signature)}`;
}

export interface LicenseVerifyOptions {
  /** The machine's current HWID (any representation is normalised). */
  hwid: string;
  /** Ed25519 public key (PEM / SPKI-DER / raw 32 bytes). */
  publicKey?: string | KeyObject;
  now?: Date | number;
}

/**
 * Verify a license key against this machine's HWID + the vendor's public key.
 * Never throws — every failure is reported as `{ valid: false, reason }` so the
 * caller (see `licenseManager` / `securityPolicy`) stays fail-closed.
 */
export function verifyLicenseKey(
  token: string | null | undefined,
  options: LicenseVerifyOptions,
): LicenseVerification {
  const nowMs = toMillis(options.now);
  const raw = typeof token === "string" ? token.trim() : "";

  if (!raw) return { valid: false, present: false, reason: "missing" };
  if (raw.length > LICENSE_TOKEN_MAX_LENGTH) {
    return { valid: false, present: true, reason: "malformed" };
  }

  const parts = raw.split(".");
  if (parts.length !== 3) return { valid: false, present: true, reason: "malformed" };

  const [prefix, payloadB64, signatureB64] = parts as [string, string, string];
  if (prefix !== LICENSE_TOKEN_PREFIX || !payloadB64 || !signatureB64) {
    return { valid: false, present: true, reason: "malformed" };
  }

  let payload: LicensePayload;
  try {
    payload = JSON.parse(licenseBase64UrlDecode(payloadB64).toString("utf8")) as LicensePayload;
  } catch {
    return { valid: false, present: true, reason: "malformed" };
  }
  if (!payload || typeof payload !== "object") {
    return { valid: false, present: true, reason: "malformed" };
  }
  if (payload.v !== LICENSE_TOKEN_VERSION) {
    return { valid: false, present: true, reason: "unsupported-version" };
  }
  if (payload.sub !== LICENSE_TOKEN_SUBJECT) {
    return { valid: false, present: true, reason: "wrong-subject" };
  }
  if (!LICENSE_TYPES.includes(payload.typ)) {
    return { valid: false, present: true, reason: "unknown-type" };
  }
  if (
    typeof payload.c !== "string" ||
    !payload.c.trim() ||
    typeof payload.hwid !== "string" ||
    !payload.hwid.trim() ||
    typeof payload.iat !== "number" ||
    !Number.isFinite(payload.iat) ||
    (payload.typ === "unlimited"
      ? payload.exp !== null
      : typeof payload.exp !== "number" || !Number.isFinite(payload.exp) || payload.exp <= payload.iat)
  ) {
    return { valid: false, present: true, reason: "malformed" };
  }

  const publicKey = toLicensePublicKey(options.publicKey);
  if (!publicKey) {
    return { valid: false, present: true, reason: "no-verification-key" };
  }
  let signatureOk = false;
  try {
    signatureOk = verify(
      null,
      licenseTokenMessage(prefix, payloadB64),
      publicKey,
      licenseBase64UrlDecode(signatureB64),
    );
  } catch {
    signatureOk = false;
  }
  if (!signatureOk) return { valid: false, present: true, reason: "bad-signature" };

  const issuedAt = new Date(payload.iat * 1000).toISOString();
  const expiresAt = payload.exp === null ? null : new Date(payload.exp * 1000).toISOString();

  if (normalizeHardwareId(options.hwid) !== normalizeHardwareId(payload.hwid)) {
    return {
      valid: false,
      present: true,
      type: payload.typ,
      client: payload.c.trim(),
      hwid: payload.hwid,
      issuedAt,
      expiresAt,
      reason: "hwid-mismatch",
    };
  }

  if (payload.typ !== "unlimited" && (payload.exp as number) * 1000 <= nowMs) {
    return {
      valid: false,
      present: true,
      type: payload.typ,
      client: payload.c.trim(),
      hwid: payload.hwid,
      issuedAt,
      expiresAt,
      reason: "expired",
    };
  }

  return {
    valid: true,
    present: true,
    type: payload.typ,
    client: payload.c.trim(),
    hwid: payload.hwid,
    issuedAt,
    expiresAt,
  };
}

/** On-disk trial record (per machine). */
export interface TrialRecord {
  hwid?: string;
  startedAtMs?: number;
  expiresAtMs?: number;
}

export interface TrialEvaluation {
  active: boolean;
  action: "start" | "continue" | "expired";
  startedAtMs?: number;
  expiresAtMs?: number;
  remainingDays?: number;
}

/**
 * Evaluate the 30-day auto-trial for a machine (pure — no file I/O here).
 * A missing record, or a record for a *different* HWID, means "start a fresh
 * trial"; a matching record that is still in the future continues; a matching
 * record that has passed means the trial is over (fail-closed → locked).
 */
export function evaluateTrial(
  record: TrialRecord | null | undefined,
  hwid: string,
  nowMs: number,
): TrialEvaluation {
  const normalized = normalizeHardwareId(hwid);
  const matches =
    !!record &&
    typeof record.startedAtMs === "number" &&
    typeof record.expiresAtMs === "number" &&
    normalizeHardwareId(record.hwid ?? "") === normalized;

  if (!matches) {
    return {
      active: true,
      action: "start",
      startedAtMs: nowMs,
      expiresAtMs: nowMs + TRIAL_DURATION_SECONDS * 1000,
    };
  }

  const startedAtMs = record?.startedAtMs as number;
  const expiresAtMs = record?.expiresAtMs as number;
  if (expiresAtMs > nowMs) {
    return {
      active: true,
      action: "continue",
      startedAtMs,
      expiresAtMs,
      remainingDays: (expiresAtMs - nowMs) / 86_400_000,
    };
  }

  return { active: false, action: "expired", startedAtMs, expiresAtMs };
}

/** Generate a fresh Ed25519 license key pair (PEM) — admin tooling / tests. */
export function generateLicenseKeyPair(): { publicKeyPem: string; privateKeyPem: string } {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519", {
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  return { publicKeyPem: publicKey, privateKeyPem: privateKey };
}
