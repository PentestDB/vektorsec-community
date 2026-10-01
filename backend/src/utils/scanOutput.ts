/**
 * Structured output helpers for the scanner tool handlers.
 *
 * Security scanners (nmap/naabu/ffuf/gobuster/nuclei) print raw, human-oriented
 * text/JSONL. These helpers normalise that output into a compact JSON shape the
 * agent can reason over directly (hosts, ports, URLs, vulnerabilities) plus a
 * deterministic exposure/risk score so the agent can write an accurate risk
 * assessment & vulnerability summary without re-reading megabytes of logs.
 */

export type ScanResultKind =
  | "ports"
  | "web_fuzz"
  | "subdomains"
  | "vulnerabilities";

export type RiskLevel = "info" | "low" | "medium" | "high" | "critical";

export interface PortFinding {
  host: string;
  port: number;
  protocol: "tcp" | "udp";
  state: string;
  service: string;
  version?: string;
}

export interface FuzzFinding {
  url: string;
  status?: number;
  length?: number;
  words?: number;
  lines?: number;
  redirectTo?: string;
}

export interface SubdomainFinding {
  subdomain: string;
  ips?: string[];
}

export interface NucleiFinding {
  templateId: string;
  templateName?: string;
  severity: RiskLevel;
  url?: string;
  type?: string;
  matcherName?: string;
  description?: string;
  tags?: string[];
}

export interface ScanRisk {
  score: number; // 0..10
  level: RiskLevel;
  label: string;
}

export interface StructuredScanResult {
  tool: string;
  engine: string;
  target?: string;
  scanKind: ScanResultKind;
  scannedAt: string;
  counts: Record<string, number | string>;
  risk: ScanRisk;
  summary: string;
  findings: PortFinding[] | FuzzFinding[] | SubdomainFinding[] | NucleiFinding[];
  rawPreview?: string;
}

// ─── Nmap ─────────────────────────────────────────────────────────────

const NMAP_PORT_RE = /^\s*(\d+)\/(tcp|udp)\s+(\w+)\s+(\S+)(?:\s+(.*?))?\s*$/;

export function parseNmapOutput(text: string): PortFinding[] {
  const lines = text.split("\n");
  const findings: PortFinding[] = [];
  let currentHost: string | null = null;

  for (const line of lines) {
    const hostMatch = line.match(/Nmap scan report for ([^\s(]+)(?:\s+\(([\d.]+)\))?/);
    if (hostMatch) {
      currentHost = hostMatch[1] ?? hostMatch[2];
      continue;
    }
    if (
      /^$|Nmap done|Starting Nmap|Host is up|PORT\s+STATE|Interesting ports|Not shown:/.test(line)
    ) {
      continue;
    }
    if (currentHost) {
      const p = line.match(NMAP_PORT_RE);
      if (p) {
        const version = p[5]?.trim();
        const service = (p[4] || "unknown").trim();
        findings.push({
          host: currentHost,
          port: parseInt(p[1], 10),
          protocol: p[2] as "tcp" | "udp",
          state: p[3].toLowerCase(),
          service,
          version: version && version !== service ? version : undefined,
        });
      }
    }
  }
  return findings.filter(
    (f) => f.state === "open" || f.state === "open|filtered",
  );
}

// ─── Naabu ────────────────────────────────────────────────────────────

export function parseNaabuOutput(text: string): PortFinding[] {
  const findings: PortFinding[] = [];
  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;

    // JSON line mode: {"host":"…","port":443,"protocol":"tcp"}
    if (line.startsWith("{")) {
      try {
        const obj = JSON.parse(line);
        const host = obj.host ?? obj.ip;
        const port = Number(obj.port);
        if (host && Number.isInteger(port) && port > 0) {
          findings.push({
            host,
            port,
            protocol: obj.protocol === "udp" ? "udp" : "tcp",
            state: "open",
            service: "",
          });
        }
        continue;
      } catch {
        // not JSON — fall through to host:port matching
      }
    }

    const m = line.match(/^([^\s:]+):(\d+)\s*$/);
    if (m) {
      const host = m[1];
      const port = parseInt(m[2], 10);
      findings.push({ host, port, protocol: "tcp", state: "open", service: "" });
    }
  }
  return dedupePorts(findings);
}

