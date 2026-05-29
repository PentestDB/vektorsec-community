import { ToolDefinition } from "../types";

const caidoAutomate: ToolDefinition = {
  name: "send_to_caido_automate",
  description:
    "Prepare an HTTP request for Caido Automate. In this version, the tool reports that Caido Automate is not exposed by the official client API.",
  parameters: {
    type: "object",
    properties: {
      host: { type: "string", description: "Target hostname." },
      port: { type: "number", description: "Target port." },
      secure: { type: "boolean", description: "Use TLS/HTTPS." },
      raw_request: { type: "string", description: "Full raw HTTP request." },
      tab_name: { type: "string", description: "Optional Automate tab name." },
    },
    required: ["host", "raw_request"],
  },
  async execute() {
    return {
      output:
        "Caido Automate is not exposed by the current official Caido client API used by Pentest Copilot v1. Use Caido Replay for request execution, or run Automate manually in Caido.",
      exitCode: 1,
    };
  },
};

export default caidoAutomate;
