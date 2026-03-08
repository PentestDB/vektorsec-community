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
      return args.command;
    }
    return args.output ?? "";
  },
};
