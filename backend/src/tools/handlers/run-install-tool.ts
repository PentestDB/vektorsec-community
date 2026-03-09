import { ToolDefinition } from "../types";

export const runInstallToolTool: ToolDefinition = {
  name: "run_install_tool",
  description:
    "Install a missing CLI tool or Python package on the exploit box when a required capability is not available",
  args: {
    command: {
      type: "string",
      required: true,
      description:
        "The installation command to execute (e.g. 'apt install -y nmap' or 'pip install pwntools')",
    },
  },
  async execute({ commandId, args, choice }) {
    if (["yes", "edit"].includes(choice)) {
      return args.command;
    }
    return args.output ?? "";
  },
};
