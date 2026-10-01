import { ToolDefinition } from "../types";
import { runNmap, isToolAvailable } from "../../services/toolWrappers";
import { parseNmapOutput, buildStructuredScanResult } from "../../utils/scanOutput";
import { guardScanTarget, serializeScanResult } from "./scan-guard";

const nmapScan: ToolDefinition = {
  name: "nmap_scan",
  allowedRoles: ["orchestrator", "swarm_agent"],
  description:
    "Run an Nmap port scan against a target and return a STRUCTURED JSON result " +
    "(hosts, open ports, services/versions) plus a deterministic risk score. " +
    "Use for recon before deciding what to attack. Target must be inside the " +
    "authorized scope. For a faster alternative use naabu_scan.",
  parameters: {
    type: "object",
    properties: {
      target: {
        type: "string",
        description: "IP, hostname, CIDR, or nmap target expression (must be in scope)",
      },
      ports: {
        type: "string",
        description: "Port range e.g. '80,443', '1-1000', 'top' not supported by nmap here",
      },
      scan_type: {
        type: "string",
        enum: ["syn", "connect", "udp", "version", "os"],
        description: "Scan technique. Default version (-sV). Use syn for TCP SYN stealth.",
      },
      extra_flags: {
        type: "array",
        items: { type: "string" },
        description: "Extra nmap flags, e.g. ['-Pn', '--script=http-title']",
      },
    },
    required: ["target"],
  },
  timeoutMs: 600_000,
  async execute(args, ctx) {
    const target = args.target as string;
    const blocked = await guardScanTarget(ctx, target);
    if (blocked) return blocked;

    if (!(await isToolAvailable("nmap"))) {
      return { output: "Error: nmap is not installed or not available in the environment.", exitCode: 1 };
    }

    const result = await runNmap({
      target,
      ports: args.ports as string | undefined,
      scanType: (args.scan_type as any) ?? "version",
      verbose: false,
      extraFlags: args.extra_flags as string[] | undefined,
    });

    const findings = parseNmapOutput(result.stdout);
    const structured = buildStructuredScanResult({
      tool: "nmap",
      engine: "nmap",
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

export default nmapScan;