function dedupePorts(findings: PortFinding[]): PortFinding[] {
  const seen = new Set<string>();
  const out: PortFinding[] = [];
  for (const f of findings) {
    const key = `${f.host}:${f.port}/${f.protocol}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(f);
  }
  return out;
}


// ─── FFUF (JSON mode) ─────────────────────────────────────────────────

export interface FfufRawResult {
  input?: Record<string, string>;
  status?: number;
  length?: number;
  words?: number;
  lines?: number;
  url?: string;
  redirectlocation?: string;
}

export function parseFfufOutput(stdout: string): FuzzFinding[] {
  let parsed: { results?: FfufRawResult[] } | null = null;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    return []; // Not JSON — nothing structured to salvage.
  }
  const out: FuzzFinding[] = [];
  for (const r of parsed?.results ?? []) {
    out.push({
      url: r.url ?? "",
      status: r.status,
      length: r.length,
      words: r.words,
      lines: r.lines,
      redirectTo: r.redirectlocation,
    });
  }
  return out.filter((f) => f.url);
}

// ─── Gobuster (dir / dns text) ────────────────────────────────────────

const GOBUSTER_DIR_RE =
  /^\/?([^\s]+)\s+\(Status:\s*(\d{3})\)\s*\[Size:\s*(\d+)\](?:\s*\[-->\s*(\S+)\])?/;
const GOBUSTER_FOUND_RE = /^Found:\s*(\S+)/;

export function parseGobusterDirOutput(text: string, baseUrl?: string): FuzzFinding[] {
  const findings: FuzzFinding[] = [];
  for (const line of text.split("\n")) {
    const m = line.match(GOBUSTER_DIR_RE);
    if (m) {
      const path = m[1].startsWith("/") ? m[1] : `/${m[1]}`;
      findings.push({
        url: baseUrl ? `${baseUrl.replace(/\/$/, "")}${path}` : path,
        status: parseInt(m[2], 10),
        length: parseInt(m[3], 10),
        redirectTo: m[4],
      });
    }
  }
  return findings;
}

export function parseGobusterDnsOutput(text: string): SubdomainFinding[] {
  const findings: SubdomainFinding[] = [];
  for (const line of text.split("\n")) {
    const m = line.match(GOBUSTER_FOUND_RE);
    if (m) {
      findings.push({ subdomain: m[1].replace(/\.$/, "") });
    }
  }
  return dedupeSubdomains(findings);
}

function dedupeSubdomains(findings: SubdomainFinding[]): SubdomainFinding[] {
  const seen = new Set<string>();
  const out: SubdomainFinding[] = [];
  for (const f of findings) {
    if (seen.has(f.subdomain)) continue;
    seen.add(f.subdomain);
    out.push(f);
  }
  return out;
}

// ─── Nuclei (JSONL preferred, text fallback) ──────────────────────────

const SEVERITY_ORDER: RiskLevel[] = ["info", "low", "medium", "high", "critical"];
const SEVERITY_WEIGHT: Record<RiskLevel, number> = {
  info: 1,
  low: 2,
  medium: 4,
  high: 7,
  critical: 10,
};

function normalizeSeverity(value: unknown): RiskLevel {
  const v = String(value ?? "").toLowerCase();
  if ((SEVERITY_ORDER as string[]).includes(v)) return v as RiskLevel;
  if (v.includes("crit")) return "critical";
  if (v.includes("high")) return "high";
  if (v.includes("medium")) return "medium";
  if (v.includes("low")) return "low";
  return "info";
}

export function parseNucleiOutput(stdout: string): NucleiFinding[] {
  const findings: NucleiFinding[] = [];

  for (const rawLine of stdout.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;

    if (line.startsWith("{")) {
      try {
        const obj = JSON.parse(line);
        if (obj.templateID || obj.template_id) {
          findings.push({
            templateId: obj.templateID ?? obj.template_id,
            templateName: obj.info?.name,
            severity: normalizeSeverity(obj.info?.severity),
            url: obj.matched_at ?? obj.matched ?? obj.host,
            type: obj.type,
            matcherName: obj.matcher_name,
            description: obj.info?.description,
            tags: Array.isArray(obj.info?.tags) ? obj.info.tags : undefined,
          });
        }
        continue;
      } catch {
        // Not JSON — try text parsing below.
      }
    }

    // Text format examples:
    //   [INF] [http-missing-security-headers] https://host/ [headers...]
    //   [2023-…] [high] [http] https://host [CVE-…]
    const textMatch =
      line.match(/\[([^\]]+)\]\s*\[(?:([^\]]+)\]\s*)?\[?([^\]]+)\]?\s+(\S+)/);
    if (textMatch) {
      const severityToken = textMatch[2] ?? textMatch[1] ?? "";
      const templateToken = textMatch[1];
      const urlToken = textMatch[4];
      if (urlToken && (urlToken.startsWith("http") || urlToken.includes("://"))) {
        findings.push({
          templateId: templateToken ?? "unknown",
          severity: normalizeSeverity(severityToken),
          url: urlToken,
        });
      }
    }
  }

  return dedupeNuclei(findings);
}

function dedupeNuclei(findings: NucleiFinding[]): NucleiFinding[] {
  const seen = new Set<string>();
  const out: NucleiFinding[] = [];
  for (const f of findings) {
    const key = `${f.templateId}|${f.url ?? ""}|${f.severity}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(f);
  }
  return out;
}

