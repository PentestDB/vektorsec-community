import type { EvidenceItem, ReportFinding } from "../services/evidenceCollector";

/**
 * Pure helpers for exporting an engagement report from a session.
 *
 * Kept free of database/Express imports so the mapping and formatting rules can
 * be unit tested (see `backend/tests/reportExport.test.ts`).
 */

export type ReportFormat = "markdown" | "html" | "json";

/** Accepted `?format=` values and their file extensions. */
const FORMATS: Record<ReportFormat, { extension: string; contentType: string }> = {
  markdown: { extension: "md", contentType: "text/markdown; charset=utf-8" },
  html: { extension: "html", contentType: "text/html; charset=utf-8" },
  json: { extension: "json", contentType: "application/json; charset=utf-8" },
};

/** Normalise a user-supplied format (defaults to markdown, rejects typos). */
export function parseReportFormat(value: unknown): ReportFormat | null {
  if (value === undefined || value === null || value === "") return "markdown";
  const normalised = String(value).trim().toLowerCase();
  if (normalised === "md" || normalised === "markdown") return "markdown";
  if (normalised === "html") return "html";
  if (normalised === "json") return "json";
  return null;
}

export function reportFileExtension(format: ReportFormat): string {
  return FORMATS[format].extension;
}

export function reportContentType(format: ReportFormat): string {
  return FORMATS[format].contentType;
}

/** Minimal shape of a stored session vulnerability (avoids importing mongoose). */
export interface SessionVulnerabilityLike {
  vulnerabilityId?: string;
  fingerprint?: string;
  title?: string;
  host?: string;
  service?: string;
  endpoint?: string;
  severity?: string;
  cvssScore?: number;
  cvssVector?: string;
  cwe?: string;
  cve?: string;
  description?: string;
  contextSummary?: string;
  evidence?: string;
  stepsToReproduce?: string[];
  impact?: string;
  remediation?: string;
  exploited?: boolean;
  status?: string;
}

const SEVERITIES = ["critical", "high", "medium", "low", "info"] as const;
type Severity = (typeof SEVERITIES)[number];

function toSeverity(value: unknown): Severity {
  const candidate = String(value ?? "").toLowerCase();
  return (SEVERITIES as readonly string[]).includes(candidate)
    ? (candidate as Severity)
    : "info";
}

/**
 * Map a stored session vulnerability onto the report finding shape.
 *
 * `stepsToReproduce` and the free-text `evidence` are folded into the finding's
 * evidence list so the exported report keeps the reproduction detail.
 */
export function toReportFinding(
  vulnerability: SessionVulnerabilityLike,
  index = 0,
): ReportFinding {
  const evidence: string[] = [];
  const steps = (vulnerability.stepsToReproduce ?? []).filter(Boolean);
  if (steps.length > 0) {
    evidence.push(
      ["Steps to reproduce:", ...steps.map((step, i) => `  ${i + 1}. ${step}`)].join("\n"),
    );
  }
  if (vulnerability.evidence) evidence.push(String(vulnerability.evidence));

  return {
    findingId:
      vulnerability.vulnerabilityId ??
      vulnerability.fingerprint ??
      `finding-${index + 1}`,
    title: vulnerability.title?.trim() || `Untitled finding ${index + 1}`,
    severity: toSeverity(vulnerability.severity),
    cvssScore: vulnerability.cvssScore,
    cvssVector: vulnerability.cvssVector,
    cwe: vulnerability.cwe,
    cve: vulnerability.cve,
    host: vulnerability.host?.trim() || "unknown",
    service: vulnerability.service,
    endpoint: vulnerability.endpoint,
    description:
      vulnerability.description?.trim() ||
      vulnerability.contextSummary?.trim() ||
      "No description recorded.",
    evidence,
    remediation: vulnerability.remediation?.trim() || "Not specified",
    impact: vulnerability.impact,
    status: (vulnerability.status as ReportFinding["status"]) ?? "open",
  };
}

export interface SeveritySummary {
  total: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
  info: number;
}

