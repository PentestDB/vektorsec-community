/**
 * Argument normalisation shared by the MCP `scan_run` tool and any future
 * scanner surface. Kept dependency-free (pure functions) so it can be unit
 * tested without booting MongoDB, MCP or the tool registry.
 */

/** MCP scan action -> registry tool name. */
export const SCAN_TOOL_BY_ACTION: Record<string, string> = {
  nmap: "nmap_scan",
  naabu: "naabu_scan",
  nuclei: "nuclei_scan",
  ffuf: "ffuf_fuzz",
  gobuster: "gobuster_fuzz",
};

/** Argument names each scan action accepts (anything else is dropped). */
export const SCAN_ARG_KEYS: Record<string, string[]> = {
  nmap: ["target", "ports", "scan_type", "extra_flags"],
  naabu: ["target", "ports", "top_ports", "extra_flags"],
  nuclei: ["target", "templates", "severity", "tags", "extra_flags"],
  ffuf: ["target", "mode", "wordlist", "extensions", "method", "threads", "extra_flags"],
  gobuster: ["target", "mode", "wordlist", "extensions", "threads", "extra_flags"],
};

/**
 * Normalise scan arguments for the target registry tool: drop empty values and
 * fail fast on missing required arguments instead of letting a scanner run with
 * a half-built command line.
 *
 * @throws when the action is unknown, `target` is missing, or a mode-based
 *         scanner (ffuf/gobuster) was called without `mode`.
 */
export function buildScanToolArgs(
  action: string,
  input: Record<string, any>,
): Record<string, unknown> {
  if (!SCAN_TOOL_BY_ACTION[action]) {
    throw new Error(`Unsupported scan action: ${action}`);
  }
  const keys = SCAN_ARG_KEYS[action] ?? [];
  const args: Record<string, unknown> = {};
  for (const key of keys) {
    const value = input[key];
    if (value === undefined || value === null || value === "") continue;
    args[key] = value;
  }
  if (!args.target) {
    throw new Error("scan_run: target is required");
  }
  if ((action === "ffuf" || action === "gobuster") && !args.mode) {
    throw new Error(
      `scan_run: mode is required for ${action} (` +
        (action === "ffuf" ? "content|subdomain" : "dir|dns|vhost") +
        ")",
    );
  }
  return args;
}
