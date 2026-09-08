"use client";

import { App, Button, Form, Input } from "antd";
import styles from "@/styles/pages/Login.module.scss";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQueryClient } from "react-query";
import { login } from "@/services/auth.service";
import CopilotLogo from "@/components/common/CopilotLogo";
import Link from "next/link";
import { loginUser } from "@/store/user.slice";
import { useDispatch } from "react-redux";
import { FaGithub, FaGoogle } from "react-icons/fa";
import AuthShowcase from "./AuthShowcase";
import { useEffect, useState } from "react";
import RecaptchaField from "@/components/common/RecaptchaField";
import { QRCodeSVG } from "qrcode.react";

const LoginPage = () => {
  const router = useRouter();
  const dispatch = useDispatch();
  const queryClient = useQueryClient();
  const { message } = App.useApp();

  // Two-step sign-in: credentials first, then the TOTP code when 2FA is on.
  const [twoFactorStep, setTwoFactorStep] = useState(false);
  // First-time 2FA enrollment — the backend returned an otpauth URI + secret.
  const [twoFactorSetup, setTwoFactorSetup] = useState(null);
  // Accounts that ALREADY have 2FA: the challenge also carries the otpauth URI +
  // secret so the key can be re-scanned / copied on every login (new device,
  // recovery, backup).
  const [twoFactorChallenge, setTwoFactorChallenge] = useState(null);
  const [creds, setCreds] = useState({ email: "", password: "" });
  const [recaptchaToken, setRecaptchaToken] = useState("");
  const [recaptchaResetKey, setRecaptchaResetKey] = useState(0);

  const loginMutation = useMutation(login, {
    onError: (error) => {
      // A brand-new account has no 2FA yet → the backend replied 400 with
      // twoFactorSetupRequired. Show the QR enrollment step.
      if (error?.response?.data?.twoFactorSetupRequired) {
        setTwoFactorSetup({
          otpauthUri: error.response.data.otpauthUri,
          secret: error.response.data.secret,
        });
        return;
      }
      // The account has 2FA enabled → the backend replied 400 with
      // twoFactorRequired. Switch to the separate TOTP code step instead of
      // treating it as a failed login, and keep the QR/secret so the key can be
      // re-scanned or copied on every login.
      if (error?.response?.data?.twoFactorRequired) {
        setTwoFactorChallenge({
          otpauthUri: error.response.data.otpauthUri,
          secret: error.response.data.secret,
        });
        setTwoFactorStep(true);
        return;
      }
      message.error(
        error?.response?.data?.message ??
          "Failed to login, please try again later!"
      );
      // reCAPTCHA tokens are single-use — force a fresh solve on the next attempt.
      setRecaptchaResetKey((k) => k + 1);
    },
    onSuccess: async (data) => {
      // The account has 2FA enabled → ask for the authenticator code.
      if (data?.twoFactorRequired) {
        setTwoFactorChallenge({
          otpauthUri: data.otpauthUri,
          secret: data.secret,
        });
        setTwoFactorStep(true);
        return;
      }

      message.success(data?.message ?? "Logged in successfully!");
      localStorage.removeItem("antiCSRF");
      dispatch(loginUser(data.user));
      await queryClient.invalidateQueries("check-session");
      router.push("/dashboard");
    },
  });

  const handleLogin = (values) => {
    if (twoFactorStep || twoFactorSetup) {
      loginMutation.mutate({
        email: creds.email,
        password: creds.password,
        twoFactorCode: values.twoFactorCode,
      });
      return;
    }

    setCreds({ email: values.email, password: values.password });
    loginMutation.mutate({
      email: values.email,
      password: values.password,
      recaptchaToken,
    });
  };

  const backToCredentials = () => {
    setTwoFactorStep(false);
    setTwoFactorSetup(null);
    setTwoFactorChallenge(null);
    setRecaptchaResetKey((k) => k + 1);
  };

  const handleSocial = (provider) => {
    // OAuth is initiated through the same-origin API gateway so the browser
    // never talks to the backend host directly.
    const target = provider === "Google" ? "/api/auth/google" : "/api/auth/github";
    window.location.href = target;
  };

  // Show a message when the OAuth flow bounces back with an error.
  const searchParams = useSearchParams();
  useEffect(() => {
    const social = searchParams.get("social");
    const error = searchParams.get("error");
    if (social && error) {
      message.error(decodeURIComponent(error));
      router.replace("/login", { scroll: false });
    }
  }, [searchParams, router, message]);

  return (
    <div className={styles.authPage}>
      <section className={styles.formPane}>
        <div className={styles.formPaneInner}>
          <div className={styles.brandRow}>
            <Link href="/">
              <CopilotLogo />
            </Link>
          </div>

          <div className={styles.formHeader}>
            <h1 className={styles.formTitle}>
              {twoFactorSetup
                ? "Set Up Two-Factor Authentication"
                : twoFactorStep
                ? "Two-Factor Authentication"
                : "Welcome Back"}
            </h1>
            <p className={styles.formSubtitle}>
              {twoFactorSetup
                ? "Scan the QR code with your authenticator app, then enter the 6-digit code to activate 2FA and finish sign-in."
                : twoFactorStep
                ? "Enter the 6-digit code from your authenticator app to complete sign-in."
                : "Sign in to your VektorSec workspace to resume your security operations."}
            </p>
          </div>

          <Form
            className={styles.minimalForm}
            onFinish={handleLogin}
            layout="vertical"
            requiredMark={false}
          >
            {twoFactorSetup ? (
              <>
                <div style={{ textAlign: "center", margin: "0.5rem 0 1rem" }}>
                  <div
                    style={{
                      display: "inline-block",
                      padding: 12,
                      background: "#ffffff",
                      borderRadius: 12,
                    }}
                  >
                    <QRCodeSVG value={twoFactorSetup.otpauthUri} size={200} />
                  </div>
                  <div
                    style={{
                      marginTop: 10,
                      fontSize: 12,
                      color: "var(--secondary-text)",
                    }}
                  >
                    Scan with Google Authenticator, Authy, or 1Password
                  </div>
                </div>

                <Form.Item
                  name="twoFactorCode"
                  label="Enter the 6-digit code"
                  rules={[
                    {
                      required: true,
                      message: "Please enter your 6-digit code",
                    },
                    {
                      len: 6,
                      message: "Code must be 6 digits",
                    },
                  ]}
                >
                  <Input
                    placeholder="000000"
                    bordered={false}
                    maxLength={6}
                    inputMode="numeric"
                    autoFocus
                  />
                </Form.Item>

                <Form.Item className={styles.submitItem}>
                  <Button
                    className={styles.loginSubmit}
                    htmlType="submit"
                    loading={loginMutation.isLoading}
                  >
                    Activate 2FA &amp; Sign In
                  </Button>
                </Form.Item>

                <details
                  style={{
                    marginBottom: 8,
                    fontSize: 12,
                    color: "var(--secondary-text)",
                  }}
                >
                  <summary style={{ cursor: "pointer" }}>
                    Can&apos;t scan the QR code?
                  </summary>
                  <div style={{ marginTop: 6, wordBreak: "break-all" }}>
                    Enter this key manually in your authenticator app (choose
                    Time-based / TOTP):
                    <br />
                    <code style={{ fontSize: 11 }}>{twoFactorSetup.secret}</code>
                  </div>
                </details>

                <Button
                  type="link"
                  onClick={backToCredentials}
                  disabled={loginMutation.isLoading}
                  style={{ width: "100%" }}
                >
                  ← Back to login
                </Button>
              </>
            ) : twoFactorStep ? (
              <>
                <Form.Item
                  name="twoFactorCode"
                  label="Authenticator code"
                  rules={[
                    {
                      required: true,
                      message: "Please enter your 6-digit code",
                    },
                    {
                      len: 6,
                      message: "Code must be 6 digits",
                    },
                  ]}
                >
                  <Input
                    placeholder="000000"
                    bordered={false}
                    maxLength={6}
                    inputMode="numeric"
                    autoFocus
                  />
                </Form.Item>

                {twoFactorChallenge?.otpauthUri && (
                  <details
                    open
                    style={{
                      marginBottom: 8,
                      fontSize: 12,
                      color: "var(--secondary-text)",
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

                <Form.Item className={styles.submitItem}>
                  <Button
                    className={styles.loginSubmit}
                    htmlType="submit"
                    loading={loginMutation.isLoading}
                  >
                    Verify &amp; Sign In
                  </Button>
                </Form.Item>

                <Button
                  type="link"
                  onClick={backToCredentials}
                  disabled={loginMutation.isLoading}
                  style={{ width: "100%" }}
                >
                  ← Back to login
                </Button>
              </>
            ) : (
              <>
                <Form.Item
                  name="email"
                  label="Email address"
                  rules={[
                    {
                      required: true,
                      message: "Please enter your email",
                    },
                    {
                      type: "email",
                      message: "Invalid email",
                    },
                  ]}
                >
                  <Input placeholder="you@company.com" bordered={false} />
                </Form.Item>

                <Form.Item
                  name="password"
                  label="Password"
                  rules={[
                    {
                      required: true,
                      message: "Please enter your password",
                    },
                  ]}
                >
                  <Input.Password placeholder="Enter your password" bordered={false} />
                </Form.Item>

                <RecaptchaField
                  onChange={setRecaptchaToken}
                  resetSignal={recaptchaResetKey}
                />

                <Form.Item className={styles.submitItem}>
                  <Button
                    className={styles.loginSubmit}
                    htmlType="submit"
                    loading={loginMutation.isLoading}
                  >
                    Login
                  </Button>
                </Form.Item>
              </>
            )}
          </Form>

          {!twoFactorStep && !twoFactorSetup && (
            <>
              <div className={styles.dividerRow}>
                <span>or continue with</span>
              </div>

              <div className={styles.socialRow}>
                <button
                  type="button"
                  className={styles.socialBtn}
                  onClick={() => handleSocial("GitHub")}
                >
                  <FaGithub size={18} />
                  Continue with GitHub
                </button>
                <button
                  type="button"
                  className={styles.socialBtn}
                  onClick={() => handleSocial("Google")}
                >
                  <FaGoogle size={18} />
                  Continue with Google
                </button>
              </div>

              <div className={styles.authSwitch}>
                New here? <Link href="/register">Create an account</Link>
              </div>
            </>
          )}
        </div>
      </section>

      <AuthShowcase />
    </div>
  );
};

export default LoginPage;

