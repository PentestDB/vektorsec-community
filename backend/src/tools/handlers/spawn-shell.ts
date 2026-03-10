import { ToolDefinition } from "../types";

const spawnShell: ToolDefinition = {
  name: "spawn_shell",
  description:
    "Create a new persistent named shell on the attack box. Returns a shell_id that can " +
    "be used with run_bash (shell_id param), write_to_shell, and read_shell. " +
    "Use this for: long-running processes (nmap scans), netcat listeners, " +
    "interactive sessions, or any task that needs a dedicated terminal.",
  parameters: {
    type: "object",
    properties: {
      label: {
        type: "string",
        description: "A short descriptive label for this shell (e.g. 'nmap-scan', 'nc-listener-4444', 'exploit-session')",
      },
      purpose: {
        type: "string",
        enum: ["exploit-box", "reverse-shell", "listener"],
        description: "Shell purpose. Use 'exploit-box' (default) for commands on the attack box, " +
          "'reverse-shell' for shells that will receive reverse connections from targets, " +
          "'listener' for netcat/socat listeners waiting for connections.",
      },
    },
    required: ["label"],
  },
  async execute(args, ctx) {
    const label = args.label;
    if (!label) return { output: "Error: label is required", exitCode: 1 };

    const purpose = args.purpose || "exploit-box";

    try {
      const shellId = await ctx.spawnShell(label, "pty", purpose);
      return {
        output: `Shell spawned successfully.\nshell_id: ${shellId}\nlabel: ${label}\npurpose: ${purpose}\n\nYou can now use this shell_id with write_to_shell and read_shell.`,
        exitCode: 0,
      };
    } catch (err: any) {
      return { output: `Failed to spawn shell: ${err.message}`, exitCode: 1 };
    }
  },
};

export default spawnShell;
