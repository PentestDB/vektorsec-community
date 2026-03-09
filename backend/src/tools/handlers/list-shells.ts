import { ToolDefinition } from "../types";

const listShells: ToolDefinition = {
  name: "list_shells",
  description:
    "List all active shells on the attack box. Shows shell IDs, labels, types, " +
    "and status. Use this to see what shells are available before running commands.",
  parameters: {
    type: "object",
    properties: {},
  },
  async execute(_args, ctx) {
    const shells = ctx.listShells();
    if (shells.length === 0) {
      return { output: "No active shells. Use spawn_shell to create one.", exitCode: 0 };
    }

    const lines = shells.map(
      (s) =>
        `- ${s.shellId} | label: ${s.label} | type: ${s.type} | status: ${s.status} | created by: ${s.createdBy}`,
    );
    return {
      output: `Active shells (${shells.length}):\n${lines.join("\n")}`,
      exitCode: 0,
    };
  },
};

export default listShells;
