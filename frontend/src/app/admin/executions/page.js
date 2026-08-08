"use client";

import { useEffect, useState, useCallback } from "react";
import { getExecutionLogs } from "@/services/admin.service";
import styles from "../admin.module.scss";

const AdminExecutions = () => {
  const [logs, setLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(50);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const data = await getExecutionLogs({ page, limit });
      setLogs(data.logs || []);
      setTotal(data.total || 0);
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to load execution logs");
    }
  }, [page, limit]);

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      try {
        await load();
      } finally {
        setLoading(false);
      }
    };
    init();
  }, [load]);

  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <div>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>Execution Logs</h1>
        <p className={styles.pageSubtitle}>
          History of tool executions (security tools, async tasks) across all
          pentest sessions and users.
        </p>
      </div>

      {error && <div className={styles.error}>{error}</div>}

      <div className={styles.filterRow}>
        <span style={{ color: "#64748b", fontSize: 14 }}>
          {total.toLocaleString()} tool executions found
        </span>
        <select
          className={styles.select}
          value={limit}
          onChange={(e) => {
            setLimit(Number(e.target.value));
            setPage(1);
          }}
        >
          <option value={25}>25 / page</option>
          <option value={50}>50 / page</option>
          <option value={100}>100 / page</option>
        </select>
      </div>

      {loading ? (
        <div className={styles.loading}>Loading execution logs...</div>
      ) : logs.length === 0 ? (
        <div className={styles.empty}>No tool executions recorded yet.</div>
      ) : (
        <div className={styles.card}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Time</th>
                <th>Session</th>
                <th>Tool</th>
                <th>Result (preview)</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log, idx) => (
                <tr key={`${log.sessionId}-${log.toolCallId || idx}-${idx}`}>
                  <td style={{ whiteSpace: "nowrap" }}>
                    {log.timestamp
                      ? new Date(log.timestamp).toLocaleString()
                      : "N/A"}
                  </td>
                  <td>
                    <strong>{log.sessionName}</strong>
                    <div>
                      <span
                        className={styles.badge}
                        style={{
                          backgroundColor: "rgba(139,92,246,0.15)",
                          color: "#a78bfa",
                          fontFamily: "monospace",
                          fontSize: 11,
                        }}
                      >
                        {(log.sessionId || "").slice(0, 12)}
                        {(log.sessionId || "").length > 12 ? "..." : ""}
                      </span>
                    </div>
                  </td>
                  <td>
                    <span className={`${styles.badge} ${styles.badgeBlue}`}>
                      {log.toolName}
                    </span>
                  </td>
                  <td style={{ maxWidth: 480 }}>
                    <span
                      style={{
                        display: "block",
                        fontFamily: "monospace",
                        fontSize: 12,
                        color: "#94a3b8",
                        whiteSpace: "pre-wrap",
                        wordBreak: "break-word",
                        lineHeight: 1.5,
                        maxHeight: 80,
                        overflow: "hidden",
                      }}
                    >
                      {log.content || "(no output)"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div className={styles.filterRow} style={{ marginTop: 16, justifyContent: "center" }}>
          <button
            className={`${styles.btn} ${styles.btnSecondary} ${styles.btnSmall}`}
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Previous
          </button>
          <span style={{ color: "#94a3b8", fontSize: 13 }}>
            Page {page} of {totalPages}
          </span>
          <button
            className={`${styles.btn} ${styles.btnSecondary} ${styles.btnSmall}`}
            disabled={page >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
};

export default AdminExecutions;
