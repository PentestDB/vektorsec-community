import { Request, Response } from "express";
import crypto from "crypto";
import UserModel from "../models/User/User.model";
import EarlyAccessModel from "../models/EarlyAccess/EarlyAccess.model";
import bcrypt from "bcrypt";

require("dotenv").config();

import geoip from "geoip-lite";
import { logAuditFromRequest } from "../services/audit.service";
import {
  generateSecret,
  verifyTOTP,
  buildOtpAuthUri,
} from "../services/twoFactor.service";
import { verifyRecaptcha } from "../services/recaptcha.service";

/**
 * Public endpoint — returns the reCAPTCHA site key so the frontend can render
 * the widget at runtime (admin sets it via Admin Panel without rebuilding).
 */
export const getRecaptchaSiteKey = async (_req: Request, res: Response) => {
  const siteKey = process.env.RECAPTCHA_SITE_KEY || "";
  return res.status(200).json({
    siteKey,
    enabled: Boolean(siteKey && process.env.RECAPTCHA_SECRET_KEY),
  });
};

export const logout = async (req: Request, res: Response) => {

  try {
    const user = req.session.user;
    if (!user) {
      // No user in session, can't perform logout
      return res.status(400).json({ message: "No user to log out!" });
    }

    const userdata = await UserModel.findOne({ _id: user.userId });

    // Record audit log before destroying session
    await logAuditFromRequest(req, res, "auth.logout", {
      resourceType: "user",
      resourceId: user.userId,
    });

    // Destroy the session and clear the cookie
    req.session.destroy((err) => {
      if (err) {
        console.error("Session destruction error:", err);
        return res.status(500).json({ message: "Error logging out!" });
      }
      res.clearCookie("sid");
      // Moved the success response here to ensure it's called after session is destroyed
      res.status(200).json({ message: "Logged out successfully!" });
    });
  } catch (err) {
    console.error("Logout error:", err);
    // Sending a 500 status code for server-side errors
    return res.status(500).json({ message: "Failed to logout!" });
  }
};


export const checkUserSession = async (req: Request, res: Response) => {
  try {
    const { user } = req.session;
    if (user == null)
      return res.status(400).json({
        success: false,
        message: "Invalid session!",
      });

    if (req.session.user != null) {
      const u = await UserModel.findOne({ _id: user.userId });

      if (u == null) {
        return res.status(400).json({
          success: false,
          message: "User not found!",
        });
      }

      const earlyAccess = await EarlyAccessModel.findOne({
        email: u.email,
      });

      // const secretKey = await getSecrets("INTERCOM-SECRET"); // secret key (keep safe!)
      // const userIdentifier = u.email; // user's email address

      // const hash = crypto
      //   .createHmac("sha256", secretKey)
      //   .update(userIdentifier)
      //   .digest("hex");

      return res.status(200).json({
        success: true,
        user: {
          name: u.name,
          email: u.email,
          firstLogin: u.firstLogin,
          profilePicture: u.profilePicture,
          uid: u._id,
          role: (u as any).role || "pentester",
          twoFactorEnabled: (u as any).twoFactorEnabled || false,
          access: earlyAccess ? true : false,
        },
      });

    }

    return res.status(400).json({
      message: "Session not found!",
    });
  } catch (err) {
    console.log(err);
    return res.status(400).json({ message: "Session not found!" });
  }
};


