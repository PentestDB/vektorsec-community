import { ToolDefinition } from "../types";

const runBash: ToolDefinition = {
  name: "run_bash",
  description:
    "Execute a bash command on the Kali Linux attack box. Use this for all CLI tools " +
    "(nmap, gobuster, sqlmap, ffuf, curl, etc.). The command runs via SSH and the full " +
    "stdout+stderr output is returned.",
  parameters: {
    type: "object",
    properties: {
      command: {
        type: "string",
        description: "The full bash command to execute",
      },
    },
    required: ["command"],
  },
  timeoutMs: 300_000,
  async execute(args, ctx) {
    const command = args.command;
    if (!command) return { output: "Error: no command provided", exitCode: 1 };

    const { output, exitCode } = await ctx.runCommand(command, this.timeoutMs);

    const files: string[] = [];
    const redirectMatch = command.match(/-o\w?\s+(\S+)|>\s*(\S+)/);
    if (redirectMatch) {
      files.push(redirectMatch[1] || redirectMatch[2]);
    }

    return { output, exitCode, files };
  },
};

export default runBash;
