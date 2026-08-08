import { v4 as uuidv4 } from "uuid";

// ─── Human-in-the-loop (HITL) Policy ────────────────────────────────
// Safe Mode: AI ช่วยวิเคราะห์ และรันเฉพาะ Passive Recon อัตโนมัติ
// Active Mode: เมื่อจะรัน Exploit หรือคำสั่งที่มีความเสี่ยงสูง
//              ต้องมีปุ่ม Confirm ให้ผู้ใช้กดยืนยันก่อนเสมอ

export type OperationMode = "safe" | "active";

export type RiskLevel = "low" | "medium" | "high" | "critical";

export interface HITLConfig {
  mode: OperationMode;
  // เมื่อ true จะต้อง confirm ทุกคำสั่ง (แม้แต่ passive)
  requireConfirmForAll: boolean;
  // ระดับความเสี่ยงที่ต้อง confirm (ใน active mode)
  confirmThreshold: RiskLevel;
  // รายการคำสั่งที่ถือว่า passive (รันอัตโนมัติได้ใน safe mode)
  passiveCommands: string[];
  // รายการคำสั่งที่ถือว่า active (ต้อง confirm เสมอ)
  activeCommands: string[];
  // timeout สำหรับรอ confirm (ms) — ถ้าเกินจะยกเลิก
  confirmTimeoutMs: number;
}

export interface PendingApproval {
  approvalId: string;
  sessionId: string;
  command: string;
  riskLevel: RiskLevel;
  reason: string;
  createdAt: Date;
  expiresAt: Date;
  status: "pending" | "approved" | "rejected" | "expired";
  approvedBy?: string;
  approvedAt?: Date;
}

export interface CommandRiskAssessment {
  riskLevel: RiskLevel;
  requiresApproval: boolean;
  reason: string;
  category: "passive" | "active" | "dangerous" | "unknown";
}

// ─── Default config ─────────────────────────────────────────────────

export function createDefaultHITLConfig(): HITLConfig {
  return {
    mode: "safe",
    requireConfirmForAll: false,
    confirmThreshold: "medium",
    passiveCommands: [
      "nmap -sP", "nmap -sn", "ping", "whois", "dig", "nslookup",
      "curl -I", "curl -s -o /dev/null", "wget --spider",
      "dnsrecon", "subfinder", "amass enum -passive",
      "whatweb", "wappalyzer", "httpx", "nuclei -l",
      "gobuster dir", "ffuf -w", "dirsearch",
      "sslscan", "testssl", "openssl s_client",
      "nikto", "enum4linux", "smbclient -L",
    ],
    activeCommands: [
      "msfconsole", "msfvenom", "exploit", "metasploit",
      "sqlmap", "hydra", "john", "hashcat", "medusa",
      "nc -e", "ncat -e", "bash -i", "python -c",
      "reverse shell", "bind shell", "meterpreter",
      "wpscan --enumerate", "searchsploit -m",
      "curl -X POST", "curl --data", "curl -d",
      "sql injection", "xss", "command injection",
      "upload", "webshell", "backdoor",
    ],
    confirmTimeoutMs: 60000,
  };
}

// ─── Risk assessment ────────────────────────────────────────────────

export function assessCommandRisk(
  command: string,
  config: HITLConfig = createDefaultHITLConfig(),
): CommandRiskAssessment {
  const cmd = command.toLowerCase();

  // Check for dangerous system commands first
  if (
    /\brm\s+-rf\s+\//.test(cmd) ||
    /\bdd\b.*\bof=\/dev\//.test(cmd) ||
    /\bmkfs\b/.test(cmd) ||
    /\bshutdown\b|\bpoweroff\b|\breboot\b/.test(cmd)
  ) {
    return {
      riskLevel: "critical",
      requiresApproval: true,
      reason: "Dangerous system command detected",
      category: "dangerous",
    };
  }

  // Check for active commands
  const isActive = config.activeCommands.some((ac) => cmd.includes(ac));
  if (isActive) {
    return {
      riskLevel: "high",
      requiresApproval: true,
      reason: "Active exploitation command detected",
      category: "active",
    };
  }

  // Check for passive commands
  const isPassive = config.passiveCommands.some((pc) => cmd.includes(pc));
  if (isPassive) {
    return {
      riskLevel: "low",
      requiresApproval: config.requireConfirmForAll,
      reason: "Passive reconnaissance command",
      category: "passive",
    };
  }

  // Unknown command — assess based on mode
  if (config.mode === "safe") {
    return {
      riskLevel: "medium",
      requiresApproval: true,
      reason: "Unknown command in safe mode — requires approval",
      category: "unknown",
    };
  }

  return {
    riskLevel: "low",
    requiresApproval: false,
    reason: "Unknown command in active mode",
    category: "unknown",
  };
}

