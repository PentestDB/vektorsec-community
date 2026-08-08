"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { getNotificationLogs } from "@/services/admin.service";
import styles from "./NotificationLogsPage.module.scss";

// ─── Mock data (fallback only) ─────────────────────────────────────
// The page normally loads real delivery logs from GET /admin/infra/notifications.
// If the backend is unreachable, it falls back to this sample data.
const MOCK_LOGS = [
  {
    id: "ntf-1001",
    timestamp: "2026-08-05T19:42:00+07:00",
    channel: "telegram",
    recipient: "Chat 123456789",
    type: "Scan started",
    status: "success",
    payload: { chatId: "123456789", text: "Scan started: nmap -sV example.com", botToken: "***" },
    error: null,
  },
  {
    id: "ntf-1002",
    timestamp: "2026-08-05T19:40:12+07:00",
    channel: "email",
    recipient: "ops@example.com",
    type: "Daily report",
    status: "success",
    payload: { to: "ops@example.com", subject: "Daily scan summary", attachments: 2 },
    error: null,
  },
  {
    id: "ntf-1003",
    timestamp: "2026-08-05T19:35:41+07:00",
    channel: "telegram",
    recipient: "Chat 987654321",
    type: "Approval required",
    status: "failed",
    payload: { chatId: "987654321", text: "Approve command: run zap baseline", botToken: "***" },
    error: "Telegram API 403: bot was blocked by the user",
  },
  {
    id: "ntf-1004",
    timestamp: "2026-08-05T19:31:05+07:00",
    channel: "webhook",
    recipient: "https://hooks.example.com/scan-events",
    type: "Scan completed",
    status: "success",
    payload: { url: "https://hooks.example.com/scan-events", event: "scan.completed", scanId: "sc-9981" },
    error: null,
  },
  {
    id: "ntf-1005",
    timestamp: "2026-08-05T19:22:30+07:00",
    channel: "email",
    recipient: "admin@example.com",
    type: "Subscription expiring",
    status: "pending",
    payload: { to: "admin@example.com", subject: "Subscription expiring in 3 days", userId: "u-5521" },
    error: null,
  },
  {
    id: "ntf-1006",
    timestamp: "2026-08-05T19:18:44+07:00",
    channel: "telegram",
    recipient: "Chat 123456789",
    type: "Report generated",
    status: "success",
    payload: { chatId: "123456789", text: "Report ready: report_20260805.pdf", botToken: "***" },
    error: null,
  },
  {
    id: "ntf-1007",
    timestamp: "2026-08-05T19:10:19+07:00",
    channel: "webhook",
    recipient: "https://hooks.example.com/alerts",
    type: "High severity finding",
    status: "failed",
    payload: { url: "https://hooks.example.com/alerts", severity: "high", title: "RCE detected" },
    error: "Timeout after 10000ms, endpoint did not respond",
  },
  {
    id: "ntf-1008",
    timestamp: "2026-08-05T19:02:55+07:00",
    channel: "telegram",
    recipient: "Chat 555111222",
    type: "Usage limit reached",
    status: "success",
    payload: { chatId: "555111222", text: "Daily scan limit reached", botToken: "***" },
    error: null,
  },
];

const PAGE_SIZE = 5;

const normalizeLog = (raw) => ({
  id: raw.id ?? String(raw.timestamp),
  timestamp: raw.timestamp,
  channel: raw.channel || "system",
  recipient: raw.recipient || "-",
  type: raw.type || "notification",
  status: raw.status || "success",
  payload: raw.payload || {},
  error: raw.error || null,
});

