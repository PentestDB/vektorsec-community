export type EngagementMode = "pentest" | "ctf";

// ─── Shared types ───────────────────────────────────────────────────

export interface DiscoveredCredential {
  username: string;
  secret: string;
  secretType: "password" | "hash" | "token" | "key" | "cookie" | "other";
  source: string;
  validOn: string[];
}

export interface CreatedFile {
  path: string;
  description: string;
}

export interface AttemptedApproach {
  technique: string;
  target: string;
  result: "success" | "failed" | "partial";
  detail: string;
}

// ─── Pentest types ──────────────────────────────────────────────────

export interface DiscoveredHost {
  ip: string;
  hostname?: string;
  os?: string;
  status: "up" | "down" | "unknown";
}

export interface DiscoveredService {
  host: string;
  port: number;
  protocol: "tcp" | "udp";
  service: string;
  version?: string;
  notes?: string;
}

export interface Vulnerability {
  vulnerabilityId: string;
  fingerprint: string;
  host: string;
  service?: string;
  endpoint?: string;
  title: string;
  severity: "critical" | "high" | "medium" | "low" | "info";
  cvssScore?: number;
  cvssVector?: string;
  cwe?: string;
  evidence: string;
  stepsToReproduce: string[];
  contextSummary: string;
  impact?: string;
  remediation?: string;
  exploited: boolean;
  cve?: string;
  status: "open" | "confirmed" | "remediated" | "accepted";
  source: string;
  createdAt: Date;
  updatedAt: Date;
  /** Related vulnerabilityIds chained with this finding. */
  links?: string[];
}

export interface ActiveShell {
  shellId: string;
  host: string;
  user: string;
  privilegeLevel: "user" | "root" | "system" | "service";
  type: "reverse" | "bind" | "ssh" | "web";
  obtainedVia?: string;
}

// ─── CTF types ──────────────────────────────────────────────────────

export interface FlagAttempt {
  value: string;
  result: "correct" | "incorrect" | "already_solved" | "rate_limited";
}

export interface DistfileAnalysis {
  filename: string;
  fileType: string;
  findings: string;
}

// ─── EngagementState class ──────────────────────────────────────────

export class EngagementState {
  mode: EngagementMode;

  // Pentest fields
  phase: string = "recon";
  scope?: string;
  hosts: DiscoveredHost[] = [];
  services: DiscoveredService[] = [];
  vulnerabilities: Vulnerability[] = [];
  shells: ActiveShell[] = [];

  // CTF fields
  challengeName?: string;
  category?: string;
  points?: number;
  connectionInfo?: string;
  challengeStatus: string = "unsolved";
  confirmedFlag?: string;
  flagAttempts: FlagAttempt[] = [];
  distfiles: DistfileAnalysis[] = [];
  keyDiscoveries: string[] = [];

  // Shared fields
  credentials: DiscoveredCredential[] = [];
  files: CreatedFile[] = [];
  approachesTried: AttemptedApproach[] = [];
  nextSteps: string[] = [];

  constructor(mode: EngagementMode) {
    this.mode = mode;
  }

  toPromptBlock(): string {
    if (this.mode === "ctf") return this.renderCtfState();
    return this.renderPentestState();
  }

  isEmpty(): boolean {
    return (
      this.hosts.length === 0 &&
      this.services.length === 0 &&
      this.credentials.length === 0 &&
      this.vulnerabilities.length === 0 &&
      this.shells.length === 0 &&
      this.flagAttempts.length === 0 &&
      this.distfiles.length === 0 &&
      this.keyDiscoveries.length === 0 &&
      this.files.length === 0 &&
      this.approachesTried.length === 0 &&
      this.nextSteps.length === 0
    );
  }

