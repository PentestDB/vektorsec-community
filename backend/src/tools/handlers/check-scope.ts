import { ToolDefinition } from "../types";
import { validateCommandScope, createDefaultScopeConfig } from "../../utils/scopeValidator";

const checkScope: ToolDefinition = {
  name: "check_scope",
  allowedRoles: ["orchestrator", "swarm_agent"],
  description:
    "Check if a target or command is within the authorized engagement scope. " +
    "Use this BEFORE running any command against a target to ensure you don't " +
    "scan or attack out-of-scope systems. This is a critical safety check.",
  parameters: {
    type: "object",
    properties: {
      command: {
        type: "string",
        description: "The command to check (e.g. 'nmap -sV 10.10.10.10')",
      },
      target: {
        type: "string",
        description: "The target to check (IP, domain, or URL)",
      },
    },
    required: ["command"],
  },
  timeoutMs: 10_000,
  async execute(args, ctx) {
    const { command, target } = args;

    if (!command) {
      return { output: "Error: command is required", exitCode: 1 };
    }

    // Workspace scope (when configured) takes precedence over the global env.
    const scopeConfig = ctx.guardrails?.scope ?? createDefaultScopeConfig();
    const result = validateCommandScope(command, scopeConfig);

    if (result.allowed) {
      return {
        output: `ALLOWED: ${command}\n\nThis command is within the authorized engagement scope.`,
        exitCode: 0,
      };
    }

    return {
      output: `BLOCKED: ${command}\n\nReason: ${result.reason}\n\nThis command is OUT OF SCOPE and must not be executed.`,
      exitCode: 1,
    };
  },
};

export default checkScope;
