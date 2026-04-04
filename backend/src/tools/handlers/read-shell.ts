import { ToolDefinition } from "../types";

const readShell: ToolDefinition = {
  name: "read_shell",
  description:
    "Read recent output from a persistent shell. Use this to check the progress of " +
    "long-running commands, see if a netcat listener caught a connection, or monitor " +
    "any background process running in a shell.",
  parameters: {
    type: "object",
    properties: {
      shell_id: {
        type: "string",
        description: "The shell_id to read from (from spawn_shell)",
      },
      last_n_lines: {
        type: "number",
        description: "Number of recent lines to return (default 50)",
      },
    },
    required: ["shell_id"],
  },
  timeoutMs: 30_000,
  async execute(args, ctx) {
    const { shell_id, last_n_lines } = args;
    if (!shell_id) return { output: "Error: shell_id is required", exitCode: 1 };

    try {
      const { data, offset } = await ctx.readShellOutput(shell_id);
      const lines = data.split("\n");
      const n = last_n_lines ?? 50;
      const recent = lines.slice(-n).join("\n");
      return {
        output: `Shell ${shell_id} output (last ${Math.min(n, lines.length)} lines, offset ${offset}):\n${recent}`,
        exitCode: 0,
      };
    } catch (err: any) {
      return { output: `Failed to read shell: ${err.message}`, exitCode: 1 };
    }
  },
};

export default readShell;
