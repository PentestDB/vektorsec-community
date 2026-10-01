import { ToolDefinition } from "../types";
import { runGobuster, isToolAvailable } from "../../services/toolWrappers";
import {
  parseGobusterDirOutput,
  parseGobusterDnsOutput,
  buildStructuredScanResult,
} from "../../utils/scanOutput";
import { guardScanTarget, serializeScanResult } from "./scan-guard";

const DEFAULT_DIR_WORDLIST = "/usr/share/wordlists/dirb/common.txt";
const DEFAULT_DNS_WORDLIST =
  "/usr/share/seclists/Discovery/DNS/subdomains-top1million-20000.txt";

const gobusterFuzz: ToolDefinition = {
  name: "gobuster_fuzz",
  allowedRoles: ["orchestrator", "swarm_agent"],
  description:
    "Directory/file or DNS-subdomain enumeration with Gobuster. Returns a STRUCTURED " +
    "JSON result (found paths or subdomains) + risk score. mode=dir fuzzes a web root; " +
    "mode=dns fuzzes subdomains of a domain; mode=vhost fuzzes virtual hosts.",
  parameters: {
    type: "object",
    properties: {
      mode: {
        type: "string",
        enum: ["dir", "dns", "vhost"],
        description: "dir = content fuzz on URL, dns = subdomain enum, vhost = vhost enum",
      },
      target: {
        type: "string",
        description:
          "dir: base URL e.g. https://example.com. dns: domain e.g. example.com. vhost: base domain",
      },
      wordlist: { type: "string", description: "Wordlist path (defaults per mode)" },
      extensions: {
        type: "array",
        items: { type: "string" },
        description: "File extensions for dir mode, e.g. ['php','txt','bak']",
      },
      threads: { type: "number", description: "Concurrency (default 20)" },
      extra_flags: {
        type: "array",
        items: { type: "string" },
        description: "Extra gobuster flags e.g. ['-x','php']",
      },
    },
    required: ["mode", "target"],
  },
  timeoutMs: 600_000,
  async execute(args, ctx) {
    const mode = (args.mode as string) ?? "dir";
    const target = (args.target as string) ?? "";
    const blocked = await guardScanTarget(ctx, target);
    if (blocked) return blocked;

    if (!(await isToolAvailable("gobuster"))) {
      return { output: "Error: gobuster is not installed or not available in the environment.", exitCode: 1 };
    }

    const wordlist =
      (args.wordlist as string | undefined) ??
      (mode === "dir" ? DEFAULT_DIR_WORDLIST : DEFAULT_DNS_WORDLIST);

    const result = await runGobuster({
      target,
      wordlist,
      mode: mode as any,
      extensions: args.extensions as string[] | undefined,
      threads: args.threads as number | undefined,
      extraFlags: args.extra_flags as string[] | undefined,
    });

    const isDns = mode === "dns" || mode === "vhost";
    const findings = isDns
      ? parseGobusterDnsOutput(result.stdout)
      : parseGobusterDirOutput(result.stdout, target);

    const structured = buildStructuredScanResult({
      tool: "gobuster",
      engine: "gobuster",
      target,
      scanKind: isDns ? "subdomains" : "web_fuzz",
      findings,
      rawText: result.stdout || result.stderr,
      extraCounts: { mode, exitCode: result.exitCode, durationMs: result.durationMs },
    });

    return {
      output: serializeScanResult(structured),
      exitCode: result.exitCode,
    };
  },
};

export default gobusterFuzz;
