import { ToolDefinition } from "../types";

const closeShell: ToolDefinition = {
  name: "close_shell",
  description:
    "Close a persistent shell. Use this to clean up shells you no longer need.",
  parameters: {
    type: "object",
    properties: {
      shell_id: {
        type: "string",
        description: "The shell_id to close",
      },
    },
    required: ["shell_id"],
  },
  async execute(args, ctx) {
    const { shell_id } = args;
    if (!shell_id) return { output: "Error: shell_id is required", exitCode: 1 };

    try {
      await ctx.closeShell(shell_id);
      return { output: `Shell ${shell_id} closed.`, exitCode: 0 };
    } catch (err: any) {
      return { output: `Failed to close shell: ${err.message}`, exitCode: 1 };
    }
  },
};

export default closeShell;
