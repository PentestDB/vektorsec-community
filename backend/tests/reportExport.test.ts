import assert from "node:assert/strict";
import { test } from "node:test";
import type { ReportFinding } from "../src/services/evidenceCollector";
import {
  buildExecutiveSummary,
  compactEvidence,
  parseReportFormat,
  reportContentType,
  reportFileExtension,
  reportFileName,
  severitySummary,
  slugifyReportTitle,
  sortFindingsBySeverity,
  toReportFinding,
} from "../src/utils/report";

const finding = (overrides: Partial<ReportFinding> = {}): ReportFinding => ({
  findingId: "f1",
  title: "SQL injection",
  severity: "high",
  host: "app.example.com",
  description: "Injectable id parameter",
  evidence: [],
  remediation: "Use parameterised queries",
  status: "open",
  ...overrides,
});

test("parseReportFormat accepts aliases and defaults to markdown", () => {
  assert.equal(parseReportFormat(undefined), "markdown");
  assert.equal(parseReportFormat(""), "markdown");
  assert.equal(parseReportFormat("md"), "markdown");
  assert.equal(parseReportFormat("MarkDown"), "markdown");
  assert.equal(parseReportFormat(" html "), "html");
  assert.equal(parseReportFormat("json"), "json");
  assert.equal(parseReportFormat("pdf"), null);
});

test("format metadata maps to the right extension and content type", () => {
  assert.equal(reportFileExtension("markdown"), "md");
  assert.equal(reportFileExtension("html"), "html");
  assert.equal(reportFileExtension("json"), "json");
  assert.match(reportContentType("markdown"), /^text\/markdown/);
  assert.match(reportContentType("html"), /^text\/html/);
  assert.match(reportContentType("json"), /^application\/json/);
});

test("toReportFinding maps a stored vulnerability and folds reproduction data", () => {
  const mapped = toReportFinding({
    vulnerabilityId: "vuln-7",
    title: "  Auth bypass  ",
    host: "api.example.com",
    service: "https",
    endpoint: "/admin",
    severity: "CRITICAL",
    cvssScore: 9.8,
    cvssVector: "CVSS:3.1/AV:N",
    cwe: "CWE-287",
    cve: "CVE-2024-0001",
    description: "Header trust issue",
    evidence: "HTTP/1.1 200 OK",
    stepsToReproduce: ["Send X-Forwarded-For", "Observe admin access"],
    impact: "Full admin access",
    remediation: "Verify the header",
    status: "confirmed",
  });

  assert.equal(mapped.findingId, "vuln-7");
  assert.equal(mapped.title, "Auth bypass");
  assert.equal(mapped.severity, "critical");
  assert.equal(mapped.host, "api.example.com");
  assert.equal(mapped.service, "https");
  assert.equal(mapped.endpoint, "/admin");
  assert.equal(mapped.cvssScore, 9.8);
  assert.equal(mapped.cwe, "CWE-287");
  assert.equal(mapped.status, "confirmed");
  assert.equal(mapped.evidence.length, 2);
  assert.match(mapped.evidence[0], /Steps to reproduce:/);
  assert.match(mapped.evidence[0], /1\. Send X-Forwarded-For/);
  assert.equal(mapped.evidence[1], "HTTP/1.1 200 OK");
});

test("toReportFinding falls back to safe defaults", () => {
  const mapped = toReportFinding({}, 2);

  assert.equal(mapped.findingId, "finding-3");
  assert.equal(mapped.title, "Untitled finding 3");
  assert.equal(mapped.severity, "info");
  assert.equal(mapped.host, "unknown");
  assert.equal(mapped.description, "No description recorded.");
  assert.equal(mapped.remediation, "Not specified");
  assert.equal(mapped.status, "open");
  assert.deepEqual(mapped.evidence, []);
});

test("toReportFinding prefers contextSummary when description is missing", () => {
  const mapped = toReportFinding({ contextSummary: "From the agent transcript" });
  assert.equal(mapped.description, "From the agent transcript");
});

test("severitySummary counts every bucket", () => {
  const summary = severitySummary([
    finding({ severity: "critical" }),
    finding({ severity: "critical" }),
    finding({ severity: "high" }),
    finding({ severity: "info" }),
  ]);

  assert.deepEqual(summary, {
    total: 4,
    critical: 2,
    high: 1,
    medium: 0,
    low: 0,
    info: 1,
  });
  assert.deepEqual(severitySummary([]), {
    total: 0,
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    info: 0,
  });
});

test("sortFindingsBySeverity puts critical first and keeps titles stable", () => {
  const sorted = sortFindingsBySeverity([
    finding({ title: "Low thing", severity: "low" }),
    finding({ title: "B critical", severity: "critical" }),
    finding({ title: "A critical", severity: "critical" }),
    finding({ title: "Medium thing", severity: "medium" }),
  ]);

  assert.deepEqual(
    sorted.map((item) => item.title),
    ["A critical", "B critical", "Medium thing", "Low thing"],
  );
});

test("buildExecutiveSummary is factual and includes client/scope/evidence", () => {
  const summary = buildExecutiveSummary({
    findings: [
      finding({ severity: "critical", status: "confirmed" }),
      finding({ severity: "low" }),
    ],
    clientName: "Acme",
    target: "acme.example.com",
    evidenceCount: 3,
  });

  assert.match(summary, /Prepared for Acme\./);
  assert.match(summary, /Target scope: acme\.example\.com\./);
  assert.match(summary, /identified 2 finding\(s\): 1 critical, 1 low\./);
  assert.match(summary, /1 finding\(s\) are confirmed or remediated/);
  assert.match(summary, /3 evidence artefact\(s\)/);
});

test("buildExecutiveSummary handles an empty engagement", () => {
  const summary = buildExecutiveSummary({ findings: [] });
  assert.equal(summary, "No vulnerabilities were identified during this engagement.");
});

test("slugifyReportTitle produces a filesystem-safe stem", () => {
  assert.equal(slugifyReportTitle("Acme Q3 Pentest!"), "acme-q3-pentest");
  assert.equal(slugifyReportTitle("weird///name"), "weirdname");
  assert.equal(slugifyReportTitle(""), "vektorsec-report");
  assert.ok(slugifyReportTitle("x".repeat(200)).length <= 80);
});

test("reportFileName combines slug, date and extension", () => {
  assert.equal(
    reportFileName({
      title: "Acme Q3 Pentest",
      format: "html",
      date: new Date("2026-09-22T10:00:00Z"),
    }),
    "acme-q3-pentest-report-2026-09-22.html",
  );
  assert.match(
    reportFileName({ title: "x", format: "json" }),
    /-report-\d{4}-\d{2}-\d{2}\.json$/,
  );
});

test("compactEvidence drops empty items and truncates huge blobs", () => {
  const compacted = compactEvidence([
    { id: "1", sessionId: "s", type: "note", title: "ok", content: "hello", timestamp: new Date() },
    { id: "2", sessionId: "s", type: "note", title: "empty", content: "   ", timestamp: new Date() },
    { id: "3", sessionId: "s", type: "note", title: "big", content: "x".repeat(50_000), timestamp: new Date() },
  ]);

  assert.equal(compacted.length, 2);
  assert.equal(compacted[0].content, "hello");
  assert.match(compacted[1].content, /\[truncated\]$/);
  assert.ok(compacted[1].content.length < 50_000);
});
