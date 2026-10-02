/**
 * Unlock-token unit tests (see `src/utils/unlockToken.ts`).
 *
 * The verifier is the only thing standing between a customer instance and a
 * switched-off Scope Guard, so every failure mode is pinned here: valid, invalid
 * (tampered payload / wrong key), missing, expired, wrong purpose, and "the
 * server has no key material at all". The wire format is asserted against an
 * **independent** re-implementation of the documented spec, so a refactor cannot
 * silently change what a token looks like.
 */

import assert from "node:assert/strict";
import test from "node:test";
import { createHmac, createPublicKey, generateKeyPairSync } from "node:crypto";
import {
  UNLOCK_MASTER_KEY_ENV,
  UNLOCK_TOKEN_ENV,
  UNLOCK_TOKEN_PREFIX,
  base64UrlDecode,
  base64UrlEncode,
  describeUnlockTokenFailure,
  encodeUnlockPayload,
  signUnlockToken,
  toUnlockPublicKey,
  verifyUnlockToken,
} from "../src/utils/unlockToken";

const SECRET = "unit-test-master-secret-key-0123456789";
const IAT = 1_700_000_000; // 2023-11-14T22:13:20Z
/** Comfortably inside every token TTL used below (shortest is 60s). */
const VALID_NOW = new Date((IAT + 30) * 1000);
const EXPIRED_NOW = new Date((IAT + 366 * 24 * 60 * 60) * 1000);

/** Tokens verified with an explicit `env: {}` never see ambient variables. */
const NO_ENV: NodeJS.ProcessEnv = {};

test("an HMAC-SHA256 token round-trips and carries the licensed client", () => {
  const token = signUnlockToken({
    client: "Acme Corp",
    secret: SECRET,
    issuedAtSeconds: IAT,
    ttlSeconds: 86_400,
  });

  const result = verifyUnlockToken(token, { secret: SECRET, now: VALID_NOW, env: NO_ENV });
  assert.equal(result.valid, true);
  assert.equal(result.mode, "hmac");
  assert.equal(result.client, "Acme Corp");
  assert.equal(result.expiresAt, new Date((IAT + 86_400) * 1000).toISOString());
});

test("the token wire format matches the documented spec", () => {
  const token = signUnlockToken({
    client: "Acme",
    secret: SECRET,
    issuedAtSeconds: IAT,
    ttlSeconds: 60,
  });

  const [prefix, payloadB64, signatureB64] = token.split(".");
  assert.equal(prefix, UNLOCK_TOKEN_PREFIX.hmac);
  assert.deepEqual(JSON.parse(base64UrlDecode(payloadB64).toString("utf8")), {
    v: 1,
    sub: "scope-guard-unlock",
    c: "Acme",
    ui: "unlocked",
    iat: IAT,
    exp: IAT + 60,
  });

  // Independent re-implementation: signature covers "<PREFIX>.<payload>".
  const expected = createHmac("sha256", SECRET)
    .update(Buffer.from(`${prefix}.${payloadB64}`, "utf8"))
    .digest();
  assert.deepEqual(base64UrlDecode(signatureB64), expected);

  // base64url, unpadded: safe to paste into a single-line .env value.
  assert.ok(!token.includes("=") && !token.includes("+") && !token.includes("/"));
  assert.equal(token.split(".").length, 3);
});

test("a tampered payload invalidates the signature", () => {
  const token = signUnlockToken({
    client: "Acme",
    secret: SECRET,
    issuedAtSeconds: IAT,
    ttlSeconds: 60,
  });
  const [prefix, , signatureB64] = token.split(".");

  // Extend the validity far into the future — the signature no longer matches.
  const forgedPayload = encodeUnlockPayload({
    v: 1,
    sub: "scope-guard-unlock",
    c: "Acme",
    ui: "unlocked",
    iat: IAT,
    exp: 4_000_000_000,
  });
  const forged = verifyUnlockToken(`${prefix}.${forgedPayload}.${signatureB64}`, {
    secret: SECRET,
    now: VALID_NOW,
    env: NO_ENV,
  });
  assert.equal(forged.valid, false);
  assert.equal(forged.reason, "bad-signature");
});

