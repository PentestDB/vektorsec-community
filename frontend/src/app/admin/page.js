"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { login, checkSession } from "@/services/auth.service";
import styles from "./admin.module.scss";

const AdminLogin = () => {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

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

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      const data = await login({ email, password });
      if (data.user?.role !== "admin") {
        setError("This account does not have admin access.");
        setSubmitting(false);
        return;
      }
      router.replace("/admin/dashboard");
    } catch (err) {
      setError(err?.response?.data?.message || "Login failed. Please try again.");
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
        <h1 className={styles.loginTitle}>Admin Login</h1>
        <p className={styles.loginSubtitle}>
          Sign in with an administrator account to access the admin panel.
        </p>

        {error && <div className={styles.loginError}>{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className={styles.field}>
            <label className={styles.fieldLabel}>Email</label>
            <input
              className={styles.input}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@example.com"
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

          <button
            className={styles.loginBtn}
            type="submit"
            disabled={submitting}
          >
            {submitting ? "Signing in..." : "Sign In"}
          </button>
        </form>

        <Link href="/login" className={styles.loginLink}>
          Back to user login
        </Link>
      </div>
    </div>
  );
};

export default AdminLogin;
