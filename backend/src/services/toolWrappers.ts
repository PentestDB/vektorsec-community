import { exec } from "child_process";
import { promisify } from "util";
import { assertTargetIsExternal } from "../utils/ssrfGuard";

const execAsync = promisify(exec);

// ─── Tool Execution Wrappers ────────────────────────────────────────
// Connector เชื่อมต่อกับ Security Tools ผ่าน API หรือ CLI โดยตรง
// เช่น Metasploit RPC, Nuclei, SQLmap, OWASP ZAP API

export interface ToolExecResult {
  success: boolean;
  stdout: string;
  stderr: string;
  exitCode: number;
  durationMs: number;
}

export interface ToolWrapperConfig {
  // Timeout for each tool execution (ms)
  timeoutMs: number;
  // Working directory
  cwd?: string;
  // Environment variables
  env?: Record<string, string>;
}

export function createDefaultToolWrapperConfig(): ToolWrapperConfig {
  return {
    timeoutMs: 120000,
    cwd: process.env.WORKSPACE_DIR || "~/pentest-workspace",
  };
}

// ─── Generic CLI executor ───────────────────────────────────────────

export async function runCliCommand(
  command: string,
  config: ToolWrapperConfig = createDefaultToolWrapperConfig(),
): Promise<ToolExecResult> {
  const start = Date.now();
  try {
    const { stdout, stderr } = await execAsync(command, {
      timeout: config.timeoutMs,
      cwd: config.cwd,
      env: { ...process.env, ...config.env },
      maxBuffer: 10 * 1024 * 1024, // 10MB
    });
    return {
      success: true,
      stdout,
      stderr,
      exitCode: 0,
      durationMs: Date.now() - start,
    };
  } catch (err: any) {
    return {
      success: false,
      stdout: err.stdout ?? "",
      stderr: err.stderr ?? err.message ?? String(err),
      exitCode: err.code ?? 1,
      durationMs: Date.now() - start,
    };
  }
}

// ─── Nmap wrapper ───────────────────────────────────────────────────

export interface NmapOptions {
  target: string;
  ports?: string;
  scanType?: "syn" | "connect" | "udp" | "version" | "os";
  verbose?: boolean;
  outputXml?: boolean;
  extraFlags?: string[];
}

export async function runNmap(
  options: NmapOptions,
  config: ToolWrapperConfig = createDefaultToolWrapperConfig(),
): Promise<ToolExecResult> {
  await assertTargetIsExternal(options.target);
  const flags: string[] = ["nmap"];

  switch (options.scanType) {
    case "syn": flags.push("-sS"); break;
    case "connect": flags.push("-sT"); break;
    case "udp": flags.push("-sU"); break;
    case "version": flags.push("-sV"); break;
    case "os": flags.push("-O"); break;
    default: flags.push("-sV");
  }

  if (options.ports) flags.push(`-p ${options.ports}`);
  if (options.verbose) flags.push("-v");
  if (options.outputXml) flags.push("-oX -");
  if (options.extraFlags) flags.push(...options.extraFlags);

  flags.push(options.target);
  return runCliCommand(flags.join(" "), config);
}

// ─── Nuclei wrapper ─────────────────────────────────────────────────

export interface NucleiOptions {
  target: string;
  templates?: string;
  severity?: "info" | "low" | "medium" | "high" | "critical";
  tags?: string;
  outputJson?: boolean;
  extraFlags?: string[];
}

export async function runNuclei(
  options: NucleiOptions,
  config: ToolWrapperConfig = createDefaultToolWrapperConfig(),
): Promise<ToolExecResult> {
  await assertTargetIsExternal(options.target);
  const flags: string[] = ["nuclei"];

  if (options.templates) flags.push(`-t ${options.templates}`);
  if (options.severity) flags.push(`-severity ${options.severity}`);
  if (options.tags) flags.push(`-tags ${options.tags}`);
  if (options.outputJson) flags.push("-jsonl");
  if (options.extraFlags) flags.push(...options.extraFlags);

  flags.push("-u", options.target);
  return runCliCommand(flags.join(" "), config);
}

// ─── SQLmap wrapper ─────────────────────────────────────────────────

export interface SqlmapOptions {
  url: string;
  data?: string;
  level?: number;
  risk?: number;
  batch?: boolean;
  dump?: boolean;
  dbms?: string;
  extraFlags?: string[];
}

export async function runSqlmap(
  options: SqlmapOptions,
  config: ToolWrapperConfig = createDefaultToolWrapperConfig(),
): Promise<ToolExecResult> {
  await assertTargetIsExternal(options.url);
  const flags: string[] = ["sqlmap"];

  flags.push("-u", options.url);
  if (options.data) flags.push(`--data="${options.data}"`);
  if (options.level) flags.push(`--level=${options.level}`);
  if (options.risk) flags.push(`--risk=${options.risk}`);
  if (options.batch) flags.push("--batch");
  if (options.dump) flags.push("--dump");
  if (options.dbms) flags.push(`--dbms=${options.dbms}`);
  if (options.extraFlags) flags.push(...options.extraFlags);

  return runCliCommand(flags.join(" "), config);
}

// ─── FFUF wrapper ───────────────────────────────────────────────────

export interface FfufOptions {
  url: string;
  wordlist: string;
  method?: string;
  extensions?: string[];
  threads?: number;
  outputJson?: boolean;
  extraFlags?: string[];
}

