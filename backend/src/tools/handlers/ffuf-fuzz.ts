import { ToolDefinition } from "../types";
import { runFfuf, isToolAvailable } from "../../services/toolWrappers";
import { parseFfufOutput, buildStructuredScanResult } from "../../utils/scanOutput";
import { guardScanTarget, serializeScanResult } from "./scan-guard";

const DEFAULT_DIR_WORDLIST = "/usr/share/wordlists/dirb/common.txt";
const DEFAULT_SUBDOMAIN_WORDLIST =
  "/usr/share/seclists/Discovery/DNS/subdomains-top1million-20000.txt";

const ffufFuzz: ToolDefinition = {
  name: "ffuf_fuzz",
  allowedRoles: ["orchestrator", "swarm_agent"],
  description:
    "Fuzz web content (directories/files) or subdomains with ffuf and return a " +
    "STRUCTURED JSON result (URLs with status/length) + risk score. Set mode=content " +
    "to fuzz paths on a URL, or mode=subdomain to fuzz subdomains of a domain.",
  parameters: {
    type: "object",
    properties: {
      mode: {
        type: "string",
        enum: ["content", "subdomain"],
        description: "content = directory/file fuzz on a URL; subdomain = DNS subdomain fuzz",
      },
      target: {
        type: "string",
        description:
          "For content: base URL e.g. https://example.com (or with FUZZ). " +
          "For subdomain: the base domain e.g. example.com",
      },
      wordlist: {
        type: "string",
        description: "Wordlist path (defaults per mode)",
      },
      extensions: {
        type: "array",
        items: { type: "string" },
        description: "File extensions for content mode, e.g. ['php','txt','bak']",
      },
      method: { type: "string", description: "HTTP method (default GET)" },
      threads: { type: "number", description: "Concurrency (default 40)" },
      extra_flags: {
        type: "array",
        items: { type: "string" },
        description: "Extra ffuf flags e.g. ['-mc','200,301,302','-fc','404']",
      },
    },
    required: ["mode", "target"],
  },
  timeoutMs: 600_000,
  async execute(args, ctx) {
    const mode = args.mode as "content" | "subdomain";
    const target = (args.target as string) ?? "";
    const blocked = await guardScanTarget(ctx, target);
    if (blocked) return blocked;

    if (!(await isToolAvailable("ffuf"))) {
      return { output: "Error: ffuf is not installed or not available in the environment.", exitCode: 1 };
    }

    const url =
      mode === "subdomain"
        ? `http://FUZZ.${target.replace(/^https?:\/\//, "")}`
        : target.includes("FUZZ")
          ? target
          : `${target.replace(/\/$/, "")}/FUZZ`;
    const wordlist =
      (args.wordlist as string | undefined) ??
      (mode === "subdomain" ? DEFAULT_SUBDOMAIN_WORDLIST : DEFAULT_DIR_WORDLIST);

    const result = await runFfuf({
      url,
      wordlist,
      method: args.method as string | undefined,
      extensions: args.extensions as string[] | undefined,
      threads: args.threads as number | undefined,
      outputJson: true,
      extraFlags: args.extra_flags as string[] | undefined,
    });

    const rawFindings = parseFfufOutput(result.stdout);
    const subdomainMode = mode === "subdomain";
    const findings = subdomainMode
      ? rawFindings.map((f) => {
          const host = f.url.replace(/^https?:\/\//, "").split("/")[0];
          return { subdomain: host.replace(/^FUZZ\./, "") };
        })
      : rawFindings;

    const structured = buildStructuredScanResult({
      tool: "ffuf",
      engine: "ffuf",
      target,
      scanKind: subdomainMode ? "subdomains" : "web_fuzz",
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

export default ffufFuzz;
