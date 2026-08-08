import { v4 as uuidv4 } from "uuid";

// ─── Evidence Collection & Reporting ────────────────────────────────
// บันทึก Raw Request/Response, Terminal Output และ Screenshot ของแต่ละ
// ขั้นตอนที่เจอบุคโหว่ไว้อัตโนมัติ + สร้างรายงาน Executive/Technical

export type EvidenceType =
  | "request_response"
  | "terminal_output"
  | "screenshot"
  | "tool_output"
  | "finding"
  | "note";

export interface EvidenceItem {
  id: string;
  sessionId: string;
  type: EvidenceType;
  title: string;
  content: string;
  metadata?: Record<string, any>;
  timestamp: Date;
  // เชื่อมโยงกับ vulnerability/finding
  linkedFindingId?: string;
}

export interface ReportFinding {
  findingId: string;
  title: string;
  severity: "critical" | "high" | "medium" | "low" | "info";
  cvssScore?: number;
  cvssVector?: string;
  cwe?: string;
  cve?: string;
  host: string;
  service?: string;
  endpoint?: string;
  description: string;
  evidence: string[];
  remediation: string;
  impact?: string;
  status: "open" | "confirmed" | "remediated" | "accepted";
}

export interface ReportData {
  reportId: string;
  sessionId: string;
  title: string;
  clientName?: string;
  engagementDate: Date;
  pentester?: string;
  scope?: string;
  executiveSummary: string;
  methodology: string[];
  findings: ReportFinding[];
  evidence: EvidenceItem[];
  recommendations: string[];
  generatedAt: Date;
}

// ─── EvidenceCollector class ────────────────────────────────────────

export class EvidenceCollector {
  private items: EvidenceItem[] = [];

  constructor(private sessionId: string) {}

  add(item: Omit<EvidenceItem, "id" | "sessionId" | "timestamp">): EvidenceItem {
    const newItem: EvidenceItem = {
      ...item,
      id: uuidv4(),
      sessionId: this.sessionId,
      timestamp: new Date(),
    };
    this.items.push(newItem);
    return newItem;
  }

  addRequestResponse(
    title: string,
    request: string,
    response: string,
    metadata?: Record<string, any>,
    linkedFindingId?: string,
  ): EvidenceItem {
    return this.add({
      type: "request_response",
      title,
      content: `REQUEST:\n${request}\n\nRESPONSE:\n${response}`,
      metadata,
      linkedFindingId,
    });
  }

  addTerminalOutput(
    title: string,
    command: string,
    output: string,
    metadata?: Record<string, any>,
  ): EvidenceItem {
    return this.add({
      type: "terminal_output",
      title,
      content: `$ ${command}\n${output}`,
      metadata,
    });
  }

  addToolOutput(
    title: string,
    tool: string,
    output: string,
    metadata?: Record<string, any>,
  ): EvidenceItem {
    return this.add({
      type: "tool_output",
      title,
      content: `[${tool}]\n${output}`,
      metadata,
    });
  }

  addFinding(
    title: string,
    content: string,
    metadata?: Record<string, any>,
  ): EvidenceItem {
    return this.add({
      type: "finding",
      title,
      content,
      metadata,
    });
  }

  addNote(title: string, content: string): EvidenceItem {
    return this.add({ type: "note", title, content });
  }

  getByFinding(findingId: string): EvidenceItem[] {
    return this.items.filter((i) => i.linkedFindingId === findingId);
  }

  getAll(): EvidenceItem[] {
    return this.items;
  }

  clear(): void {
    this.items = [];
  }
}

// ─── CVSS scoring helpers ───────────────────────────────────────────

export interface CvssScore {
  score: number;
  severity: "critical" | "high" | "medium" | "low" | "none";
  vector: string;
}

// Simple CVSS v3.1 base score calculator (approximation)
export function calculateCvssScore(params: {
  attackVector: "N" | "A" | "L" | "P";
  attackComplexity: "L" | "H";
  privilegesRequired: "N" | "L" | "H";
  userInteraction: "N" | "R";
  scope: "U" | "C";
  confidentiality: "N" | "L" | "H";
  integrity: "N" | "L" | "H";
  availability: "N" | "L" | "H";
}): CvssScore {
  const {
    attackVector, attackComplexity, privilegesRequired,
    userInteraction, scope, confidentiality, integrity, availability,
  } = params;

  const av = { N: 0.85, A: 0.62, L: 0.55, P: 0.2 }[attackVector];
  const ac = { L: 0.77, H: 0.44 }[attackComplexity];
  const pr = scope === "U"
    ? { N: 0.85, L: 0.62, H: 0.27 }[privilegesRequired]
    : { N: 0.85, L: 0.68, H: 0.5 }[privilegesRequired];
  const ui = { N: 0.85, R: 0.62 }[userInteraction];
  const c = { N: 0, L: 0.22, H: 0.56 }[confidentiality];
  const i = { N: 0, L: 0.22, H: 0.56 }[integrity];
  const a = { N: 0, L: 0.22, H: 0.56 }[availability];

  const iss = 1 - (1 - c) * (1 - i) * (1 - a);
  const impact = scope === "U" ? 6.42 * iss : 7.52 * (iss - 0.029) - 3.25 * Math.pow(iss - 0.02, 15);
  const exploitability = 8.22 * av * ac * pr * ui;

  let baseScore: number;
  if (impact <= 0) {
    baseScore = 0;
  } else if (scope === "U") {
    baseScore = Math.min(impact + exploitability, 10);
  } else {
    baseScore = Math.min(1.08 * (impact + exploitability), 10);
  }

  baseScore = Math.round(baseScore * 10) / 10;

  const severity =
    baseScore >= 9.0 ? "critical" :
    baseScore >= 7.0 ? "high" :
    baseScore >= 4.0 ? "medium" :
    baseScore > 0 ? "low" : "none";

  const vector = `CVSS:3.1/AV:${attackVector}/AC:${attackComplexity}/PR:${privilegesRequired}/UI:${userInteraction}/S:${scope}/C:${confidentiality}/I:${integrity}/A:${availability}`;

  return { score: baseScore, severity, vector };
}

