"use client";

import { useEffect, useState } from "react";
import { getAuditLogs } from "@/services/admin.service";
import styles from "../admin.module.scss";

const AdminAuditLogs = () => {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionFilter, setActionFilter] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [limit] = useState(50);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const params = { page, limit };
        if (actionFilter) params.action = actionFilter;
        const data = await getAuditLogs(params);
        setLogs(data.logs || []);
        setTotal(data.total || 0);
      } catch (err) {
        setError(err?.response?.data?.message || "Failed to load audit logs");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [actionFilter, page]);

  const totalPages = Math.ceil(total / limit);

  if (loading) {
    return <div className={styles.loading}>Loading audit logs...</div>;
  }

  return (
    <div>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>Audit Logs</h1>
        <p className={styles.pageSubtitle}>Security and activity logs across the platform.</p>
      </div>

      {error && <div className={styles.error}>{error}</div>}

      <div className={styles.filterRow}>
        <input
          className={styles.input}
          style={{ maxWidth: 300 }}
          type="text"
          placeholder="Filter by action..."
          value={actionFilter}
          onChange={(e) => {
            setActionFilter(e.target.value);
            setPage(1);
          }}
        />
      </div>

      {logs.length === 0 ? (
        <div className={styles.empty}>No audit logs found.</div>
      ) : (
        <div className={styles.card}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Action</th>
                <th>User</th>
                <th>Resource</th>
                <th>IP</th>
                <th>Timestamp</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log._id}>
                  <td>
                    <span className={`${styles.badge} ${styles.badgeBlue}`}>
                      {log.action}
                    </span>
                  </td>
                  <td>{log.userId || "System"}</td>
                  <td>
                    {log.resourceType ? `${log.resourceType}:${log.resourceId || "N/A"}` : "N/A"}
                  </td>
                  <td>{log.ip || "N/A"}</td>
                  <td>{new Date(log.createdAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {totalPages > 1 && (
            <div className={styles.filterRow} style={{ marginTop: 16, justifyContent: "center" }}>
              <button
                className={`${styles.btn} ${styles.btnSecondary} ${styles.btnSmall}`}
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
              >
                Previous
              </button>
              <span style={{ color: "#64748b", fontSize: 14 }}>
                Page {page} of {totalPages}
              </span>
              <button
                className={`${styles.btn} ${styles.btnSecondary} ${styles.btnSmall}`}
                disabled={page >= totalPages}
                onClick={() => setPage(page + 1)}
              >
                Next
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default AdminAuditLogs;
