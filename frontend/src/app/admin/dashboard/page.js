"use client";

import { useEffect, useState } from "react";
import {
  getDashboardStats,
  getPentestAnalytics,
  getSystemResource,
  getActiveTasks,
} from "@/services/admin.service";
import styles from "../admin.module.scss";

const AdminDashboard = () => {
  const [stats, setStats] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [resources, setResources] = useState(null);
  const [activeTasks, setActiveTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const load = async () => {
      try {
        const data = await getDashboardStats();
        setStats(data);
        try {
          const a = await getPentestAnalytics({});
          setAnalytics(a);
        } catch (err) {
          // analytics may not be available on older backends
        }
        try {
          const r = await getSystemResource();
          setResources(r);
        } catch (err) {
          // system resource may be unavailable in some environments
        }
        try {
          const t = await getActiveTasks();
          setActiveTasks(t.tasks || []);
        } catch (err) {
          // ignore
        }
      } catch (err) {
        setError(err?.response?.data?.message || "Failed to load dashboard");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  if (loading) {
    return <div className={styles.loading}>Loading dashboard...</div>;
  }

  const statCards = [
    { label: "Total Users", value: stats?.totalUsers ?? 0, sub: "Registered accounts" },
    { label: "Active Users", value: stats?.activeUsers ?? 0, sub: "Active in last 30 days" },
    { label: "Blocked Users", value: stats?.blockedUsers ?? 0, sub: "Suspended accounts" },
    { label: "Total Orders", value: stats?.totalOrders ?? 0, sub: "All payment orders" },
    { label: "Pending Orders", value: stats?.pendingOrders ?? 0, sub: "Awaiting payment" },
    { label: "Confirmed Orders", value: stats?.confirmedOrders ?? 0, sub: "Completed payments" },
    { label: "Total Revenue", value: `$${stats?.totalRevenue ?? 0}`, sub: "All time" },
    { label: "Active Subscriptions", value: stats?.activeSubscriptions ?? 0, sub: "Current subscribers" },
  ];

  const pentestCards = [
    { label: "Total Pentest Tasks", value: analytics?.totalTasks ?? 0, sub: "All scan/attack tasks processed" },
    { label: "Active Bot Users", value: analytics?.activeBotUsers24h ?? 0, sub: "Telegram bot users in last 24h" },
    { label: "Total Bot Users", value: analytics?.totalBotUsers ?? 0, sub: "All registered bot users" },
    { label: "LLM Tokens Used", value: analytics?.llm?.totalTokens ? analytics.llm.totalTokens.toLocaleString() : 0, sub: "Input + output" },
    { label: "LLM Cost", value: analytics?.llm?.totalCostUsd ? `$${Number(analytics.llm.totalCostUsd).toFixed(2)}` : "$0.00", sub: "DeepSeek / OpenAI / etc." },
    { label: "Queue Pending", value: analytics?.queuePending ?? 0, sub: "Jobs waiting in queue" },
    { label: "Active Tasks", value: activeTasks.length ?? 0, sub: "Running agent sessions" },
  ];

  const pct = (v) => (typeof v === "number" ? `${Math.round(v * 10) / 10}%` : "N/A");


  return (
    <div>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>Dashboard</h1>
        <p className={styles.pageSubtitle}>Overview of the VektorSec platform.</p>
      </div>

      {error && <div className={styles.error}>{error}</div>}

      <div className={styles.statsGrid}>
        {statCards.map((card) => (
          <div key={card.label} className={styles.statCard}>
            <div className={styles.statLabel}>{card.label}</div>
            <div className={styles.statValue}>{card.value}</div>
            <div className={styles.statSub}>{card.sub}</div>
          </div>
        ))}
      </div>

      <h2 className={styles.cardTitle} style={{ marginTop: 28 }}>
        Pentest & Bot Analytics
      </h2>
      <div className={styles.statsGrid}>
        {pentestCards.map((card) => (
          <div key={card.label} className={styles.statCard}>
            <div className={styles.statLabel}>{card.label}</div>
            <div className={styles.statValue}>{card.value}</div>
            <div className={styles.statSub}>{card.sub}</div>
          </div>
        ))}
      </div>

      {(resources || activeTasks.length > 0) && (
        <div className={styles.card} style={{ marginTop: 24 }}>
          <h2 className={styles.cardTitle}>System Resource & Queue Status</h2>
          <div className={styles.statsGrid}>
            <div className={styles.statCard}>
              <div className={styles.statLabel}>CPU Usage</div>
              <div className={styles.statValue}>{pct(resources?.cpuPercent)}</div>
              <div className={styles.statSub}>Server CPU load</div>
            </div>
            <div className={styles.statCard}>
              <div className={styles.statLabel}>RAM Usage</div>
              <div className={styles.statValue}>{pct(resources?.memoryPercent)}</div>
              <div className={styles.statSub}>Server memory</div>
            </div>
            <div className={styles.statCard}>
              <div className={styles.statLabel}>Disk Usage</div>
              <div className={styles.statValue}>{pct(resources?.diskPercent)}</div>
              <div className={styles.statSub}>Server disk</div>
            </div>
            <div className={styles.statCard}>
              <div className={styles.statLabel}>Queue Pending</div>
              <div className={styles.statValue}>{analytics?.queuePending ?? resources?.queuePending ?? 0}</div>
              <div className={styles.statSub}>Jobs in queue</div>
            </div>
          </div>
          {activeTasks.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <strong style={{ fontSize: 14, color: "#e2e8f0" }}>
                Running Tasks ({activeTasks.length})
              </strong>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
                {activeTasks.map((t, idx) => (
                  <span
                    key={`${t.sessionId || t.taskId || "t"}-${idx}`}
                    className={`${styles.badge} ${styles.badgeBlue}`}
                  >
                    {(t.sessionId || t.taskId || "task").slice(0, 24)}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {stats?.recentOrders?.length > 0 && (

        <div className={styles.card}>
          <h2 className={styles.cardTitle}>Recent Orders</h2>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Order</th>
                <th>User</th>
                <th>Plan</th>
                <th>Amount</th>
                <th>Status</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {stats.recentOrders.map((o) => (
                <tr key={o.orderId}>
                  <td className="mono">{o.orderId}</td>
                  <td>{o.userId}</td>
                  <td>{o.plan}</td>
                  <td>${o.amountUsd}</td>
                  <td>
                    <span className={`${styles.badge} ${styles[`badge${o.status === "confirmed" ? "Green" : o.status === "pending" ? "Yellow" : o.status === "paid" ? "Blue" : "Gray"}`]}`}>
                      {o.status}
                    </span>
                  </td>
                  <td>{new Date(o.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default AdminDashboard;