  private renderPentestState(): string {
    const sections: string[] = [
      `<engagement_state type="pentest" phase="${this.phase}">`,
    ];

    if (this.hosts.length) {
      sections.push("## Hosts");
      for (const h of this.hosts) {
        const hostname = h.hostname ? ` (${h.hostname})` : "";
        const os = h.os ? ` — ${h.os}` : "";
        sections.push(`- ${h.ip}${hostname} [${h.status}]${os}`);
      }
    }

    if (this.services.length) {
      sections.push("## Services");
      for (const s of this.services) {
        const ver = s.version ? ` ${s.version}` : "";
        const notes = s.notes ? ` (${s.notes})` : "";
        sections.push(
          `- ${s.host}:${s.port}/${s.protocol} — ${s.service}${ver}${notes}`,
        );
      }
    }

    if (this.credentials.length) {
      sections.push("## Credentials");
      for (const c of this.credentials) {
        const valid =
          c.validOn.length > 0
            ? `, valid on: ${c.validOn.join(", ")}`
            : "";
        sections.push(
          `- ${c.username}:${c.secret} (${c.secretType}) — from: ${c.source}${valid}`,
        );
      }
    }

    if (this.vulnerabilities.length) {
      sections.push("## Vulnerabilities");
      for (const v of this.vulnerabilities) {
        const svc = v.service ? `:${v.service}` : "";
        const exploited = v.exploited ? "EXPLOITED" : "not yet exploited";
        const cve = v.cve ? ` (${v.cve})` : "";
        const scoring = [
          v.cvssScore != null ? `CVSS ${v.cvssScore}` : "",
          v.cwe ?? "",
        ].filter(Boolean).join(", ");
        sections.push(
          `- [${v.severity.toUpperCase()}] ${v.title} on ${v.host}${svc} — ${exploited}${cve}${scoring ? ` — ${scoring}` : ""}`,
        );
        if (v.contextSummary) sections.push(`  Context: ${v.contextSummary}`);
        if (v.links?.length) {
          sections.push(`  Chained with: ${v.links.join(", ")}`);
        }
      }
    }

    if (this.shells.length) {
      sections.push("## Active Shells");
      for (const s of this.shells) {
        const via = s.obtainedVia ? ` (${s.obtainedVia})` : "";
        sections.push(
          `- ${s.shellId}: ${s.user}@${s.host} [${s.privilegeLevel}] via ${s.type}${via}`,
        );
      }
    }

    this.renderShared(sections);
    sections.push("</engagement_state>");
    return sections.join("\n");
  }

  private renderCtfState(): string {
    const sections: string[] = [
      `<engagement_state type="ctf" status="${this.challengeStatus}">`,
      `Challenge: ${this.challengeName ?? "unknown"} | Category: ${this.category ?? "?"} | Points: ${this.points ?? "?"}`,
    ];

    if (this.confirmedFlag) {
      sections.push(`CONFIRMED FLAG: ${this.confirmedFlag}`);
    }

    if (this.flagAttempts.length) {
      sections.push("## Flag Attempts");
      for (const f of this.flagAttempts) {
        sections.push(`- "${f.value}" → ${f.result}`);
      }
    }

    if (this.distfiles.length) {
      sections.push("## Distfile Analysis");
      for (const d of this.distfiles) {
        sections.push(`- ${d.filename} (${d.fileType}): ${d.findings}`);
      }
    }

    if (this.keyDiscoveries.length) {
      sections.push("## Key Discoveries");
      for (const kd of this.keyDiscoveries) {
        sections.push(`- ${kd}`);
      }
    }

    if (this.credentials.length) {
      sections.push("## Credentials Found");
      for (const c of this.credentials) {
        sections.push(
          `- ${c.username}:${c.secret} (${c.secretType}) — from: ${c.source}`,
        );
      }
    }

    this.renderShared(sections);
    sections.push("</engagement_state>");
    return sections.join("\n");
  }

  private renderShared(sections: string[]): void {
    if (this.files.length) {
      sections.push("## Files Created");
      for (const f of this.files) {
        sections.push(`- ${f.path}: ${f.description}`);
      }
    }

    if (this.approachesTried.length) {
      sections.push("## Approaches Tried");
      for (const a of this.approachesTried) {
        sections.push(
          `- [${a.result.toUpperCase()}] ${a.technique} → ${a.target}: ${a.detail}`,
        );
      }
    }

    if (this.nextSteps.length) {
      sections.push("## Next Steps");
      for (const n of this.nextSteps) {
        sections.push(`- ${n}`);
      }
    }
  }
}
