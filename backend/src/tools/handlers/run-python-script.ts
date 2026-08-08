import { ToolDefinition } from "../types";
import { findCapabilityForCommand } from "../../capabilities/registry";

const MODULE_NOT_FOUND_PATTERNS = [
  /No module named ['"]*(\S+?)['"]*\s*$/im,
  /ModuleNotFoundError: No module named ['"]*(\S+?)['"]*$/im,
  /ImportError: No module named ['"]*(\S+?)['"]*$/im,
];

function detectMissingModule(output: string) {
  for (const pattern of MODULE_NOT_FOUND_PATTERNS) {
    const match = output.match(pattern);
    if (match) {
      const cap = findCapabilityForCommand(match[1]);
      if (cap) {
        return { name: cap.name, label: cap.label, installCommand: cap.installCommand, size: cap.size };
      }
    }
  }
  return null;
}

const runPythonScript: ToolDefinition = {
  name: "run_python_script",
  description:
    "Execute a Python 3 script on the attack box. Use this for custom exploits, " +
    "data parsing, protocol interactions, brute-force logic, or any task requiring Python libraries " +
    "like requests, socket, struct, pwntools, etc. " +
    "Scripts always run in-memory via stdin. If file_name is provided, the script is also saved to disk for reference.",
  parameters: {
    type: "object",
    properties: {
      script: {
        type: "string",
        description: "Full Python script content",
      },
      file_name: {
        type: "string",
        description: "Optional: save the script to this filename for reference (e.g. 'exploit.py'). Must be a plain filename, not a path. The script still runs in-memory regardless.",
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

    const files: string[] = [];

    // Persist to disk as a side effect if requested (best-effort, don't block execution)
    if (file_name) {
      const safeName = file_name.replace(/^.*[\\/]/, "");
      if (safeName) {
        ctx.runCommand(
          `cat > './${safeName.replace(/'/g, "'\\''")}' << 'PYTHON_SCRIPT_EOF'\n${script}\nPYTHON_SCRIPT_EOF`,
          10_000,
        ).catch(() => {});
        files.push(safeName);
      }
    }

    // Always run in-memory via stdin — faster and avoids path issues
    const { output, exitCode } = await ctx.runCommand(
      `python3 << 'PYTHON_SCRIPT_EOF'\n${script}\nPYTHON_SCRIPT_EOF`,
      this.timeoutMs,
    );
    const suggestion = exitCode !== 0 ? detectMissingModule(output) : null;
    return { output, exitCode, ...(files.length ? { files } : {}), ...(suggestion ? { installSuggestion: suggestion } : {}) };
  },
};

export default runPythonScript;