export async function runFfuf(
  options: FfufOptions,
  config: ToolWrapperConfig = createDefaultToolWrapperConfig(),
): Promise<ToolExecResult> {
  await assertTargetIsExternal(options.url);
  const flags: string[] = ["ffuf"];

  flags.push("-u", options.url);
  flags.push("-w", options.wordlist);
  if (options.method) flags.push(`-X ${options.method}`);
  if (options.extensions) flags.push(`-e ${options.extensions.join(",")}`);
  if (options.threads) flags.push(`-t ${options.threads}`);
  if (options.outputJson) flags.push("-json");
  if (options.extraFlags) flags.push(...options.extraFlags);

  return runCliCommand(flags.join(" "), config);
}

// ─── Gobuster wrapper ───────────────────────────────────────────────

export interface GobusterOptions {
  target: string;
  wordlist: string;
  mode?: "dir" | "dns" | "vhost";
  extensions?: string[];
  threads?: number;
  extraFlags?: string[];
}

export async function runGobuster(
  options: GobusterOptions,
  config: ToolWrapperConfig = createDefaultToolWrapperConfig(),
): Promise<ToolExecResult> {
  await assertTargetIsExternal(options.target);
  const flags: string[] = ["gobuster"];

  switch (options.mode) {
    case "dir": flags.push("dir"); break;
    case "dns": flags.push("dns"); break;
    case "vhost": flags.push("vhost"); break;
    default: flags.push("dir");
  }

  flags.push("-u", options.target);
  flags.push("-w", options.wordlist);
  if (options.extensions) flags.push(`-x ${options.extensions.join(",")}`);
  if (options.threads) flags.push(`-t ${options.threads}`);
  if (options.extraFlags) flags.push(...options.extraFlags);

  return runCliCommand(flags.join(" "), config);
}

// ─── Hydra wrapper ──────────────────────────────────────────────────

export interface HydraOptions {
  target: string;
  service: string;
  username?: string;
  usernameList?: string;
  password?: string;
  passwordList?: string;
  port?: number;
  threads?: number;
  extraFlags?: string[];
}

export async function runHydra(
  options: HydraOptions,
  config: ToolWrapperConfig = createDefaultToolWrapperConfig(),
): Promise<ToolExecResult> {
  await assertTargetIsExternal(options.target);
  const flags: string[] = ["hydra"];

  if (options.username) flags.push(`-l ${options.username}`);
  if (options.usernameList) flags.push(`-L ${options.usernameList}`);
  if (options.password) flags.push(`-p ${options.password}`);
  if (options.passwordList) flags.push(`-P ${options.passwordList}`);
  if (options.threads) flags.push(`-t ${options.threads}`);
  if (options.port) flags.push(`-s ${options.port}`);
  if (options.extraFlags) flags.push(...options.extraFlags);

  flags.push(options.target, options.service);
  return runCliCommand(flags.join(" "), config);
}

// ─── OWASP ZAP API wrapper ──────────────────────────────────────────

export interface ZapApiConfig {
  baseUrl: string;
  apiKey?: string;
}

export async function zapApiRequest(
  path: string,
  params: Record<string, string> = {},
  config: ZapApiConfig,
): Promise<any> {
  const url = new URL(`${config.baseUrl}${path}`);
  if (config.apiKey) url.searchParams.set("apikey", config.apiKey);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }

  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error(`ZAP API request failed: ${response.status} ${response.statusText}`);
  }
  return response.json();
}

export async function zapStartScan(
  target: string,
  config: ZapApiConfig,
): Promise<string> {
  await assertTargetIsExternal(target);
  const result = await zapApiRequest("/JSON/ascan/action/scan/", { url: target }, config);
  return result.scan;
}

export async function zapGetScanStatus(
  scanId: string,
  config: ZapApiConfig,
): Promise<number> {
  const result = await zapApiRequest("/JSON/ascan/view/status/", { scanId }, config);
  return parseInt(result.status, 10);
}

export async function zapGetAlerts(
  config: ZapApiConfig,
  baseUrl?: string,
): Promise<any[]> {
  const params: Record<string, string> = {};
  if (baseUrl) params.baseurl = baseUrl;
  const result = await zapApiRequest("/JSON/core/view/alerts/", params, config);
  return result.alerts ?? [];
}

// ─── Metasploit RPC wrapper ─────────────────────────────────────────

export interface MsfRpcConfig {
  host: string;
  port: number;
  token: string;
}

export async function msfRpcCall(
  method: string,
  params: any[],
  config: MsfRpcConfig,
): Promise<any> {
  const response = await fetch(`http://${config.host}:${config.port}/api/1.0/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ _token: config.token, ...params }),
  });

  if (!response.ok) {
    throw new Error(`Metasploit RPC failed: ${response.status} ${response.statusText}`);
  }
  return response.json();
}

export async function msfGetModules(
  type: "exploit" | "auxiliary" | "post" | "payload",
  config: MsfRpcConfig,
): Promise<string[]> {
  const result = await msfRpcCall("module.list", [type], config);
  return Object.keys(result);
}

export async function msfRunExploit(
  module: string,
  options: Record<string, any>,
  config: MsfRpcConfig,
): Promise<any> {
  return msfRpcCall("module.execute", [module, options], config);
}

// ─── Tool availability check ────────────────────────────────────────

export async function isToolAvailable(tool: string): Promise<boolean> {
  try {
    const result = await runCliCommand(`which ${tool}`, {
      timeoutMs: 5000,
    });
    return result.success;
  } catch {
    return false;
  }
}

export async function checkToolsAvailability(
  tools: string[],
): Promise<Record<string, boolean>> {
  const results: Record<string, boolean> = {};
  for (const tool of tools) {
    results[tool] = await isToolAvailable(tool);
  }
  return results;
}