test("a token signed with a different master key is rejected", () => {
  const token = signUnlockToken({
    client: "Acme",
    secret: "another-master-secret-0123456789",
    issuedAtSeconds: IAT,
    ttlSeconds: 60,
  });
  const result = verifyUnlockToken(token, { secret: SECRET, now: VALID_NOW, env: NO_ENV });
  assert.equal(result.valid, false);
  assert.equal(result.reason, "bad-signature");
});

test("missing, empty and unparsable tokens fail closed", () => {
  const cases: Array<[string | undefined, string]> = [
    [undefined, "missing"],
    ["", "missing"],
    ["   ", "missing"],
    ["not-a-token", "malformed"],
    [`${UNLOCK_TOKEN_PREFIX.hmac}.only-two-segments`, "malformed"],
    [`${UNLOCK_TOKEN_PREFIX.hmac}.AAAA.BBBB.CCCC`, "malformed"],
    ["VEK3.AAAA.BBBB", "malformed"],
    ["VEK1.####.####", "malformed"],
    [`${UNLOCK_TOKEN_PREFIX.hmac}.${base64UrlEncode("not json")}.${base64UrlEncode("x")}`, "malformed"],
    ["A".repeat(5000), "malformed"],
  ];

  for (const [token, reason] of cases) {
    const result = verifyUnlockToken(token, { secret: SECRET, now: VALID_NOW, env: NO_ENV });
    assert.equal(result.valid, false, `${String(token).slice(0, 24)} must not verify`);
    assert.equal(result.reason, reason, `${String(token).slice(0, 24)} → ${result.reason}`);
  }
});

test("an expired token is rejected", () => {
  const token = signUnlockToken({
    client: "Acme",
    secret: SECRET,
    issuedAtSeconds: IAT,
    ttlSeconds: 60,
  });
  const result = verifyUnlockToken(token, { secret: SECRET, now: EXPIRED_NOW, env: NO_ENV });
  assert.equal(result.valid, false);
  assert.equal(result.reason, "expired");
  assert.equal(result.client, "Acme");
});

test("a token issued for another purpose or version is rejected", () => {
  const mint = (payload: Record<string, unknown>) => {
    const payloadB64 = base64UrlEncode(JSON.stringify(payload));
    const signature = createHmac("sha256", SECRET)
      .update(Buffer.from(`${UNLOCK_TOKEN_PREFIX.hmac}.${payloadB64}`, "utf8"))
      .digest();
    return `${UNLOCK_TOKEN_PREFIX.hmac}.${payloadB64}.${base64UrlEncode(signature)}`;
  };

  const base = { v: 1, sub: "scope-guard-unlock", c: "Acme", ui: "unlocked", iat: IAT, exp: IAT + 60 };

  // Valid signature, wrong subject → rejected (a token issued for something else).
  const wrongSubject = verifyUnlockToken(mint({ ...base, sub: "something-else" }), {
    secret: SECRET,
    now: VALID_NOW,
    env: NO_ENV,
  });
  assert.equal(wrongSubject.reason, "wrong-subject");

  // Valid signature, but not bound to an unlocked UI build.
  const wrongUi = verifyUnlockToken(mint({ ...base, ui: "locked" }), {
    secret: SECRET,
    now: VALID_NOW,
    env: NO_ENV,
  });
  assert.equal(wrongUi.reason, "wrong-subject");

  // Valid signature, unknown payload version.
  const wrongVersion = verifyUnlockToken(mint({ ...base, v: 2 }), {
    secret: SECRET,
    now: VALID_NOW,
    env: NO_ENV,
  });
  assert.equal(wrongVersion.reason, "unsupported-version");

  // Valid signature, but no expiry at all.
  const noExpiry = verifyUnlockToken(
    mint({ v: 1, sub: "scope-guard-unlock", c: "Acme", ui: "unlocked", iat: IAT }),
    { secret: SECRET, now: VALID_NOW, env: NO_ENV },
  );
  assert.equal(noExpiry.reason, "malformed");
});

