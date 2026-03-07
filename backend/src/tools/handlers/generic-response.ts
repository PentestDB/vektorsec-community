import { ToolDefinition } from "../types";

export const genericResponseTool: ToolDefinition = {
  name: "generic_response",
  description: "Generic Response",
  args: {
    response: {
      type: "string",
      required: true,
      description: "The response text to return to the user",
    },
  },
  async execute({ args }) {
    return args.response ?? "";
  },
};
