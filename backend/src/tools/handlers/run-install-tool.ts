import { ToolDefinition } from "../types";

const runInstallTool: ToolDefinition = {
  name: "run_install_tool",
  description:
    "Install a missing CLI tool or Python package on the attack box. " +
    "Examples: 'apt install -y nikto', 'pip install pwntools'. " +
    "This tool requires user consent before execution.",
  parameters: {
    type: "object",
    properties: {
      command: {
        type: "string",
        description: "The install command (e.g. 'apt install -y nmap', 'pip install requests')",
      },
    },
    required: ["command"],
  },
  requiresConsent: true,
  timeoutMs: 120_000,
  async execute(args, ctx) {
    const command = args.command;
    if (!command) return { output: "Error: no install command provided", exitCode: 1 };

    const { output, exitCode } = await ctx.runCommand(command, this.timeoutMs);
    return { output, exitCode };
  },
};

export default runInstallTool;
