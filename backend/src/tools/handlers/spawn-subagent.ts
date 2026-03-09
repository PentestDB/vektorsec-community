import { ToolDefinition } from "../types";

const spawnSubagent: ToolDefinition = {
  name: "spawn_subagent",
  description:
    "Launch a parallel subagent to work on a specific task independently. The subagent " +
    "gets its own conversation context, can spawn shells, run commands, and use all tools. " +
    "Use this when you identify multiple independent lines of investigation " +
    "(e.g. analyzing different ports, testing different attack vectors in parallel). " +
    "The subagent runs in the background and its results are returned when complete. " +
    "You can spawn multiple subagents simultaneously.",
  parameters: {
    type: "object",
    properties: {
      task: {
        type: "string",
        description:
          "A detailed description of what the subagent should investigate or accomplish. " +
          "Include all relevant context (target IP, port, service info, credentials found so far, etc.)",
      },
    },
    required: ["task"],
  },
  async execute(args, ctx) {
    const { task } = args;
    if (!task) return { output: "Error: task is required", exitCode: 1 };

    if (!ctx.spawnSubagent) {
      return { output: "Subagent spawning is not available in this context (subagents cannot spawn further subagents).", exitCode: 1 };
    }

    try {
      const subagentId = await ctx.spawnSubagent(task);
      return {
        output: `Subagent spawned successfully.\nsubagent_id: ${subagentId}\ntask: ${task}\n\nThe subagent is now running in the background. Its results will be provided to you when it completes.`,
        exitCode: 0,
      };
    } catch (err: any) {
      return { output: `Failed to spawn subagent: ${err.message}`, exitCode: 1 };
    }
  },
};

export default spawnSubagent;
