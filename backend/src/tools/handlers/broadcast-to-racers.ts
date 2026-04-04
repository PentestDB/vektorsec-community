import { ToolDefinition } from "../types";

const broadcastToRacers: ToolDefinition = {
  name: "broadcast",
  allowedRoles: ["orchestrator"],
  description:
    "Broadcast a strategic hint or insight to ALL active racer agents. Use this to " +
    "share cross-racer discoveries (e.g. flag format, shared vulnerabilities, useful " +
    "techniques that one racer found). All racers will see the message via check_findings.",
  parameters: {
    type: "object",
    properties: {
      message: {
        type: "string",
        description: "The message to broadcast to all racers",
      },
    },
    required: ["message"],
  },
  timeoutMs: 10_000,
  async execute(args, ctx) {
    if (!ctx.broadcastToRacers) {
      return { output: "No active racer swarms.", exitCode: 1 };
    }
    const { message } = args;
    if (!message) {
      return { output: "Message is required.", exitCode: 1 };
    }
    const result = ctx.broadcastToRacers(message);
    return { output: result, exitCode: 0 };
  },
};

export default broadcastToRacers;
