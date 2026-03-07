import { ToolDefinition } from "../types";

export const runBashTool: ToolDefinition = {
  name: "run_bash",
  description: "Run Bash Commands",
  args: {
    command: {
      type: "string",
      required: true,
      description: "The bash command to execute",
    },
  },
  outputFileField: "file_name",
  async execute({ commandId, args, choice }) {
    if (["yes", "edit"].includes(choice)) {
      const terminalCommand = `echo "<command_id_start>${commandId}</command_id_start>"; ${args.command} ;echo "<command_id_end>${commandId}</command_id_end>";`;
      return terminalCommand;
    }
    return args.output ?? "";
  },
};
