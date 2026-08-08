import { ToolDefinition } from "../types";
import { getHITLManager } from "../../services/hitlPolicy";

const requestApproval: ToolDefinition = {
  name: "request_approval",
  allowedRoles: ["orchestrator", "swarm_agent"],
  description:
    "Request user approval before executing a high-risk command. " +
    "Use this when you need to run an exploit, brute-force, or other potentially " +
    "dangerous command. The user must approve before the command can proceed.",
  parameters: {
    type: "object",
    properties: {
      command: {
        type: "string",
        description: "The command that needs approval",
      },
      reason: {
        type: "string",
        description: "Why this command needs approval",
      },
    },
    required: ["command"],
  },
  timeoutMs: 10_000,
  async execute(args, ctx) {
    const { command, reason } = args;

    if (!command) {
      return { output: "Error: command is required", exitCode: 1 };
    }

    const hitl = getHITLManager();
    const assessment = hitl.shouldRequestApproval(command);

    if (!assessment.requiresApproval) {
      return {
        output: `NO APPROVAL NEEDED: ${command}\n\n${assessment.reason}`,
        exitCode: 0,
      };
    }

    const approval = hitl.requestApproval(
      ctx.sessionId ?? "unknown",
      command,
      assessment,
    );

    return {
      output: [
        `APPROVAL REQUIRED for command: ${command}`,
        `Approval ID: ${approval.approvalId}`,
        `Risk level: ${assessment.riskLevel}`,
        `Reason: ${assessment.reason}`,
        reason ? `Additional context: ${reason}` : "",
        "",
        "Please ask the user to approve or reject this command.",
        `Approval expires at: ${approval.expiresAt.toISOString()}`,
      ].join("\n"),
      exitCode: 2,
    };
  },
};

export default requestApproval;
