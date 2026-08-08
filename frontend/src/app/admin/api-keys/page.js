"use client";

import { useEffect, useState, useCallback } from "react";
import {
  getApiKeys,
  updateApiKeys,
  clearApiKey,
} from "@/services/admin.service";
import styles from "../admin.module.scss";

const AdminApiKeys = () => {
  const [keys, setKeys] = useState([]);
  const [values, setValues] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await getApiKeys();
      setKeys(data.keys || []);
      setValues({});
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to load API keys");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleChange = (key, value) => {
    setValues((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    // Only send non-empty fields (empty values are ignored — use clear to remove).
    const payload = {};
    for (const [key, value] of Object.entries(values)) {
      if (typeof value === "string" && value.trim()) {
        payload[key] = value.trim();
      }
    }

    if (Object.keys(payload).length === 0) {
      setError("Enter a value for at least one key before saving.");
      return;
    }

    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const data = await updateApiKeys(payload);
      setSuccess(data.message || "API keys updated");
      setValues({});
      await load();
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to update API keys");
    } finally {
      setSaving(false);
    }
  };

  const handleClear = async (key, label) => {
    if (!window.confirm(`Clear "${label}" (${key})? This removes the stored value.`)) return;
    setError("");
    setSuccess("");
    try {
      const data = await clearApiKey(key);
      setSuccess(data.message || `${key} cleared`);
      setValues((prev) => ({ ...prev, [key]: "" }));
      await load();
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to clear API key");
    }
  };

  if (loading) {
    return <div className={styles.loading}>Loading API keys...</div>;
  }

  return (
    <div>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>API Keys / Provider Settings</h1>

        <p className={styles.pageSubtitle}>
          Manage API keys and provider credentials used by the platform. Secrets are stored in the backend .env file and never displayed.
        </p>
      </div>

      {error && <div className={styles.error}>{error}</div>}
      {success && <div className={styles.success}>{success}</div>}

      <div className={styles.card}>
        <h2 className={styles.cardTitle}>Provider Credentials</h2>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Provider</th>
              <th>Status</th>
              <th>Value</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {keys.map((meta) => (
              <tr key={meta.key}>
                <td>
                  <strong>{meta.icon ? `${meta.icon} ` : ""}{meta.label}</strong>
                  <div>
                    <span className={styles.badge} style={{ backgroundColor: "rgba(100,116,139,0.15)", color: "#94a3b8", fontFamily: "monospace", fontSize: 11 }}>
                      {meta.key}
                    </span>
                  </div>
                </td>
                <td>
                  {meta.configured ? (
                    <span className={`${styles.badge} ${styles.badgeGreen}`}>Configured</span>

                  ) : (
                    <span className={`${styles.badge} ${styles.badgeGray}`}>Not set</span>
                  )}
                </td>
                <td>
                  <input
                    type="password"
                    className={styles.input}
                    placeholder={meta.configured ? "•••••••• (already set)" : meta.placeholder}
                    value={values[meta.key] || ""}
                    onChange={(e) => handleChange(meta.key, e.target.value)}
                    autoComplete="off"
                    style={{ maxWidth: 320 }}
                  />
                </td>
                <td>
                  <div className={styles.actionRow}>
                    {meta.configured && (
                      <button
                        className={`${styles.btn} ${styles.btnDanger} ${styles.btnSmall}`}
                        onClick={() => handleClear(meta.key, meta.label)}
                      >
                        Clear
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{ display: "flex", gap: 12, marginTop: 20 }}>
          <button
            className={`${styles.btn} ${styles.btnPrimary}`}
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? "Saving..." : "Save API Keys"}

          </button>
          <button
            className={`${styles.btn} ${styles.btnSecondary}`}
            onClick={load}
            disabled={saving}
          >
            ↻ Reset
          </button>
        </div>
      </div>
    </div>
  );
};

export default AdminApiKeys;
