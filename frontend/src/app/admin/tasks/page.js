"use client";

import { useEffect, useState, useCallback } from "react";
import {
  getActiveTasks,
  abortAgentSession,
  cancelQueuedTask,
  getSystemResource,
} from "@/services/admin.service";
import styles from "../admin.module.scss";

const PRIORITY_COLORS = {
  critical: "badgeRed",
  high: "badgeYellow",
  normal: "badgeBlue",
  low: "badgeGray",
};

const STATUS_COLORS = {
  queued: "badgeGray",
  running: "badgeBlue",
  completed: "badgeGreen",
  failed: "badgeRed",
  cancelled: "badgeYellow",
};

const AdminTasks = () => {

  const [data, setData] = useState({ sessions: [], queue: { stats: {}, tasks: [] } });
  const [system, setSystem] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const loadTasks = useCallback(async () => {
    try {
      const tasksData = await getActiveTasks();
      setData(tasksData);
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to load active tasks");
    }
  }, []);

  const loadSystem = useCallback(async () => {
    try {
      const sysData = await getSystemResource();
      setSystem(sysData);
    } catch (err) {
      // Non-fatal — system metrics may not be available on some platforms.
    }
  }, []);

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      try {
        await Promise.all([loadTasks(), loadSystem()]);
      } finally {
        setLoading(false);
      }
    };
    init();

    // Auto-refresh every 5s while the page is open.
    const interval = setInterval(() => {
      loadTasks();
      loadSystem();
    }, 5000);
    return () => clearInterval(interval);
  }, [loadTasks, loadSystem]);

  const handleAbort = async (sessionId, name) => {
    if (!window.confirm(`Force stop session "${name}"? Running tools will be terminated.`)) return;
    setError("");
    setSuccess("");
    try {
      const data = await abortAgentSession(sessionId);
      setSuccess(data?.message || "Session aborted");
      await loadTasks();
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to abort session");
    }
  };

  const handleCancelTask = async (taskId) => {
    if (!window.confirm("Cancel this queued task?")) return;
    setError("");
    setSuccess("");
    try {
      const data = await cancelQueuedTask(taskId);
      setSuccess(data?.message || "Task cancelled");
      await loadTasks();
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to cancel task");
    }
  };

  if (loading) {
    return <div className={styles.loading}>Loading task monitor...</div>;
  }

  const { sessions, queue } = data;
  const queueStats = queue.stats || {};

  const memUsagePct = system?.memory?.usagePct ?? 0;
  const diskUsagePct = system?.disk?.usagePct ?? 0;

  const ProgressBar = ({ pct }) => (
    <div style={{ width: 140, height: 6, borderRadius: 3, backgroundColor: "rgba(100,116,139,0.25)", overflow: "hidden" }}>
      <div
        style={{
          width: `${Math.min(100, Math.max(0, pct || 0))}%`,
          height: "100%",
          borderRadius: 3,
          backgroundColor: pct > 85 ? "#ef4444" : pct > 60 ? "#f59e0b" : "#22c55e",
        }}
      />
    </div>
  );

  return (
    <div>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>Pentest Tasks</h1>

        <p className={styles.pageSubtitle}>
          Monitor active agent sessions, background task queue and host resources. Auto-refreshes every 5 seconds.
        </p>
      </div>

      {error && <div className={styles.error}>{error}</div>}
      {success && <div className={styles.success}>{success}</div>}

      {/* System resources */}
      {system && (
        <>
          <h2 className={styles.cardTitle} style={{ marginBottom: 12 }}>System Resources</h2>

          <div className={styles.statsGrid}>
            <div className={styles.statCard}>
              <div className={styles.statLabel}>CPU Cores</div>
              <div className={styles.statValue} style={{ fontSize: 22 }}>{system.cpu?.cores ?? "?"}</div>
              <div className={styles.statSub}>
                Load: {system.cpu?.loadAvg?.map((l) => l.toFixed(2)).join(" / ")}
              </div>
              <div style={{ marginTop: 8 }}>
                <ProgressBar pct={(system.cpu?.loadAvg?.[0] ?? 0) * 10} />
              </div>
            </div>
            <div className={styles.statCard}>
              <div className={styles.statLabel}>Memory</div>
              <div className={styles.statValue} style={{ fontSize: 22 }}>
                {system.memory?.usedGb ?? "?"} GB
              </div>
              <div className={styles.statSub}>
                {system.memory?.totalGb} GB total · {memUsagePct}% used
              </div>
              <div style={{ marginTop: 8 }}>
                <ProgressBar pct={memUsagePct} />
              </div>
            </div>
            <div className={styles.statCard}>
              <div className={styles.statLabel}>Disk ({system.disk?.mount || "root"})</div>
              <div className={styles.statValue} style={{ fontSize: 22 }}>
                {system.disk ? `${system.disk.usedGb} GB` : "N/A"}
              </div>
              <div className={styles.statSub}>
                {system.disk ? `${system.disk.totalGb} GB total · ${diskUsagePct}% used` : "Disk info unavailable"}
              </div>
              <div style={{ marginTop: 8 }}>
                <ProgressBar pct={diskUsagePct} />
              </div>
            </div>
            <div className={styles.statCard}>
              <div className={styles.statLabel}>Uptime</div>
              <div className={styles.statValue} style={{ fontSize: 22 }}>
                {(system.uptimeSec / 3600).toFixed(1)}h
              </div>
              <div className={styles.statSub}>
                {system.platform} · Node {system.nodeVersion}
              </div>
            </div>
          </div>
        </>
      )}

      {/* Active agent sessions */}
      <h2 className={styles.cardTitle} style={{ marginBottom: 12 }}>
        Active Agent Sessions ({sessions.length})

      </h2>
      {sessions.length === 0 ? (
        <div className={styles.empty}>No active agent sessions right now.</div>
      ) : (
        <div className={styles.card} style={{ marginBottom: 20 }}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Session</th>
                <th>State</th>
                <th>Started</th>
                <th>Active Since</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((s) => (
                <tr key={s.sessionId}>
                  <td>
                    <strong>{s.name}</strong>
                    <div>
                      <span className={styles.badge} style={{ backgroundColor: "rgba(139,92,246,0.15)", color: "#a78bfa", fontFamily: "monospace", fontSize: 11 }}>
                        {s.sessionId.slice(0, 12)}...
                      </span>
                    </div>
                  </td>
                  <td>
                    <span className={`${styles.badge} ${styles.badgeBlue}`}>{s.agentState}</span>
                  </td>
                  <td>{s.createdAt ? new Date(s.createdAt).toLocaleString() : "N/A"}</td>
                  <td>{s.activeSince ? new Date(s.activeSince).toLocaleTimeString() : "N/A"}</td>
                  <td>
                    <button
                      className={`${styles.btn} ${styles.btnDanger} ${styles.btnSmall}`}
                      onClick={() => handleAbort(s.sessionId, s.name)}
                    >
                      Force Stop
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Task queue */}
      <h2 className={styles.cardTitle} style={{ marginBottom: 12 }}>
        Task Queue ({queue.tasks?.length ?? 0})

      </h2>
      <div className={styles.statsGrid} style={{ gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))" }}>
        <div className={styles.statCard}>
          <div className={styles.statLabel}>Queued</div>
          <div className={styles.statValue} style={{ fontSize: 22 }}>{queueStats.queued ?? 0}</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statLabel}>Running</div>
          <div className={styles.statValue} style={{ fontSize: 22 }}>{queueStats.running ?? 0}</div>
        </div>
      </div>

      {(queue.tasks?.length ?? 0) === 0 ? (
        <div className={styles.empty}>No background tasks in the queue.</div>
      ) : (
        <div className={styles.card}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Type</th>
                <th>Priority</th>
                <th>Status</th>
                <th>Progress</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {queue.tasks.map((t) => (
                <tr key={t.id}>
                  <td>
                    <strong>{t.type}</strong>
                    <div>
                      <span className={styles.badge} style={{ backgroundColor: "rgba(100,116,139,0.15)", color: "#94a3b8", fontFamily: "monospace", fontSize: 11 }}>
                        {t.id.slice(0, 8)}...
                      </span>
                    </div>
                  </td>
                  <td>
                    <span className={`${styles.badge} ${PRIORITY_COLORS[t.priority] || "badgeGray"}`}>{t.priority}</span>
                  </td>
                  <td>
                    <span className={`${styles.badge} ${STATUS_COLORS[t.status] || "badgeGray"}`}>
                      {t.status}
                    </span>

                    {t.error && (
                      <div style={{ marginTop: 4, fontSize: 11, color: "#f87171", maxWidth: 220 }}>
                        {t.error.slice(0, 80)}
                      </div>
                    )}
                  </td>
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <ProgressBar pct={t.progress} />
                      <span style={{ fontSize: 12, color: "#64748b" }}>{t.progress}%</span>
                    </div>
                  </td>
                  <td>{new Date(t.createdAt).toLocaleString()}</td>
                  <td>
                    {t.status === "queued" && (
                      <button
                        className={`${styles.btn} ${styles.btnDanger} ${styles.btnSmall}`}
                        onClick={() => handleCancelTask(t.id)}
                      >
                        Cancel
                      </button>
                    )}
                    {t.status === "running" && <span style={{ fontSize: 12, color: "#64748b" }}>Running...</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default AdminTasks;
