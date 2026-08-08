import { createHash, randomUUID } from "crypto";
import { appendFileSync, mkdirSync, existsSync, readFileSync } from "fs";
import { join } from "path";

// ─── Immutable Audit Trail ──────────────────────────────────────────
// บันทึก Log ทุกคำสั่งที่ AI หรือผู้ใช้สั่งรัน พร้อม Timestamp, Target IP,
// และ User ID ในลักษณะ Read-only เพื่อใช้ตรวจสอบย้อนหลัง (Compliance/Forensics)
//
// ใช้ Merkle Chain (hash chaining) เพื่อให้แน่ใจว่า log ไม่สามารถถูกแก้ไขได้
// โดยแต่ละ entry จะมี hash ที่อ้างอิงถึง entry ก่อนหน้า

export type AuditAction =
  | "command_executed"
  | "tool_called"
  | "file_accessed"
  | "auth_login"
  | "auth_logout"
  | "auth_failed"
  | "scope_check"
  | "approval_requested"
  | "approval_granted"
  | "approval_rejected"
  | "data_exported"
  | "config_changed"
  | "user_created"
  | "user_deleted"
  | "api_key_created"
  | "api_key_revoked";

export type AuditSeverity = "info" | "warning" | "critical";

export interface AuditEntry {
  id: string;
  timestamp: string;
  action: AuditAction;
  severity: AuditSeverity;
  userId?: string;
  sessionId?: string;
  target?: string;
  command?: string;
  toolName?: string;
  details: Record<string, any>;
  ip?: string;
  // Chain integrity
  prevHash: string;
  hash: string;
}

// ─── Merkle Chain Audit Trail ───────────────────────────────────────

export class AuditTrail {
  private entries: AuditEntry[] = [];
  private chainFile: string;
  private lastHash = "GENESIS";

  constructor(chainFile?: string) {
    this.chainFile = chainFile ?? join(process.cwd(), "data", "audit-trail.jsonl");
    this.loadExistingChain();
  }

  // Load existing chain from disk (if any)
  private loadExistingChain(): void {
    try {
      if (existsSync(this.chainFile)) {
        const lines = readFileSync(this.chainFile, "utf-8").trim().split("\n");
        for (const line of lines) {
          if (!line.trim()) continue;
          const entry = JSON.parse(line) as AuditEntry;
          this.entries.push(entry);
          this.lastHash = entry.hash;
        }
      }
    } catch {
      // Corrupted or missing chain file - start fresh
      this.entries = [];
      this.lastHash = "GENESIS";
    }
  }

  // Compute hash for an entry
  private computeHash(entry: Omit<AuditEntry, "hash">): string {
    const data = JSON.stringify({
      id: entry.id,
      timestamp: entry.timestamp,
      action: entry.action,
      severity: entry.severity,
      userId: entry.userId,
      sessionId: entry.sessionId,
      target: entry.target,
      command: entry.command,
      toolName: entry.toolName,
      details: entry.details,
      ip: entry.ip,
      prevHash: entry.prevHash,
    });
    return createHash("sha256").update(data).digest("hex");
  }

  // Append a new audit entry
  log(params: {
    action: AuditAction;
    severity?: AuditSeverity;
    userId?: string;
    sessionId?: string;
    target?: string;
    command?: string;
    toolName?: string;
    details?: Record<string, any>;
    ip?: string;
  }): AuditEntry {
    const entry: Omit<AuditEntry, "hash"> = {
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      action: params.action,
      severity: params.severity ?? "info",
      userId: params.userId,
      sessionId: params.sessionId,
      target: params.target,
      command: params.command,
      toolName: params.toolName,
      details: params.details ?? {},
      ip: params.ip,
      prevHash: this.lastHash,
    };

    const hash = this.computeHash(entry);
    const fullEntry: AuditEntry = { ...entry, hash };

    this.entries.push(fullEntry);
    this.lastHash = hash;

    // Append to disk (append-only, immutable)
    try {
      mkdirSync(join(process.cwd(), "data"), { recursive: true });
      appendFileSync(this.chainFile, JSON.stringify(fullEntry) + "\n", "utf-8");
    } catch {
      // Disk write failed - keep in memory
    }

    return fullEntry;
  }

  // Verify the integrity of the entire chain
  verifyChain(): { valid: boolean; brokenAt?: number; message: string } {
    let prevHash = "GENESIS";
    for (let i = 0; i < this.entries.length; i++) {
      const entry = this.entries[i];
      if (entry.prevHash !== prevHash) {
        return {
          valid: false,
          brokenAt: i,
          message: `Chain broken at entry ${i}: prevHash mismatch`,
        };
      }
      const recomputed = this.computeHash({
        id: entry.id,
        timestamp: entry.timestamp,
        action: entry.action,
        severity: entry.severity,
        userId: entry.userId,
        sessionId: entry.sessionId,
        target: entry.target,
        command: entry.command,
        toolName: entry.toolName,
        details: entry.details,
        ip: entry.ip,
        prevHash: entry.prevHash,
      });
      if (recomputed !== entry.hash) {
        return {
          valid: false,
          brokenAt: i,
          message: `Chain broken at entry ${i}: hash mismatch (tampered)`,
        };
      }
      prevHash = entry.hash;
    }
    return { valid: true, message: "Chain integrity verified" };
  }

  // Get all entries (read-only)
  getEntries(): ReadonlyArray<AuditEntry> {
    return this.entries;
  }

  // Get entries filtered by action
  getByAction(action: AuditAction): AuditEntry[] {
    return this.entries.filter((e) => e.action === action);
  }

  // Get entries for a specific user
  getByUser(userId: string): AuditEntry[] {
    return this.entries.filter((e) => e.userId === userId);
  }

  // Get entries for a specific session
  getBySession(sessionId: string): AuditEntry[] {
    return this.entries.filter((e) => e.sessionId === sessionId);
  }

  // Get entries within a time range
  getByTimeRange(start: Date, end: Date): AuditEntry[] {
    return this.entries.filter((e) => {
      const ts = new Date(e.timestamp);
      return ts >= start && ts <= end;
    });
  }

  // Get count
  getCount(): number {
    return this.entries.length;
  }

  // Get last hash (for external verification)
  getLastHash(): string {
    return this.lastHash;
  }
}

// ─── Singleton instance ─────────────────────────────────────────────

let auditTrailInstance: AuditTrail | null = null;

export function getAuditTrail(): AuditTrail {
  if (!auditTrailInstance) {
    auditTrailInstance = new AuditTrail();
  }
  return auditTrailInstance;
}
