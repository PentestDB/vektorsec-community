import { ToolDefinition } from "../types";

const reportFinding: ToolDefinition = {
  name: "report_finding",
  allowedRoles: ["swarm_agent"],
  description:
    "Report a finding to the swarm so sibling agents can see it. Use this whenever you " +
    "discover something useful (a vulnerability, credential, open port, interesting file, etc.). " +
    "Set is_success to true if you believe you have fully achieved the swarm's objective " +
    "(e.g. found the flag, got a shell). This will signal the swarm to stop other agents.",
  parameters: {
    type: "object",
    properties: {
      finding: {
        type: "string",
        description: "Description of what you found",
      },
      is_success: {
        type: "boolean",
        description: "Set to true if this finding represents achieving the swarm's goal",
      },
    },
    required: ["finding"],
  },
  timeoutMs: 10_000,
  async execute(args, ctx) {
    const { finding, is_success } = args;
    if (!finding) return { output: "Error: finding is required", exitCode: 1 };

    if (!ctx.reportFinding) {
      return { output: "report_finding is only available inside a swarm.", exitCode: 1 };
    }

    ctx.reportFinding(finding, is_success ?? false);
    return {
      output: `Finding reported${is_success ? " (marked as success)" : ""}.\n\n${finding}`,
      exitCode: 0,
    };
  },
};

export default reportFinding;
