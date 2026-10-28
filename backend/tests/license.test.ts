/**
 * License-key unit tests (see `src/utils/drm/license.ts`).
 *
 * The verifier is the gatekeeper for the desktop DRM, so every package type and
 * every failure mode is pinned here: valid round-trip, HWID binding, tamper
 * rejection, expiry (fail-closed), unlimited (no expiry), unknown type/wrong
 * subject, weak/missing inputs, and the pure 30-day trial evaluator.
 */

import assert from "node:assert/strict";
import test from "node:test";
import { createPrivateKey, sign as cryptoSign } from "node:crypto";

import { normalizeHardwareId } from "../src/utils/drm/hardwareId";
import {
  LICENSE_TOKEN_PREFIX,
  LICENSE_TOKEN_SUBJECT,
  LICENSE_TOKEN_VERSION,
  TRIAL_DURATION_SECONDS,
  encodeLicensePayload,
  evaluateTrial,
  generateLicenseKeyPair,
  licenseBase64UrlDecode,
  licenseBase64UrlEncode,
  licenseTypeDurationSeconds,
  signLicenseKey,
  verifyLicenseKey,
  type LicensePayload,
} from "../src/utils/drm/license";

const { publicKeyPem, privateKeyPem } = generateLicenseKeyPair();
const HWID = "HWID-ABCD-1234-5678-90EF";
const OTHER_HWID = "HWID-0000-1111-2222-3333";
const IAT = 1_700_000_000; // unix seconds

function nowAt(seconds: number): Date {
  return new Date(seconds * 1000);
}

/** Sign an arbitrary payload with the test private key (for negative cases). */
function forge(payload: Partial<LicensePayload>): string {
  const full = {
    v: LICENSE_TOKEN_VERSION,
    sub: LICENSE_TOKEN_SUBJECT,
    typ: "1y",
    hwid: normalizeHardwareId(HWID),
    c: "Acme",
    iat: IAT,
    exp: IAT + 86_400,
    ...payload,
  };
  const payloadB64 = encodeLicensePayload(full as LicensePayload);
  const signature = cryptoSign(
    null,
    Buffer.from(`${LICENSE_TOKEN_PREFIX}.${payloadB64}`, "utf8"),
    createPrivateKey(privateKeyPem),
  );
  return `${LICENSE_TOKEN_PREFIX}.${payloadB64}.${licenseBase64UrlEncode(signature)}`;
}

test("a 1-year license round-trips and is bound to its HWID", () => {
  const key = signLicenseKey({
    type: "1y",
    hwid: HWID,
    client: "Acme Corp",
    privateKey: privateKeyPem,
    issuedAtSeconds: IAT,
  });

  const result = verifyLicenseKey(key, { hwid: HWID, publicKey: publicKeyPem, now: nowAt(IAT + 1) });
  assert.equal(result.valid, true);
  assert.equal(result.type, "1y");
  assert.equal(result.client, "Acme Corp");
  assert.equal(result.expiresAt, nowAt(IAT + 365 * 86_400).toISOString());
});

test("all four package types carry the expected validity window", () => {
  assert.equal(licenseTypeDurationSeconds("trial"), 30 * 86_400);
  assert.equal(licenseTypeDurationSeconds("60d"), 60 * 86_400);
  assert.equal(licenseTypeDurationSeconds("1y"), 365 * 86_400);
  assert.equal(licenseTypeDurationSeconds("unlimited"), null);

  const trial = verifyLicenseKey(
    signLicenseKey({ type: "trial", hwid: HWID, client: "T", privateKey: privateKeyPem, issuedAtSeconds: IAT }),
    { hwid: HWID, publicKey: publicKeyPem, now: nowAt(IAT + 1) },
  );
  assert.equal(trial.expiresAt, nowAt(IAT + 30 * 86_400).toISOString());
});

test("an unlimited license never expires (exp is null)", () => {
  const key = signLicenseKey({
    type: "unlimited",
    hwid: HWID,
    client: "Lifetime",
    privateKey: privateKeyPem,
    issuedAtSeconds: IAT,
  });

  const result = verifyLicenseKey(key, {
    hwid: HWID,
    publicKey: publicKeyPem,
    now: nowAt(IAT + 100 * 365 * 86_400),
  });
  assert.equal(result.valid, true);
  assert.equal(result.type, "unlimited");
  assert.equal(result.expiresAt, null);
});

test("a license bound to another machine is rejected (HWID mismatch)", () => {
  const key = signLicenseKey({
    type: "1y",
    hwid: HWID,
    client: "Acme",
    privateKey: privateKeyPem,
    issuedAtSeconds: IAT,
  });
  const result = verifyLicenseKey(key, { hwid: OTHER_HWID, publicKey: publicKeyPem, now: nowAt(IAT + 1) });
  assert.equal(result.valid, false);
  assert.equal(result.reason, "hwid-mismatch");
});

