/**
 * Google reCAPTCHA verification service.
 *
 * - Reads RECAPTCHA_SECRET_KEY from process.env (loaded from /srv/data/.env via loadConfig).
 * - When the secret is not configured, verification is skipped (returns true) so
 *   the app keeps working in local / dev setups without reCAPTCHA.
 * - Supports both reCAPTCHA v2 (checkbox) and v3 (score-based) via the
 *   official siteverify API.
 */

import { loadConfig } from "../utils/loadConfig";

// Ensure process.env is populated from the runtime .env (e.g. /srv/data/.env).
// Idempotent — safe to call on every module import.
loadConfig();

interface SiteVerifyResponse {
  success?: boolean;
  score?: number;
  action?: string;
  "error-codes"?: string[];
}

/**
 * Verify a reCAPTCHA token with Google's siteverify API.
 *
 * @param token    The reCAPTCHA response token submitted by the client.
 * @param remoteIp Optional end-user IP address (passed through to Google).
 * @returns `true` when the token is valid OR when reCAPTCHA is not configured.
 */
export async function verifyRecaptcha(
  token: string | undefined,
  remoteIp?: string,
): Promise<boolean> {
  const secret = (process.env.RECAPTCHA_SECRET_KEY || "").trim();

  // Feature not configured → skip verification entirely.
  if (!secret) return true;

  // Configured but no token supplied → reject.
  if (!token || typeof token !== "string") {
    console.warn("[recaptcha] configured but no token was provided.");
    return false;
  }

  try {
    const params = new URLSearchParams({ secret, response: token });
    if (remoteIp) params.append("remoteip", remoteIp);

    const res = await fetch("https://www.google.com/recaptcha/api/siteverify", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });

    const data = (await res.json()) as SiteVerifyResponse;

    if (!data.success) {
      console.warn("[recaptcha] verification failed:", data["error-codes"]);
      return false;
    }

    // reCAPTCHA v3 returns a score (0.0 – 1.0). Reject low-confidence requests
    // when a score is present. Configurable via RECAPTCHA_MIN_SCORE.
    const minScore = parseFloat(process.env.RECAPTCHA_MIN_SCORE || "0.5");
    if (typeof data.score === "number" && data.score < minScore) {
      console.warn(
        `[recaptcha] score too low: ${data.score} < ${minScore} (action="${data.action}")`,
      );
      return false;
    }

    return true;
  } catch (err: any) {
    console.error("[recaptcha] siteverify request failed:", err?.message);
    return false;
  }
}
