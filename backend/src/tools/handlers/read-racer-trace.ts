import { ToolDefinition } from "../types";

const readRacerTrace: ToolDefinition = {
  name: "read_racer_trace",
  allowedRoles: ["orchestrator"],
  description:
    "Read recent messages and tool calls from a specific racer's context. Use this to " +
    "understand what a racer is doing, what it has tried, and where it's stuck. " +
    "Essential for crafting effective bump_racer guidance.",
  parameters: {
    type: "object",
    properties: {
      racer_id: {
        type: "string",
        description: "The agent ID of the racer (from get_solve_status output)",
      },
      last_n: {
        type: "number",
        description: "Number of recent messages to retrieve (default: 20)",
      },
    },
    required: ["racer_id"],
  },
  timeoutMs: 10_000,
  async execute(args, ctx) {
    if (!ctx.readRacerTrace) {
      return { output: "No active racer swarms.", exitCode: 1 };
    }
    const { racer_id, last_n } = args;
    if (!racer_id) {
      return { output: "racer_id is required.", exitCode: 1 };
    }
    const messages = ctx.readRacerTrace(racer_id, last_n ?? 20);
    if (!messages || messages.length === 0) {
      return { output: `No messages found for racer ${racer_id}.`, exitCode: 0 };
    }
    const lines = messages.map((m: any) => {
      const role = m.role?.toUpperCase() || "?";
      let content = m.content || "";
      if (content.length > 300) content = content.slice(0, 300) + "...";
      if (m.toolCalls?.length) {
        const tools = m.toolCalls.map((tc: any) => tc.name).join(", ");
        return `[${role}] (tools: ${tools}) ${content}`;
      }
      if (m.toolName) {
        return `[TOOL:${m.toolName}] ${content}`;
      }
      return `[${role}] ${content}`;
    });
    return { output: `**Trace for ${racer_id}** (last ${messages.length} messages):\n${lines.join("\n")}`, exitCode: 0 };
  },
};

export default readRacerTrace;
