import { ToolDefinition } from "../types";
import { isDangerousShellInput } from "../../utils/commandSafety";

const writeToShell: ToolDefinition = {
  name: "write_to_shell",
  description:
    "Send input to an existing persistent shell. Use this for interactive programs, " +
    "sending commands to a reverse shell caught by netcat, responding to prompts, " +
    "or any scenario where you need to type into a running shell.",
  parameters: {
    type: "object",
    properties: {
      shell_id: {
        type: "string",
        description: "The shell_id to write to (from spawn_shell)",
      },
      input: {
        type: "string",
        description: "The text to send to the shell. Include \\n for Enter key.",
      },
    },
    required: ["shell_id", "input"],
  },
  shouldRequireConsent(args, ctx) {
    const shellInfo = ctx.getShellInfo(args.shell_id);
    if (!shellInfo || shellInfo.purpose === "reverse-shell" || shellInfo.purpose === "listener") {
      return false;
    }
    return isDangerousShellInput(args.input).dangerous;
  },
  async execute(args, ctx) {
    const { shell_id, input } = args;
    if (!shell_id) return { output: "Error: shell_id is required", exitCode: 1 };
    if (input === undefined) return { output: "Error: input is required", exitCode: 1 };

    try {
      await ctx.writeToShell(shell_id, input);
      await new Promise((r) => setTimeout(r, 300));
      const { data } = await ctx.readShellOutput(shell_id);
      const lastLines = data.split("\n").slice(-30).join("\n");
      return {
        output: `Input sent to shell ${shell_id}. Recent output:\n${lastLines}`,
        exitCode: 0,
      };
    } catch (err: any) {
      return { output: `Failed to write to shell: ${err.message}`, exitCode: 1 };
    }
  },
};

export default writeToShell;
