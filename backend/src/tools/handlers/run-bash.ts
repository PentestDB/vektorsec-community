import { ToolDefinition } from "../types";
import { isDangerousCommand, WORKSPACE_DIR } from "../../utils/commandSafety";

const runBash: ToolDefinition = {
  name: "run_bash",
  description:
    "Execute a bash command on the Kali Linux attack box and return its full output. " +
    "Uses a one-shot exec channel — the command runs to completion (or timeout) and " +
    "stdout+stderr are returned. Use this for all CLI tools (nmap, gobuster, sqlmap, " +
    "ffuf, curl, etc.). For long-running or interactive tasks, use spawn_shell + " +
    "write_to_shell + read_shell instead.",
  parameters: {
    type: "object",
    properties: {
      command: {
        type: "string",
        description: "The full bash command to execute",
      },
      timeout_seconds: {
        type: "number",
        description: "Timeout in seconds (default 300). The command is killed if it exceeds this.",
      },
    },
    required: ["command"],
  },
  timeoutMs: 300_000,
  shouldRequireConsent(args) {
    return isDangerousCommand(args.command).dangerous;
  },
  async execute(args, ctx) {
    const command = args.command;
    if (!command) return { output: "Error: no command provided", exitCode: 1 };

    const sandboxedCommand = `cd ${WORKSPACE_DIR} && ${command}`;

    const timeoutMs = args.timeout_seconds ? args.timeout_seconds * 1000 : this.timeoutMs;
    const { output, exitCode } = await ctx.runCommand(sandboxedCommand, timeoutMs);

    const files: string[] = [];
    const redirectMatch = command.match(/-o\w?\s+(\S+)|>\s*(\S+)/);
    if (redirectMatch) {
      files.push(redirectMatch[1] || redirectMatch[2]);
    }

    return { output, exitCode, files };
  },
};

export default runBash;
