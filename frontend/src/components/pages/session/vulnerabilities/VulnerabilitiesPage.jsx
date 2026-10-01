"use client";

import React, { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "react-query";
import { Empty, Input, Select, Spin, Dropdown, Button } from "antd";
import { SearchOutlined, RightOutlined, DownloadOutlined } from "@ant-design/icons";
import { getVulnerabilities, sessionReportUrl } from "@/services/agent.service";
import styles from "@/styles/pages/Vulnerabilities.module.scss";
import { useTranslation } from "@/i18n/I18nProvider";

const SEVERITY_ORDER = { critical: 5, high: 4, medium: 3, low: 2, info: 1 };

/** Report formats offered by the export endpoint (labels are brand-neutral). */
const REPORT_FORMATS = [
  { key: "markdown", label: "Markdown (.md)" },
  { key: "html", label: "HTML (.html)" },
  { key: "json", label: "JSON (.json)" },
];

function SeverityBadge({ severity }) {
  const value = severity || "medium";
  return <span className={`${styles.severity} ${styles[value]}`}>{value}</span>;
}

function formatDate(value, locale) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleString(locale === "th" ? "th-TH" : "en-US");
}

export default function VulnerabilitiesPage({ sessionId }) {
  const router = useRouter();
  const { t, locale } = useTranslation();
  const [search, setSearch] = useState("");
  const [severity, setSeverity] = useState("all");
  const { data, isLoading, isError } = useQuery(
    ["vulnerabilities", sessionId],
    () => getVulnerabilities(sessionId),
    { refetchInterval: 5000 },
  );

  const vulnerabilities = data?.vulnerabilities ?? [];
  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return vulnerabilities
      .filter((item) => severity === "all" || item.severity === severity)
      .filter((item) => {
        if (!needle) return true;
        return [item.title, item.host, item.service, item.endpoint, item.cwe, item.cve]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(needle));
      })
      .sort((a, b) => {
        const delta = (SEVERITY_ORDER[b.severity] ?? 0) - (SEVERITY_ORDER[a.severity] ?? 0);
        return delta || new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      });
  }, [vulnerabilities, search, severity]);

  const counts = useMemo(() => ({
    critical: vulnerabilities.filter((item) => item.severity === "critical").length,
    high: vulnerabilities.filter((item) => item.severity === "high").length,
    exploited: vulnerabilities.filter((item) => item.exploited).length,
  }), [vulnerabilities]);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <span className={styles.eyebrow}>{t("vulnerabilities.eyebrow")}</span>
          <h1>{t("vulnerabilities.title")}</h1>
          <p>{t("vulnerabilities.subtitle")}</p>
        </div>
        <div className={styles.headerActions}>
          <Dropdown
            trigger={["click"]}
            menu={{
              items: REPORT_FORMATS,
              onClick: ({ key }) => {
                // Same-origin download: the gateway relays Content-Disposition.
                window.location.assign(sessionReportUrl(sessionId, key));
              },
            }}
          >
            <Button icon={<DownloadOutlined />}>{t("common.exportReport")}</Button>
          </Dropdown>
          <div className={styles.totalBadge}>
            {t("vulnerabilities.findingsCount", { count: vulnerabilities.length })}
          </div>
        </div>
      </header>

      <section className={styles.metrics}>
        <div className={styles.metric}><span>{t("vulnerabilities.metricTotal")}</span><strong>{vulnerabilities.length}</strong></div>
        <div className={`${styles.metric} ${styles.metricCritical}`}><span>{t("vulnerabilities.metricCritical")}</span><strong>{counts.critical}</strong></div>
        <div className={`${styles.metric} ${styles.metricHigh}`}><span>{t("vulnerabilities.metricHigh")}</span><strong>{counts.high}</strong></div>
        <div className={styles.metric}><span>{t("vulnerabilities.metricExploited")}</span><strong>{counts.exploited}</strong></div>
      </section>

      <section className={styles.tableCard}>
        <div className={styles.toolbar}>
          <Input
            prefix={<SearchOutlined />}
            placeholder={t("vulnerabilities.searchPlaceholder")}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            allowClear
            className={styles.search}
          />
          <Select
            value={severity}
            onChange={setSeverity}
            className={styles.filter}
            options={[
              { value: "all", label: t("vulnerabilities.severityAll") },
              { value: "critical", label: t("vulnerabilities.severityCritical") },
              { value: "high", label: t("vulnerabilities.severityHigh") },
              { value: "medium", label: t("vulnerabilities.severityMedium") },
              { value: "low", label: t("vulnerabilities.severityLow") },
              { value: "info", label: t("vulnerabilities.severityInfo") },
            ]}
          />
        </div>

        {isLoading ? (
          <div className={styles.centerState}><Spin /></div>
        ) : isError ? (
          <div className={styles.centerState}>{t("vulnerabilities.loadError")}</div>
        ) : filtered.length === 0 ? (
          <div className={styles.centerState}>
            <Empty
              description={
                vulnerabilities.length
                  ? t("vulnerabilities.emptyFiltered")
                  : t("vulnerabilities.empty")
              }
            />
          </div>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>{t("vulnerabilities.colSeverity")}</th>
                  <th>{t("vulnerabilities.colFinding")}</th>
                  <th>{t("vulnerabilities.colAsset")}</th>
                  <th>{t("vulnerabilities.colCvss")}</th>
                  <th>{t("vulnerabilities.colClassification")}</th>
                  <th>{t("vulnerabilities.colStatus")}</th>
                  <th>{t("vulnerabilities.colUpdated")}</th>
                  <th aria-label={t("common.open")} />
                </tr>
              </thead>
              <tbody>
                {filtered.map((item) => (
                  <tr
                    key={item.vulnerabilityId}
                    tabIndex={0}
                    onClick={() => router.push(`/session/${sessionId}/vulnerabilities/${item.vulnerabilityId}`)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") router.push(`/session/${sessionId}/vulnerabilities/${item.vulnerabilityId}`);
                    }}
                  >
                    <td><SeverityBadge severity={item.severity} /></td>
                    <td>
                      <strong className={styles.findingTitle}>{item.title}</strong>
                      <span className={styles.findingContext}>{item.contextSummary || item.description || t("vulnerabilities.noContext")}</span>
                    </td>
                    <td>
                      <span className={styles.asset}>{item.host || t("common.unknown")}</span>
                      <span className={styles.assetMeta}>{item.endpoint || item.service || "—"}</span>
                    </td>
                    <td>{item.cvssScore ?? "—"}</td>
                    <td>{item.cwe || item.cve || "—"}</td>
                    <td><span className={styles.status}>{item.status}</span></td>
                    <td className={styles.updated}>{formatDate(item.updatedAt, locale)}</td>
                    <td><RightOutlined className={styles.openIcon} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
