import { ToolDefinition } from "../types";

const caidoInterceptControl: ToolDefinition = {
  name: "caido_intercept_control",
  description:
    "Control Caido interception. In this version, the tool reports that Caido Intercept control is not exposed by the official client API.",
  parameters: {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: ["status", "enable", "disable"],
        description: "Intercept action to perform.",
      },
    },
    required: ["action"],
  },
  async execute() {
    return {
      output:
        "Caido Intercept control is not exposed by the current official Caido client API used by Pentest Copilot v1. Toggle Intercept manually in Caido.",
      exitCode: 1,
    };
  },
};

export default caidoInterceptControl;
