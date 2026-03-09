import { ToolDefinition } from "../types";

const netcatListener: ToolDefinition = {
  name: "netcat_listener",
  description:
    "Start a netcat listener on a specified port on the attack box. " +
    "Useful for catching reverse shells or receiving data.",
  parameters: {
    type: "object",
    properties: {
      port: { type: "string", description: "Port number to listen on" },
    },
    required: ["port"],
  },
  timeoutMs: 10_000,
  async execute(args, ctx) {
    const port = args.port;
    if (!port) return { output: "Error: port is required", exitCode: 1 };

    const { output, exitCode } = await ctx.runCommand(
      `nohup nc -nlvp ${port} > /tmp/nc_${port}.log 2>&1 &`,
      this.timeoutMs,
    );

    return {
      output: output || `Netcat listener started on port ${port} (background). Output logging to /tmp/nc_${port}.log`,
      exitCode,
    };
  },
};

export default netcatListener;
