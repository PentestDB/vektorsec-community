"use client";

import { useEffect, useState, useCallback } from "react";
import {
  getSystemSettings,
  updateSystemSettings,
  getScopeConfig,
  updateScopeConfig,
} from "@/services/admin.service";
import styles from "./AdminSettingsPage.module.scss";

/**
 * Admin > Security.
 * Central control panel for the backend security systems: SSRF protection,
 * engagement scope enforcement, MCP consent gating and scan safety.
 */
const AdminSecurityPage = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [settings, setSettings] = useState({});
  const [scope, setScope] = useState({ enabled: false, strictMode: false });

  const updateSetting = useCallback((key, value) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  }, []);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [settingsData, scopeData] = await Promise.all([
        getSystemSettings(),
        getScopeConfig(),
      ]);
      setSettings(settingsData.settings || {});
      setScope(scopeData.scope || { enabled: false, strictMode: false });
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to load security settings");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const handleSave = async () => {
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      await updateSystemSettings({
        ssrfEnabled: !!settings.ssrfEnabled,
        pentestMcpAllowDangerous: !!settings.pentestMcpAllowDangerous,
        scanTimeoutMinutes: Number(settings.scanTimeoutMinutes) || 30,
        telegramAutoApprove: !!settings.telegramAutoApprove,
        maintenanceMode: !!settings.maintenanceMode,
      });
      const scopeData = await updateScopeConfig({
        enabled: !!scope.enabled,
        strictMode: !!scope.strictMode,
        entriesRaw: scope.entriesRaw || "",
      });
      setScope(scopeData.scope || scope);
      setSuccess("Security settings saved.");
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to save security settings");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className={styles.loading}>Loading security settings...</div>;
  }

  const renderField = (label, hint, children) => (
    <div className={styles.field}>
      <label className={styles.fieldLabel}>{label}</label>
      {children}
      {hint && <p className={styles.fieldHint}>{hint}</p>}
    </div>
  );

  const renderSwitch = (checked, onChange, onLabel, offLabel) => (
    <label className={styles.switchWrap}>
      <input
        type="checkbox"
        className={styles.switchInput}
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className={`${styles.switch} ${checked ? styles.switchOn : ""}`}>
        <span className={styles.switchKnob} />
      </span>
      <span className={styles.switchLabel}>{checked ? onLabel : offLabel}</span>
    </label>
  );

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>Security</h1>
        <p className={styles.subtitle}>
          SSRF protection, engagement scope enforcement and scan safety
          controls. Changes apply immediately — no restart needed.
        </p>
      </div>

      {error && <div className={styles.error}>{error}</div>}
      {success && <div className={styles.success}>{success}</div>}

      <div className={styles.section}>
        <div className={styles.card}>
          <h2 className={styles.cardTitle}>Request & Scan Protection</h2>
          {renderField(
            "SSRF Protection",
            "Resolves every target URL/IP to its latest DNS records and blocks internal/private addresses (loopback, RFC1918, cloud metadata 169.254.169.254 / 100.100.100.200, IPv6 ULA/link-local).",
            renderSwitch(
              !!settings.ssrfEnabled,
              (v) => updateSetting("ssrfEnabled", v),
              "Enabled (recommended)",
              "Disabled — internal targets allowed"
            )
          )}
          {renderField(
            "Engagement Scope / Whitelist",
            "Enforce that every command only targets IPs/domains in the configured scope.",
            renderSwitch(
              !!scope.enabled,
              (v) => setScope((prev) => ({ ...prev, enabled: v })),
              "Scope enforcement on",
              "Scope enforcement off"
            )
          )}
          {renderField(
            "Strict Scope Mode",
            "When on, commands with no matching scope entry are blocked (not just warned).",
            renderSwitch(
              !!scope.strictMode,
              (v) => setScope((prev) => ({ ...prev, strictMode: v })),
              "Strict mode on",
              "Strict mode off"
            )
          )}
        </div>

        <div className={styles.card}>
          <h2 className={styles.cardTitle}>MCP & Automation</h2>
          {renderField(
            "Allow Consent-Gated MCP Tools",
            "Lets MCP clients run tools normally gated behind user consent. Disable to force approval for every risky call.",
            renderSwitch(
              !!settings.pentestMcpAllowDangerous,
              (v) => updateSetting("pentestMcpAllowDangerous", v),
              "Allowed",
              "Blocked (require consent)"
            )
          )}
          {renderField(
            "Scan Timeout (minutes)",
            "Maximum duration for a single scan task before it is killed.",
            <input
              className={styles.input}
              type="number"
              min={1}
              max={1440}
              value={settings.scanTimeoutMinutes ?? 30}
              onChange={(e) => updateSetting("scanTimeoutMinutes", e.target.value)}
            />
          )}
        </div>

        <div className={styles.card}>
          <h2 className={styles.cardTitle}>Platform Access</h2>
          {renderField(
            "Telegram Auto-Approval",
            "Approve Telegram-issued scan commands automatically instead of requiring manual confirmation.",
            renderSwitch(
              !!settings.telegramAutoApprove,
              (v) => updateSetting("telegramAutoApprove", v),
              "Auto-approve on",
              "Auto-approve off"
            )
          )}
          {renderField(
            "Maintenance Mode",
            "Temporarily disable user access while you work on the platform.",
            renderSwitch(
              !!settings.maintenanceMode,
              (v) => updateSetting("maintenanceMode", v),
              "Maintenance on",
              "Maintenance off"
            )
          )}
        </div>

        <div className={styles.actions}>
          <button className={styles.saveBtn} onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save Security Settings"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AdminSecurityPage;
