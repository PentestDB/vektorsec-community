import { ToolDefinition } from "../types";

const runPythonScript: ToolDefinition = {
  name: "run_python_script",
  description:
    "Write and execute a Python 3 script on the attack box. Use this for custom exploits, " +
    "data parsing, protocol interactions, brute-force logic, or any task requiring Python libraries " +
    "like requests, socket, struct, pwntools, etc. The script is written to /tmp and executed.",
  parameters: {
    type: "object",
    properties: {
      script: {
        type: "string",
        description: "Full Python script content",
      },
      file_name: {
        type: "string",
        description: "Filename for the script (e.g. exploit.py)",
      },
    },
    required: ["script", "file_name"],
  },
  timeoutMs: 300_000,
  async execute(args, ctx) {
    const { script, file_name } = args;
    if (!script || !file_name) {
      return { output: "Error: script and file_name are required", exitCode: 1 };
    }

    const escapedScript = script.replace(/'/g, "'\\''");
    const writeCmd = `cat > /tmp/${file_name} << 'PYTHON_SCRIPT_EOF'\n${script}\nPYTHON_SCRIPT_EOF`;
    await ctx.runCommand(writeCmd, 10_000);

    const { output, exitCode } = await ctx.runCommand(
      `cd /tmp && python3 ${file_name}`,
      this.timeoutMs,
    );

    return { output, exitCode, files: [file_name] };
  },
};

export default runPythonScript;