const NotificationLogsPage = () => {
  const [logs, setLogs] = useState(MOCK_LOGS);
  const [total, setTotal] = useState(MOCK_LOGS.length);
  const [channelFilter, setChannelFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(null);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [live, setLive] = useState(false);
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const data = await getNotificationLogs({ limit: 200 });
      setLogs((data.logs || []).map(normalizeLog));
      setTotal(data.total ?? data.logs?.length ?? 0);
      setLive(true);
      setNotice("");
    } catch (err) {
      setLive(false);
      setNotice("Notification API unavailable - showing sample logs.");
      setLogs(MOCK_LOGS);
      setTotal(MOCK_LOGS.length);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // ─── Derived stats ─────────────────────────────────────────────
  const stats = useMemo(() => {
    const success = logs.filter((l) => l.status === "success").length;
    const failed = logs.filter((l) => l.status === "failed").length;
    const pending = logs.filter((l) => l.status === "pending").length;
    const successRate = logs.length ? Math.round((success / logs.length) * 100) : 0;
    return { total24h: total, successRate, failed, pending };
  }, [logs, total]);

  // ─── Filtering ─────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return logs.filter((l) => {
      if (channelFilter !== "all" && l.channel !== channelFilter) return false;
      if (statusFilter !== "all" && l.status !== statusFilter) return false;
      if (term) {
        const haystack = `${l.recipient} ${l.type} ${l.payload?.subject || ""}`.toLowerCase();
        if (!haystack.includes(term)) return false;
      }
      return true;
    });
  }, [logs, channelFilter, statusFilter, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageRows = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const handleSearch = (value) => {
    setSearch(value);
    setPage(1);
  };

  const fmtTime = (iso) => {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
  };


  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.headerTitleWrap}>
          <h1 className={styles.title}>Notification Logs</h1>
          <p className={styles.subtitle}>
            Delivery history for Telegram, email and webhook notifications sent by the platform.
            {live && <span className={styles.liveBadge}>Live</span>}
          </p>
        </div>
        <button className={styles.refreshBtn} onClick={load} disabled={refreshing}>
          {refreshing ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      {notice && <div className={styles.notice}>{notice}</div>}

      {/* Header stats */}
      <div className={styles.statsGrid}>
        <div className={styles.statCard}>
          <div className={styles.statLabel}>Total Sent (24h)</div>
          <div className={styles.statValue}>{stats.total24h}</div>
          <div className={styles.statSub}>All channels combined</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statLabel}>Success Rate</div>
          <div className={styles.statValue}>{stats.successRate}%</div>
          <div className={styles.statSub}>Delivered successfully</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statLabel}>Failed</div>
          <div className={styles.statValue}>{stats.failed}</div>
          <div className={styles.statSub}>Delivery errors</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statLabel}>Pending</div>
          <div className={styles.statValue}>{stats.pending}</div>
          <div className={styles.statSub}>Awaiting delivery</div>
        </div>
      </div>

      {/* Filters */}
      <div className={styles.filterRow}>
        <select
          className={styles.select}
          value={channelFilter}
          onChange={(e) => {
            setChannelFilter(e.target.value);
            setPage(1);
          }}
        >
          <option value="all">All Channels</option>
          <option value="telegram">Telegram</option>
          <option value="email">Email</option>
          <option value="webhook">Webhook</option>
        </select>
        <select
          className={styles.select}
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setPage(1);
          }}
        >
          <option value="all">All Statuses</option>
          <option value="success">Success</option>
          <option value="failed">Failed</option>
          <option value="pending">Pending</option>
        </select>
        <input
          className={styles.searchInput}
          placeholder="Search recipient or subject..."
          value={search}
          onChange={(e) => handleSearch(e.target.value)}
        />
      </div>


      {loading ? (
        <div className={styles.loading}>Loading notification logs...</div>
      ) : pageRows.length === 0 ? (
        <div className={styles.empty}>No notification logs match the current filters.</div>
      ) : (
        <div className={styles.card}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Channel</th>
                <th>Recipient</th>
                <th>Type / Title</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((log) => (
                <tr key={log.id}>
                  <td style={{ whiteSpace: "nowrap" }}>{fmtTime(log.timestamp)}</td>
                  <td>
                    <span className={`${styles.badge} ${styles[`channel_${log.channel}`]}`}>
                      {log.channel === "telegram" ? "Telegram" : log.channel === "email" ? "Email" : "Webhook"}
                    </span>
                  </td>
                  <td>{log.recipient}</td>
                  <td>{log.type}</td>
                  <td>
                    <span className={`${styles.badge} ${styles[`status_${log.status}`]}`}>
                      {log.status.charAt(0).toUpperCase() + log.status.slice(1)}
                    </span>
                  </td>
                  <td>
                    <button
                      className={styles.viewBtn}
                      onClick={() => setSelected(log)}
                    >
                      View Payload
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Pagination */}
          <div className={styles.pagination}>
            <button
              className={styles.pageBtn}
              disabled={safePage <= 1}
              onClick={() => setPage(safePage - 1)}
            >
              Previous
            </button>
            <span className={styles.pageInfo}>
              Page {safePage} of {totalPages}
            </span>
            <button
              className={styles.pageBtn}
              disabled={safePage >= totalPages}
              onClick={() => setPage(safePage + 1)}
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* Detail modal */}
      {selected && (
        <div className={styles.modalOverlay} onClick={() => setSelected(null)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h2 className={styles.modalTitle}>Notification Detail</h2>
            <div className={styles.modalMeta}>
              <span>
                <strong>ID:</strong> {selected.id}
              </span>
              <span>
                <strong>Channel:</strong> {selected.channel}
              </span>
              <span>
                <strong>Recipient:</strong> {selected.recipient}
              </span>
              <span>
                <strong>Type:</strong> {selected.type}
              </span>
              <span>
                <strong>Status:</strong> {selected.status}
              </span>
            </div>

            <div className={styles.modalSection}>
              <h3 className={styles.modalSectionTitle}>JSON Payload</h3>
              <pre className={styles.jsonBlock}>
                {JSON.stringify(selected.payload, null, 2)}
              </pre>
            </div>

            {selected.error && (
              <div className={styles.modalSection}>
                <h3 className={styles.modalSectionTitle}>Error Log</h3>
                <pre className={`${styles.jsonBlock} ${styles.errorBlock}`}>
                  {selected.error}
                </pre>
              </div>
            )}

            <div className={styles.modalActions}>
              <button
                className={styles.closeBtn}
                onClick={() => setSelected(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default NotificationLogsPage;