// ─── Risk scoring + summary ───────────────────────────────────────────

const HIGH_RISK_SERVICES: Record<string, number> = {
  telnet: 3,
  ftp: 2,
  "netbios-ssn": 2,
  microsoft: 3,
  "ms-wbt-server": 3,
  smtp: 1,
  pop3: 1,
  imap: 1,
  mysql: 2,
  postgresql: 2,
  "ms-sql-s": 3,
  redis: 3,
  mongod: 3,
  oracle: 3,
  ssh: 1,
  http: 1,
  https: 1,
};

export function scorePorts(findings: PortFinding[]): ScanRisk {
  if (findings.length === 0) {
    return { score: 0, level: "info", label: "No open ports detected" };
  }
  let score = 1;
  const hosts = new Set(findings.map((f) => f.host));
  const services = new Set(findings.map((f) => f.service.toLowerCase()));
  for (const svc of services) {
    score += HIGH_RISK_SERVICES[svc] ?? 1;
  }
  if (hosts.size > 1) score += Math.min(2, hosts.size - 1);
  score = Math.min(10, score);
  return levelFromScore(
    score,
    `${findings.length} open port(s) on ${hosts.size} host(s)`,
  );
}

export function scoreWebFuzz(findings: FuzzFinding[]): ScanRisk {
  if (findings.length === 0) {
    return { score: 0, level: "info", label: "No matching paths discovered" };
  }
  let score = 2;
  const paths = findings.map((f) => f.url.toLowerCase());
  const sensitive =
    /(admin|login|api|debug|backup|config|\.git|\.env|upload|console|swagger|graphql|\.sql|\.bak)/;
  if (paths.some((p) => sensitive.test(p))) score += 2;
  if (findings.some((f) => f.status === 200)) score += 1;
  if (findings.length > 25) score += 2;
  else if (findings.length > 10) score += 1;
  return levelFromScore(
    Math.min(10, score),
    `${findings.length} discovered URL(s)/path(s)`,
  );
}

