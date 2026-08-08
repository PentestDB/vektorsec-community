import { ToolDefinition } from "../types";
import { getHITLManager } from "../../services/hitlPolicy";

const approveCommand: ToolDefinition = {
  name: "approve_command",
  allowedRoles: ["orchestrator"],
  description:
    "Approve or reject a pending command approval request. " +
    "Use this after the user has reviewed a command that was flagged for approval. " +
    "The user must explicitly approve before the command can be executed.",
  parameters: {
    type: "object",
    properties: {
      approval_id: {
        type: "string",
        description: "The approval ID from the request_approval tool",
      },
      decision: {
        type: "string",
        enum: ["approve", "reject"],
        description: "Whether to approve or reject the command",
      },
    },
    required: ["approval_id", "decision"],
  },
  timeoutMs: 10_000,
  async execute(args, ctx) {
    const { approval_id, decision } = args;

    if (!approval_id || !decision) {
      return { output: "Error: approval_id and decision are required", exitCode: 1 };
    }

    const hitl = getHITLManager();
    const userId = ctx.agentId ?? "unknown";

    if (decision === "approve") {
      const approval = hitl.approve(approval_id, userId);
      if (!approval) {
        return {
          output: `Error: approval '${approval_id}' not found or already resolved`,
          exitCode: 1,
        };
      }
      if (approval.status === "expired") {
        return {
          output: `Approval '${approval_id}' has expired. Please request a new approval.`,
          exitCode: 1,
        };
      }
      return {
        output: `APPROVED: ${approval.command}\n\nYou may now execute this command.`,
        exitCode: 0,
      };
    }

    if (decision === "reject") {
      const approval = hitl.reject(approval_id, userId);
      if (!approval) {
        return {
          output: `Error: approval '${approval_id}' not found or already resolved`,
          exitCode: 1,
        };
      }
      return {
        output: `REJECTED: ${approval.command}\n\nThis command will NOT be executed.`,
        exitCode: 0,
      };
    }

    return { output: `Error: unknown decision '${decision}'`, exitCode: 1 };
  },
};

export default approveCommand;
