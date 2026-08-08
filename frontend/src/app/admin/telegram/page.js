"use client";

import { useEffect, useState } from "react";
import {
  getTelegramBotStatus,
  testTelegramConnection,
  setTelegramWebhook,
  broadcastTelegramMessage,
  getTelegramUsers,
} from "@/services/admin.service";
import styles from "../admin.module.scss";

const AdminTelegram = () => {
  const [status, setStatus] = useState(null);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Test connection
  const [testToken, setTestToken] = useState("");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);

  // Webhook
  const [webhookUrl, setWebhookUrl] = useState("");
  const [savingWebhook, setSavingWebhook] = useState(false);

  // Broadcast
  const [broadcastMsg, setBroadcastMsg] = useState("");
  const [broadcasting, setBroadcasting] = useState(false);

  const load = async () => {
    setError("");
    try {
      const [statusData, userData] = await Promise.all([
        getTelegramBotStatus(),
        getTelegramUsers().catch(() => null),
      ]);
      setStatus(statusData);
      setUsers(userData?.users || []);
      setWebhookUrl(statusData?.webhook?.url || "");
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to load Telegram status");
    }
  };

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
  }, []);

  const handleTest = async () => {
    setError("");
    setSuccess("");
    setTestResult(null);
    setTesting(true);
    try {
      const data = await testTelegramConnection(testToken.trim() || undefined);
      setTestResult(data);
      if (data.success) setSuccess(data.message);
      else setError(data.message);
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to test connection");
    } finally {
      setTesting(false);
    }
  };

  const handleSaveWebhook = async () => {
    setError("");
    setSuccess("");
    setSavingWebhook(true);
    try {
      const data = await setTelegramWebhook(webhookUrl.trim());
      setSuccess(data.message);
      await load();
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to set webhook");
    } finally {
      setSavingWebhook(false);
    }
  };

  const handleBroadcast = async () => {
    if (!broadcastMsg.trim()) {
      setError("Broadcast message cannot be empty");
      return;
    }
    if (!window.confirm(`Send this message to all ${users.length} Telegram users?`)) return;
    setError("");
    setSuccess("");
    setBroadcasting(true);
    try {
      const data = await broadcastTelegramMessage(broadcastMsg.trim());
      setSuccess(data.message);
      setBroadcastMsg("");
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to broadcast");
    } finally {
      setBroadcasting(false);
    }
  };

  if (loading) {
    return <div className={styles.loading}>Loading Telegram bot status...</div>;
  }

  const botName = status?.botInfo?.username
    ? `@${status.botInfo.username}`
    : "Not connected";

  return (
    <div>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>Telegram Bot</h1>

        <p className={styles.pageSubtitle}>
          Monitor the Telegram integration, verify the bot token, configure the webhook and broadcast messages.
        </p>
      </div>

      {error && <div className={styles.error}>{error}</div>}
      {success && <div className={styles.success}>{success}</div>}

      {/* Status cards */}
      <div className={styles.statsGrid}>
        <div className={styles.statCard}>
          <div className={styles.statLabel}>Bot Status</div>
          <div className={styles.statValue} style={{ fontSize: 20 }}>
            {status?.configured ? "Configured" : "Not configured"}

          </div>
          <div className={styles.statSub}>
            {status?.running ? "Polling loop is running" : "Polling loop stopped"}
          </div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statLabel}>Bot Identity</div>
          <div className={styles.statValue} style={{ fontSize: 20 }}>
            {botName}
          </div>
          <div className={styles.statSub}>
            {status?.botInfo?.first_name || "Run Test Connection to verify the token"}
          </div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statLabel}>Rate Limit</div>
          <div className={styles.statValue} style={{ fontSize: 20 }}>
            {status?.rateLimited ? "Limited" : "Normal"}

          </div>
          <div className={styles.statSub}>
            {status?.rateLimitedUntil
              ? `Until ${new Date(status.rateLimitedUntil).toLocaleTimeString()}`
              : "No Telegram API rate limiting"}
          </div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statLabel}>Telegram Users</div>
          <div className={styles.statValue}>{status?.telegramUsers ?? 0}</div>
          <div className={styles.statSub}>{users.length} shown below</div>
        </div>
      </div>

      {/* Test connection */}
      <div className={styles.card} style={{ marginBottom: 20 }}>
        <h2 className={styles.cardTitle}>Test Connection</h2>
        <p style={{ color: "#64748b", fontSize: 13, marginBottom: 12 }}>
          Leave the token empty to test the currently configured <code>TELEGRAM_BOT_TOKEN</code>.
        </p>
        <div className={styles.filterRow}>
          <input
            className={styles.input}
            style={{ minWidth: 320, flex: 1 }}
            type="password"
            placeholder="Telegram bot token (optional)"
            value={testToken}
            onChange={(e) => setTestToken(e.target.value)}
          />
          <button
            className={`${styles.btn} ${styles.btnPrimary} ${styles.btnSmall}`}
            onClick={handleTest}
            disabled={testing}
          >
            {testing ? "Testing..." : "Test Connection"}
          </button>
        </div>

        {testResult && (
          <div
            style={{
              marginTop: 12,
              padding: 12,
              borderRadius: 8,
              backgroundColor: testResult.success ? "rgba(34,197,94,0.1)" : "rgba(239,68,68,0.1)",
              border: `1px solid ${testResult.success ? "rgba(34,197,94,0.3)" : "rgba(239,68,68,0.3)"}`,
              color: testResult.success ? "#4ade80" : "#f87171",
              fontSize: 13,
            }}
          >
            {testResult.success
              ? `Connected as @${testResult.bot?.username} (ID: ${testResult.bot?.id})`
              : testResult.message}

          </div>
        )}
      </div>

      {/* Webhook */}
      <div className={styles.card} style={{ marginBottom: 20 }}>
        <h2 className={styles.cardTitle}>Webhook Configuration</h2>
        <p style={{ color: "#64748b", fontSize: 13, marginBottom: 12 }}>
          The bot currently uses long-polling. Set a webhook URL to switch to push mode (requires a public HTTPS URL).
        </p>
        <div className={styles.filterRow}>
          <input
            className={styles.input}
            style={{ minWidth: 320, flex: 1 }}
            type="text"
            placeholder="https://your-domain.com/api/telegram/webhook (empty = clear)"
            value={webhookUrl}
            onChange={(e) => setWebhookUrl(e.target.value)}
          />
          <button
            className={`${styles.btn} ${styles.btnPrimary} ${styles.btnSmall}`}
            onClick={handleSaveWebhook}
            disabled={savingWebhook}
          >
            {savingWebhook ? "Saving..." : "Save Webhook"}
          </button>
        </div>
        {status?.webhook?.url && (
          <div style={{ marginTop: 8, fontSize: 12, color: "#64748b" }}>
            Current: <code style={{ color: "#a78bfa" }}>{status.webhook.url}</code>
            {status.webhook.pending_update_count > 0
              ? ` · ${status.webhook.pending_update_count} pending updates`
              : ""}
          </div>
        )}
      </div>

      {/* Broadcast */}
      <div className={styles.card} style={{ marginBottom: 20 }}>
        <h2 className={styles.cardTitle}>Broadcast Message</h2>
        <p style={{ color: "#64748b", fontSize: 13, marginBottom: 12 }}>
          Send a message to every known Telegram user. Supports Telegram Markdown.
        </p>
        <textarea
          className={styles.input}
          style={{ minHeight: 80 }}
          placeholder="Hello! We are performing scheduled maintenance tonight..."
          value={broadcastMsg}
          onChange={(e) => setBroadcastMsg(e.target.value)}
        />
        <div style={{ marginTop: 12 }}>
          <button
            className={`${styles.btn} ${styles.btnSuccess} ${styles.btnSmall}`}
            onClick={handleBroadcast}
            disabled={broadcasting}
          >
            {broadcasting ? "Broadcasting..." : `Broadcast to ${users.length} users`}
          </button>
        </div>
      </div>

      {/* Telegram users */}
      <h2 className={styles.cardTitle} style={{ marginBottom: 12 }}>
        Telegram Users ({users.length})
      </h2>
      {users.length === 0 ? (
        <div className={styles.empty}>No Telegram users yet. Users appear after pressing /start.</div>
      ) : (
        <div className={styles.card}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>User</th>
                <th>Telegram ID</th>
                <th>Status</th>
                <th>Last Seen</th>
                <th>Joined</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u._id}>
                  <td>
                    <strong>
                      {u.username ? `@${u.username}` : `${u.firstName || ""} ${u.lastName || ""}`.trim() || "Unknown"}
                    </strong>
                  </td>
                  <td>
                    <span className={styles.badge} style={{ backgroundColor: "rgba(139,92,246,0.15)", color: "#a78bfa" }}>
                      {u.telegramId}
                    </span>
                  </td>
                  <td>
                    {u.linked ? (
                      <span className={`${styles.badge} ${styles.badgeGreen}`}>Linked</span>

                    ) : (
                      <span className={`${styles.badge} ${styles.badgeGray}`}>Not linked</span>
                    )}
                  </td>
                  <td>{u.lastSeenAt ? new Date(u.lastSeenAt).toLocaleString() : "Never"}</td>
                  <td>{u.createdAt ? new Date(u.createdAt).toLocaleDateString() : "N/A"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default AdminTelegram;
