import { ToolDefinition } from "../types";

const getSolveStatus: ToolDefinition = {
  name: "get_solve_status",
  allowedRoles: ["orchestrator"],
  description:
    "Check the current status of all racer agents. Returns each racer's model name, " +
    "current iteration, status (running/completed/failed/cancelled), and last finding.",
  parameters: {
    type: "object",
    properties: {},
  },
  timeoutMs: 10_000,
  async execute(_args, ctx) {
    if (!ctx.getSwarmStatus) {
      return { output: "No active racer swarms.", exitCode: 1 };
    }
    const status = ctx.getSwarmStatus();
    if (!status || status.length === 0) {
      return { output: "No active racers found.", exitCode: 0 };
    }
    const lines = status.map((r: any) => {
      let line = `- **${r.modelLabel}** (${r.agentId}): ${r.status} | iteration ${r.iteration}`;
      if (r.lastFinding) line += `\n  Last finding: ${r.lastFinding.slice(0, 200)}`;
      if (r.status === "running" && r.iteration < 5) {
        line += `\n  → Still early. Let this racer work independently.`;
      } else if (r.status === "running" && r.iteration >= 8 && !r.lastFinding) {
        line += `\n  → High iteration, no findings. Consider reading trace and bumping.`;
      }
      return line;
    });
    return { output: `**Racer Status:**\n${lines.join("\n")}`, exitCode: 0 };
  },
};

export default getSolveStatus;
