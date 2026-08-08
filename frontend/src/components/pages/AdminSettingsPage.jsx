"use client";

import { useEffect, useState, useCallback } from "react";
import {
  getSystemSettings,
  updateSystemSettings,
  getApiKeys,
  updateApiKeys,
  clearApiKey,
  getScopeConfig,
  updateScopeConfig,
  getTelegramBotStatus,
  testTelegramConnection,
  setTelegramWebhook,
  saveTelegramBotToken,
  getExecutionQuotas,
  updateExecutionQuota,
} from "@/services/admin.service";
import { getAllGateways, saveGateway } from "@/services/payment.service";
import styles from "./AdminSettingsPage.module.scss";

// Candidate models shown in the "Default AI Model" dropdown.
// These match the ids recognized by the backend model metadata (MODEL_ALIASES).
const MODEL_OPTIONS = [
  "gpt-5.6-sol",
  "gpt-5.5",
  "gpt-5.4",
  "gpt-4.1",
  "gpt-4o",
  "claude-opus-5",
  "claude-sonnet-5",
  "claude-haiku-4.5",
  "deepseek-chat",
  "deepseek-reasoner",
  "kimi-k3",
];

const TABS = [
  { id: "general", label: "General" },
  { id: "api", label: "API & AI Models" },
  { id: "telegram", label: "Telegram Bot" },
  { id: "scope", label: "Security & Scope" },
  { id: "payments", label: "Payments & Quotas" },
];