// ─── Report Generator ───────────────────────────────────────────────

export class ReportGenerator {
  constructor(private sessionId: string) {}

  generateReport(data: Omit<ReportData, "reportId" | "sessionId" | "generatedAt">): ReportData {
    return {
      ...data,
      reportId: uuidv4(),
      sessionId: this.sessionId,
      generatedAt: new Date(),
    };
  }

  // ─── Markdown report ──────────────────────────────────────────────

  toMarkdown(report: ReportData): string {
    const lines: string[] = [];

    lines.push(`# ${report.title}`);
    lines.push("");
    lines.push(`**Engagement Date:** ${report.engagementDate.toISOString().split("T")[0]}`);
    if (report.clientName) lines.push(`**Client:** ${report.clientName}`);
    if (report.pentester) lines.push(`**Pentester:** ${report.pentester}`);
    if (report.scope) lines.push(`**Scope:** ${report.scope}`);
    lines.push("");

    // Executive Summary
    lines.push("## Executive Summary");
    lines.push("");
    lines.push(report.executiveSummary);
    lines.push("");

    // Methodology
    lines.push("## Methodology");
    lines.push("");
    for (const m of report.methodology) {
      lines.push(`- ${m}`);
    }
    lines.push("");

    // Findings
    lines.push("## Findings");
    lines.push("");
    if (report.findings.length === 0) {
      lines.push("No vulnerabilities were identified during this engagement.");
    } else {
      for (const f of report.findings) {
        lines.push(`### ${f.title}`);
        lines.push("");
        lines.push(`**Severity:** ${f.severity.toUpperCase()}`);
        if (f.cvssScore != null) lines.push(`**CVSS:** ${f.cvssScore} (${f.cvssVector ?? ""})`);
        if (f.cwe) lines.push(`**CWE:** ${f.cwe}`);
        if (f.cve) lines.push(`**CVE:** ${f.cve}`);
        lines.push(`**Host:** ${f.host}${f.service ? `:${f.service}` : ""}${f.endpoint ? ` ${f.endpoint}` : ""}`);
        lines.push("");
        lines.push(`**Description:** ${f.description}`);
        lines.push("");
        lines.push(`**Impact:** ${f.impact ?? "N/A"}`);
        lines.push("");
        lines.push(`**Remediation:** ${f.remediation}`);
        lines.push("");
        if (f.evidence.length > 0) {
          lines.push("**Evidence:**");
          for (const e of f.evidence) {
            lines.push(`- ${e}`);
          }
          lines.push("");
        }
      }
    }

    // Evidence
    if (report.evidence.length > 0) {
      lines.push("## Evidence Collected");
      lines.push("");
      for (const e of report.evidence) {
        lines.push(`### ${e.title} (${e.type})`);
        lines.push("");
        lines.push("```");
        lines.push(e.content);
        lines.push("```");
        lines.push("");
      }
    }

    // Recommendations
    if (report.recommendations.length > 0) {
      lines.push("## Recommendations");
      lines.push("");
      for (const r of report.recommendations) {
        lines.push(`- ${r}`);
      }
      lines.push("");
    }

    lines.push("---");
    lines.push(`*Generated by VektorSec on ${report.generatedAt.toISOString()}*`);

    return lines.join("\n");
  }

  // ─── HTML report ──────────────────────────────────────────────────

  toHtml(report: ReportData): string {
    const md = this.toMarkdown(report);
    const escaped = md
      .replace(/&/g, "&")
      .replace(/</g, "<")
      .replace(/>/g, ">");

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${report.title}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 900px; margin: 0 auto; padding: 2rem; color: #1a1a1a; line-height: 1.6; }
    h1 { border-bottom: 3px solid #2563eb; padding-bottom: 0.5rem; }
    h2 { color: #2563eb; margin-top: 2rem; border-bottom: 1px solid #e5e7eb; padding-bottom: 0.3rem; }
    h3 { color: #374151; margin-top: 1.5rem; }
    pre { background: #f3f4f6; padding: 1rem; border-radius: 6px; overflow-x: auto; font-size: 0.85rem; }
    code { background: #f3f4f6; padding: 0.1rem 0.3rem; border-radius: 3px; }
    .severity-critical { color: #dc2626; font-weight: bold; }
    .severity-high { color: #ea580c; font-weight: bold; }
    .severity-medium { color: #d97706; font-weight: bold; }
    .severity-low { color: #16a34a; font-weight: bold; }
    .severity-info { color: #6b7280; }
    @media print { body { padding: 1rem; } }
  </style>
</head>
<body>
  <pre>${escaped}</pre>
</body>
</html>`;
  }

  // ─── Plain text report ────────────────────────────────────────────

  toText(report: ReportData): string {
    return this.toMarkdown(report)
      .replace(/^#+\s+/gm, "")
      .replace(/\*\*/g, "")
      .replace(/`/g, "");
  }
}
