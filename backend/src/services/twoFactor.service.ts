import crypto from "crypto";

/**
 * Two-Factor Authentication (2FA) service using TOTP (RFC 6238).
 * Uses Node.js built-in crypto — no external dependency required.
 *
 * Compatible with Google Authenticator, Authy, 1Password, etc.
 */

const TOTP_PERIOD_SECONDS = 30;
const TOTP_DIGITS = 6;
const TOTP_ALGORITHM = "sha1"; // RFC 6238 default
const ISSUER = "VektorSec";

/** Base32 alphabet (RFC 4648). */
const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32Encode(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = "";
  for (let i = 0; i < buffer.length; i++) {
    value = (value << 8) | buffer[i];
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }
  return output;
}

function base32Decode(input: string): Buffer {
  const cleaned = input.toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of cleaned) {
    const idx = BASE32_ALPHABET.indexOf(char);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

/** Generate a new TOTP secret (base32 encoded). */
export function generateSecret(): string {
  const randomBytes = crypto.randomBytes(20); // 160-bit secret
  return base32Encode(randomBytes);
}

/** Compute the current TOTP code for a given secret. */
export function generateTOTP(secret: string, timestamp: number = Date.now()): string {
  const key = base32Decode(secret);
  const counter = Math.floor(timestamp / 1000 / TOTP_PERIOD_SECONDS);

  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter));

  const hmac = crypto.createHmac(TOTP_ALGORITHM, key);
  hmac.update(counterBuffer);
  const digest = hmac.digest();

  const offset = digest[digest.length - 1] & 0x0f;
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);

  const otp = binary % 10 ** TOTP_DIGITS;
  return otp.toString().padStart(TOTP_DIGITS, "0");
}

/**
 * Verify a TOTP code with a small window to tolerate clock drift.
 * @param secret  The user's base32 secret
 * @param token   The 6-digit code entered by the user
 * @param window  Number of time steps before/after to accept (default 1)
 */
export function verifyTOTP(secret: string, token: string, window = 1): boolean {
  if (!token || !/^\d{6}$/.test(token)) return false;

  const now = Date.now();
  for (let i = -window; i <= window; i++) {
    const candidate = generateTOTP(secret, now + i * TOTP_PERIOD_SECONDS * 1000);
    // Constant-time comparison to avoid timing attacks
    const a = Buffer.from(candidate);
    const b = Buffer.from(token);
    if (a.length === b.length && crypto.timingSafeEqual(a, b)) {
      return true;
    }
  }
  return false;
}

/** Build an otpauth:// URI for QR code generation. */
export function buildOtpAuthUri(secret: string, email: string): string {
  const label = encodeURIComponent(`${ISSUER}:${email}`);
  const params = new URLSearchParams({
    secret,
    issuer: ISSUER,
    algorithm: TOTP_ALGORITHM.toUpperCase(),
    digits: String(TOTP_DIGITS),
    period: String(TOTP_PERIOD_SECONDS),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}