const AdminSettingsPage = () => {
  const [activeTab, setActiveTab] = useState("general");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // General settings (flat env-backed object).
  const [settings, setSettings] = useState({});

  // API keys catalog from backend (configured flags only, values never leak).
  const [keys, setKeys] = useState([]);
  const [keyValues, setKeyValues] = useState({});

  // Scope / whitelist.
  const [scope, setScope] = useState({ enabled: false, strictMode: false, entriesRaw: "" });

  // Telegram bot actions.
  const [botStatus, setBotStatus] = useState(null);
  const [botToken, setBotToken] = useState("");
  const [webhookUrl, setWebhookUrl] = useState("");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);

  // Payments: crypto wallet + per-plan daily scan limits.
  const [gateways, setGateways] = useState([]);
  const [quotas, setQuotas] = useState([]);

  const updateSetting = useCallback((key, value) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  }, []);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [settingsData, keysData, scopeData, gatewaysData, quotasData] = await Promise.all([
        getSystemSettings(),
        getApiKeys(),
        getScopeConfig(),
        getAllGateways(),
        getExecutionQuotas(),
      ]);
      setSettings(settingsData.settings || {});
      setKeys(keysData.keys || []);
      setScope(scopeData.scope || { enabled: false, strictMode: false, entriesRaw: "" });
      setGateways(gatewaysData.gateways || []);
      setQuotas(quotasData.quotas || []);
      try {
        const bs = await getTelegramBotStatus();
        setBotStatus(bs);
        setWebhookUrl(bs?.webhook?.url || "");
      } catch (err) {
        // Bot status may be unavailable; not fatal.
      }
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to load settings");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const handleSaveGeneral = async () => {
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      await updateSystemSettings(settings);
      setSuccess("General settings saved");
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to save general settings");
    } finally {
      setSaving(false);
    }
  };

  const handleChangeKey = (key, value) => {
    setKeyValues((prev) => ({ ...prev, [key]: value }));
  };

  const handleSaveKeys = async () => {
    const payload = {};
    for (const [key, value] of Object.entries(keyValues)) {
      payload[key] = typeof value === "string" ? value.trim() : value;
    }
    if (Object.keys(payload).length === 0) {
      setError("Enter at least one API key value before saving.");
      return;
    }
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      await updateApiKeys(payload);
      setSuccess("API keys saved");
      setKeyValues({});
      const keysData = await getApiKeys();
      setKeys(keysData.keys || []);
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to save API keys");
    } finally {
      setSaving(false);
    }
  };

  const handleClearKey = async (key, label) => {
    if (!window.confirm(`Clear "${label}" (${key})?`)) return;
    setError("");
    setSuccess("");
    try {
      await clearApiKey(key);
      setSuccess(`${label} cleared`);
      const keysData = await getApiKeys();
      setKeys(keysData.keys || []);
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to clear key");
    }
  };

  const handleSaveScope = async () => {
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const data = await updateScopeConfig({
        enabled: scope.enabled,
        strictMode: scope.strictMode,
        entriesRaw: scope.entriesRaw,
      });
      setScope(data.scope || scope);
      setSuccess("Scope configuration saved");
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to save scope config");
    } finally {
      setSaving(false);
    }
  };


  const handleTestConnection = async () => {
    setTesting(true);
    setError("");
    setSuccess("");
    setTestResult(null);
    try {
      const data = await testTelegramConnection(botToken.trim() || undefined);
      setTestResult(data);
      if (data.success) setSuccess(data.message);
      else setError(data.message);
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to test connection");
    } finally {
      setTesting(false);
    }
  };

  const handleSaveToken = async () => {
    if (!botToken.trim()) {
      setError("Enter a bot token to save.");
      return;
    }
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const data = await saveTelegramBotToken(botToken.trim());
      setSuccess(data.message || "Bot token saved");
      setBotToken("");
      const bs = await getTelegramBotStatus();
      setBotStatus(bs);
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to save bot token");
    } finally {
      setSaving(false);
    }
  };

  const handleSetWebhook = async () => {
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const data = await setTelegramWebhook(webhookUrl.trim());
      setSuccess(data.message);
      const bs = await getTelegramBotStatus();
      setBotStatus(bs);
      setWebhookUrl(bs?.webhook?.url || "");
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to set webhook");
    } finally {
      setSaving(false);
    }
  };

  const handleSaveQuota = async (planId, field, value) => {
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const payload = {};
      payload[field] = Number(value) || 0;
      const data = await updateExecutionQuota(planId, payload);
      setSuccess(data.message || `Quota updated for "${planId}"`);
      const quotasData = await getExecutionQuotas();
      setQuotas(quotasData.quotas || []);
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to update quota");
    } finally {
      setSaving(false);
    }
  };

  const handleSaveWallet = async (channel, address) => {
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      await saveGateway({ channel, cryptoWallet: { address } });
      setSuccess(`${channel} wallet address saved`);
      const gatewaysData = await getAllGateways();
      setGateways(gatewaysData.gateways || []);
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to save wallet address");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className={styles.loading}>Loading settings...</div>;
  }

  const isConfigured = (key) => {
    const meta = keys.find((k) => k.key === key);
    return Boolean(meta?.configured);
  };

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

  const walletAddress = (channel) =>
    gateways.find((g) => g.channel === channel)?.cryptoWallet?.address || "";


  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>Admin Settings</h1>
        <p className={styles.subtitle}>
          Configure the platform, AI providers, Telegram bot, scope rules and payment quotas.
        </p>
      </div>

      {error && <div className={styles.error}>{error}</div>}
      {success && <div className={styles.success}>{success}</div>}

      <div className={styles.tabs}>
        {TABS.map((tab) => (
          <button
            key={tab.id}
            className={`${styles.tab} ${activeTab === tab.id ? styles.tabActive : ""}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ─── General ─────────────────────────────────────────────── */}
      {activeTab === "general" && (
        <div className={styles.section}>
          <div className={styles.card}>
            <h2 className={styles.cardTitle}>Branding</h2>
            {renderField(
              "Platform Title",
              "Shown as the site name on the login page.",
              <input
                className={styles.input}
                value={settings.siteName || ""}
                onChange={(e) => updateSetting("siteName", e.target.value)}
                placeholder="VektorSec"
              />
            )}
            {renderField(
              "Platform Subtitle",
              "Short tagline displayed under the title.",
              <input
                className={styles.input}
                value={settings.siteSubtitle || ""}
                onChange={(e) => updateSetting("siteSubtitle", e.target.value)}
                placeholder="Autonomous Security Operations"
              />
            )}
            {renderField(
              "Login Disclaimer Notice",
              "Legal / responsible-use notice shown on the login page.",
              <textarea
                className={styles.textarea}
                rows={3}
                value={settings.loginDisclaimer || ""}
                onChange={(e) => updateSetting("loginDisclaimer", e.target.value)}
                placeholder="Only test systems you are authorized to test..."
              />
            )}
          </div>

          <div className={styles.card}>
            <h2 className={styles.cardTitle}>Operations</h2>
            {renderField(
              "Maintenance Mode",
              "Temporarily disable access while you work on the platform.",
              renderSwitch(
                !!settings.maintenanceMode,
                (v) => updateSetting("maintenanceMode", v),
                "Maintenance on",
                "Maintenance off"
              )
            )}
            {renderField(
              "System Log Retention (days)",
              "How many days of audit / execution logs to keep.",
              <input
                className={styles.input}
                type="number"
                min="1"
                max="365"
                value={settings.logRetentionDays ?? 30}
                onChange={(e) => updateSetting("logRetentionDays", e.target.value)}
              />
            )}
          </div>

          <div className={styles.actions}>
            <button className={styles.saveBtn} onClick={handleSaveGeneral} disabled={saving}>
              {saving ? "Saving..." : "Save General Settings"}
            </button>
          </div>
        </div>
      )}


      {/* ─── API & AI Models ────────────────────────────────────── */}
      {activeTab === "api" && (
        <div className={styles.section}>
          <div className={styles.card}>
            <h2 className={styles.cardTitle}>LLM Provider Keys</h2>
            {renderField(
              "OpenAI API Key",
              isConfigured("OPENAI_API_KEY") ? "A key is already configured." : "sk-...",
              <input
                className={styles.input}
                type="password"
                placeholder={isConfigured("OPENAI_API_KEY") ? "Already set (leave blank to keep)" : "sk-..."}
                value={keyValues.OPENAI_API_KEY || ""}
                onChange={(e) => handleChangeKey("OPENAI_API_KEY", e.target.value)}
                autoComplete="off"
              />
            )}
            {renderField(
              "DeepSeek API Key",
              isConfigured("DEEPSEEK_API_KEY") ? "A key is already configured." : "sk-...",
              <input
                className={styles.input}
                type="password"
                placeholder={isConfigured("DEEPSEEK_API_KEY") ? "Already set (leave blank to keep)" : "sk-..."}
                value={keyValues.DEEPSEEK_API_KEY || ""}
                onChange={(e) => handleChangeKey("DEEPSEEK_API_KEY", e.target.value)}
                autoComplete="off"
              />
            )}
            {renderField(
              "Anthropic API Key",
              isConfigured("ANTHROPIC_API_KEY") ? "A key is already configured." : "sk-ant-...",
              <input
                className={styles.input}
                type="password"
                placeholder={isConfigured("ANTHROPIC_API_KEY") ? "Already set (leave blank to keep)" : "sk-ant-..."}
                value={keyValues.ANTHROPIC_API_KEY || ""}
                onChange={(e) => handleChangeKey("ANTHROPIC_API_KEY", e.target.value)}
                autoComplete="off"
              />
            )}
          </div>

          <div className={styles.card}>
            <h2 className={styles.cardTitle}>OSINT Tool Keys</h2>
            {renderField(
              "Shodan API Key",
              isConfigured("SHODAN_API_KEY") ? "A key is already configured." : "Shodan API key",
              <input
                className={styles.input}
                type="password"
                placeholder={isConfigured("SHODAN_API_KEY") ? "Already set (leave blank to keep)" : "Shodan API key"}
                value={keyValues.SHODAN_API_KEY || ""}
                onChange={(e) => handleChangeKey("SHODAN_API_KEY", e.target.value)}
                autoComplete="off"
              />
            )}
            {renderField(
              "VirusTotal API Key",
              isConfigured("VIRUSTOTAL_API_KEY") ? "A key is already configured." : "VirusTotal API key",
              <input
                className={styles.input}
                type="password"
                placeholder={isConfigured("VIRUSTOTAL_API_KEY") ? "Already set (leave blank to keep)" : "VirusTotal API key"}
                value={keyValues.VIRUSTOTAL_API_KEY || ""}
                onChange={(e) => handleChangeKey("VIRUSTOTAL_API_KEY", e.target.value)}
                autoComplete="off"
              />
            )}
          </div>

          <div className={styles.card}>
            <h2 className={styles.cardTitle}>Social Login (OAuth)</h2>
            {renderField(
              "Google OAuth Client ID",
              isConfigured("GOOGLE_CLIENT_ID") ? "Already configured." : "Google Cloud Console → OAuth 2.0 Client ID",
              <input
                className={styles.input}
                placeholder={isConfigured("GOOGLE_CLIENT_ID") ? "Already set (leave blank to keep)" : "xxxxx.apps.googleusercontent.com"}
                value={keyValues.GOOGLE_CLIENT_ID || ""}
                onChange={(e) => handleChangeKey("GOOGLE_CLIENT_ID", e.target.value)}
                autoComplete="off"
              />
            )}
            {renderField(
              "Google OAuth Client Secret",
              isConfigured("GOOGLE_CLIENT_SECRET") ? "Already configured." : "Google OAuth client secret",
              <input
                className={styles.input}
                type="password"
                placeholder={isConfigured("GOOGLE_CLIENT_SECRET") ? "Already set (leave blank to keep)" : "GOCSPX-..."}
                value={keyValues.GOOGLE_CLIENT_SECRET || ""}
                onChange={(e) => handleChangeKey("GOOGLE_CLIENT_SECRET", e.target.value)}
                autoComplete="off"
              />
            )}
            {renderField(
              "GitHub OAuth Client ID",
              isConfigured("GITHUB_CLIENT_ID") ? "Already configured." : "GitHub OAuth App → Client ID",
              <input
                className={styles.input}
                placeholder={isConfigured("GITHUB_CLIENT_ID") ? "Already set (leave blank to keep)" : "Iv1.xxxxxx"}
                value={keyValues.GITHUB_CLIENT_ID || ""}
                onChange={(e) => handleChangeKey("GITHUB_CLIENT_ID", e.target.value)}
                autoComplete="off"
              />
            )}
            {renderField(
              "GitHub OAuth Client Secret",
              isConfigured("GITHUB_CLIENT_SECRET") ? "Already configured." : "GitHub OAuth client secret",
              <input
                className={styles.input}
                type="password"
                placeholder={isConfigured("GITHUB_CLIENT_SECRET") ? "Already set (leave blank to keep)" : "GitHub client secret"}
                value={keyValues.GITHUB_CLIENT_SECRET || ""}
                onChange={(e) => handleChangeKey("GITHUB_CLIENT_SECRET", e.target.value)}
                autoComplete="off"
              />
            )}
          </div>

          <div className={styles.card}>
            <h2 className={styles.cardTitle}>Google reCAPTCHA</h2>
            <p style={{ margin: 0, marginBottom: 12, color: "#8c8c8c", fontSize: 13 }}>
              Create keys at{" "}
              <a href="https://www.google.com/recaptcha/admin" target="_blank" rel="noreferrer" style={{ color: "#40a9ff" }}>
                google.com/recaptcha/admin
              </a>{" "}
              (reCAPTCHA v2 Checkbox). Both keys must be set for the captcha to
              appear on the login / register pages. Leave both empty to disable.
            </p>
            {renderField(
              "reCAPTCHA Site Key",
              isConfigured("RECAPTCHA_SITE_KEY") ? "Already configured." : "Public site key",
              <input
                className={styles.input}
                placeholder={isConfigured("RECAPTCHA_SITE_KEY") ? "Already set (leave blank to keep)" : "6Lc..."}
                value={keyValues.RECAPTCHA_SITE_KEY || ""}
                onChange={(e) => handleChangeKey("RECAPTCHA_SITE_KEY", e.target.value)}
                autoComplete="off"
              />
            )}
            {renderField(
              "reCAPTCHA Secret Key",
              isConfigured("RECAPTCHA_SECRET_KEY") ? "Already configured." : "Server-side secret key",
              <input
                className={styles.input}
                type="password"
                placeholder={isConfigured("RECAPTCHA_SECRET_KEY") ? "Already set (leave blank to keep)" : "6Lc..."}
                value={keyValues.RECAPTCHA_SECRET_KEY || ""}
                onChange={(e) => handleChangeKey("RECAPTCHA_SECRET_KEY", e.target.value)}
                autoComplete="off"
              />
            )}
          </div>


          <div className={styles.card}>
            <h2 className={styles.cardTitle}>Default AI Model</h2>
            {renderField(
              "Model Selector",
              "Model used when no specific model is requested.",
              <select
                className={styles.select}
                value={settings.defaultModel || ""}
                onChange={(e) => updateSetting("defaultModel", e.target.value)}
              >
                <option value="">Auto / system default</option>
                {MODEL_OPTIONS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className={styles.actions}>
            <button className={styles.saveBtn} onClick={handleSaveKeys} disabled={saving}>
              {saving ? "Saving..." : "Save API Keys"}
            </button>
            <button
              className={styles.secondaryBtn}
              onClick={async () => {
                setError("");
                setSuccess("");
                try {
                  await updateSystemSettings({ defaultModel: settings.defaultModel });
                  setSuccess("Default model saved");
                } catch (err) {
                  setError(err?.response?.data?.message || "Failed to save default model");
                }
              }}
              disabled={saving}
            >
              Save Model
            </button>
          </div>

          {keys.length > 0 && (
            <div className={styles.card}>
              <h2 className={styles.cardTitle}>Configured Providers</h2>
              <div className={styles.providerList}>
                {keys.map((meta) => (
                  <div key={meta.key} className={styles.providerRow}>
                    <div>
                      <strong>{meta.label}</strong>
                      <span className={styles.providerKey}>{meta.key}</span>
                    </div>
                    <div className={styles.providerStatus}>
                      {meta.configured ? (
                        <span className={`${styles.badge} ${styles.badgeOn}`}>Configured</span>
                      ) : (
                        <span className={`${styles.badge} ${styles.badgeOff}`}>Not set</span>
                      )}
                      {meta.configured && (
                        <button
                          className={styles.smallDangerBtn}
                          onClick={() => handleClearKey(meta.key, meta.label)}
                        >
                          Clear
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}


      {/* ─── Telegram Bot ───────────────────────────────────────── */}
      {activeTab === "telegram" && (
        <div className={styles.section}>
          <div className={styles.statsGrid}>
            <div className={styles.statCard}>
              <div className={styles.statLabel}>Bot Status</div>
              <div className={styles.statValue}>
                {botStatus?.configured ? "Configured" : "Not configured"}
              </div>
              <div className={styles.statSub}>
                {botStatus?.running ? "Polling is running" : "Polling stopped"}
              </div>
            </div>
            <div className={styles.statCard}>
              <div className={styles.statLabel}>Rate Limit</div>
              <div className={styles.statValue}>
                {botStatus?.rateLimited ? "Limited" : "Normal"}
              </div>
              <div className={styles.statSub}>
                {botStatus?.rateLimitedUntil
                  ? `Until ${new Date(botStatus.rateLimitedUntil).toLocaleTimeString()}`
                  : "No active rate limiting"}
              </div>
            </div>
          </div>

          <div className={styles.card}>
            <h2 className={styles.cardTitle}>Bot Token</h2>
            {renderField(
              "Bot Token",
              "Save a new token to restart the bot with it.",
              <div className={styles.inputRow}>
                <input
                  className={styles.input}
                  type="password"
                  placeholder="123456:ABC-DEF..."
                  value={botToken}
                  onChange={(e) => setBotToken(e.target.value)}
                  autoComplete="off"
                />
                <button className={styles.saveBtn} onClick={handleSaveToken} disabled={saving}>
                  {saving ? "Saving..." : "Save Token"}
                </button>
              </div>
            )}
            {renderField(
              "Test Connection",
              "Verify the configured token against the Telegram API.",
              <button className={styles.secondaryBtn} onClick={handleTestConnection} disabled={testing}>
                {testing ? "Testing..." : "Test Connection"}
              </button>
            )}
            {testResult && (
              <div
                className={`${styles.testResult} ${
                  testResult.success ? styles.testResultOk : styles.testResultBad
                }`}
              >
                {testResult.success
                  ? `Connected as @${testResult.bot?.username} (ID: ${testResult.bot?.id})`
                  : testResult.message}
              </div>
            )}
          </div>


          <div className={styles.card}>
            <h2 className={styles.cardTitle}>Webhook</h2>
            {renderField(
              "Webhook URL",
              "Requires a public HTTPS URL. Empty clears the webhook (back to polling).",
              <div className={styles.inputRow}>
                <input
                  className={styles.input}
                  placeholder="https://your-domain.com/api/telegram/webhook"
                  value={webhookUrl}
                  onChange={(e) => setWebhookUrl(e.target.value)}
                />
                <button className={styles.saveBtn} onClick={handleSetWebhook} disabled={saving}>
                  {saving ? "Saving..." : "Set Webhook"}
                </button>
              </div>
            )}
            {botStatus?.webhook?.url && (
              <p className={styles.fieldHint}>
                Current: <code>{botStatus.webhook.url}</code>
                {botStatus.webhook.pending_update_count > 0
                  ? ` (${botStatus.webhook.pending_update_count} pending updates)`
                  : ""}
              </p>
            )}
          </div>

          <div className={styles.card}>
            <h2 className={styles.cardTitle}>Membership & Alerts</h2>
            {renderField(
              "Auto-approve New Users",
              "Automatically link new Telegram users instead of requiring manual approval.",
              renderSwitch(
                !!settings.telegramAutoApprove,
                (v) => updateSetting("telegramAutoApprove", v),
                "Auto-approve on",
                "Auto-approve off"
              )
            )}
            {renderField(
              "Admin Chat ID",
              "Telegram chat id that receives system alerts / notifications.",
              <input
                className={styles.input}
                placeholder="123456789"
                value={settings.telegramAdminChatId || ""}
                onChange={(e) => updateSetting("telegramAdminChatId", e.target.value)}
              />
            )}
          </div>

          <div className={styles.actions}>
            <button
              className={styles.saveBtn}
              onClick={async () => {
                setSaving(true);
                setError("");
                setSuccess("");
                try {
                  await updateSystemSettings({
                    telegramAutoApprove: settings.telegramAutoApprove,
                    telegramAdminChatId: settings.telegramAdminChatId,
                  });
                  setSuccess("Telegram settings saved");
                } catch (err) {
                  setError(err?.response?.data?.message || "Failed to save Telegram settings");
                } finally {
                  setSaving(false);
                }
              }}
              disabled={saving}
            >
              {saving ? "Saving..." : "Save Telegram Settings"}
            </button>
          </div>
        </div>
      )}


      {/* ─── Security & Scope ───────────────────────────────────── */}
      {activeTab === "scope" && (
        <div className={styles.section}>
          <div className={styles.statsGrid}>
            <div className={styles.statCard}>
              <div className={styles.statLabel}>Scope Validation</div>
              <div className={styles.statValue}>
                {scope.enabled ? "Enabled" : "Disabled"}
              </div>
              <div className={styles.statSub}>
                All targets checked against the whitelist
              </div>
            </div>
            <div className={styles.statCard}>
              <div className={styles.statLabel}>Strict Mode</div>
              <div className={styles.statValue}>
                {scope.strictMode ? "On" : "Off"}
              </div>
              <div className={styles.statSub}>Out-of-scope targets blocked</div>
            </div>
            <div className={styles.statCard}>
              <div className={styles.statLabel}>Whitelisted Targets</div>
              <div className={styles.statValue}>
                {scope.entriesRaw?.split(/[\s,;]+/).filter(Boolean).length || 0}
              </div>
              <div className={styles.statSub}>IPs / CIDRs / domains</div>
            </div>
          </div>

          <div className={styles.card}>
            <h2 className={styles.cardTitle}>Global Target Whitelist</h2>
            {renderField(
              "Enable Scope Validation",
              "Validate every target before running security tools.",
              renderSwitch(
                !!scope.enabled,
                (v) => setScope((prev) => ({ ...prev, enabled: v })),
                "Validation on",
                "Validation off"
              )
            )}
            {renderField(
              "Strict Mode",
              "Block commands whose target has no matching whitelist entry.",
              renderSwitch(
                !!scope.strictMode,
                (v) => setScope((prev) => ({ ...prev, strictMode: v })),
                "Strict on",
                "Strict off"
              )
            )}
            {renderField(
              "Allowed Targets",
              "One per line or comma/space separated: IP, CIDR or domain.",
              <textarea
                className={styles.textarea}
                rows={8}
                value={scope.entriesRaw || ""}
                onChange={(e) => setScope((prev) => ({ ...prev, entriesRaw: e.target.value }))}
                placeholder={"example.com\n*.example.org\n192.168.1.0/24\n10.0.0.5"}
                style={{ fontFamily: "monospace" }}
              />
            )}
          </div>


          <div className={styles.card}>
            <h2 className={styles.cardTitle}>Global Blacklist</h2>
            {renderField(
              "Blocked Targets",
              "Targets that must never be scanned, e.g. .gov, .ac.th.",
              <textarea
                className={styles.textarea}
                rows={5}
                value={settings.scopeBlacklist || ""}
                onChange={(e) => updateSetting("scopeBlacklist", e.target.value)}
                placeholder={".gov\n.ac.th\n8.8.8.8"}
                style={{ fontFamily: "monospace" }}
              />
            )}
            {renderField(
              "Max Scan Timeout (minutes)",
              "Kill long-running scans that exceed this limit.",
              <input
                className={styles.input}
                type="number"
                min="1"
                value={settings.scanTimeoutMinutes ?? 30}
                onChange={(e) => updateSetting("scanTimeoutMinutes", e.target.value)}
              />
            )}
          </div>

          <div className={styles.actions}>
            <button className={styles.saveBtn} onClick={handleSaveScope} disabled={saving}>
              {saving ? "Saving..." : "Save Security Settings"}
            </button>
            <button
              className={styles.secondaryBtn}
              onClick={async () => {
                setSaving(true);
                setError("");
                setSuccess("");
                try {
                  await updateSystemSettings({
                    scopeBlacklist: settings.scopeBlacklist,
                    scanTimeoutMinutes: settings.scanTimeoutMinutes,
                  });
                  setSuccess("Blacklist and timeout saved");
                } catch (err) {
                  setError(err?.response?.data?.message || "Failed to save blacklist");
                } finally {
                  setSaving(false);
                }
              }}
              disabled={saving}
            >
              Save Blacklist & Timeout
            </button>
          </div>
        </div>
      )}


      {/* ─── Payments & Quotas ──────────────────────────────────── */}
      {activeTab === "payments" && (
        <div className={styles.section}>
          <div className={styles.card}>
            <h2 className={styles.cardTitle}>Crypto Wallet Addresses</h2>
            {renderField(
              "Ethereum (ETH) Wallet",
              "Address users send ETH payments to.",
              <div className={styles.inputRow}>
                <input
                  className={styles.input}
                  placeholder="0x..."
                  defaultValue={walletAddress("crypto_eth")}
                  key={`eth-${walletAddress("crypto_eth")}`}
                  onBlur={(e) => handleSaveWallet("crypto_eth", e.target.value)}
                />
              </div>
            )}
            {renderField(
              "Bitcoin (BTC) Wallet",
              "Address users send BTC payments to.",
              <div className={styles.inputRow}>
                <input
                  className={styles.input}
                  placeholder="bc1..."
                  defaultValue={walletAddress("crypto_btc")}
                  key={`btc-${walletAddress("crypto_btc")}`}
                  onBlur={(e) => handleSaveWallet("crypto_btc", e.target.value)}
                />
              </div>
            )}
          </div>

          <div className={styles.card}>
            <h2 className={styles.cardTitle}>Daily Scan Limits</h2>
            <p className={styles.fieldHint}>
              Enforced per plan by the backend usage tracker. 0 = unlimited.
            </p>
            {quotas.length === 0 ? (
              <div className={styles.empty}>No plans found.</div>
            ) : (
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Plan</th>
                    <th>Requests / Day</th>
                    <th>Tokens / Day</th>
                    <th>Concurrent Sessions</th>
                  </tr>
                </thead>
                <tbody>
                  {quotas.map((q) => (
                    <tr key={q.planId}>
                      <td>
                        <strong>{q.name}</strong>
                        <span className={styles.planId}>{q.planId}</span>
                      </td>
                      <td>
                        <input
                          className={styles.smallInput}
                          type="number"
                          min="0"
                          defaultValue={q.maxRequestsPerDay ?? 0}
                          key={`req-${q.planId}-${q.maxRequestsPerDay}`}
                          onBlur={(e) => handleSaveQuota(q.planId, "maxRequestsPerDay", e.target.value)}
                        />
                      </td>
                      <td>
                        <input
                          className={styles.smallInput}
                          type="number"
                          min="0"
                          defaultValue={q.maxTokensPerDay ?? 0}
                          key={`tok-${q.planId}-${q.maxTokensPerDay}`}
                          onBlur={(e) => handleSaveQuota(q.planId, "maxTokensPerDay", e.target.value)}
                        />
                      </td>
                      <td>
                        <input
                          className={styles.smallInput}
                          type="number"
                          min="1"
                          defaultValue={q.maxConcurrentSessions ?? 1}
                          key={`conc-${q.planId}-${q.maxConcurrentSessions}`}
                          onBlur={(e) => handleSaveQuota(q.planId, "maxConcurrentSessions", e.target.value)}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminSettingsPage;