test("verification without key material on the server fails closed", () => {
  const token = signUnlockToken({
    client: "Acme",
    secret: SECRET,
    issuedAtSeconds: IAT,
    ttlSeconds: 60,
  });

  const noSecret = verifyUnlockToken(token, { now: VALID_NOW, env: NO_ENV });
  assert.equal(noSecret.valid, false);
  assert.equal(noSecret.reason, "no-verification-key");

  // A too-short secret (typo / placeholder) is treated as "not configured".
  assert.equal(
    verifyUnlockToken(token, { secret: "1234", now: VALID_NOW, env: NO_ENV }).reason,
    "no-verification-key",
  );

  assert.equal(UNLOCK_TOKEN_ENV, "SCOPE_GUARD_UNLOCK_TOKEN");
  assert.equal(UNLOCK_MASTER_KEY_ENV, "MASTER_SECRET_KEY");
  assert.match(describeUnlockTokenFailure("bad-signature"), /does not match/);
  assert.match(describeUnlockTokenFailure(undefined), /could not be verified/);
  assert.equal(toUnlockPublicKey("not a key"), null);
});

test("the master secret can come from the environment", () => {
  const token = signUnlockToken({
    client: "Acme",
    secret: SECRET,
    issuedAtSeconds: IAT,
    ttlSeconds: 60,
  });

  assert.equal(
    verifyUnlockToken(token, { env: { [UNLOCK_MASTER_KEY_ENV]: SECRET }, now: VALID_NOW }).valid,
    true,
  );
  assert.equal(
    verifyUnlockToken(token, {
      env: { [UNLOCK_MASTER_KEY_ENV]: "wrong-master-secret-0123456789" },
      now: VALID_NOW,
    }).reason,
    "bad-signature",
  );
});

/**
 * Ed25519 (`VEK2`) key pair — generated per test run. The private key stands in
 * for the vendor's offline master key, the public key for what a customer
 * instance is allowed to know.
 */
const { publicKey: ED_PUBLIC_PEM, privateKey: ED_PRIVATE_PEM } = generateKeyPairSync("ed25519", {
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});

const { publicKey: OTHER_PUBLIC_PEM } = generateKeyPairSync("ed25519", {
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});

test("Ed25519 tokens verify with the public key alone (no shared secret on the server)", () => {
  const token = signUnlockToken({
    client: "Globex",
    privateKey: ED_PRIVATE_PEM,
    issuedAtSeconds: IAT,
    ttlSeconds: 60,
  });
  assert.ok(token.startsWith(`${UNLOCK_TOKEN_PREFIX.ed25519}.`));

  // PEM (multi-line) and the single-line escaped form both work.
  for (const key of [ED_PUBLIC_PEM, ED_PUBLIC_PEM.replace(/\n/g, "\\n")]) {
    const result = verifyUnlockToken(token, { publicKey: key, now: VALID_NOW, env: NO_ENV });
    assert.equal(result.valid, true);
    assert.equal(result.mode, "ed25519");
    assert.equal(result.client, "Globex");
  }

  // Raw 32-byte public key (base64 of the SPKI DER tail) is accepted as well.
  const spki = createPublicKey(ED_PUBLIC_PEM).export({ format: "der", type: "spki" });
  const raw = base64UrlEncode(spki.subarray(spki.length - 32));
  assert.equal(verifyUnlockToken(token, { publicKey: raw, now: VALID_NOW, env: NO_ENV }).valid, true);

  // Another key pair must not verify it…
  assert.equal(
    verifyUnlockToken(token, { publicKey: OTHER_PUBLIC_PEM, now: VALID_NOW, env: NO_ENV }).reason,
    "bad-signature",
  );
  // …and the two modes must not borrow each other's key material.
  assert.equal(
    verifyUnlockToken(token, { secret: SECRET, now: VALID_NOW, env: NO_ENV }).reason,
    "no-verification-key",
  );
});

test("signing refuses weak or missing key material", () => {
  assert.throws(() => signUnlockToken({ client: "Acme", secret: "short" }), /at least/);
  assert.throws(() => signUnlockToken({ client: "", secret: SECRET }), /client name/);
  assert.throws(
    () => signUnlockToken({ client: "Acme", secret: SECRET, ttlSeconds: 0 }),
    /positive/,
  );
  assert.throws(
    () => signUnlockToken({ client: "Acme", secret: SECRET, privateKey: "junk" }),
    /not usable/,
  );
});
