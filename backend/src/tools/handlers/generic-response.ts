import { ToolDefinition } from "../types";

const genericResponse: ToolDefinition = {
  name: "ask_user",
  description:
    "Ask the user a question or request specific information needed to continue. " +
    "Use this when you need target details, clarification, credentials, or any other " +
    "input from the user before proceeding.",
  parameters: {
    type: "object",
    properties: {
      question: {
        type: "string",
        description: "The question or request for the user",
      },
    },
    required: ["question"],
  },
  timeoutMs: 0,
  async execute(args, _ctx) {
    return { output: args.question ?? "No question provided", exitCode: 0 };
  },
};

export default genericResponse;
