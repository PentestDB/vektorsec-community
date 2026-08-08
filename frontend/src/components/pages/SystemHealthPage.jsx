"use client";

import { useEffect, useState, useCallback } from "react";
import { getSystemHealth } from "@/services/admin.service";
import styles from "./SystemHealthPage.module.scss";

// ─── Mock data (fallback only) ─────────────────────────────────────
// The page normally loads a real snapshot from GET /admin/infra/health.
// If the backend is unreachable, it falls back to this sample data so the
// UI still demonstrates the full experience.
const MOCK_SERVICES = [
  {
    id: "postgres",
    name: "PostgreSQL Database",
    status: "healthy",
    details: { pool: "12 / 20", latency: "8 ms" },
  },
  {
    id: "redis",
    name: "Redis Queue",
    status: "healthy",
    details: { pending: "3 jobs", clients: "5 connected" },
  },
  {
    id: "workers",
    name: "Celery / Pentest Workers",
    status: "degraded",
    details: { workers: "2 / 4 active", processing: "7 tasks" },
  },
  {
    id: "telegram",
    name: "Telegram Bot Webhook",
    status: "healthy",
    details: { latency: "210 ms", last: "2 min ago" },
  },
  {
    id: "llm",
    name: "LLM API Gateway",
    status: "healthy",
    details: { openai: "OK", deepseek: "OK" },
  },
];

const SYSTEM_STATUS_LABELS = { healthy: "Healthy", degraded: "Degraded", critical: "Critical" };
const SERVICE_STATUS_LABELS = { healthy: "Healthy", degraded: "Degraded", critical: "Critical", offline: "Offline" };

const randomJitter = (base, spread) => {
  const j = Math.round((Math.random() - 0.5) * 2 * spread);
  return base + j;
};

const buildHealthSnapshot = () => {
  const postgresOk = Math.random() > 0.15;
  const redisOk = Math.random() > 0.1;
  const workersOk = Math.random() > 0.25;
  const telegramOk = Math.random() > 0.2;
  const llmOk = Math.random() > 0.15;

  const services = [
    {
      id: "postgres",
      name: "PostgreSQL Database",
      status: postgresOk ? "healthy" : "critical",
      details: {
        pool: `${randomJitter(14, 6)} / 20`,
        latency: `${randomJitter(8, 6)} ms`,
      },
    },
    {
      id: "redis",
      name: "Redis Queue",
      status: redisOk ? "healthy" : "degraded",
      details: {
        pending: `${randomJitter(3, 3)} jobs`,
        clients: `${randomJitter(5, 2)} connected`,
      },
    },
    {
      id: "workers",
      name: "Celery / Pentest Workers",
      status: workersOk ? "healthy" : "degraded",
      details: {
        workers: `${randomJitter(3, 1)} / 4 active`,
        processing: `${randomJitter(7, 4)} tasks`,
      },
    },
    {
      id: "telegram",
      name: "Telegram Bot Webhook",
      status: telegramOk ? "healthy" : "degraded",
      details: {
        latency: `${randomJitter(210, 80)} ms`,
        last: `${randomJitter(2, 2)} min ago`,
      },
    },
    {
      id: "llm",
      name: "LLM API Gateway",
      status: llmOk ? "healthy" : "critical",
      details: {
        openai: llmOk ? "OK" : "Error",
        deepseek: Math.random() > 0.15 ? "OK" : "Error",
      },
    },
  ];

  const counts = { healthy: 0, degraded: 0, critical: 0 };
  services.forEach((s) => {
    counts[s.status] = (counts[s.status] || 0) + 1;
  });

  let overall = "healthy";
  if (counts.critical > 0) overall = "critical";
  else if (counts.degraded > 0) overall = "degraded";

  return {
    overall,
    totalWorkers: randomJitter(3, 1),
    queueLoadPct: randomJitter(42, 25),
    apiResponseMs: randomJitter(185, 90),
    services,
    refreshedAt: new Date(),
  };
};

/**
 * Normalize the backend health payload into the shape the UI expects.
 */
