import { ToolDefinition } from "../types";
import { getAuditTrail, AuditAction, AuditSeverity } from "../../services/auditTrail";

// ─── Audit Log Tool ─────────────────────────────────────────────────
// บันทึกเหตุการณ์สำคัญลงใน Immutable Audit Trail (Merkle Chain)
// เพื่อใช้ตรวจสอบย้อนหลัง (Compliance/Forensics)

const auditLog: ToolDefinition = {
  name: "audit_log",
  allowedRoles: ["orchestrator", "swarm_agent"],
  description:
    "Record an important event in the immutable audit trail. " +
    "Use this to log security-relevant actions like command executions, " +
    "data exports, or configuration changes. The audit trail uses hash chaining " +
    "so entries cannot be tampered with.",
  parameters: {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: [
          "command_executed", "tool_called", "file_accessed",
          "auth_login", "auth_logout", "auth_failed",
          "scope_check", "approval_requested", "approval_granted", "approval_rejected",
          "data_exported", "config_changed",
          "user_created", "user_deleted",
          "api_key_created", "api_key_revoked",
        ],
        description: "The type of event to log",
      },
      severity: {
        type: "string",
        enum: ["info", "warning", "critical"],
        description: "Severity level",
      },
      target: {
        type: "string",
        description: "The target IP/domain involved",
      },
      command: {
        type: "string",
        description: "The command that was executed",
      },
      details: {
        type: "object",
        description: "Additional details about the event",
      },
    },
    required: ["action"],
  },
  timeoutMs: 10_000,
  async execute(args, ctx) {
    const { action, severity, target, command, details } = args;

    if (!action) {
      return { output: "Error: action is required", exitCode: 1 };
    }

    const audit = getAuditTrail();

    const entry = audit.log({
      action: action as AuditAction,
      severity: (severity as AuditSeverity) ?? "info",
      userId: ctx.agentId,
      sessionId: ctx.sessionId,
      target,
      command,
      details: details ?? {},
    });

    return {
      output: [
        `Audit entry recorded:`,
        `  ID: ${entry.id}`,
        `  Action: ${entry.action}`,
        `  Severity: ${entry.severity}`,
        `  Timestamp: ${entry.timestamp}`,
        `  Hash: ${entry.hash.slice(0, 16)}...`,
        ``,
        `Chain integrity: ${audit.verifyChain().valid ? "VERIFIED" : "BROKEN"}`,
      ].join("\n"),
      exitCode: 0,
    };
  },
};

export default auditLog;
