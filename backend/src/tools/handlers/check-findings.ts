import { ToolDefinition } from "../types";

const checkFindings: ToolDefinition = {
  name: "check_findings",
  allowedRoles: ["main", "swarm_agent"],
  description:
    "Check for new findings from racer agents running in parallel. Call this periodically " +
    "to see if any racer has discovered something useful. Returns unread findings since your last check.",
  parameters: {
    type: "object",
    properties: {},
  },
  timeoutMs: 10_000,
  async execute(_args, ctx) {
    if (!ctx.checkFindings) {
      return { output: "check_findings is only available inside a swarm.", exitCode: 1 };
    }

    const result = ctx.checkFindings();
    return { output: result, exitCode: 0 };
  },
};

export default checkFindings;
