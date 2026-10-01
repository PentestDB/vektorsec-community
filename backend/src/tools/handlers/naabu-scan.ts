import { ToolDefinition } from "../types";
import { runNaabu, isToolAvailable } from "../../services/toolWrappers";
import { parseNaabuOutput, buildStructuredScanResult } from "../../utils/scanOutput";
import { guardScanTarget, serializeScanResult } from "./scan-guard";

const naabuScan: ToolDefinition = {
  name: "naabu_scan",
  allowedRoles: ["orchestrator", "swarm_agent"],
  description:
    "Fast port scan with Naabu (projectdiscovery). Returns a STRUCTURED JSON result " +
    "with host:port pairs and a risk score. Much faster than nmap for large host/port " +
    "spaces; follow up interesting services with nmap_scan for version details.",
  parameters: {
    type: "object",
    properties: {
      target: {
        type: "string",
        description: "IP, hostname, CIDR, or comma-separated hosts (must be in scope)",
      },
      ports: {
        type: "string",
        description: "Explicit ports e.g. '80,443,8080' or '1-1000'",
      },
      top_ports: {
        type: "number",
        description: "Scan top N ports (default 100) when ports is not provided",
      },
      extra_flags: {
        type: "array",
        items: { type: "string" },
        description: "Extra naabu flags e.g. ['-rate', '1000']",
      },
    },
    required: ["target"],
  },
  timeoutMs: 600_000,
  async execute(args, ctx) {
    const target = args.target as string;
    const blocked = await guardScanTarget(ctx, target);
    if (blocked) return blocked;

    if (!(await isToolAvailable("naabu"))) {
      return { output: "Error: naabu is not installed or not available in the environment.", exitCode: 1 };
    }

    const result = await runNaabu({
      target,
      ports: args.ports as string | undefined,
      topPorts: args.top_ports as number | undefined,
      outputJson: true,
      extraFlags: args.extra_flags as string[] | undefined,
    });

    const findings = parseNaabuOutput(result.stdout);
    const structured = buildStructuredScanResult({
      tool: "naabu",
      engine: "naabu",
      target,
      scanKind: "ports",
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

export default naabuScan;