/** Count findings per severity. */
export function severitySummary(findings: ReportFinding[]): SeveritySummary {
  const summary: SeveritySummary = {
    total: findings.length,
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    info: 0,
  };
  for (const finding of findings) {
    summary[toSeverity(finding.severity)] += 1;
  }
  return summary;
}

/** Sort findings by severity (critical first), then by title for stability. */
export function sortFindingsBySeverity(findings: ReportFinding[]): ReportFinding[] {
  const rank = (severity: string) => {
    const index = (SEVERITIES as readonly string[]).indexOf(severity);
    return index === -1 ? SEVERITIES.length : index;
  };
  return [...findings].sort(
    (a, b) => rank(a.severity) - rank(b.severity) || a.title.localeCompare(b.title),
  );
}

/**
 * Deterministic executive summary for an exported report.
 *
 * Deliberately factual (counts + confirmed findings) so an operator can edit it
 * afterwards instead of having to fact-check prose written by a model.
 */
export function buildExecutiveSummary(input: {
  findings: ReportFinding[];
  scope?: string;
  clientName?: string;
  target?: string;
  evidenceCount?: number;
}): string {
  const summary = severitySummary(input.findings);
  const confirmed = input.findings.filter((finding) =>
    ["confirmed", "remediated"].includes(finding.status),
  ).length;

  const parts: string[] = [];
  if (input.clientName) parts.push(`Prepared for ${input.clientName}.`);
  if (input.target || input.scope) {
    parts.push(`Target scope: ${input.target || input.scope}.`);
  }

  if (summary.total === 0) {
    parts.push("No vulnerabilities were identified during this engagement.");
  } else {
    const breakdown = [
      summary.critical > 0 ? `${summary.critical} critical` : null,
      summary.high > 0 ? `${summary.high} high` : null,
      summary.medium > 0 ? `${summary.medium} medium` : null,
      summary.low > 0 ? `${summary.low} low` : null,
      summary.info > 0 ? `${summary.info} informational` : null,
    ]
      .filter(Boolean)
      .join(", ");
    parts.push(`The assessment identified ${summary.total} finding(s): ${breakdown}.`);
    if (confirmed > 0) {
      parts.push(
        `${confirmed} finding(s) are confirmed or remediated and should be treated as the highest priority.`,
      );
    }
  }

  if (input.evidenceCount) {
    parts.push(`${input.evidenceCount} evidence artefact(s) are attached to this report.`);
  }

  return parts.join(" ");
}

/** Slug used for the download filename (safe on every OS). */
export function slugifyReportTitle(title: string): string {
  const slug = String(title ?? "")
    .normalize("NFKD")
    .replace(/[^\w\s.-]/g, "")
    .trim()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, 80)
    .toLowerCase();
  return slug || "vektorsec-report";
}

/** `acme-pentest-report-2026-09-22.html` */
export function reportFileName(input: {
  title: string;
  format: ReportFormat;
  date?: Date;
}): string {
  const date = (input.date ?? new Date()).toISOString().slice(0, 10);
  return `${slugifyReportTitle(input.title)}-report-${date}.${reportFileExtension(input.format)}`;
}

/** Evidence tidy-up for exports: drop empty entries and cap huge blobs. */
export function compactEvidence(
  evidence: EvidenceItem[],
  maxCharsPerItem = 20_000,
): EvidenceItem[] {
  return (evidence ?? [])
    .filter((item) => Boolean(item?.content?.trim()))
    .map((item) =>
      item.content.length > maxCharsPerItem
        ? { ...item, content: `${item.content.slice(0, maxCharsPerItem)}\n… [truncated]` }
        : item,
    );
}

/**
 * Derive the report's recommendation list from the findings' remediation text
 * (deduplicated, severity order preserved). Keeps the export useful without
 * asking a model to invent generic advice.
 */
export function buildRecommendations(
  findings: ReportFinding[],
  limit = 20,
): string[] {
  const seen = new Set<string>();
  const recommendations: string[] = [];

  for (const finding of sortFindingsBySeverity(findings)) {
    const remediation = finding.remediation?.trim();
    if (!remediation || remediation === "Not specified") continue;
    const key = remediation.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    recommendations.push(remediation);
    if (recommendations.length >= limit) break;
  }

  return recommendations;
}
