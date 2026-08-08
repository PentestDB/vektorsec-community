import { ToolDefinition } from "../types";
import { ReportGenerator, ReportFinding } from "../../services/evidenceCollector";
import { getEvidenceCollector } from "./collect-evidence";

const generateReport: ToolDefinition = {
  name: "generate_report",
  allowedRoles: ["orchestrator"],
  description:
    "Generate a pentest report (Markdown, HTML, or plain text) from collected evidence and findings. " +
    "Includes executive summary, technical findings with CVSS scores, evidence, and recommendations.",
  parameters: {
    type: "object",
    properties: {
      format: {
        type: "string",
        enum: ["markdown", "html", "text"],
        description: "The report format",
      },
      title: {
        type: "string",
        description: "Report title",
      },
      client_name: {
        type: "string",
        description: "Client name",
      },
      pentester: {
        type: "string",
        description: "Pentester name",
      },
      scope: {
        type: "string",
        description: "Engagement scope",
      },
      executive_summary: {
        type: "string",
        description: "Executive summary text",
      },
      findings: {
        type: "array",
        description: "Array of findings with title, severity, description, remediation, etc.",
        items: {
          type: "object",
        },
      },
      recommendations: {
        type: "array",
        description: "Array of recommendations",
        items: { type: "string" },
      },
    },
    required: ["title"],
  },
  timeoutMs: 30_000,
  async execute(args, ctx) {
    const {
      format = "markdown",
      title,
      client_name,
      pentester,
      scope,
      executive_summary,
      findings = [],
      recommendations = [],
    } = args;

    if (!title) {
      return { output: "Error: title is required", exitCode: 1 };
    }

    const sessionId = ctx.sessionId ?? "unknown";
    const generator = new ReportGenerator(sessionId);
    const evidenceCollector = getEvidenceCollector(sessionId);

    // Convert findings to ReportFinding format
    const reportFindings: ReportFinding[] = findings.map((f: any) => ({
      findingId: f.finding_id ?? `finding-${Math.random().toString(36).slice(2, 8)}`,
      title: f.title ?? "Untitled finding",
      severity: f.severity ?? "info",
      cvssScore: f.cvss_score,
      cvssVector: f.cvss_vector,
      cwe: f.cwe,
      cve: f.cve,
      host: f.host ?? "unknown",
      service: f.service,
      endpoint: f.endpoint,
      description: f.description ?? "",
      evidence: f.evidence ?? [],
      remediation: f.remediation ?? "Not specified",
      impact: f.impact,
      status: f.status ?? "open",
    }));

    const report = generator.generateReport({
      title,
      clientName: client_name,
      engagementDate: new Date(),
      pentester,
      scope,
      executiveSummary:
        executive_summary ??
        `Pentest engagement completed. ${reportFindings.length} finding(s) identified.`,
      methodology: [
        "Reconnaissance",
        "Enumeration",
        "Vulnerability Analysis",
        "Exploitation",
        "Post-Exploitation",
        "Reporting",
      ],
      findings: reportFindings,
      evidence: evidenceCollector.getAll(),
      recommendations,
    });

    let output: string;
    switch (format) {
      case "html":
        output = generator.toHtml(report);
        break;
      case "text":
        output = generator.toText(report);
        break;
      default:
        output = generator.toMarkdown(report);
    }

    return {
      output: `Report generated (${format} format)\n\n${output}`,
      exitCode: 0,
    };
  },
};

export default generateReport;
