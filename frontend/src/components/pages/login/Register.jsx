"use client";

import { App, Button, Form, Input } from "antd";
import styles from "@/styles/pages/Login.module.scss";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation } from "react-query";
import { register } from "@/services/auth.service";
import CopilotLogo from "@/components/common/CopilotLogo";
import Link from "next/link";
import { FaGithub, FaGoogle } from "react-icons/fa";
import AuthShowcase from "./AuthShowcase";
import { useEffect, useState } from "react";
import RecaptchaField from "@/components/common/RecaptchaField";

const RegisterPage = () => {
  const router = useRouter();
  const { message } = App.useApp();
  const [recaptchaToken, setRecaptchaToken] = useState("");
  const [recaptchaResetKey, setRecaptchaResetKey] = useState(0);

  const registerMutation = useMutation(register, {
    onError: (error) => {
      message.error(
        error?.response?.data?.message ??
          "Failed to register. Please try again later."
      );
      // reCAPTCHA tokens are single-use — force a fresh solve on the next attempt.
      setRecaptchaResetKey((k) => k + 1);
    },
    onSuccess: (data) => {
      message.success("Registration successful. Please login to continue.");
      router.push("/login");
    },
  });

  const handleRegister = (values) => {
    registerMutation.mutate({
      name: values.name,
      email: values.email,
      password: values.password,
      recaptchaToken,
    });
  };

  const handleSocial = (provider) => {
    const backend = process.env.NEXT_PUBLIC_BACKEND_URI || "http://localhost:8080";
    const target =
      provider === "Google"
        ? `${backend}/api/auth/google`
        : `${backend}/api/auth/github`;
    window.location.href = target;
  };

  // Show a message when the OAuth flow bounces back with an error.
  const searchParams = useSearchParams();
  useEffect(() => {
    const social = searchParams.get("social");
    const error = searchParams.get("error");
    if (social && error) {
      message.error(decodeURIComponent(error));
      router.replace("/register", { scroll: false });
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
            <h1 className={styles.formTitle}>Create your account</h1>
            <p className={styles.formSubtitle}>
              Start your autonomous pentesting journey with VektorSec and claim
              your one-time welcome tokens.
            </p>
          </div>

          <Form
            className={styles.minimalForm}
            onFinish={handleRegister}
            layout="vertical"
            requiredMark={false}
          >
            <Form.Item
              name="name"
              label="Full name"
              rules={[
                {
                  required: true,
                  message: "Please enter your name",
                },
              ]}
            >
              <Input placeholder="Jane Doe" bordered={false} />
            </Form.Item>

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
                {
                  min: 8,
                  message: "Password must be at least 8 characters",
                },
              ]}
            >
              <Input.Password placeholder="Create a strong password" bordered={false} />
            </Form.Item>

            <RecaptchaField
              onChange={setRecaptchaToken}
              resetSignal={recaptchaResetKey}
            />

            <Form.Item className={styles.submitItem}>
              <Button
                className={styles.loginSubmit}
                htmlType="submit"
                loading={registerMutation.isLoading}
              >
                Create Account
              </Button>
            </Form.Item>
          </Form>

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
            Already have an account? <Link href="/login">Sign in</Link>
          </div>
        </div>
      </section>

      <AuthShowcase />
    </div>
  );
};

export default RegisterPage;