test("a tampered payload invalidates the signature", () => {
  const key = signLicenseKey({
    type: "1y",
    hwid: HWID,
    client: "Acme",
    privateKey: privateKeyPem,
    issuedAtSeconds: IAT,
  });
  const [prefix, , signatureB64] = key.split(".");
  const forgedPayload = encodeLicensePayload({
    v: LICENSE_TOKEN_VERSION,
    sub: LICENSE_TOKEN_SUBJECT,
    typ: "unlimited",
    hwid: normalizeHardwareId(HWID),
    c: "Acme",
    iat: IAT,
    exp: null,
  });
  const result = verifyLicenseKey(`${prefix}.${forgedPayload}.${signatureB64}`, {
    hwid: HWID,
    publicKey: publicKeyPem,
    now: nowAt(IAT + 1),
  });
  assert.equal(result.valid, false);
  assert.equal(result.reason, "bad-signature");
});

test("an expired license is rejected (fail-closed)", () => {
  const key = signLicenseKey({
    type: "60d",
    hwid: HWID,
    client: "Acme",
    privateKey: privateKeyPem,
    issuedAtSeconds: IAT,
  });
  const result = verifyLicenseKey(key, { hwid: HWID, publicKey: publicKeyPem, now: nowAt(IAT + 61 * 86_400) });
  assert.equal(result.valid, false);
  assert.equal(result.reason, "expired");
});

test("unknown type and wrong subject are rejected even when signed", () => {
  const unknown = verifyLicenseKey(forge({ typ: "1m" as LicensePayload["typ"] }), {
    hwid: HWID,
    publicKey: publicKeyPem,
    now: nowAt(IAT + 1),
  });
  assert.equal(unknown.reason, "unknown-type");

  const wrongSubject = verifyLicenseKey(forge({ sub: "other" }), {
    hwid: HWID,
    publicKey: publicKeyPem,
    now: nowAt(IAT + 1),
  });
  assert.equal(wrongSubject.reason, "wrong-subject");
});

test("a valid signature with the wrong public key is rejected", () => {
  const other = generateLicenseKeyPair();
  const key = signLicenseKey({ type: "1y", hwid: HWID, client: "Acme", privateKey: privateKeyPem, issuedAtSeconds: IAT });
  const result = verifyLicenseKey(key, { hwid: HWID, publicKey: other.publicKeyPem, now: nowAt(IAT + 1) });
  assert.equal(result.reason, "bad-signature");
});

test("signing refuses weak or missing inputs", () => {
  assert.throws(() => signLicenseKey({ type: "1y", hwid: "", client: "Acme", privateKey: privateKeyPem }), /hardware id/);
  assert.throws(() => signLicenseKey({ type: "1y", hwid: HWID, client: " ", privateKey: privateKeyPem }), /client name/);
  assert.throws(() => signLicenseKey({ type: "1y", hwid: HWID, client: "Acme", privateKey: "junk" }), /not usable/);
  assert.throws(() => signLicenseKey({ type: "nope" as LicensePayload["typ"], hwid: HWID, client: "Acme", privateKey: privateKeyPem }), /unknown license type/);
});

test("the wire format is three base64url segments with no padding", () => {
  const key = signLicenseKey({ type: "1y", hwid: HWID, client: "Acme", privateKey: privateKeyPem, issuedAtSeconds: IAT });
  const parts = key.split(".");
  assert.equal(parts.length, 3);
  assert.equal(parts[0], LICENSE_TOKEN_PREFIX);
  assert.ok(!key.includes("=") && !key.includes("+") && !key.includes("/"));
  const payload = JSON.parse(licenseBase64UrlDecode(parts[1]).toString("utf8"));
  assert.equal(payload.sub, LICENSE_TOKEN_SUBJECT);
  assert.equal(payload.hwid, normalizeHardwareId(HWID));
});

test("the auto-trial: starts fresh, continues, restarts on a new HWID, expires", () => {
  const now = 1_700_000_000_000;
  assert.deepEqual(evaluateTrial(null, HWID, now), {
    active: true,
    action: "start",
    startedAtMs: now,
    expiresAtMs: now + TRIAL_DURATION_SECONDS * 1000,
  });

  const record = { hwid: normalizeHardwareId(HWID), startedAtMs: now - 86_400_000, expiresAtMs: now + 86_400_000 };
  const cont = evaluateTrial(record, HWID, now);
  assert.equal(cont.active, true);
  assert.equal(cont.action, "continue");
  assert.ok((cont.remainingDays as number) > 0);

  const other = evaluateTrial(record, OTHER_HWID, now);
  assert.equal(other.action, "start");

  const expired = evaluateTrial(
    { hwid: normalizeHardwareId(HWID), startedAtMs: now - 40 * 86_400_000, expiresAtMs: now - 1000 },
    HWID,
    now,
  );
  assert.equal(expired.active, false);
  assert.equal(expired.action, "expired");
});