export const registerUser = async (req: Request, res: Response) => {
  try {
    const { name, email, password, recaptchaToken } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ message: "All fields are required" });
    }

    // Basic password strength check
    if (password.length < 8) {
      return res
        .status(400)
        .json({ message: "Password must be at least 8 characters long" });
    }

    // Google reCAPTCHA (skipped automatically when not configured).
    if (!(await verifyRecaptcha(recaptchaToken, req.ip))) {
      return res
        .status(400)
        .json({ message: "reCAPTCHA verification failed. Please try again." });
    }

    let user = await UserModel.findOne({ email });
    if (user) {
      return res.status(400).json({ message: "User already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    // First registered user becomes admin; subsequent users are pentesters.
    const userCount = await UserModel.countDocuments();
    const role = userCount === 0 ? "admin" : "pentester";

    user = new UserModel({
      name,
      email,
      password: hashedPassword,
      role,
    });

    await user.save();

    // Record audit log
    await logAuditFromRequest(req, res, "auth.register", {
      resourceType: "user",
      resourceId: user._id.toString(),
      details: { role },
    });

    return res.status(201).json({
      message: "User registered successfully",
      user: {
        uid: user._id,
        name: user.name,
        email: user.email,
        role,
      },
    });
  } catch (error) {
    console.error("Error registering user:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};


/**
 * Generate a 2FA setup (returns a secret + otpauth URI for QR code).
 * Requires an authenticated session.
 */
export const setupTwoFactor = async (req: Request, res: Response) => {
  try {
    const userId = req.session.user?.userId;
    if (!userId) {
      return res.status(401).json({ message: "Authentication required" });
    }

    const user = await UserModel.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // If 2FA already enabled, don't regenerate the secret.
    if ((user as any).twoFactorEnabled) {
      return res.status(400).json({ message: "Two-factor authentication is already enabled" });
    }

    const secret = generateSecret();
    const otpAuthUri = buildOtpAuthUri(secret, user.email);

    // Store the pending secret (not yet active until verified).
    (user as any).twoFactorSecret = secret;
    await user.save();

    return res.status(200).json({
      message: "Two-factor setup initiated",
      secret,
      otpAuthUri,
    });
  } catch (error) {
    console.error("Error setting up 2FA:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

/**
 * Verify a TOTP code to activate 2FA.
 */
export const verifyTwoFactorSetup = async (req: Request, res: Response) => {
  try {
    const userId = req.session.user?.userId;
    if (!userId) {
      return res.status(401).json({ message: "Authentication required" });
    }

    const { code } = req.body;
    if (!code) {
      return res.status(400).json({ message: "Verification code required" });
    }

    const user = await UserModel.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const secret = (user as any).twoFactorSecret;
    if (!secret) {
      return res.status(400).json({ message: "Two-factor setup not initiated" });
    }

    if (!verifyTOTP(secret, code)) {
      return res.status(401).json({ message: "Invalid verification code" });
    }

    (user as any).twoFactorEnabled = true;
    await user.save();

    await logAuditFromRequest(req, res, "auth.two_factor_enabled", {
      resourceType: "user",
      resourceId: user._id.toString(),
    });

    return res.status(200).json({ message: "Two-factor authentication enabled" });
  } catch (error) {
    console.error("Error verifying 2FA setup:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

/**
 * Disable 2FA (requires a valid TOTP code).
 */
export const disableTwoFactor = async (req: Request, res: Response) => {
  try {
    const userId = req.session.user?.userId;
    if (!userId) {
      return res.status(401).json({ message: "Authentication required" });
    }

    const { code } = req.body;
    if (!code) {
      return res.status(400).json({ message: "Verification code required" });
    }

    const user = await UserModel.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const secret = (user as any).twoFactorSecret;
    if (!secret || !(user as any).twoFactorEnabled) {
      return res.status(400).json({ message: "Two-factor authentication is not enabled" });
    }

    if (!verifyTOTP(secret, code)) {
      return res.status(401).json({ message: "Invalid verification code" });
    }

    (user as any).twoFactorEnabled = false;
    (user as any).twoFactorSecret = undefined;
    await user.save();

    await logAuditFromRequest(req, res, "auth.two_factor_disabled", {
      resourceType: "user",
      resourceId: user._id.toString(),
    });

    return res.status(200).json({ message: "Two-factor authentication disabled" });
  } catch (error) {
    console.error("Error disabling 2FA:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

export const loginUser = async (req: Request, res: Response) => {

  try {
    const { email, password, twoFactorCode, recaptchaToken } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required" });
    }

    // Google reCAPTCHA is enforced on the first login step only — the 2FA step
    // is additionally protected by the TOTP code. Skipped when not configured.
    if (!twoFactorCode && !(await verifyRecaptcha(recaptchaToken, req.ip))) {
      return res
        .status(400)
        .json({ message: "reCAPTCHA verification failed. Please try again." });
    }

    const user = await UserModel.findOne({ email });
    if (!user) {
      // Record failed login attempt (no user found)
      await logAuditFromRequest(req, res, "auth.login_failed", {
        resourceType: "user",
        details: { email, reason: "user_not_found" },
      });
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      // Record failed login attempt (wrong password)
      await logAuditFromRequest(req, res, "auth.login_failed", {
        resourceType: "user",
        resourceId: user._id.toString(),
        details: { email, reason: "invalid_password" },
      });
      return res.status(401).json({ message: "Invalid credentials" });
    }

    // If 2FA is enabled, require the TOTP code
    const twoFactorEnabled = (user as any).twoFactorEnabled || false;
    const twoFactorSecret = (user as any).twoFactorSecret;
    if (twoFactorEnabled && twoFactorSecret) {
      if (!twoFactorCode) {
        return res.status(400).json({
          message: "Two-factor authentication code required",
          twoFactorRequired: true,
        });
      }
      if (!verifyTOTP(twoFactorSecret, twoFactorCode)) {
        await logAuditFromRequest(req, res, "auth.login_failed", {
          resourceType: "user",
          resourceId: user._id.toString(),
          details: { email, reason: "invalid_2fa_code" },
        });
        return res.status(401).json({ message: "Invalid two-factor code" });
      }
    }

    const head = req.headers["x-forwarded-for"] as string;
    let headIp = null;
    if (head) {
      headIp = head.split(",")[0];
    }

    const ip = headIp ?? req.socket.remoteAddress;

    if (ip) {
      user.ip = ip;
      const geo = geoip.lookup(ip);

      if (geo) {
        user.ipLocation = {
          ...geo,
          ip: ip,
        };
      }
    }

    await user.save();

    req.session.user = {
      userId: user._id.toString(),
    };

    // saving the session
    req.session.save(function (err) {
      if (err) {
        console.log(err);
        return res.status(400).json({ message: "Failed to save session!" });
      }
    });

    // Record successful login
    await logAuditFromRequest(req, res, "auth.login", {
      resourceType: "user",
      resourceId: user._id.toString(),
      details: { email, twoFactorUsed: twoFactorEnabled },
    });

    return res.status(200).json({
      message: "User logged in successfully",
      user: {
        uid: user._id,
        name: user.name,
        email: user.email,
        profilePicture: user.profilePicture,
        role: (user as any).role || "pentester",
        twoFactorEnabled,
      },
    });

  } catch (error) {
    console.error("Error logging in user:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};



// ─── OAuth (Google / GitHub) sign-in ─────────────────────────────────

const FRONTEND_URL = () => process.env.FRONTEND_URL || "http://localhost:3000";

/** In-memory OAuth state store (expires after 10 minutes). */
const oauthStateStore = new Map<string, { provider: string; expiresAt: number }>();

function issueOAuthState(provider: string): string {
  const state = crypto.randomBytes(24).toString("hex");
  oauthStateStore.set(state, { provider, expiresAt: Date.now() + 10 * 60 * 1000 });
  return state;
}

function consumeOAuthState(state: string, provider: string): boolean {
  const entry = oauthStateStore.get(state);
  if (!entry) return false;
  oauthStateStore.delete(state);
  return entry.provider === provider && entry.expiresAt > Date.now();
}

/**
 * Find a user by OAuth provider id (or email), creating a new account when
 * the provider email is not registered yet. Password-based accounts keep
 * working alongside; when a social sign-in matches an existing email the
 * provider id is linked so future sign-ins resolve instantly.
 */
async function findOrCreateSocialUser(opts: {
  provider: "google" | "github";
  providerId: string;
  email?: string;
  name?: string;
  avatar?: string;
}) {
  const idField = opts.provider === "google" ? "googleId" : "githubId";

  let user: any = opts.providerId
    ? await UserModel.findOne({ [idField]: opts.providerId })
    : null;
  if (!user && opts.email) user = await UserModel.findOne({ email: opts.email });

  if (user) {
    if (opts.providerId && !user[idField]) {
      user[idField] = opts.providerId;
      if (opts.avatar && !user.profilePicture) user.profilePicture = opts.avatar;
      await user.save();
    }
    return user;
  }

  if (!opts.email) throw new Error("Provider did not return an email address");

  // No matching account — create one with an unusable random password so the
  // user can only sign in through the social provider (or reset via admin).
  const randomPassword = await bcrypt.hash(crypto.randomBytes(24).toString("hex"), 10);
  user = await UserModel.create({
    email: opts.email,
    name: opts.name || opts.email.split("@")[0],
    password: randomPassword,
    profilePicture: opts.avatar || "",
    role: "pentester",
    [idField]: opts.providerId,
    firstLogin: true,
  });
  return user;
}

/** Establish the express-session for a user (same as email/password login). */
async function establishSession(req: Request, user: any): Promise<void> {
  req.session.user = { userId: user._id.toString() };
  await new Promise<void>((resolve, reject) => {
    req.session.save((err: any) => (err ? reject(err) : resolve()));
  });
}

// ─── Google OAuth ─────────────────────────────────────────────────────

/** GET /api/auth/google — redirect to Google consent screen. */
export const googleOAuthStart = async (_req: Request, res: Response) => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    return res.redirect(
      `${FRONTEND_URL()}/login?social=google&error=OAuth is not configured on the server. Add GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET to backend/.env.`
    );
  }

  const redirectUri =
    process.env.GOOGLE_OAUTH_REDIRECT_URI ||
    `${process.env.BACKEND_URI || "http://localhost:8080"}/api/auth/google/callback`;

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    access_type: "offline",
    prompt: "consent",
    state: issueOAuthState("google"),
  });

  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
};


/** GET /api/auth/google/callback — exchange code, sign the user in, redirect. */
export const googleOAuthCallback = async (req: Request, res: Response) => {
  const fail = (message: string) =>
    res.redirect(
      `${FRONTEND_URL()}/login?social=google&error=${encodeURIComponent(message)}`
    );
  try {
    const { code, state, error } = req.query as Record<string, string | undefined>;
    if (error) return fail(`Google sign-in was cancelled or failed (${error})`);
    if (!code || !state) return fail("Missing OAuth code or state.");
    if (!consumeOAuthState(state, "google")) return fail("Invalid or expired OAuth state.");

    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    if (!clientId || !clientSecret) return fail("Google OAuth is not configured on the server.");

    const redirectUri =
      process.env.GOOGLE_OAUTH_REDIRECT_URI ||
      `${process.env.BACKEND_URI || "http://localhost:8080"}/api/auth/google/callback`;

    // Exchange the authorization code for tokens.
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }).toString(),
    });
    const tokens = (await tokenRes.json()) as any;
    if (!tokens.access_token) {
      return fail(tokens.error_description || "Failed to exchange Google code for token.");
    }

    // Fetch the user profile.
    const profileRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const profile = (await profileRes.json()) as any;
    if (!profile || !profile.email) return fail("Google did not return a valid profile.");

    const user = await findOrCreateSocialUser({
      provider: "google",
      providerId: String(profile.id || profile.email),
      email: profile.email,
      name: profile.name || undefined,
      avatar: profile.picture || undefined,
    });
    await establishSession(req, user);
    await logAuditFromRequest(req, res, "auth.login", {
      resourceType: "user",
      resourceId: user._id.toString(),
      details: { email: user.email, provider: "google" },
    });
    res.redirect(`${FRONTEND_URL()}/dashboard`);
  } catch (err: any) {
    console.error("[auth] googleOAuthCallback error:", err);
    return fail(err?.message || "Google sign-in failed.");
  }
};


// ─── GitHub OAuth ─────────────────────────────────────────────────────

/** GET /api/auth/github — redirect to GitHub authorize screen. */
export const githubOAuthStart = async (_req: Request, res: Response) => {
  const clientId = process.env.GITHUB_CLIENT_ID;
  if (!clientId) {
    return res.redirect(
      `${FRONTEND_URL()}/login?social=github&error=OAuth is not configured on the server. Add GITHUB_CLIENT_ID/GITHUB_CLIENT_SECRET to backend/.env.`
    );
  }

  const redirectUri =
    process.env.GITHUB_OAUTH_REDIRECT_URI ||
    `${process.env.BACKEND_URI || "http://localhost:8080"}/api/auth/github/callback`;

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: "read:user user:email",
    state: issueOAuthState("github"),
  });

  res.redirect(`https://github.com/login/oauth/authorize?${params.toString()}`);
};

/** GET /api/auth/github/callback — exchange code, sign the user in, redirect. */
export const githubOAuthCallback = async (req: Request, res: Response) => {
  const fail = (message: string) =>
    res.redirect(
      `${FRONTEND_URL()}/login?social=github&error=${encodeURIComponent(message)}`
    );
  try {
    const { code, state, error } = req.query as Record<string, string | undefined>;
    if (error) return fail(`GitHub sign-in was cancelled or failed (${error})`);
    if (!code || !state) return fail("Missing OAuth code or state.");
    if (!consumeOAuthState(state, "github")) return fail("Invalid or expired OAuth state.");

    const clientId = process.env.GITHUB_CLIENT_ID;
    const clientSecret = process.env.GITHUB_CLIENT_SECRET;
    if (!clientId || !clientSecret) return fail("GitHub OAuth is not configured on the server.");

    const redirectUri =
      process.env.GITHUB_OAUTH_REDIRECT_URI ||
      `${process.env.BACKEND_URI || "http://localhost:8080"}/api/auth/github/callback`;

    // Exchange the authorization code for an access token.
    const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: redirectUri,
      }),
    });
    const tokens = (await tokenRes.json()) as any;
    if (!tokens.access_token) {
      return fail(tokens.error_description || "Failed to exchange GitHub code for token.");
    }

    const authHeaders = {
      Authorization: `Bearer ${tokens.access_token}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "VektorSec",
    };

    // Fetch the GitHub profile + verified email.
    const [userRes, emailsRes] = await Promise.all([
      fetch("https://api.github.com/user", { headers: authHeaders }),
      fetch("https://api.github.com/user/emails", { headers: authHeaders }),
    ]);
    const profile = (await userRes.json()) as any;
    if (!profile || !profile.id) return fail("GitHub did not return a valid profile.");

    let email = profile.email as string | undefined;
    const emails = (await emailsRes.json()) as any;
    if (!email && Array.isArray(emails)) {
      const primary = emails.find((e: any) => e.primary && e.verified) || emails[0];
      email = primary?.email;
    }

    const user = await findOrCreateSocialUser({
      provider: "github",
      providerId: String(profile.id),
      email: email || undefined,
      name: profile.name || profile.login || undefined,
      avatar: profile.avatar_url || undefined,
    });
    await establishSession(req, user);
    await logAuditFromRequest(req, res, "auth.login", {
      resourceType: "user",
      resourceId: user._id.toString(),
      details: { email: user.email, provider: "github" },
    });
    res.redirect(`${FRONTEND_URL()}/dashboard`);
  } catch (err: any) {
    console.error("[auth] githubOAuthCallback error:", err);
    return fail(err?.message || "GitHub sign-in failed.");
  }
};

