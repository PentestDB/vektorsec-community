import { ToolDefinition } from "../types";

export const runPythonScriptTool: ToolDefinition = {
  name: "run_python_script",
  description:
    "Write and execute a Python script for complex pentesting tasks such as custom exploits, data parsing, brute-force logic, protocol interactions, or automation that would be cumbersome in bash",
  args: {
    script: {
      type: "string",
      required: true,
      description: "The full Python script content to execute",
    },
    file_name: {
      type: "string",
      required: true,
      description:
        "Filename for the script (e.g. exploit.py). Saved to /tmp/ before execution",
    },
  },
  outputFileField: "file_name",
  async execute({ commandId, args, choice }) {
    if (["yes", "edit"].includes(choice)) {
      const scriptPath = `/tmp/${args.file_name}`;
      const escapedScript = args.script.replace(/'/g, "'\\''");
      return `printf '%s' '${escapedScript}' > ${scriptPath} && python3 ${scriptPath}`;
    }
    return args.output ?? "";
  },
};
