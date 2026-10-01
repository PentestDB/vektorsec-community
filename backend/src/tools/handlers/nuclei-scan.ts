import { ToolDefinition } from "../types";
import { runNuclei, isToolAvailable } from "../../services/toolWrappers";
import { parseNucleiOutput, buildStructuredScanResult } from "../../utils/scanOutput";
import { guardScanTarget, serializeScanResult } from "./scan-guard";

const nucleiScan: ToolDefinition = {
  name: "nuclei_scan",
  allowedRoles: ["orchestrator", "swarm_agent"],
  description:
    "Vulnerability scan with Nuclei (projectdiscovery). Returns a STRUCTURED JSON result: " +
    "each match normalized with template id, severity, URL and description, plus counts " +
    "per severity and an overall risk score. Use this to build the vulnerability summary.",
  parameters: {
    type: "object",
    properties: {
      target: {
        type: "string",
        description: "URL, host or list file target to scan (must be in scope)",
      },
      templates: {
        type: "string",
        description: "Template name, directory or list e.g. 'http/', 'cves/', 'exposures/'",
      },
      severity: {
        type: "string",
        enum: ["info", "low", "medium", "high", "critical"],
        description: "Only run templates of at least this severity (default: none / all)",
      },
      tags: {
        type: "string",
        description: "Template tags to include, e.g. 'waf,tech,panel'",
      },
      extra_flags: {
        type: "array",
        items: { type: "string" },
        description: "Extra nuclei flags e.g. ['-rl','150','-c','25']",
      },
    },
    required: ["target"],
  },
  timeoutMs: 900_000,
  async execute(args, ctx) {
    const target = args.target as string;
    const blocked = await guardScanTarget(ctx, target);
    if (blocked) return blocked;

    if (!(await isToolAvailable("nuclei"))) {
      return { output: "Error: nuclei is not installed or not available in the environment.", exitCode: 1 };
    }

    const result = await runNuclei({
      target,
      templates: args.templates as string | undefined,
      severity: args.severity as any,
      tags: args.tags as string | undefined,
      outputJson: true,
      extraFlags: args.extra_flags as string[] | undefined,
    });

    const findings = parseNucleiOutput(result.stdout);
    const structured = buildStructuredScanResult({
      tool: "nuclei",
      engine: "nuclei",
      target,
      scanKind: "vulnerabilities",
      findings,
      rawText: result.stdout || result.stderr,
      extraCounts: {
        exitCode: result.exitCode,
        durationMs: result.durationMs,
      },
    });

    return {
      output: serializeScanResult(structured),
      exitCode: result.exitCode,
    };
  },
};

export default nucleiScan;