export function scoreSubdomains(findings: SubdomainFinding[]): ScanRisk {
  if (findings.length === 0) {
    return { score: 0, level: "info", label: "No subdomains found" };
  }
  return levelFromScore(
    Math.min(8, 2 + findings.length),
    `${findings.length} subdomain(s) discovered`,
  );
}

export function scoreNuclei(findings: NucleiFinding[]): ScanRisk {
  if (findings.length === 0) {
    return { score: 0, level: "info", label: "No vulnerabilities matched" };
  }
  const max = Math.max(...findings.map((f) => SEVERITY_WEIGHT[f.severity] ?? 1));
  const criticalCount = findings.filter((f) => f.severity === "critical").length;
  const highCount = findings.filter((f) => f.severity === "high").length;
  let score = max;
  if (criticalCount > 0) score += Math.min(3, criticalCount);
  else if (highCount > 1) score += Math.min(2, highCount - 1);
  score = Math.min(10, score);
  return levelFromScore(score, `Nuclei matched ${findings.length} issue(s)`);
}

function levelFromScore(score: number, label: string): ScanRisk {
  const clamped = Math.max(0, Math.min(10, score));
  const level: RiskLevel =
    clamped >= 8
      ? "critical"
      : clamped >= 6
        ? "high"
        : clamped >= 3
          ? "medium"
          : clamped >= 1
            ? "low"
            : "info";
  return { score: clamped, level, label };
}

// ─── Result builder ───────────────────────────────────────────────────

export function buildStructuredScanResult(params: {
  tool: string;
  engine: string;
  target?: string;
  scanKind: ScanResultKind;
  findings: PortFinding[] | FuzzFinding[] | SubdomainFinding[] | NucleiFinding[];
  rawText?: string;
  extraCounts?: Record<string, number | string>;
}): StructuredScanResult {
  const { tool, engine, target, scanKind, rawText, extraCounts } = params;
  const findings = params.findings;
  const risk = computeRisk(scanKind, findings);

  const counts: Record<string, number | string> = { ...(extraCounts ?? {}) };
  if (scanKind === "ports") {
    const ports = findings as PortFinding[];
    counts.openPorts = ports.length;
    counts.hosts = new Set(ports.map((p) => p.host)).size;
  } else if (scanKind === "web_fuzz") {
    counts.paths = (findings as FuzzFinding[]).length;
  } else if (scanKind === "subdomains") {
    counts.subdomains = (findings as SubdomainFinding[]).length;
  } else {
    const nuclei = findings as NucleiFinding[];
    counts.vulnerabilities = nuclei.length;
    const bySev: Record<RiskLevel, number> = {
      info: 0, low: 0, medium: 0, high: 0, critical: 0,
    };
    for (const f of nuclei) bySev[f.severity] += 1;
    for (const s of ["info", "low", "medium", "high", "critical"] as RiskLevel[]) {
      counts[`severity_${s}`] = bySev[s];
    }
  }

  return {
    tool,
    engine,
    target,
    scanKind,
    scannedAt: new Date().toISOString(),
    counts,
    risk,
    summary: risk.label,
    findings,
    rawPreview: rawText ? truncate(rawText, 6000) : undefined,
  };
}

function computeRisk(
  kind: ScanResultKind,
  findings: PortFinding[] | FuzzFinding[] | SubdomainFinding[] | NucleiFinding[],
): ScanRisk {
  switch (kind) {
    case "ports":
      return scorePorts(findings as PortFinding[]);
    case "web_fuzz":
      return scoreWebFuzz(findings as FuzzFinding[]);
    case "subdomains":
      return scoreSubdomains(findings as SubdomainFinding[]);
    case "vulnerabilities":
      return scoreNuclei(findings as NucleiFinding[]);
  }
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}\n...[truncated ${text.length - max} chars]`;
}

