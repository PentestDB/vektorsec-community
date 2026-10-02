"use client";

import { useEffect, useState, useCallback } from "react";
import {
  getSystemSettings,
  updateSystemSettings,
  getScopeConfig,
  updateScopeConfig,
} from "@/services/admin.service";
import styles from "./AdminSettingsPage.module.scss";
import { SCOPE_GUARD_LOCKED, SECURITY_CONTACT_URL, scopeUnlockWarning } from "@/constants/security";

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

  const renderSwitch = (checked, onChange, onLabel, offLabel, disabled = false) => (
    <label className={styles.switchWrap}>
      <input
        type="checkbox"
        className={styles.switchInput}
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className={`${styles.switch} ${checked ? styles.switchOn : ""}`}>
        <span className={styles.switchKnob} />
      </span>
      <span className={styles.switchLabel}>{checked ? onLabel : offLabel}</span>
    </label>
  );

  // `scope.unlock` explains a refused unlock attempt: the guard stays ON, so
  // tell the operator which of the three conditions is still missing.
  const unlockWarning = scopeUnlockWarning(scope.unlock);

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

      {!SCOPE_GUARD_LOCKED && (
        <div className={styles.card} style={{ borderColor: "#f87171" }}>
          <h2 className={styles.cardTitle}>This is an unlocked build — Scope Guard is OFF</h2>
          <p style={{ margin: 0, fontSize: 13, color: "#cbd5e1", lineHeight: 1.7 }}>
            Targets are no longer verified against the scope allowlist before a security tool runs, so
            every workspace can reach any host it is asked to. This build was produced with{" "}
            <code>SCOPE_GUARD_LOCK=0</code> — see <code>backend/src/utils/securityPolicy.ts</code> and{" "}
            <code>frontend/src/constants/security.js</code>. Re-lock it by removing that flag and
            rebuilding the UI without <code>NEXT_PUBLIC_SCOPE_GUARD_LOCK=0</code>.
          </p>
        </div>
      )}

      {unlockWarning && (
        <div className={styles.card} style={{ borderColor: "#f87171" }}>
          <h2 className={styles.cardTitle}>Scope Guard unlock attempt failed</h2>
          <p style={{ margin: 0, fontSize: 13, color: "#cbd5e1", lineHeight: 1.7 }}>
            {unlockWarning}
            <br />
            An unlocked build needs all three conditions at once:{" "}
            <code>SCOPE_GUARD_LOCK=0</code>, a UI built with{" "}
            <code>NEXT_PUBLIC_SCOPE_GUARD_LOCK=0</code> and a valid{" "}
            <code>SCOPE_GUARD_UNLOCK_TOKEN</code> (verified with{" "}
            <code>MASTER_SECRET_KEY</code> or <code>MASTER_UNLOCK_PUBLIC_KEY</code>) — until then
            the guard stays ON (fail-closed). Need an unlock token? Contact{" "}
            <a
              href={SECURITY_CONTACT_URL}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "#60a5fa" }}
            >
              {SECURITY_CONTACT_URL}
            </a>
          </p>
        </div>
      )}

      {SCOPE_GUARD_LOCKED && (
        <div className={styles.card} style={{ borderColor: "#faad14" }}>
          <h2 className={styles.cardTitle}>Scope Guard is enforced in this build</h2>
          <p style={{ margin: 0, fontSize: 13, color: "#cbd5e1", lineHeight: 1.7 }}>
            Every target is verified against the scope allowlist before a security tool runs, and it
            cannot be switched off from this UI, the environment or the config files (see{" "}
            <code>backend/src/utils/securityPolicy.ts</code>). Only the allowlist itself is editable.
            <br />
            Need a build without Scope Guard? Contact{" "}
            <a
              href={SECURITY_CONTACT_URL}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "#60a5fa" }}
            >
              {SECURITY_CONTACT_URL}
            </a>
          </p>
        </div>
      )}

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
            SCOPE_GUARD_LOCKED
              ? `Enforced in this build and cannot be turned off — every command only targets IPs/domains in the configured scope. A build without Scope Guard needs all three unlock conditions at once (SCOPE_GUARD_LOCK=0, a UI built unlocked and a valid SCOPE_GUARD_UNLOCK_TOKEN) — contact ${SECURITY_CONTACT_URL}`
              : "Enforce that every command only targets IPs/domains in the configured scope.",
            renderSwitch(
              SCOPE_GUARD_LOCKED ? true : !!scope.enabled,
              (v) => setScope((prev) => ({ ...prev, enabled: v })),
              SCOPE_GUARD_LOCKED ? "Enforced (locked in this build)" : "Scope enforcement on",
              "Scope enforcement off",
              SCOPE_GUARD_LOCKED
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
