"use client";

import { useEffect, useState, useCallback } from "react";
import {
  getScopeConfig,
  updateScopeConfig,
} from "@/services/admin.service";
import styles from "../admin.module.scss";

const AdminScope = () => {
  const [enabled, setEnabled] = useState(false);
  const [strictMode, setStrictMode] = useState(false);
  const [entriesRaw, setEntriesRaw] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await getScopeConfig();
      const scope = data.scope || {};
      setEnabled(Boolean(scope.enabled));
      setStrictMode(Boolean(scope.strictMode));
      setEntriesRaw(scope.entriesRaw || "");
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to load scope config");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleSave = async () => {
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const data = await updateScopeConfig({
        enabled,
        strictMode,
        entriesRaw,
      });
      setSuccess(data.message || "Scope config saved");
      const scope = data.scope || {};
      setEnabled(Boolean(scope.enabled));
      setStrictMode(Boolean(scope.strictMode));
      setEntriesRaw(scope.entriesRaw || "");
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to save scope config");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className={styles.loading}>Loading scope config...</div>;
  }

  return (
    <div>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>Scope / Whitelist</h1>

        <p className={styles.pageSubtitle}>
          Control which IPs, CIDR ranges and domains the pentest agent is allowed to target. Strict mode blocks every out-of-scope target.
        </p>
      </div>

      {error && <div className={styles.error}>{error}</div>}
      {success && <div className={styles.success}>{success}</div>}

      <div className={styles.statsGrid} style={{ gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))" }}>
        <div className={styles.statCard}>
          <div className={styles.statLabel}>Scope Validation</div>
          <div className={styles.statValue} style={{ fontSize: 22 }}>
            {enabled ? <span style={{ color: "#4ade80" }}>Enabled</span> : <span style={{ color: "#64748b" }}>Disabled</span>}

          </div>
          <div className={styles.statSub}>All commands are checked against the whitelist</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statLabel}>Strict Mode</div>
          <div className={styles.statValue} style={{ fontSize: 22 }}>
            {strictMode ? <span style={{ color: "#f87171" }}>On</span> : <span style={{ color: "#64748b" }}>Off</span>}

          </div>
          <div className={styles.statSub}>Out-of-scope targets are blocked entirely</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statLabel}>Whitelisted Targets</div>
          <div className={styles.statValue} style={{ fontSize: 22 }}>
            {entriesRaw.split(/[\s,;]+/).filter(Boolean).length}
          </div>
          <div className={styles.statSub}>IPs · CIDRs · domains</div>
        </div>
      </div>

      <div className={styles.card}>
        <h2 className={styles.cardTitle}>Scope Configuration</h2>

        <div className={styles.formRow} style={{ marginBottom: 16 }}>
          <div className={styles.field}>
            <label className={styles.fieldLabel}>Enable scope validation</label>
            <label style={{ display: "flex", alignItems: "center", gap: 10, color: "#cbd5e1", fontSize: 14, cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
                style={{ width: 18, height: 18, accentColor: "#6366f1" }}
              />
              Validate every target before running security tools
            </label>
          </div>
          <div className={styles.field}>
            <label className={styles.fieldLabel}>Strict mode</label>
            <label style={{ display: "flex", alignItems: "center", gap: 10, color: "#cbd5e1", fontSize: 14, cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={strictMode}
                onChange={(e) => setStrictMode(e.target.checked)}
                style={{ width: 18, height: 18, accentColor: "#6366f1" }}
              />
              Block commands with no matching whitelist entry
            </label>
          </div>
        </div>

        <div className={styles.field}>
          <label className={styles.fieldLabel}>
            Whitelist entries <span style={{ color: "#64748b", fontWeight: 400 }}>— one per line or comma/space separated</span>
          </label>
          <textarea
            className={styles.input}
            value={entriesRaw}
            onChange={(e) => setEntriesRaw(e.target.value)}
            placeholder={"example.com\n*.example.org\n192.168.1.0/24\n10.0.0.5"}
            rows={8}
            style={{ fontFamily: "monospace", resize: "vertical", lineHeight: 1.6 }}
          />
        </div>

        <p style={{ fontSize: 13, color: "#64748b", marginBottom: 16 }}>
          Format: <code>1.2.3.4</code> (IP) · <code>192.168.0.0/16</code> (CIDR) · <code>example.com</code> (domain + subdomains) ·{" "}
          <code>*.example.com</code> (subdomains only) · <code>exact.host</code> (exact subdomain)
        </p>

        <div style={{ display: "flex", gap: 12 }}>
          <button
            className={`${styles.btn} ${styles.btnPrimary}`}
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? "Saving..." : "Save Scope Config"}

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

export default AdminScope;
