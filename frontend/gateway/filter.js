/**
 * Sensitive-field stripper for the VektorSec Black-Box gateway.
 *
 * Used by server.js to shape JSON responses before they reach the browser so
 * only the fields needed for rendering are exposed. The key list is deliberately
 * conservative (credential / secret material only) and can be extended per
 * deployment via the GATEWAY_STRIP_KEYS environment variable.
 */

const DEFAULT_STRIP_KEYS = [
  // Passwords / credential hashes
  "password",
  "passwd",
  "passwordhash",
  "hashedpassword",
  "bcryptpassword",
  // NOTE: TOTP setup fields (otpauthUri / secret) are intentionally NOT
  // stripped — they only appear in the 2FA-enrollment response and must reach
  // the browser so the user can scan the QR / read their own secret.
  // OAuth / 3rd-party secrets
  "google_refresh_token",
  "google_client_secret",
  "github_client_secret",
  "recaptcha_secret_key",
  "stripe_secret_key",
  // Private keys
  "privatekey",
  "private_key",
  "ssl_private_key",
  "ssh_private_key",
];

const MAX_DEPTH = 8;
const REDACTED = "[REDACTED]";

function normalize(key) {
  return String(key).toLowerCase().replace(/[^a-z0-9]/g, "");
}

function buildStripSet(extraKeys) {
  const set = new Set(DEFAULT_STRIP_KEYS.map(normalize));
  (extraKeys || []).forEach((key) => set.add(normalize(key)));
  return set;
}

/**
 * Recursively walk an object/array and replace values of sensitive keys with
 * "[REDACTED]". The shape of the payload is preserved (keys are not deleted)
 * so client-side code that reads a field still finds it, just without secrets.
 *
 * @param {unknown} input
 * @param {string[]} [extraKeys] additional keys to strip (normalized match)
 * @returns {unknown}
 */
function stripSensitiveFields(input, extraKeys) {
  const stripSet = buildStripSet(extraKeys);
  const seen = new WeakSet();

  const visit = (value, depth) => {
    if (value === null || typeof value !== "object") return value;
    if (seen.has(value)) return value;
    seen.add(value);

    if (Array.isArray(value)) {
      return depth >= MAX_DEPTH ? value : value.map((item) => visit(item, depth + 1));
    }

    const out = {};
    for (const key of Object.keys(value)) {
      if (stripSet.has(normalize(key))) {
        out[key] = REDACTED;
      } else if (depth < MAX_DEPTH) {
        out[key] = visit(value[key], depth + 1);
      } else {
        out[key] = value[key];
      }
    }
    return out;
  };

  return visit(input, 0);
}

module.exports = { stripSensitiveFields, DEFAULT_STRIP_KEYS };
