import express from "express";
import {
  checkUserSession,
  loginUser,
  logout,
  registerUser,
  setupTwoFactor,
  verifyTwoFactorSetup,
  disableTwoFactor,
  getRecaptchaSiteKey,
  googleOAuthStart,
  googleOAuthCallback,
  githubOAuthStart,
  githubOAuthCallback,
} from "../controllers/auth.controller";
import { verifySess } from "../middlewares/VerifySession.middleware";
import { authRateLimiter } from "../middlewares/RateLimit.middleware";

const router = express.Router();

// Public auth routes (rate-limited to prevent brute force)
router.post("/login", authRateLimiter, loginUser);
router.post("/register", authRateLimiter, registerUser);

// Public: expose the reCAPTCHA site key (used by the login/register widgets)
router.get("/recaptcha-site-key", getRecaptchaSiteKey);

// OAuth sign-in (Google / GitHub) — browser redirects, not rate-limited
router.get("/google", googleOAuthStart);
router.get("/google/callback", googleOAuthCallback);
router.get("/github", githubOAuthStart);
router.get("/github/callback", githubOAuthCallback);

// Authenticated routes
router.post("/logout", logout);
router.get("/status", checkUserSession);

// 2FA management (requires an authenticated session)
router.post("/2fa/setup", verifySess, setupTwoFactor);
router.post("/2fa/verify", verifySess, verifyTwoFactorSetup);
router.post("/2fa/disable", verifySess, disableTwoFactor);

export { router as authRoutes };
