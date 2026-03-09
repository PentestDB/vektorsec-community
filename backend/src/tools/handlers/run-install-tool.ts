import { ToolDefinition } from "../types";
import { getCapabilityByName } from "../../capabilities/registry";

const runInstallTool: ToolDefinition = {
  name: "run_install_tool",
  description:
    "Install a capability on the attack box by name. " +
    "Pass the tool/package name exactly as listed in the capabilities section (e.g. 'nmap', 'pwntools', 'ghidra'). " +
    "The system resolves the correct install command automatically. " +
    "This tool requires user consent before execution.",
  parameters: {
    type: "object",
    properties: {
      tool_name: {
        type: "string",
        description:
          "The capability name to install, as listed in the system prompt " +
          "(e.g. 'nmap', 'pwntools', 'sqlmap', 'ghidra')",
      },
    },
    required: ["tool_name"],
  },
  requiresConsent: true,
  timeoutMs: 120_000,
  async execute(args, ctx) {
    const toolName = args.tool_name;
    if (!toolName) return { output: "Error: no tool_name provided", exitCode: 1 };

    const cap = getCapabilityByName(toolName);
    if (!cap) {
      return {
        output: `Unknown capability: "${toolName}". Use the exact name from the capabilities list.`,
        exitCode: 1,
      };
    }

    const { output, exitCode } = await ctx.runCommand(cap.installCommand, this.timeoutMs);
    return { output, exitCode };
  },
};

export default runInstallTool;
