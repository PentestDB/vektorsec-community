/**
 * DRM license manager — ties the machine HWID, the (optional) license key and
 * the 30-day auto-trial into one synchronous, cached `LicenseState` that
 * `securityPolicy.ts` can consult without awaiting.
 *
 * Enforcement is fail-closed:
 *   - `DRM_ENFORCED_IN_CODE` + a configured license public key = DRM active.
 *   - Before `initializeLicenseManager()` completes, `getLicenseState()`
 *     returns `valid: false` (a locked guard), never "open".
 *   - A missing/invalid/expired/HWID-mismatched key is **not** valid.
 *   - The auto-trial only starts when there is no license key at all (first
 *     install on a new HWID). A present-but-invalid key never grants a trial.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

import { formatHardwareId, hashHardwareId, normalizeHardwareId } from "./hardwareId";
import { evaluateTrial, verifyLicenseKey, type LicenseType, type TrialRecord } from "./license";
import {
  collectHardwareFingerprintNative,
  getEmbeddedLicensePublicKey,
} from "./nativeBinding";

export const LICENSE_KEY_ENV = "VEKTORSEC_LICENSE_KEY";
export const LICENSE_PUBLIC_KEY_ENV = "VEKTORSEC_LICENSE_PUBLIC_KEY";
export const TRIAL_STORE_ENV = "VEKTORSEC_TRIAL_STORE";

/** Compile-time switch: ship `true` to enforce DRM in the desktop build. */
export const DRM_ENFORCED_IN_CODE = true;

export type LicenseStateReason =
  | "not-enforced"
  | "not-evaluated"
  | "valid-license"
  | "valid-trial"
  | "trial-expired"
  | "missing"
  | "malformed"
  | "unsupported-version"
  | "wrong-subject"
  | "unknown-type"
  | "no-verification-key"
  | "bad-signature"
  | "hwid-mismatch"
  | "expired";

export interface LicenseState {
  /** true when DRM is active on this build (public key configured). */
  enforced: boolean;
  /** true only when the guard may be unlocked (valid key or active trial). */
  valid: boolean;
  reason: LicenseStateReason;
  source: "none" | "trial" | "license-key";
  type?: LicenseType;
  client?: string;
  hwid?: string;
  /** ISO date, or `null` for an `unlimited` license. */
  expiresAt?: string | null;
  trial?: {
    active: boolean;
    startedAt?: string;
    expiresAt?: string;
    remainingDays?: number;
  };
}

const NOT_ENFORCED_STATE: LicenseState = {
  enforced: false,
  valid: false,
  reason: "not-enforced",
  source: "none",
};

const NOT_EVALUATED_STATE: LicenseState = {
  enforced: false,
  valid: false,
  reason: "not-evaluated",
  source: "none",
};

let cachedState: LicenseState = NOT_EVALUATED_STATE;
let initialized = false;

function readPublicKey(): string {
  const embedded = getEmbeddedLicensePublicKey();
  if (embedded) return embedded;
  return (process.env[LICENSE_PUBLIC_KEY_ENV] ?? "").trim().replace(/\\n/g, "\n");
}

/** DRM is active when the build ships enforcement and a public key exists. */
export function isLicenseEnforced(): boolean {
  return DRM_ENFORCED_IN_CODE && readPublicKey().length > 0;
}

/** Current license state (synchronous; safe to call before init — fails closed). */
export function getLicenseState(): LicenseState {
  return cachedState;
}

/** Where the per-machine trial record lives. */
export function trialStorePath(): string {
  const override = process.env[TRIAL_STORE_ENV];
  if (override) return override;
  return join(homedir(), ".vektorsec", "license-trial.json");
}

function readTrialRecord(path: string): TrialRecord | null {
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as TrialRecord) : null;
  } catch {
    return null;
  }
}

function writeTrialRecord(path: string, record: TrialRecord): void {
  try {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify(record, null, 2));
  } catch {
    /* best effort — a missing store just means the trial restarts next time */
  }
}

/**
 * Compute the HWID, verify any configured license key, and (only when no key is
 * present) start/continue the 30-day auto-trial. Cached; call once at boot.
 */
export async function initializeLicenseManager(): Promise<LicenseState> {
  if (initialized) return cachedState;
  initialized = true;

  if (!isLicenseEnforced()) {
    cachedState = NOT_ENFORCED_STATE;
    return cachedState;
  }

  const publicKey = readPublicKey();
  const hwid = formatHardwareId(hashHardwareId(await collectHardwareFingerprintNative()));
  const normalized = normalizeHardwareId(hwid);
  const token = (process.env[LICENSE_KEY_ENV] ?? "").trim();

  const verification = verifyLicenseKey(token, { hwid, publicKey });
  if (verification.valid) {
    cachedState = {
      enforced: true,
      valid: true,
      reason: "valid-license",
      source: "license-key",
      type: verification.type,
      client: verification.client,
      hwid: verification.hwid,
      expiresAt: verification.expiresAt,
    };
    return cachedState;
  }

  if (!verification.present) {
    // No key at all → first install on this HWID auto-starts the 30-day trial.
    const trialPath = trialStorePath();
    const record = readTrialRecord(trialPath);
    const evaluation = evaluateTrial(record, normalized, Date.now());
    if (evaluation.action === "start") {
      writeTrialRecord(trialPath, {
        hwid: normalized,
        startedAtMs: evaluation.startedAtMs,
        expiresAtMs: evaluation.expiresAtMs,
      });
    }

    if (evaluation.active) {
      cachedState = {
        enforced: true,
        valid: true,
        reason: "valid-trial",
        source: "trial",
        hwid: normalized,
        expiresAt: evaluation.expiresAtMs ? new Date(evaluation.expiresAtMs).toISOString() : null,
        trial: {
          active: true,
          startedAt: evaluation.startedAtMs
            ? new Date(evaluation.startedAtMs).toISOString()
            : undefined,
          expiresAt: evaluation.expiresAtMs
            ? new Date(evaluation.expiresAtMs).toISOString()
            : undefined,
          remainingDays: evaluation.remainingDays,
        },
      };
      return cachedState;
    }

    cachedState = {
      enforced: true,
      valid: false,
      reason: "trial-expired",
      source: "none",
      hwid: normalized,
      trial: {
        active: false,
        startedAt: evaluation.startedAtMs
          ? new Date(evaluation.startedAtMs).toISOString()
          : undefined,
        expiresAt: evaluation.expiresAtMs
          ? new Date(evaluation.expiresAtMs).toISOString()
          : undefined,
      },
    };
    return cachedState;
  }

  // A key is present but did not verify — fail closed, no trial is granted.
  cachedState = {
    enforced: true,
    valid: false,
    reason: (verification.reason ?? "malformed") as LicenseStateReason,
    source: "none",
    type: verification.type,
    client: verification.client,
    hwid: normalized,
    expiresAt: verification.expiresAt ?? null,
  };
  return cachedState;
}

/** Test-only reset (the module cache is intentionally sticky in production). */
export function resetLicenseManagerForTests(): void {
  cachedState = NOT_EVALUATED_STATE;
  initialized = false;
}
