import { ToolDefinition } from "../types";

const waitForRacers: ToolDefinition = {
  name: "wait",
  allowedRoles: ["orchestrator"],
  description:
    "Wait for a specified number of seconds before continuing. Use this between " +
    "status checks to give racers time to make progress. Minimum 10 seconds, max 60 seconds. " +
    "Prefer 20-30 second waits to avoid wasting orchestrator iterations.",
  parameters: {
    type: "object",
    properties: {
      seconds: {
        type: "number",
        description: "Number of seconds to wait (10-60, prefer 20-30)",
      },
    },
    required: ["seconds"],
  },
  timeoutMs: 70_000,
  async execute(args, ctx) {
    const seconds = Math.max(10, Math.min(60, args.seconds ?? 20));
    if (ctx.waitForRacers) {
      await ctx.waitForRacers(seconds);
    } else {
      await new Promise((resolve) => setTimeout(resolve, seconds * 1000));
    }
    if (ctx.getSwarmStatus) {
      const status = ctx.getSwarmStatus();
      if (status && status.length > 0) {
        const lines = status.map((r: any) =>
          `- ${r.modelLabel} (${r.agentId}): ${r.status} | iter ${r.iteration}`,
        );
        return { output: `Waited ${seconds}s. Current status:\n${lines.join("\n")}`, exitCode: 0 };
      }
    }
    return { output: `Waited ${seconds}s. No active racers.`, exitCode: 0 };
  },
};

export default waitForRacers;
