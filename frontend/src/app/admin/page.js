"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";
import { login, checkSession } from "@/services/auth.service";
import styles from "./admin.module.scss";

const AdminLogin = () => {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // Two-step sign-in (mirrors the user login page): credentials first, then the
  // TOTP code when the account has 2FA enabled (or must enroll on first login).
  const [twoFactorStep, setTwoFactorStep] = useState(false);
  const [twoFactorSetup, setTwoFactorSetup] = useState(null); // { otpauthUri, secret }
  // Existing-2FA challenge: the backend also returns the otpauth URI + secret so
  // the key can be re-scanned / copied at any login.
  const [twoFactorChallenge, setTwoFactorChallenge] = useState(null);
  const [twoFactorCode, setTwoFactorCode] = useState("");

  // Check if already logged in as admin
  useEffect(() => {
    const verify = async () => {
      try {
        const data = await checkSession();
        if (data.success && data.user?.role === "admin") {
          router.replace("/admin/dashboard");
          return;
        }
      } catch (err) {
        // not logged in
      }
      setLoading(false);
    };
    verify();
  }, [router]);

  const backToCredentials = () => {
    setTwoFactorStep(false);
    setTwoFactorSetup(null);
    setTwoFactorChallenge(null);
    setTwoFactorCode("");
    setError("");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);

    const finish = async (data) => {
      if (data?.user?.role !== "admin") {
        setError("This account does not have admin access.");
        backToCredentials();
        setSubmitting(false);
        return false;
      }
      router.replace("/admin/dashboard");
      return true;
    };

    try {
      if (twoFactorStep || twoFactorSetup) {
        // Second step: submit the authenticator code for the stored credentials.
        const data = await login({ email, password, twoFactorCode });
        if (data?.twoFactorRequired) {
          setTwoFactorChallenge({
            otpauthUri: data.otpauthUri,
            secret: data.secret,
          });
          setTwoFactorStep(true);
          setSubmitting(false);
          return;
        }
        await finish(data);
        return;
      }

      // First step: credentials only.
      const data = await login({ email, password });
      if (data?.twoFactorRequired) {
        setTwoFactorChallenge({
          otpauthUri: data.otpauthUri,
          secret: data.secret,
        });
        setTwoFactorStep(true);
        setSubmitting(false);
        return;
      }
      await finish(data);
    } catch (err) {
      const res = err?.response?.data || {};
      // First-time login: the account has no 2FA yet → show QR enrollment.
      if (res?.twoFactorSetupRequired) {
        setTwoFactorSetup({ otpauthUri: res.otpauthUri, secret: res.secret });
        setTwoFactorCode("");
        setSubmitting(false);
        return;
      }
      // The account has 2FA enabled → ask for the authenticator code, and keep
      // the QR/secret so the key can be re-scanned / copied at any login.
      if (res?.twoFactorRequired) {
        setTwoFactorChallenge({
          otpauthUri: res.otpauthUri,
          secret: res.secret,
        });
        setTwoFactorStep(true);
        setTwoFactorCode("");
        setSubmitting(false);
        return;
      }
      setError(res?.message || "Login failed. Please try again.");
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className={styles.loadingScreen}>
        <div className={styles.loadingSpinner} />
        <p>Loading...</p>
      </div>
    );
  }

  return (
    <div className={styles.loginContainer}>
      <div className={styles.loginCard}>
        <h1 className={styles.loginTitle}>
          {twoFactorSetup
            ? "Set Up Two-Factor Authentication"
            : twoFactorStep
            ? "Two-Factor Authentication"
            : "Admin Login"}
        </h1>
        <p className={styles.loginSubtitle}>
          {twoFactorSetup
            ? "Scan the QR code with your authenticator app, then enter the 6-digit code to activate 2FA."
            : twoFactorStep
            ? "Enter the 6-digit code from your authenticator app."
            : "Sign in with an administrator account to access the admin panel."}
        </p>

        {error && <div className={styles.loginError}>{error}</div>}

        {twoFactorSetup && (
          <div className={styles.twoFactorSetup}>
            <div className={styles.qrCode}>
              <QRCodeSVG value={twoFactorSetup.otpauthUri} size={180} />
            </div>
            <div className={styles.setupSecret}>
              <span className={styles.detailLabel}>Secret key:</span>
              <code className={styles.secretValue}>{twoFactorSetup.secret}</code>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {!twoFactorStep && !twoFactorSetup ? (
            <>
              <div className={styles.field}>
                <label className={styles.fieldLabel}>Email</label>
                <input
                  className={styles.input}
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@vektorsec.local"
                  required
                />
              </div>

              <div className={styles.field}>
                <label className={styles.fieldLabel}>Password</label>
                <input
                  className={styles.input}
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                />
              </div>
            </>
          ) : (
            <div className={styles.field}>
              <label className={styles.fieldLabel}>Authenticator Code</label>
              <input
                className={styles.input}
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={twoFactorCode}
                onChange={(e) => setTwoFactorCode(e.target.value.replace(/\D/g, ""))}
                placeholder="000000"
                required
              />

              {twoFactorChallenge?.otpauthUri && (
                <details
                  open
                  style={{
                    marginTop: 10,
                    fontSize: 12,
                    color: "var(--secondary-text, #a1a1a1)",
                  }}
                >
                  <summary style={{ cursor: "pointer" }}>
                    Lost your device or switching apps? Scan / copy your key again
                  </summary>
                  <div style={{ textAlign: "center", margin: "0.5rem 0" }}>
                    <div
                      style={{
                        display: "inline-block",
                        padding: 10,
                        background: "#ffffff",
                        borderRadius: 10,
                      }}
                    >
                      <QRCodeSVG value={twoFactorChallenge.otpauthUri} size={160} />
                    </div>
                  </div>
                  <div style={{ marginTop: 6, wordBreak: "break-all" }}>
                    Enter this key manually in your authenticator app (choose
                    Time-based / TOTP):
                    <br />
                    <code style={{ fontSize: 11 }}>{twoFactorChallenge.secret}</code>
                  </div>
                </details>
              )}
            </div>
          )}

          <button className={styles.loginBtn} type="submit" disabled={submitting}>
            {submitting
              ? "Signing in..."
              : twoFactorStep || twoFactorSetup
              ? "Verify & Sign In"
              : "Sign In"}
          </button>
        </form>

        {(twoFactorStep || twoFactorSetup) && (
          <button type="button" className={styles.loginLink} onClick={backToCredentials}>
            Back to credentials
          </button>
        )}

        {!twoFactorStep && !twoFactorSetup && (
          <Link href="/login" className={styles.loginLink}>
            Back to user login
          </Link>
        )}
      </div>
    </div>
  );
};

export default AdminLogin;
