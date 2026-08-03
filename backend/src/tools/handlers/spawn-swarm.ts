import { ToolDefinition } from "../types";

const spawnSwarm: ToolDefinition = {
  name: "spawn_swarm",
  allowedRoles: ["main"],
  description:
    "Launch the optional configured racer models for work that materially benefits from independent parallel approaches. " +
    "Do not use for greetings, casual conversation, simple questions, or routine single-path tasks. " +
    "Each racer runs on a different configured model and works independently. " +
    "Agents can share findings with each other and spawn their own subagents. " +
    'Set win_condition to "first_success" if the first agent to succeed should end the race, ' +
    'or "all_complete" to wait for all agents to finish.',
  parameters: {
    type: "object",
    properties: {
      goal: {
        type: "string",
        description:
          "The overarching objective for the swarm (e.g. 'Find and exploit vulnerabilities on the web app at 10.10.10.5:80')",
      },
      agents: {
        type: "array",
        items: {
          type: "object",
          properties: {
            task: {
              type: "string",
              description: "Specific task or strategy for this agent",
            },
            context: {
              type: "string",
              description: "Optional additional context (target info, credentials, etc.)",
            },
          },
          required: ["task"],
        },
        description:
          "Strategies for the configured racers. Provide one strategy per configured racer when useful; " +
          "a single strategy is applied to the full configured roster.",
      },
      win_condition: {
        type: "string",
        enum: ["first_success", "all_complete"],
        description: 'How to determine completion. "first_success" cancels others when one wins. Default: "all_complete".',
      },
      timeout_minutes: {
        type: "number",
        description: "Optional maximum time for the swarm to run in minutes. Omit for no timeout (indefinite run).",
      },
    },
    required: ["goal", "agents"],
  },
  timeoutMs: 30_000,
  async execute(args, ctx) {
    const { goal, agents, win_condition, timeout_minutes } = args;
    if (!goal) return { output: "Error: goal is required", exitCode: 1 };
    if (!agents?.length) return { output: "Error: at least one agent spec is required", exitCode: 1 };

    if (!ctx.spawnSwarm) {
      return { output: "Swarm spawning is not available in this context.", exitCode: 1 };
    }

    try {
      const swarmId = await ctx.spawnSwarm({
        goal,
        agents,
        winCondition: win_condition || "all_complete",
        timeoutMinutes: timeout_minutes || undefined,
      });
      return {
        output: `Swarm spawned successfully.\nswarm_id: ${swarmId}\ngoal: ${goal}\nstrategies: ${agents.length}\nwin_condition: ${win_condition || "all_complete"}\ntimeout: ${timeout_minutes ? `${timeout_minutes}min` : "none"}\n\nThe configured racer roster is now running. Results will be provided when it completes.`,
        exitCode: 0,
      };
    } catch (err: any) {
      return { output: `Failed to spawn swarm: ${err.message}`, exitCode: 1 };
    }
  },
};

export default spawnSwarm;