// ─── HITL Manager ───────────────────────────────────────────────────

export class HITLManager {
  private pendingApprovals: Map<string, PendingApproval> = new Map();
  private config: HITLConfig;

  constructor(config: HITLConfig = createDefaultHITLConfig()) {
    this.config = config;
  }

  setMode(mode: OperationMode): void {
    this.config.mode = mode;
  }

  getMode(): OperationMode {
    return this.config.mode;
  }

  getConfig(): HITLConfig {
    return this.config;
  }

  updateConfig(updates: Partial<HITLConfig>): void {
    this.config = { ...this.config, ...updates };
  }

  // ตรวจสอบว่าคำสั่งต้องขอ approval หรือไม่
  shouldRequestApproval(command: string): CommandRiskAssessment {
    const assessment = assessCommandRisk(command, this.config);

    // In safe mode, everything except passive requires approval
    if (this.config.mode === "safe" && assessment.category !== "passive") {
      assessment.requiresApproval = true;
      assessment.reason = "Safe mode: non-passive command requires approval";
    }

    // In active mode, only commands above threshold require approval
    if (this.config.mode === "active") {
      const riskOrder: RiskLevel[] = ["low", "medium", "high", "critical"];
      const thresholdIdx = riskOrder.indexOf(this.config.confirmThreshold);
      const riskIdx = riskOrder.indexOf(assessment.riskLevel);
      assessment.requiresApproval = riskIdx >= thresholdIdx;
    }

    return assessment;
  }

  // สร้าง pending approval
  requestApproval(
    sessionId: string,
    command: string,
    assessment: CommandRiskAssessment,
  ): PendingApproval {
    const now = new Date();
    const approval: PendingApproval = {
      approvalId: uuidv4(),
      sessionId,
      command,
      riskLevel: assessment.riskLevel,
      reason: assessment.reason,
      createdAt: now,
      expiresAt: new Date(now.getTime() + this.config.confirmTimeoutMs),
      status: "pending",
    };
    this.pendingApprovals.set(approval.approvalId, approval);
    return approval;
  }

  // ผู้ใช้กด approve
  approve(approvalId: string, userId: string): PendingApproval | null {
    const approval = this.pendingApprovals.get(approvalId);
    if (!approval || approval.status !== "pending") return null;
    if (approval.expiresAt < new Date()) {
      approval.status = "expired";
      return approval;
    }
    approval.status = "approved";
    approval.approvedBy = userId;
    approval.approvedAt = new Date();
    return approval;
  }

  // ผู้ใช้กด reject
  reject(approvalId: string, userId: string): PendingApproval | null {
    const approval = this.pendingApprovals.get(approvalId);
    if (!approval || approval.status !== "pending") return null;
    approval.status = "rejected";
    approval.approvedBy = userId;
    approval.approvedAt = new Date();
    return approval;
  }

  // ตรวจสอบว่า approval ยัง valid หรือไม่
  isApproved(approvalId: string): boolean {
    const approval = this.pendingApprovals.get(approvalId);
    if (!approval) return false;
    if (approval.status === "approved" && approval.expiresAt >= new Date()) {
      return true;
    }
    if (approval.expiresAt < new Date() && approval.status === "pending") {
      approval.status = "expired";
    }
    return false;
  }

  // ล้าง approvals ที่หมดอายุ
  cleanupExpired(): void {
    const now = new Date();
    for (const [id, approval] of this.pendingApprovals) {
      if (approval.expiresAt < now && approval.status === "pending") {
        approval.status = "expired";
      }
    }
  }

  getPendingApprovals(sessionId?: string): PendingApproval[] {
    this.cleanupExpired();
    const all = [...this.pendingApprovals.values()];
    if (sessionId) {
      return all.filter((a) => a.sessionId === sessionId && a.status === "pending");
    }
    return all.filter((a) => a.status === "pending");
  }
}

// ─── Singleton instance ─────────────────────────────────────────────

let hitlManagerInstance: HITLManager | null = null;

export function getHITLManager(): HITLManager {
  if (!hitlManagerInstance) {
    hitlManagerInstance = new HITLManager();
  }
  return hitlManagerInstance;
}
