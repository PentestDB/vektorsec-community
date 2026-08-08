"use client";

import { useEffect, useState, useCallback } from "react";
import {
  getExecutionQuotas,
  updateExecutionQuota,
} from "@/services/admin.service";
import styles from "../admin.module.scss";

const AdminQuotas = () => {
  const [quotas, setQuotas] = useState([]);
  const [editing, setEditing] = useState(null); // planId being edited
  const [form, setForm] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await getExecutionQuotas();
      setQuotas(data.quotas || []);
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to load quotas");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const startEdit = (q) => {
    setEditing(q.planId);
    setForm({
      maxRequestsPerDay: q.maxRequestsPerDay ?? 0,
      maxTokensPerDay: q.maxTokensPerDay ?? 0,
      maxConcurrentSessions: q.maxConcurrentSessions ?? 1,
    });
  };

  const handleSave = async () => {
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const data = await updateExecutionQuota(editing, {
        maxRequestsPerDay: Number(form.maxRequestsPerDay) || 0,
        maxTokensPerDay: Number(form.maxTokensPerDay) || 0,
        maxConcurrentSessions: Number(form.maxConcurrentSessions) || 1,
      });
      setSuccess(data.message || `Quota updated for "${editing}"`);
      setEditing(null);
      await load();
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to update quota");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className={styles.loading}>Loading quotas...</div>;
  }

  const fmt = (n) => (Number(n) === 0 ? "Unlimited" : Number(n).toLocaleString());

  return (
    <div>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>Quotas / Rate Limits</h1>
        <p className={styles.pageSubtitle}>
          Limit how many pentest requests, LLM tokens and concurrent sessions
          each plan can use per day. Free users can be capped at e.g. 3 scans /
          day while premium plans can be unlimited.
        </p>
      </div>

      {error && <div className={styles.error}>{error}</div>}
      {success && <div className={styles.success}>{success}</div>}

      {quotas.length === 0 ? (
        <div className={styles.empty}>No plans found.</div>
      ) : (
        <div className={styles.card}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Plan</th>
                <th>Requests / Day</th>
                <th>Tokens / Day</th>
                <th>Concurrent Sessions</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {quotas.map((q) => (
                <tr key={q.planId}>
                  <td>
                    <strong>{q.name}</strong>
                    <div>
                      <span
                        className={styles.badge}
                        style={{
                          backgroundColor: "rgba(100,116,139,0.15)",
                          color: "#94a3b8",
                          fontFamily: "monospace",
                          fontSize: 11,
                        }}
                      >
                        {q.planId}
                      </span>
                    </div>
                  </td>
                  <td>
                    {editing === q.planId ? (
                      <input
                        type="number"
                        min="0"
                        className={styles.input}
                        style={{ maxWidth: 120 }}
                        value={form.maxRequestsPerDay}
                        onChange={(e) =>
                          setForm({ ...form, maxRequestsPerDay: e.target.value })
                        }
                      />
                    ) : (
                      fmt(q.maxRequestsPerDay)
                    )}
                  </td>
                  <td>
                    {editing === q.planId ? (
                      <input
                        type="number"
                        min="0"
                        className={styles.input}
                        style={{ maxWidth: 120 }}
                        value={form.maxTokensPerDay}
                        onChange={(e) =>
                          setForm({ ...form, maxTokensPerDay: e.target.value })
                        }
                      />
                    ) : (
                      fmt(q.maxTokensPerDay)
                    )}
                  </td>
                  <td>
                    {editing === q.planId ? (
                      <input
                        type="number"
                        min="1"
                        className={styles.input}
                        style={{ maxWidth: 100 }}
                        value={form.maxConcurrentSessions}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            maxConcurrentSessions: e.target.value,
                          })
                        }
                      />
                    ) : (
                      q.maxConcurrentSessions
                    )}
                  </td>
                  <td>
                    {q.enabled ? (
                      <span className={`${styles.badge} ${styles.badgeGreen}`}>
                        Enabled
                      </span>
                    ) : (
                      <span className={`${styles.badge} ${styles.badgeGray}`}>
                        Disabled
                      </span>
                    )}
                  </td>
                  <td>
                    {editing === q.planId ? (
                      <div className={styles.actionRow}>
                        <button
                          className={`${styles.btn} ${styles.btnPrimary} ${styles.btnSmall}`}
                          onClick={handleSave}
                          disabled={saving}
                        >
                          {saving ? "Saving..." : "Save"}
                        </button>
                        <button
                          className={`${styles.btn} ${styles.btnSecondary} ${styles.btnSmall}`}
                          onClick={() => setEditing(null)}
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        className={`${styles.btn} ${styles.btnSecondary} ${styles.btnSmall}`}
                        onClick={() => startEdit(q)}
                      >
                        Edit
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p style={{ fontSize: 12, color: "#64748b", marginTop: 16 }}>
        Tip: 0 = unlimited. Values are enforced by the backend usage tracker for
        both Telegram bot and Online platform channels.
      </p>
    </div>
  );
};

export default AdminQuotas;
