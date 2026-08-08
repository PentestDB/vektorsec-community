"use client";

import { useEffect, useState } from "react";
import { getReports } from "@/services/admin.service";
import styles from "../admin.module.scss";

const AdminReports = () => {
  const [period, setPeriod] = useState("30d");
  const [reports, setReports] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const data = await getReports(period);
        setReports(data);
      } catch (err) {
        setError(err?.response?.data?.message || "Failed to load reports");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [period]);

  if (loading) {
    return <div className={styles.loading}>Loading reports...</div>;
  }

  const statCards = [
    { label: "Total Revenue", value: `$${reports?.totalRevenue ?? 0}`, sub: `Last ${period}` },
    { label: "New Users", value: reports?.newUsers ?? 0, sub: `Last ${period}` },
    { label: "New Orders", value: reports?.newOrders ?? 0, sub: `Last ${period}` },
    { label: "Conversion Rate", value: `${reports?.conversionRate ?? 0}%`, sub: "Orders / users" },
  ];

  const usage = reports?.usage || [];
  const activity = reports?.activity || [];

  return (
    <div>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>Reports</h1>
        <p className={styles.pageSubtitle}>Platform analytics, usage and activity reports.</p>
      </div>

      {error && <div className={styles.error}>{error}</div>}

      <div className={styles.filterRow}>
        <select
          className={styles.select}
          value={period}
          onChange={(e) => setPeriod(e.target.value)}
        >
          <option value="7d">Last 7 days</option>
          <option value="30d">Last 30 days</option>
          <option value="90d">Last 90 days</option>
          <option value="1y">Last year</option>
        </select>
      </div>

      <div className={styles.statsGrid}>
        {statCards.map((card) => (
          <div key={card.label} className={styles.statCard}>
            <div className={styles.statLabel}>{card.label}</div>
            <div className={styles.statValue}>{card.value}</div>
            <div className={styles.statSub}>{card.sub}</div>
          </div>
        ))}
      </div>

      {reports?.revenueByPlan && Object.keys(reports.revenueByPlan).length > 0 && (
        <div className={styles.card} style={{ marginBottom: 20 }}>
          <h2 className={styles.cardTitle}>Revenue by Plan</h2>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Plan</th>
                <th>Revenue</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(reports.revenueByPlan).map(([plan, amount]) => (
                <tr key={plan}>
                  <td>{plan}</td>
                  <td>${amount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {reports?.revenueByChannel && Object.keys(reports.revenueByChannel).length > 0 && (
        <div className={styles.card} style={{ marginBottom: 20 }}>
          <h2 className={styles.cardTitle}>Revenue by Channel</h2>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Channel</th>
                <th>Revenue</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(reports.revenueByChannel).map(([channel, amount]) => (
                <tr key={channel}>
                  <td>{channel}</td>
                  <td>${amount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Usage per user ─────────────────────────────────────────── */}
      <div className={styles.card} style={{ marginBottom: 20 }}>
        <h2 className={styles.cardTitle}>Usage by User</h2>
        {usage.length === 0 ? (
          <div className={styles.empty}>No usage recorded in this period.</div>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>User</th>
                <th>Requests</th>
                <th>Tokens In</th>
                <th>Tokens Out</th>
                <th>Total Tokens</th>
                <th>Cost (USD)</th>
              </tr>
            </thead>
            <tbody>
              {usage.map((u) => (
                <tr key={u.userId}>
                  <td>
                    <div>{u.name}</div>
                    <div style={{ fontSize: 12, color: "#64748b" }}>{u.email}</div>
                  </td>
                  <td>{u.requests}</td>
                  <td>{u.tokensIn.toLocaleString()}</td>
                  <td>{u.tokensOut.toLocaleString()}</td>
                  <td>{u.totalTokens.toLocaleString()}</td>
                  <td>${Number(u.costUsd || 0).toFixed(4)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Activity (who / IP) ─────────────────────────────────────── */}
      <div className={styles.card}>
        <h2 className={styles.cardTitle}>Activity (Who accessed from where)</h2>
        {activity.length === 0 ? (
          <div className={styles.empty}>No activity in this period.</div>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>User</th>
                <th>Action</th>
                <th>Resource</th>
                <th>IP Address</th>
                <th>User Agent</th>
                <th>Time</th>
              </tr>
            </thead>
            <tbody>
              {activity.map((a) => (
                <tr key={a.id}>
                  <td>
                    <div>{a.name}</div>
                    <div style={{ fontSize: 12, color: "#64748b" }}>{a.email}</div>
                  </td>
                  <td>
                    <span className={`${styles.badge} ${styles.badgeBlue}`}>
                      {a.action}
                    </span>
                  </td>
                  <td style={{ fontSize: 13 }}>
                    {a.resourceType ? `${a.resourceType}${a.resourceId ? `:${a.resourceId}` : ""}` : "N/A"}
                  </td>
                  <td>
                    {a.ip ? (
                      <span className={styles.badge} style={{ backgroundColor: "rgba(56,189,248,0.15)", color: "#38bdf8" }}>
                        {a.ip}
                      </span>
                    ) : (
                      "N/A"
                    )}
                  </td>
                  <td style={{ fontSize: 12, color: "#64748b", maxWidth: 220 }}>
                    <span style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={a.userAgent || ""}>
                      {a.userAgent || "N/A"}
                    </span>
                  </td>
                  <td>{a.createdAt ? new Date(a.createdAt).toLocaleString() : "N/A"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default AdminReports;
