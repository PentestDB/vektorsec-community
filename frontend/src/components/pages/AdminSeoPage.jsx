"use client";

import { useEffect, useState, useCallback } from "react";
import {
  getSystemSettings,
  updateSystemSettings,
} from "@/services/admin.service";
import styles from "./AdminSettingsPage.module.scss";

/**
 * Admin > SEO & Sitemap.
 * Controls the meta tags, Open Graph, robots.txt and sitemap.xml values that
 * the public site serves. Values are stored in the backend .env and consumed
 * by the frontend at runtime (see frontend/src/lib/seoSettings.js).
 */
const AdminSeoPage = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [settings, setSettings] = useState({});

  const updateSetting = useCallback((key, value) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  }, []);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await getSystemSettings();
      setSettings(data.settings || {});
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to load SEO settings");
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
        seoTitle: settings.seoTitle || "",
        seoDescription: settings.seoDescription || "",
        seoKeywords: settings.seoKeywords || "",
        seoSiteUrl: settings.seoSiteUrl || "",
        seoOgImage: settings.seoOgImage || "",
        seoTwitterHandle: settings.seoTwitterHandle || "",
        seoIndexing: !!settings.seoIndexing,
        seoSitemapEnabled: !!settings.seoSitemapEnabled,
        seoRobotsExtraDisallow: settings.seoRobotsExtraDisallow || "",
        seoSitemapExtraRoutes: settings.seoSitemapExtraRoutes || "",
      });
      setSuccess("SEO settings saved. Changes appear on public pages within a minute.");
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to save SEO settings");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className={styles.loading}>Loading SEO settings...</div>;
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
        <h1 className={styles.title}>SEO & Sitemap</h1>
        <p className={styles.subtitle}>
          Meta tags, Open Graph, robots.txt and sitemap values for Google
          indexing and social previews.
        </p>
      </div>

      {error && <div className={styles.error}>{error}</div>}
      {success && <div className={styles.success}>{success}</div>}

      <div className={styles.section}>
        <div className={styles.card}>
          <h2 className={styles.cardTitle}>Core Meta Tags</h2>
          {renderField(
            "Site Title",
            "Default <title> for the home page. Sub-pages use '<Page> | <Site Name>'.",
            <input
              className={styles.input}
              value={settings.seoTitle || ""}
              onChange={(e) => updateSetting("seoTitle", e.target.value)}
              placeholder="VektorSec | Autonomous AI Pentest & Security Operations Platform"
            />
          )}
          {renderField(
            "Meta Description",
            "Shown in search results below the title.",
            <textarea
              className={styles.textarea}
              rows={3}
              value={settings.seoDescription || ""}
              onChange={(e) => updateSetting("seoDescription", e.target.value)}
              placeholder="Next-Gen AI Pentest Platform. Autonomous AI Security Operations & Penetration Testing Agent..."
            />
          )}
          {renderField(
            "Keywords",
            "Comma-separated. Used in <meta name='keywords'>.",
            <textarea
              className={styles.textarea}
              rows={3}
              value={settings.seoKeywords || ""}
              onChange={(e) => updateSetting("seoKeywords", e.target.value)}
              placeholder="AI Pentest, Security Operations, Penetration Testing Agent, Vulnerability Scanner, ตรวจเช็กช่องโหว่"
            />
          )}
        </div>

        <div className={styles.card}>
          <h2 className={styles.cardTitle}>Open Graph & Social</h2>
          {renderField(
            "Site URL",
            "Canonical domain (no trailing slash). Used for canonical links, OG URLs, sitemap and robots.",
            <input
              className={styles.input}
              value={settings.seoSiteUrl || ""}
              onChange={(e) => updateSetting("seoSiteUrl", e.target.value)}
              placeholder="https://vektorsec.ai"
            />
          )}
          {renderField(
            "Open Graph Image",
            "Public path or absolute URL of the 1200x630 share preview image.",
            <input
              className={styles.input}
              value={settings.seoOgImage || ""}
              onChange={(e) => updateSetting("seoOgImage", e.target.value)}
              placeholder="/opengraph-image.jpg"
            />
          )}
          {renderField(
            "Twitter Handle",
            "Twitter/X account shown on the Twitter Card (include @).",
            <input
              className={styles.input}
              value={settings.seoTwitterHandle || ""}
              onChange={(e) => updateSetting("seoTwitterHandle", e.target.value)}
              placeholder="@VektorSec"
            />
          )}
        </div>

        <div className={styles.card}>
          <h2 className={styles.cardTitle}>Indexing & Crawlers</h2>
          {renderField(
            "Allow Search Engine Indexing",
            "When off, all public pages are served with noindex, nofollow.",
            renderSwitch(
              !!settings.seoIndexing,
              (v) => updateSetting("seoIndexing", v),
              "Indexing enabled",
              "Indexing disabled (noindex)"
            )
          )}
          {renderField(
            "Generate Sitemap",
            "Toggles the /sitemap.xml output.",
            renderSwitch(
              !!settings.seoSitemapEnabled,
              (v) => updateSetting("seoSitemapEnabled", v),
              "Sitemap enabled",
              "Sitemap disabled"
            )
          )}
          {renderField(
            "Extra robots.txt Disallow Paths",
            "One path per line or comma-separated (e.g. /internal). Appended to the default blocklist.",
            <textarea
              className={styles.textarea}
              rows={3}
              value={settings.seoRobotsExtraDisallow || ""}
              onChange={(e) => updateSetting("seoRobotsExtraDisallow", e.target.value)}
              placeholder="/internal&#10;/reports"
            />
          )}
          {renderField(
            "Extra Sitemap Routes",
            "Additional public paths to include in /sitemap.xml (one per line or comma-separated).",
            <textarea
              className={styles.textarea}
              rows={3}
              value={settings.seoSitemapExtraRoutes || ""}
              onChange={(e) => updateSetting("seoSitemapExtraRoutes", e.target.value)}
              placeholder="/news&#10;/events"
            />
          )}
        </div>

        <div className={styles.actions}>
          <button className={styles.saveBtn} onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save SEO Settings"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AdminSeoPage;
