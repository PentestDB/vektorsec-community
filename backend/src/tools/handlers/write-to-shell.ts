import { ToolDefinition } from "../types";
import { isDangerousShellInput } from "../../utils/commandSafety";
import { assertCommandTargetsAreExternal, blockedTargetResult } from "../../utils/ssrfGuard";
import { validateCommandScope, createDefaultScopeConfig } from "../../utils/scopeValidator";

const writeToShell: ToolDefinition = {
  name: "write_to_shell",
  description:
    "Send input to an existing persistent shell. Use this for interactive programs, " +
    "sending commands to a reverse shell caught by netcat, responding to prompts, " +
    "or any scenario where you need to type into a running shell.",
  parameters: {
    type: "object",
    properties: {
      shell_id: {
        type: "string",
        description: "The shell_id to write to (from spawn_shell)",
      },
      input: {
        type: "string",
        description: "The text to send to the shell. Include \\n for Enter key.",
      },
    },
    required: ["shell_id", "input"],
  },
  timeoutMs: 30_000,
  shouldRequireConsent(args, ctx) {
    const shellInfo = ctx.getShellInfo(args.shell_id);
    if (!shellInfo || shellInfo.purpose === "reverse-shell" || shellInfo.purpose === "listener") {
      return false;
    }
    return isDangerousShellInput(args.input).dangerous;
  },
  async execute(args, ctx) {
    const { shell_id, input } = args;
    if (!shell_id) return { output: "Error: shell_id is required", exitCode: 1 };
    if (input === undefined) return { output: "Error: input is required", exitCode: 1 };

    // SSRF guard: input may be (or include) a scan/request command, so any
    // target it references must resolve to a public address only.
    try {
      await assertCommandTargetsAreExternal(String(input));
    } catch {
      return blockedTargetResult();
    }

    // Scope allowlist (same policy as run_bash): input may embed scan/request
    // commands against a target that must be inside the authorized scope.
    const scopeConfig = ctx.guardrails?.scope ?? createDefaultScopeConfig();
    const scopeResult = validateCommandScope(String(input), scopeConfig);
    if (!scopeResult.allowed) {
      return { output: `BLOCKED: ${scopeResult.reason}`, exitCode: 1 };
    }

    try {
      await ctx.writeToShell(shell_id, input);
      await new Promise((r) => setTimeout(r, 300));
      const { data } = await ctx.readShellOutput(shell_id);
      const lastLines = data.split("\n").slice(-30).join("\n");
      return {
        output: `Input sent to shell ${shell_id}. Recent output:\n${lastLines}`,
        exitCode: 0,
      };
    } catch (err: any) {
      return { output: `Failed to write to shell: ${err.message}`, exitCode: 1 };
    }
  },
};

export default writeToShell;
