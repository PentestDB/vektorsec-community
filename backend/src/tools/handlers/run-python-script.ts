import { ToolDefinition } from "../types";

const runPythonScript: ToolDefinition = {
  name: "run_python_script",
  description:
    "Execute a Python 3 script on the attack box. Use this for custom exploits, " +
    "data parsing, protocol interactions, brute-force logic, or any task requiring Python libraries " +
    "like requests, socket, struct, pwntools, etc.",
  parameters: {
    type: "object",
    properties: {
      script: {
        type: "string",
        description: "Full Python script content",
      },
      file_name: {
        type: "string",
        description: "Optional filename to persist the script (e.g. exploit.py). If omitted, script runs in-memory via stdin.",
      },
    },
    required: ["script"],
  },
  timeoutMs: 300_000,
  async execute(args, ctx) {
    const { script, file_name } = args;
    if (!script) {
      return { output: "Error: script is required", exitCode: 1 };
    }

    if (file_name) {
      const writeCmd = `cat > /tmp/${file_name} << 'PYTHON_SCRIPT_EOF'\n${script}\nPYTHON_SCRIPT_EOF`;
      await ctx.runCommand(writeCmd, 10_000);

      const { output, exitCode } = await ctx.runCommand(
        `cd /tmp && python3 ${file_name}`,
        this.timeoutMs,
      );
      return { output, exitCode, files: [file_name] };
    }

    const { output, exitCode } = await ctx.runCommand(
      `python3 << 'PYTHON_SCRIPT_EOF'\n${script}\nPYTHON_SCRIPT_EOF`,
      this.timeoutMs,
    );
    return { output, exitCode };
  },
};

export default runPythonScript;
