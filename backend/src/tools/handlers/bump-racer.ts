import { ToolDefinition } from "../types";

const bumpRacer: ToolDefinition = {
  name: "bump_racer",
  allowedRoles: ["orchestrator"],
  description:
    "Send targeted coaching or hints to a specific racer agent. The insights will be " +
    "injected into the racer's context at its next iteration. ONLY use when a racer " +
    "is stuck (iteration >= 8 with no progress). Always read_racer_trace FIRST before bumping. " +
    "Do NOT bump racers that are actively progressing or on early iterations (< 5).",
  parameters: {
    type: "object",
    properties: {
      racer_id: {
        type: "string",
        description: "The agent ID of the racer to bump (from get_solve_status output)",
      },
      insights: {
        type: "string",
        description: "Specific technical guidance, approach suggestions, or cross-racer insights to send",
      },
    },
    required: ["racer_id", "insights"],
  },
  timeoutMs: 10_000,
  async execute(args, ctx) {
    if (!ctx.bumpRacer) {
      return { output: "No active racer swarms.", exitCode: 1 };
    }
    const { racer_id, insights } = args;
    if (!racer_id || !insights) {
      return { output: "Both racer_id and insights are required.", exitCode: 1 };
    }
    const result = ctx.bumpRacer(racer_id, insights);
    return { output: result, exitCode: 0 };
  },
};

export default bumpRacer;