const normalizeHealthSnapshot = (data) => {
  if (!data || !Array.isArray(data.services)) return null;
  return {
    overall: data.overall || "healthy",
    totalWorkers: data.totalWorkers ?? 1,
    queueLoadPct: data.queueLoadPct ?? 0,
    apiResponseMs: data.apiResponseMs ?? 0,
    services: data.services,
    refreshedAt: new Date(data.refreshedAt || Date.now()),
  };
};

const SystemHealthPage = () => {
  const [snapshot, setSnapshot] = useState(buildHealthSnapshot);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [live, setLive] = useState(false);
  const [notice, setNotice] = useState("");

  const refresh = useCallback(async () => {
    setRefreshing(true);
    setNotice("");
    try {
      const data = await getSystemHealth();
      const next = normalizeHealthSnapshot(data);
      if (next) {
        setSnapshot(next);
        setLive(true);
      }
    } catch (err) {
      setLive(false);
      setNotice("Backend health API unavailable - showing sample data.");
      setSnapshot(buildHealthSnapshot());
    } finally {
      setRefreshing(false);
    }
  }, []);

  // Load a real snapshot once on mount.
  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!autoRefresh) return undefined;
    const interval = window.setInterval(() => {
      refresh();
    }, 10000);
    return () => window.clearInterval(interval);
  }, [autoRefresh, refresh]);

  const overallLabel = SYSTEM_STATUS_LABELS[snapshot.overall] || "Unknown";

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>System Health</h1>
          <p className={styles.subtitle}>
            Live status of core infrastructure services. Auto-refreshes every 10 seconds when enabled.
          </p>
        </div>
        <div className={styles.headerActions}>
          <label className={styles.switchWrap}>
            <input
              type="checkbox"
              className={styles.switchInput}
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
            />
            <span className={`${styles.switch} ${autoRefresh ? styles.switchOn : ""}`}>
              <span className={styles.switchKnob} />
            </span>
            <span className={styles.switchLabel}>Auto Refresh (10s)</span>
          </label>
          <button
            className={styles.refreshBtn}
            onClick={refresh}
            disabled={refreshing}
          >
            {refreshing ? "Refreshing..." : "Refresh Now"}
          </button>
        </div>
      </div>

      <p className={styles.lastUpdated}>
        Last updated: {snapshot.refreshedAt.toLocaleTimeString()}
        {live && <span className={styles.liveBadge}>Live</span>}
      </p>

      {notice && <div className={styles.notice}>{notice}</div>}

      {/* Overview cards */}
      <div className={styles.statsGrid}>
        <div className={styles.statCard}>
          <div className={styles.statLabel}>Overall System Status</div>
          <div className={styles.statValue}>
            <span
              className={`${styles.statusBadge} ${styles[`status_${snapshot.overall}`]}`}
            >
              {overallLabel}
            </span>
          </div>
          <div className={styles.statSub}>
            Computed from all services below
          </div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statLabel}>Backend Workers</div>
          <div className={styles.statValue}>{snapshot.totalWorkers}</div>
          <div className={styles.statSub}>Running worker processes</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statLabel}>Queue Load</div>
          <div className={styles.statValue}>{snapshot.queueLoadPct}%</div>
          <div className={styles.statSub}>Sessions vs capacity</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statLabel}>Health Check Time</div>
          <div className={styles.statValue}>{snapshot.apiResponseMs} ms</div>
          <div className={styles.statSub}>Backend API round-trip</div>
        </div>
      </div>

      {/* Service status grid */}
      <h2 className={styles.sectionTitle}>Services</h2>
      <div className={styles.servicesGrid}>
        {snapshot.services.map((s) => (
          <div key={s.id} className={styles.serviceCard}>
            <div className={styles.serviceHeader}>
              <span className={styles.serviceName}>{s.name}</span>
              <span className={`${styles.statusBadge} ${styles[`status_${s.status}`]}`}>
                {SERVICE_STATUS_LABELS[s.status] || s.status}
              </span>
            </div>
            <div className={styles.serviceDetails}>
              {Object.entries(s.details).map(([key, value]) => (
                <div key={key} className={styles.serviceDetail}>
                  <span className={styles.detailKey}>{key}</span>
                  <span className={styles.detailValue}>{value}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default SystemHealthPage;

