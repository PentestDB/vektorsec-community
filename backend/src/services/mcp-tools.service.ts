import fs from "fs";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import { z } from "zod";
import { Client as SSHClient } from "ssh2";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import SessionsModel from "../models/Sessions/Sessions.model";
import WorkspaceModel from "../models/Workspace/Workspace.model";
import HistoryArchiveModel from "../models/HistoryArchive/HistoryArchive.model";
import { UserDoc } from "../models/User/User.model";
import { buildExecutionContext } from "./agent.tools";
import { sessionLifecycle } from "./session.lifecycle";
import { toolRegistry } from "../tools/registry";
import { ToolResult } from "../tools/types";
import { readEnvFile, updateEnvVars } from "../utils/envWriter";
import { buildSSHConfig } from "../utils/sshConfig";
import { execSSHCommand } from "./ssh.service";
import { getVncDisplay, getVncRfbPort, getWebsockifyPort, KALI_DATA_DIR } from "../config/constants";
import { abortSession, hasActiveController, setPaused } from "./agent.service";

const SERVER_NAME = "pentest-copilot";
const SERVER_VERSION = "1.0.0";
const ALLOW_DANGEROUS = process.env.PENTEST_MCP_ALLOW_DANGEROUS === "1";
const MAX_OUTPUT_CHARS = parseInt(process.env.PENTEST_MCP_MAX_OUTPUT_CHARS || "60000", 10);
const VPN_DIR = path.join(KALI_DATA_DIR, "vpn-profiles");
const PROVIDER_MAP: Record<string, string> = {
  anthropic: "anthropic",
  openai: "openai",
  google: "google-ai",
  minimax: "openai-generic",
  openrouter: "openai-generic",
  "openai-compatible": "openai-generic",
};

const operationLocks = new Map<string, Promise<unknown>>();

type HealthStatus = "ready" | "misconfigured" | "missing" | "unreachable" | "degraded";

interface HealthCheckResult {
  component: string;
  status: HealthStatus;
  canAutoRepair: boolean;
  summary: string;
  missingItems: string[];
  nextAction: string;
}

function textResult(text: string, structuredContent?: Record<string, unknown>) {
  return structuredContent
    ? { content: [{ type: "text", text }], structuredContent }
    : { content: [{ type: "text", text }] };
}

function formatToolResult(result: ToolResult): string {
  let output = truncate(result.output || "");
  if (typeof result.exitCode === "number" && result.exitCode !== 0) {
    output += `\n\n[exit code: ${result.exitCode}]`;
  }
  if (result.files?.length) {
    output += `\n\n[output files: ${result.files.join(", ")}]`;
  }
  if (result.installSuggestion) {
    output += `\n\n[install suggestion: ${result.installSuggestion.label} via ${result.installSuggestion.installCommand}]`;
  }
  return output.trim();
}

function truncate(output: string): string {
  if (output.length <= MAX_OUTPUT_CHARS) return output;
  const half = Math.floor(MAX_OUTPUT_CHARS / 2);
  return `${output.slice(0, half)}\n\n... [truncated ${output.length - MAX_OUTPUT_CHARS} chars] ...\n\n${output.slice(-half)}`;
}

async function withSerializedLock<T>(key: string, work: () => Promise<T>): Promise<T> {
  const prior = operationLocks.get(key) || Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  operationLocks.set(key, prior.then(() => current));
  await prior;
  try {
    return await work();
  } finally {
    release();
    if (operationLocks.get(key) === current) {
      operationLocks.delete(key);
    }
  }
}

function sanitizeProfileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_\-.]/g, "_").substring(0, 64);
}

function ensureVPNDir(): void {
  if (!fs.existsSync(VPN_DIR)) {
    fs.mkdirSync(VPN_DIR, { recursive: true });
  }
}

function listLocalProfiles(): Array<{ name: string; filename: string; path: string; size: number }> {
  ensureVPNDir();
  const files = fs.readdirSync(VPN_DIR).filter((entry) => entry.endsWith(".ovpn") || entry.endsWith(".conf"));
  return files.map((entry) => {
    const fullPath = path.join(VPN_DIR, entry);
    const stat = fs.statSync(fullPath);
    return {
      name: entry.replace(/\.(ovpn|conf)$/i, ""),
      filename: entry,
      path: fullPath,
      size: stat.size,
    };
  });
}

function shellEscape(input: string): string {
  return `'${input.replace(/'/g, `'\\''`)}'`;
}

function sudoWrap(command: string, sshConfig: { username?: string; password?: string }, isScriptPath = false): string {
  const run = isScriptPath ? `bash ${shellEscape(command)}` : `sh -c ${shellEscape(command)}`;
  if (sshConfig.username === "root") return run;
  if (sshConfig.password) {
    return `echo ${shellEscape(sshConfig.password)} | sudo -S ${run}`;
  }
  return `sudo -n ${run}`;
}

function sshConnectPromise(sshConfig: ReturnType<typeof buildSSHConfig>): Promise<SSHClient> {
  return new Promise((resolve, reject) => {
    const ssh = new SSHClient();
    ssh.on("ready", () => resolve(ssh));
    ssh.on("error", (err) => reject(err));
    ssh.connect(sshConfig);
  });
}

function sshExecPromise(ssh: SSHClient, command: string): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve, reject) => {
    ssh.exec(command, (err, stream) => {
      if (err) return reject(err);
      let stdout = "";
      let stderr = "";
      stream.on("data", (chunk: Buffer) => {
        stdout += chunk.toString();
      });
      stream.stderr.on("data", (chunk: Buffer) => {
        stderr += chunk.toString();
      });
      stream.on("close", (code: number) => {
        resolve({ stdout, stderr, code });
      });
    });
  });
}

function uploadFileViaSftp(ssh: SSHClient, localPath: string, remotePath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    ssh.sftp((err, sftp) => {
      if (err) return reject(err);
      sftp.fastPut(localPath, remotePath, (putErr) => {
        if (putErr) return reject(putErr);
        resolve();
      });
    });
  });
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

async function getOwnedSession(user: UserDoc, engagementId: string) {
  const session = await SessionsModel.findOne({
    uid: user._id,
    sessionId: engagementId,
    status: "active",
  });
  if (!session) {
    throw new Error(`Engagement not found: ${engagementId}`);
  }
  return session;
}

async function getExecutionContext(sessionId: string, agentId: string) {
  const shellManager = await sessionLifecycle.getShellManager(sessionId);
  if (!shellManager.isConnected) {
    await shellManager.connect();
  }
  return buildExecutionContext({
    sessionId,
    agentId,
    agentRole: "main",
    shellManager,
  });
}

async function executeLowLevelTool(sessionId: string, agentId: string, toolName: string, args: Record<string, unknown>) {
  const tool = toolRegistry.get(toolName);
  if (!tool) throw new Error(`Unsupported tool: ${toolName}`);
  const ctx = await getExecutionContext(sessionId, agentId);
  const dangerous = tool.shouldRequireConsent?.(args, ctx) ?? tool.requiresConsent ?? false;
  if (dangerous && !ALLOW_DANGEROUS) {
    throw new Error(
      `Blocked: ${toolName} was flagged as dangerous. Re-run with PENTEST_MCP_ALLOW_DANGEROUS=1 on the backend to allow destructive commands.`,
    );
  }
  const result = await tool.execute(args, ctx);
  return { result, ctx };
}

function sessionSummary(session: any) {
  return {
    engagementId: session.sessionId,
    workspaceId: session.workspaceId,
    name: session.name,
    description: session.description,
    agentState: session.agentState,
    createdAt: session.createdAt,
    target: session.mcpContext?.target || null,
    scope: session.mcpContext?.scope || null,
    notes: session.mcpContext?.notes || null,
    credentials: session.mcpContext?.credentials || null,
    labels: session.mcpContext?.labels || [],
    findingsCount: session.mcpFindings?.length || 0,
    shellCount: session.shells?.length || 0,
    totalTokens: session.totalTokens || 0,
  };
}

async function collectPlatformHealth(component = "all"): Promise<HealthCheckResult[]> {
  const env = readEnvFile();
  const checks: HealthCheckResult[] = [];
  const selected = component === "all"
    ? ["ssh", "shell", "burp", "magnitude", "vpn", "google_search"]
    : [component];

  if (selected.includes("ssh") || selected.includes("shell")) {
    const missing = [
      !env.SSH_HOST && "SSH_HOST",
      !env.SSH_PORT && "SSH_PORT",
      !env.SSH_USERNAME && "SSH_USERNAME",
      !env.SSH_PASSWORD && !env.SSH_PRIVATE_KEY && "SSH_PASSWORD or SSH_PRIVATE_KEY",
    ].filter(Boolean) as string[];
    if (missing.length > 0) {
      checks.push({
        component: "ssh",
        status: "missing",
        canAutoRepair: false,
        summary: "SSH is not fully configured",
        missingItems: missing,
        nextAction: "Run platform_setup with ssh settings or configure SSH / Exploit Box in Settings.",
      });
    } else {
      try {
        const whoami = (await execSSHCommand("whoami", 8000)).trim();
        checks.push({
          component: "ssh",
          status: "ready",
          canAutoRepair: false,
          summary: `SSH connected as ${whoami}`,
          missingItems: [],
          nextAction: "None",
        });
      } catch (error: any) {
        checks.push({
          component: "ssh",
          status: "unreachable",
          canAutoRepair: false,
          summary: `SSH connection failed: ${error.message || error}`,
          missingItems: [],
          nextAction: "Verify the attack box is running and the SSH credentials are correct.",
        });
      }
    }
  }

  if (selected.includes("burp")) {
    if (!env.BURP_RPC_HOST) {
      checks.push({
        component: "burp",
        status: "missing",
        canAutoRepair: false,
        summary: "Burp RPC is not configured",
        missingItems: ["BURP_RPC_HOST", "BURP_RPC_PORT"],
        nextAction: "Set Burp host/port in platform_setup or Settings -> Burp Suite.",
      });
    } else {
      try {
        const { BurpClient } = await import("burp-rpc");
        const client = new BurpClient({
          host: env.BURP_RPC_HOST,
          port: parseInt(env.BURP_RPC_PORT || "50051", 10),
        });
        try {
          const ping = await client.ping();
          checks.push({
            component: "burp",
            status: "ready",
            canAutoRepair: false,
            summary: `Burp RPC reachable (${ping.burpVersion})`,
            missingItems: [],
            nextAction: "None",
          });
        } finally {
          client.close();
        }
      } catch (error: any) {
        checks.push({
          component: "burp",
          status: "unreachable",
          canAutoRepair: false,
          summary: `Burp RPC is configured but unreachable: ${error.message || error}`,
          missingItems: [],
          nextAction: "Open Burp locally, load the Burp RPC extension, and ensure the configured host/port are correct.",
        });
      }
    }
  }

  if (selected.includes("magnitude")) {
    const enabled = env.MAGNITUDE_ENABLED === "true";
    const provider = env.MAGNITUDE_MODEL_PROVIDER || "";
    const model = env.MAGNITUDE_MODEL || "";
    const apiKey = env.MAGNITUDE_MODEL_API_KEY || "";
    const missing = [
      !enabled && "MAGNITUDE_ENABLED=true",
      !provider && "MAGNITUDE_MODEL_PROVIDER",
      !model && "MAGNITUDE_MODEL",
      !apiKey && "MAGNITUDE_MODEL_API_KEY",
    ].filter(Boolean) as string[];

    if (missing.length > 0) {
      checks.push({
        component: "magnitude",
        status: "missing",
        canAutoRepair: false,
        summary: "Magnitude is not fully configured",
        missingItems: missing,
        nextAction: "Run platform_setup with magnitude settings, then retry platform_health.",
      });
    } else {
      try {
        await import("magnitude-core");
        checks.push({
          component: "magnitude",
          status: "ready",
          canAutoRepair: false,
          summary: `Magnitude ready with ${provider}/${model}`,
          missingItems: [],
          nextAction: "None",
        });
      } catch (error: any) {
        checks.push({
          component: "magnitude",
          status: "degraded",
          canAutoRepair: false,
          summary: `Magnitude dependency load failed: ${error.message || error}`,
          missingItems: [],
          nextAction: "Reinstall backend dependencies and verify browser-agent packages are present.",
        });
      }
    }
  }

  if (selected.includes("vpn")) {
    const profiles = listLocalProfiles();
    if (profiles.length === 0) {
      checks.push({
        component: "vpn",
        status: "missing",
        canAutoRepair: false,
        summary: "No VPN profiles have been uploaded",
        missingItems: ["VPN profile (.ovpn or .conf)"],
        nextAction: "Use vpn_manage upload_profile before attempting a connection.",
      });
    } else {
      try {
        await execSSHCommand("command -v openvpn >/dev/null 2>&1 && echo READY || echo MISSING", 8000);
        checks.push({
          component: "vpn",
          status: "ready",
          canAutoRepair: true,
          summary: `${profiles.length} VPN profile(s) available`,
          missingItems: [],
          nextAction: "Use vpn_manage connect to bring one up.",
        });
      } catch (error: any) {
        checks.push({
          component: "vpn",
          status: "unreachable",
          canAutoRepair: true,
          summary: `VPN prerequisites could not be verified over SSH: ${error.message || error}`,
          missingItems: [],
          nextAction: "Fix SSH first, then rerun platform_health.",
        });
      }
    }
  }

  if (selected.includes("google_search")) {
    const missing = [
      !env["GOOGLE-API-KEY"] && "GOOGLE-API-KEY",
      !env["CUSTOM-SEARCH-ENGINE-ID"] && "CUSTOM-SEARCH-ENGINE-ID",
    ].filter(Boolean) as string[];

    checks.push({
      component: "google_search",
      status: missing.length > 0 ? "missing" : "ready",
      canAutoRepair: false,
      summary: missing.length > 0 ? "Google Custom Search is not fully configured" : "Google Custom Search is configured",
      missingItems: missing,
      nextAction: missing.length > 0
        ? "Run platform_setup with google_search settings."
        : "None",
    });
  }

  return checks.filter((check) => component === "all" || check.component === component);
}

function buildRepairSteps(component: string, health: HealthCheckResult[]): string {
  const sshStep = [
    "1. Open Settings -> SSH / Exploit Box or call platform_setup with SSH values.",
    "2. Set SSH host, port, username, and either a password or private key.",
    "3. Ensure the attack box is running and reachable on that host/port.",
    "4. Re-run platform_health for ssh.",
  ].join("\n");

  const burpStep = [
    "1. Start Burp Suite locally.",
    "2. Load the Burp RPC extension jar into Burp.",
    "3. Make sure the extension is listening on the configured host/port.",
    "4. Save BURP_RPC_HOST and BURP_RPC_PORT via platform_setup or Settings -> Burp Suite.",
    "5. Re-run platform_health for burp.",
  ].join("\n");

  const magnitudeStep = [
    "1. Set MAGNITUDE_ENABLED=true.",
    "2. Configure MAGNITUDE_MODEL_PROVIDER, MAGNITUDE_MODEL, and MAGNITUDE_MODEL_API_KEY.",
    "3. Optionally set MAGNITUDE_MODEL_BASE_URL, MAGNITUDE_PROXY_URL, and MAGNITUDE_DISPLAY.",
    "4. Re-run platform_health for magnitude, then test with browser_run.",
  ].join("\n");

  const vpnStep = [
    "1. Upload a VPN profile with vpn_manage action=upload_profile.",
    "2. Verify SSH is healthy so Pentest Copilot can reach the attack box.",
    "3. Ensure openvpn is installed on the attack box.",
    "4. Use vpn_manage action=connect when ready.",
  ].join("\n");

  const googleStep = [
    "1. Create or retrieve a Google Custom Search API key.",
    "2. Create a Custom Search Engine and copy its engine ID.",
    "3. Save GOOGLE-API-KEY and CUSTOM-SEARCH-ENGINE-ID via platform_setup.",
    "4. Re-run platform_health for google_search.",
  ].join("\n");

  const mapping: Record<string, string> = {
    ssh: sshStep,
    shell: sshStep,
    burp: burpStep,
    magnitude: magnitudeStep,
    vpn: vpnStep,
    google_search: googleStep,
    all: health.map((item) => `## ${item.component}\n${buildRepairSteps(item.component, health)}`).join("\n\n"),
  };

  return mapping[component] || mapping.all;
}

async function applyRepair(component: string): Promise<string> {
  if (component === "vpn") {
    await execSSHCommand(
      "command -v openvpn >/dev/null 2>&1 || " +
      "(export DEBIAN_FRONTEND=noninteractive && sudo apt-get update -qq && sudo apt-get install -y -qq openvpn)",
      120_000,
    );
    return "Attempted to install openvpn on the attack box.";
  }

  if (component === "all") {
    const results: string[] = [];
    try {
      results.push(await applyRepair("vpn"));
    } catch (error: any) {
      results.push(`VPN repair skipped: ${error.message || error}`);
    }
    return results.join("\n");
  }

  return `No automatic repair is available for ${component}. Use explain mode for guided steps.`;
}

async function applyPlatformSetup(input: {
  ssh?: Record<string, unknown>;
  burp?: Record<string, unknown>;
  magnitude?: Record<string, unknown>;
  google_search?: Record<string, unknown>;
  safety?: Record<string, unknown>;
}) {
  const env = readEnvFile();
  const updates: Record<string, string> = {};

  if (input.ssh) {
    const ssh = input.ssh;
    if (ssh.host !== undefined) updates.SSH_HOST = String(ssh.host || "");
    if (ssh.port !== undefined) updates.SSH_PORT = String(ssh.port || "");
    if (ssh.username !== undefined) updates.SSH_USERNAME = String(ssh.username || "");
    if (ssh.password !== undefined) updates.SSH_PASSWORD = String(ssh.password || "");
    if (ssh.privateKey !== undefined) updates.SSH_PRIVATE_KEY = String(ssh.privateKey || "");
    if (ssh.privateKeyPassphrase !== undefined) {
      updates.SSH_PRIVATE_KEY_PASSPHRASE = String(ssh.privateKeyPassphrase || "");
    }
  }

  if (input.burp) {
    const burp = input.burp;
    if (burp.host !== undefined) updates.BURP_RPC_HOST = String(burp.host || "");
    if (burp.port !== undefined) updates.BURP_RPC_PORT = String(burp.port || "50051");
  }

  if (input.magnitude) {
    const magnitude = input.magnitude;
    if (magnitude.enabled !== undefined) updates.MAGNITUDE_ENABLED = String(!!magnitude.enabled);
    if (magnitude.proxyUrl !== undefined) updates.MAGNITUDE_PROXY_URL = String(magnitude.proxyUrl || "");
    if (magnitude.headless !== undefined) updates.MAGNITUDE_HEADLESS = String(magnitude.headless !== false);
    if (magnitude.display !== undefined) updates.MAGNITUDE_DISPLAY = String(magnitude.display || "");
    if (magnitude.modelProvider !== undefined) updates.MAGNITUDE_MODEL_PROVIDER = String(magnitude.modelProvider || "");
    if (magnitude.model !== undefined) updates.MAGNITUDE_MODEL = String(magnitude.model || "");
    if (magnitude.apiKey !== undefined) updates.MAGNITUDE_MODEL_API_KEY = String(magnitude.apiKey || "");
    if (magnitude.baseURL !== undefined) updates.MAGNITUDE_MODEL_BASE_URL = String(magnitude.baseURL || "");
  }

  if (input.google_search) {
    const google = input.google_search;
    if (google.apiKey !== undefined) updates["GOOGLE-API-KEY"] = String(google.apiKey || "");
    if (google.searchEngineId !== undefined) {
      updates["CUSTOM-SEARCH-ENGINE-ID"] = String(google.searchEngineId || "");
    }
  }

  if (input.safety) {
    const safety = input.safety;
    if (safety.allowDangerousMcp !== undefined) {
      updates.PENTEST_MCP_ALLOW_DANGEROUS = String(safety.allowDangerousMcp ? 1 : 0);
    }
    if (safety.maxOutputChars !== undefined) {
      updates.PENTEST_MCP_MAX_OUTPUT_CHARS = String(safety.maxOutputChars || env.PENTEST_MCP_MAX_OUTPUT_CHARS || "60000");
    }
  }

  updateEnvVars(updates);
  return updates;
}

async function uploadVpnProfile(profileName: string, content: string, encoded = false) {
  ensureVPNDir();
  const safeName = sanitizeProfileName(profileName);
  const ext = safeName.endsWith(".conf") || safeName.endsWith(".ovpn")
    ? ""
    : ".ovpn";
  const filename = `${safeName}${ext}`;
  const filePath = path.join(VPN_DIR, filename);
  const buffer = encoded ? Buffer.from(content, "base64") : Buffer.from(content, "utf8");
  fs.writeFileSync(filePath, buffer);
  return { filename, path: filePath, size: buffer.length, name: filename.replace(/\.(ovpn|conf)$/i, "") };
}

async function connectVpnProfile(sessionId: string, profileName: string) {
  const safeName = sanitizeProfileName(profileName);
  const profile = listLocalProfiles().find((candidate) => candidate.name === safeName);
  if (!profile) {
    throw new Error(`VPN profile not found: ${safeName}`);
  }

  const sshConfig = buildSSHConfig();
  const ssh = await withTimeout(sshConnectPromise(sshConfig), 15000, "SSH connect for VPN");
  try {
    const remotePath = `/tmp/vpn-${safeName}.ovpn`;
    await withTimeout(uploadFileViaSftp(ssh, profile.path, remotePath), 30000, "Upload VPN profile");

    const logFile = `/tmp/openvpn-${safeName}.log`;
    const pidFile = `/tmp/openvpn-${safeName}.pid`;
    const scriptPath = `/tmp/vpn-start-${safeName}.sh`;
    const scriptContent = [
      "#!/bin/bash",
      `rm -f ${pidFile}`,
      `openvpn --config ${remotePath} --daemon --log ${logFile} --writepid ${pidFile}`,
      "sleep 2",
      `if [ -f ${pidFile} ] && kill -0 $(cat ${pidFile}) 2>/dev/null; then`,
      "  echo STARTED",
      "else",
      "  echo FAILED",
      `  [ -f ${logFile} ] && sed -n '1,120p' ${logFile}`,
      "fi",
    ].join("\n");

    const localScriptPath = path.join(VPN_DIR, `vpn-start-${safeName}.sh`);
    fs.writeFileSync(localScriptPath, scriptContent, "utf8");
    try {
      await withTimeout(uploadFileViaSftp(ssh, localScriptPath, scriptPath), 10000, "Upload VPN start script");
    } finally {
      fs.unlinkSync(localScriptPath);
    }

    const startCmd = sudoWrap(scriptPath, sshConfig, true);
    const { stdout, stderr, code } = await withTimeout(sshExecPromise(ssh, startCmd), 25000, "VPN start");
    if (code === 0 && stdout.includes("STARTED")) {
      return { message: `VPN "${safeName}" connected`, profileName: safeName };
    }
    throw new Error(stderr?.trim() || stdout.replace("FAILED", "").trim() || `Failed to start VPN "${safeName}"`);
  } finally {
    ssh.end();
  }
}

async function disconnectVpnConnection(pid?: string, profileName?: string) {
  const sshConfig = buildSSHConfig();
  const ssh = await sshConnectPromise(sshConfig);
  try {
    let rawCommand = "";
    if (pid) {
      rawCommand = `kill ${parseInt(pid, 10)} 2>/dev/null && echo 'KILLED'`;
    } else if (profileName) {
      const safeName = sanitizeProfileName(profileName);
      const pidFile = `/tmp/openvpn-${safeName}.pid`;
      rawCommand = `if [ -f ${pidFile} ]; then kill $(cat ${pidFile}) 2>/dev/null && rm -f ${pidFile} && echo 'KILLED'; else echo 'NOT_FOUND'; fi`;
    } else {
      rawCommand = "pkill openvpn 2>/dev/null; rm -f /tmp/openvpn-*.pid /tmp/vpn-*.ovpn; echo 'DONE'";
    }
    const { stdout } = await sshExecPromise(ssh, sudoWrap(rawCommand, sshConfig));
    return stdout.trim();
  } finally {
    ssh.end();
  }
}

async function vpnStatus() {
  const sshConfig = buildSSHConfig();
  const ssh = await sshConnectPromise(sshConfig);
  try {
    const { stdout: pgrepOut, code } = await sshExecPromise(ssh, "pgrep -a openvpn 2>/dev/null");
    if (code !== 0 || !pgrepOut.trim()) {
      return { success: false, connections: [], message: "No VPN connections active" };
    }

    const lines = pgrepOut.trim().split("\n").filter(Boolean);
    const connections = lines.map((line) => {
      const parts = line.trim().split(/\s+/);
      const pid = parts[0];
      const configIndex = parts.indexOf("--config");
      const configFile = configIndex !== -1 ? parts[configIndex + 1] || "" : "";
      const profileName = configFile ? path.basename(configFile, path.extname(configFile)).replace(/^vpn-/, "") : "unknown";
      return { pid, profile_name: profileName, config_file: configFile };
    });
    return { success: true, connections, message: `${connections.length} VPN connection(s) active` };
  } finally {
    ssh.end();
  }
}

export function buildMcpServerForUser(user: UserDoc): McpServer {
  const server = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION },
    {
      capabilities: { tools: {} },
      instructions:
        "Pentest Copilot exposes platform setup, engagement control, shell access, Burp workflows, browser automation, VPN management, findings, and artifacts over MCP.",
    },
  );

  server.registerTool(
    "platform_health",
    {
      description: "Check whether SSH, shell, Burp, Magnitude, VPN, and Google search are correctly configured and reachable.",
      inputSchema: {
        component: z.enum(["all", "ssh", "shell", "burp", "magnitude", "vpn", "google_search"]).optional(),
      },
    },
    async ({ component = "all" }) => {
      const health = await collectPlatformHealth(component);
      const text = health
        .map((item) => `- ${item.component}: ${item.status} — ${item.summary}`)
        .join("\n");
      return textResult(text || "No health checks were run.", { health });
    },
  );

  server.registerTool(
    "platform_setup",
    {
      description: "Persist platform configuration for SSH, Burp, Magnitude, Google search, and MCP safety flags.",
      inputSchema: {
        ssh: z.object({
          host: z.string().optional(),
          port: z.union([z.string(), z.number()]).optional(),
          username: z.string().optional(),
          password: z.string().optional(),
          privateKey: z.string().optional(),
          privateKeyPassphrase: z.string().optional(),
        }).optional(),
        burp: z.object({
          host: z.string().optional(),
          port: z.union([z.string(), z.number()]).optional(),
        }).optional(),
        magnitude: z.object({
          enabled: z.boolean().optional(),
          proxyUrl: z.string().optional(),
          headless: z.boolean().optional(),
          display: z.string().optional(),
          modelProvider: z.string().optional(),
          model: z.string().optional(),
          apiKey: z.string().optional(),
          baseURL: z.string().optional(),
        }).optional(),
        google_search: z.object({
          apiKey: z.string().optional(),
          searchEngineId: z.string().optional(),
        }).optional(),
        safety: z.object({
          allowDangerousMcp: z.boolean().optional(),
          maxOutputChars: z.number().optional(),
        }).optional(),
      },
    },
    async (args) => {
      const updated = await withSerializedLock("platform_setup", () => applyPlatformSetup(args));
      return textResult(`Updated ${Object.keys(updated).length} configuration values.`, { updated });
    },
  );

  server.registerTool(
    "platform_repair",
    {
      description: "Explain or apply repair steps for Burp, Magnitude, VPN, SSH, shell, or Google search setup issues.",
      inputSchema: {
        component: z.enum(["all", "ssh", "shell", "burp", "magnitude", "vpn", "google_search"]),
        mode: z.enum(["explain", "apply_safe", "apply"]).default("explain"),
      },
    },
    async ({ component, mode }) => {
      const health = await collectPlatformHealth(component === "all" ? "all" : component);
      if (mode === "explain") {
        return textResult(buildRepairSteps(component, health), { health });
      }

      const outcome = await withSerializedLock(`repair:${component}`, async () => applyRepair(component));
      const after = await collectPlatformHealth(component === "all" ? "all" : component);
      return textResult(`${outcome}\n\nPost-repair health:\n${after.map((item) => `- ${item.component}: ${item.status}`).join("\n")}`, { health: after });
    },
  );

  server.registerTool(
    "engagement_open",
    {
      description: "Create a new engagement or reopen an existing one. Engagements map to Pentest Copilot sessions.",
      inputSchema: {
        engagement_id: z.string().optional(),
        name: z.string().optional(),
        workspace_name: z.string().optional(),
        description: z.string().optional(),
        target: z.string().optional(),
        scope: z.string().optional(),
        notes: z.string().optional(),
        credentials: z.string().optional(),
        labels: z.array(z.string()).optional(),
      },
    },
    async ({ engagement_id, name, workspace_name, description, target, scope, notes, credentials, labels }) => {
      if (engagement_id) {
        const session = await getOwnedSession(user, engagement_id);
        return textResult(`Resumed engagement ${session.sessionId}.`, { engagement: sessionSummary(session) });
      }

      const workspaceId = uuidv4();
      const workspaceName = (workspace_name || name || target || "MCP Engagement").substring(0, 50);
      await new WorkspaceModel({
        uid: user._id,
        workspaceId,
        name: workspaceName,
        description: (description || notes || "").substring(0, 500),
        type: "general",
        createdAt: new Date(),
      }).save();

      const sessionId = uuidv4();
      await new HistoryArchiveModel({ sessionId, history: [] }).save();

      const session = await new SessionsModel({
        uid: user._id,
        sessionId,
        workspaceId,
        name: (name || target || "MCP Engagement").substring(0, 50),
        description: (description || notes || "").substring(0, 500),
        createdAt: new Date(),
        mcpContext: {
          target,
          scope,
          notes,
          credentials,
          labels: labels || [],
        },
      }).save();

      return textResult(`Created engagement ${sessionId}.`, { engagement: sessionSummary(session) });
    },
  );

  server.registerTool(
    "engagement_status",
    {
      description: "Return the current state of an engagement, including context, shells, findings, and agent state.",
      inputSchema: {
        engagement_id: z.string(),
      },
    },
    async ({ engagement_id }) => {
      const session = await getOwnedSession(user, engagement_id);
      return textResult(
        `Engagement ${engagement_id}: ${session.agentState}. Shells: ${session.shells.length}. Findings: ${session.mcpFindings?.length || 0}.`,
        {
          engagement: {
            ...sessionSummary(session),
            pendingConsent: session.pendingConsent || null,
            pendingManualExecution: session.pendingManualExecution || null,
            shells: session.shells || [],
            findings: session.mcpFindings || [],
            messageCount: session.messages.length,
          },
        },
      );
    },
  );

  server.registerTool(
    "engagement_update",
    {
      description: "Update target context, notes, credentials, scope, labels, or engagement naming metadata.",
      inputSchema: {
        engagement_id: z.string(),
        name: z.string().optional(),
        description: z.string().optional(),
        target: z.string().optional(),
        scope: z.string().optional(),
        notes: z.string().optional(),
        credentials: z.string().optional(),
        labels: z.array(z.string()).optional(),
      },
    },
    async ({ engagement_id, ...updates }) => {
      const session = await getOwnedSession(user, engagement_id);
      if (updates.name !== undefined) session.name = updates.name.substring(0, 50);
      if (updates.description !== undefined) session.description = updates.description.substring(0, 500);
      session.mcpContext = {
        ...(session.mcpContext || {}),
        ...(updates.target !== undefined ? { target: updates.target } : {}),
        ...(updates.scope !== undefined ? { scope: updates.scope } : {}),
        ...(updates.notes !== undefined ? { notes: updates.notes } : {}),
        ...(updates.credentials !== undefined ? { credentials: updates.credentials } : {}),
        ...(updates.labels !== undefined ? { labels: updates.labels } : {}),
      };
      await session.save();
      return textResult(`Updated engagement ${engagement_id}.`, { engagement: sessionSummary(session) });
    },
  );

  server.registerTool(
    "engagement_pause",
    {
      description: "Pause an engagement and abort any active built-in agent controller if one is running.",
      inputSchema: {
        engagement_id: z.string(),
      },
    },
    async ({ engagement_id }) => {
      const session = await getOwnedSession(user, engagement_id);
      if (hasActiveController(engagement_id)) {
        abortSession(engagement_id);
      }
      await setPaused(engagement_id, true);
      session.agentState = "paused";
      await session.save();
      return textResult(`Paused engagement ${engagement_id}.`);
    },
  );

  server.registerTool(
    "engagement_history",
    {
      description: "Return engagement message history, archive history, shell summaries, and findings.",
      inputSchema: {
        engagement_id: z.string(),
        limit: z.number().optional(),
      },
    },
    async ({ engagement_id, limit = 50 }) => {
      const session = await getOwnedSession(user, engagement_id);
      const archive = await HistoryArchiveModel.findOne({ sessionId: engagement_id }).lean();
      const messages = session.messages.slice(-limit);
      return textResult(
        `Returned ${messages.length} live messages and ${(archive?.history || []).length} archived history items.`,
        {
          liveMessages: messages,
          archiveHistory: archive?.history || [],
          shells: session.shells || [],
          findings: session.mcpFindings || [],
        },
      );
    },
  );

  server.registerTool(
    "shell_exec",
    {
      description: "Run a one-shot command on the attack box within an engagement context.",
      inputSchema: {
        engagement_id: z.string(),
        agent_id: z.string().optional(),
        command: z.string(),
        timeout_seconds: z.number().optional(),
      },
    },
    async ({ engagement_id, agent_id = "mcp", command, timeout_seconds }) => {
      await getOwnedSession(user, engagement_id);
      const { result } = await executeLowLevelTool(engagement_id, agent_id, "run_bash", { command, timeout_seconds });
      return textResult(formatToolResult(result));
    },
  );

  server.registerTool(
    "shell_session",
    {
      description: "Manage persistent shell sessions for an engagement. Actions: open, write, read, close, list.",
      inputSchema: {
        engagement_id: z.string(),
        agent_id: z.string().optional(),
        action: z.enum(["open", "write", "read", "close", "list"]),
        label: z.string().optional(),
        purpose: z.enum(["exploit-box", "reverse-shell", "listener"]).optional(),
        rows: z.number().optional(),
        cols: z.number().optional(),
        shell_id: z.string().optional(),
        input: z.string().optional(),
        last_n_lines: z.number().optional(),
      },
    },
    async ({ engagement_id, agent_id = "mcp", action, ...rest }) => {
      await getOwnedSession(user, engagement_id);
      if (action === "list") {
        const session = await getOwnedSession(user, engagement_id);
        return textResult(`Found ${session.shells.length} shell records.`, { shells: session.shells || [] });
      }

      const mapping: Record<string, string> = {
        open: "spawn_shell",
        write: "write_to_shell",
        read: "read_shell",
        close: "close_shell",
      };
      const { result } = await executeLowLevelTool(engagement_id, agent_id, mapping[action], rest);
      return textResult(formatToolResult(result));
    },
  );

  server.registerTool(
    "burp",
    {
      description: "Operate Burp Suite through Pentest Copilot. Actions: status, request, intruder, history, collaborator.",
      inputSchema: {
        engagement_id: z.string().optional(),
        agent_id: z.string().optional(),
        action: z.enum(["status", "request", "intruder", "history", "collaborator"]),
        host: z.string().optional(),
        port: z.number().optional(),
        secure: z.boolean().optional(),
        raw_request: z.string().optional(),
        tab_name: z.string().optional(),
        insertion_points: z.array(z.object({ start: z.number(), end: z.number() })).optional(),
        search: z.string().optional(),
        methods: z.string().optional(),
        status_min: z.number().optional(),
        status_max: z.number().optional(),
        hide_assets: z.boolean().optional(),
        entry_id: z.number().optional(),
        collaborator_action: z.enum(["generate", "poll"]).optional(),
        secret_key: z.string().optional(),
        custom_data: z.string().optional(),
      },
    },
    async ({ engagement_id = "mcp", agent_id = "mcp", action, collaborator_action, ...rest }) => {
      if (action === "status") {
        const health = await collectPlatformHealth("burp");
        return textResult(health[0]?.summary || "Burp status unavailable.", { health });
      }
      if (action === "request") {
        const { result } = await executeLowLevelTool(engagement_id, agent_id, "send_to_burp_repeater", rest);
        return textResult(formatToolResult(result));
      }
      if (action === "intruder") {
        const { result } = await executeLowLevelTool(engagement_id, agent_id, "send_to_burp_intruder", rest);
        return textResult(formatToolResult(result));
      }
      if (action === "history") {
        const toolArgs = rest.entry_id != null ? { action: "get", entry_id: rest.entry_id } : { action: "search", ...rest };
        const { result } = await executeLowLevelTool(engagement_id, agent_id, "search_burp_proxy_history", toolArgs);
        return textResult(formatToolResult(result));
      }
      const { result } = await executeLowLevelTool(
        engagement_id,
        agent_id,
        "burp_collaborator",
        { action: collaborator_action, secret_key: rest.secret_key, custom_data: rest.custom_data },
      );
      return textResult(formatToolResult(result));
    },
  );

  server.registerTool(
    "browser_run",
    {
      description: "Run a browser task through the Magnitude agent for a given engagement.",
      inputSchema: {
        engagement_id: z.string(),
        agent_id: z.string().optional(),
        url: z.string(),
        goal: z.string(),
        extract: z.string().optional(),
      },
    },
    async ({ engagement_id, agent_id = "mcp", url, goal, extract }) => {
      await getOwnedSession(user, engagement_id);
      const output = await withSerializedLock("browser_run", async () => {
        const { result } = await executeLowLevelTool(engagement_id, agent_id, "browser_action", { url, goal, extract });
        return formatToolResult(result);
      });
      return textResult(output);
    },
  );

  server.registerTool(
    "vpn_manage",
    {
      description: "Manage VPN profiles and connections. Actions: upload_profile, list_profiles, connect, disconnect, status.",
      inputSchema: {
        engagement_id: z.string().optional(),
        action: z.enum(["upload_profile", "list_profiles", "connect", "disconnect", "status"]),
        profile_name: z.string().optional(),
        profile_content: z.string().optional(),
        profile_content_base64: z.string().optional(),
        pid: z.string().optional(),
      },
    },
    async ({ engagement_id, action, profile_name, profile_content, profile_content_base64, pid }) => {
      if (action === "upload_profile") {
        if (!profile_name || (!profile_content && !profile_content_base64)) {
          throw new Error("profile_name and profile content are required");
        }
        const profile = await uploadVpnProfile(profile_name, profile_content_base64 || profile_content || "", !!profile_content_base64);
        return textResult(`Uploaded VPN profile ${profile.name}.`, { profile });
      }

      if (action === "list_profiles") {
        const profiles = listLocalProfiles();
        return textResult(`Found ${profiles.length} VPN profile(s).`, { profiles });
      }

      if (!engagement_id) {
        throw new Error("engagement_id is required for VPN connect/disconnect/status");
      }
      await getOwnedSession(user, engagement_id);

      if (action === "connect") {
        if (!profile_name) throw new Error("profile_name is required");
        const connected = await withSerializedLock("vpn_connect", async () => connectVpnProfile(engagement_id, profile_name));
        return textResult(connected.message, connected);
      }

      if (action === "disconnect") {
        const outcome = await withSerializedLock("vpn_disconnect", async () => disconnectVpnConnection(pid, profile_name));
        return textResult(`VPN disconnect result: ${outcome}`);
      }

      const status = await vpnStatus();
      return textResult(status.message, status as unknown as Record<string, unknown>);
    },
  );

  server.registerTool(
    "findings_manage",
    {
      description: "List, add, update, close, or export engagement findings stored by MCP.",
      inputSchema: {
        engagement_id: z.string(),
        agent_id: z.string().optional(),
        action: z.enum(["list", "add", "update", "close", "export"]),
        finding_id: z.string().optional(),
        title: z.string().optional(),
        content: z.string().optional(),
        severity: z.enum(["info", "low", "medium", "high", "critical"]).optional(),
        status: z.enum(["open", "closed"]).optional(),
      },
    },
    async ({ engagement_id, agent_id = "mcp", action, finding_id, title, content, severity = "info", status }) => {
      const session = await getOwnedSession(user, engagement_id);
      const findings = session.mcpFindings || [];

      if (action === "list") {
        return textResult(`Found ${findings.length} finding(s).`, { findings });
      }

      if (action === "add") {
        if (!title || !content) throw new Error("title and content are required");
        const finding = {
          findingId: uuidv4(),
          title,
          content,
          severity,
          status: "open" as const,
          createdBy: agent_id,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        session.mcpFindings = [...findings, finding];
        await session.save();
        return textResult(`Added finding ${finding.findingId}.`, { finding });
      }

      if (action === "export") {
        const markdown = findings.map((finding, index) => [
          `## ${index + 1}. ${finding.title}`,
          `Severity: ${finding.severity}`,
          `Status: ${finding.status}`,
          `Created By: ${finding.createdBy}`,
          "",
          finding.content,
        ].join("\n")).join("\n\n");
        return textResult(markdown || "No findings recorded yet.", { findings });
      }

      if (!finding_id) throw new Error("finding_id is required");
      const finding = findings.find((candidate) => candidate.findingId === finding_id);
      if (!finding) throw new Error(`Finding not found: ${finding_id}`);

      if (action === "update") {
        if (title !== undefined) finding.title = title;
        if (content !== undefined) finding.content = content;
        if (severity !== undefined) finding.severity = severity;
        if (status !== undefined) finding.status = status;
        finding.updatedAt = new Date();
        await session.save();
        return textResult(`Updated finding ${finding_id}.`, { finding });
      }

      finding.status = "closed";
      finding.updatedAt = new Date();
      await session.save();
      return textResult(`Closed finding ${finding_id}.`, { finding });
    },
  );

  server.registerTool(
    "artifact_get",
    {
      description: "Fetch useful artifacts such as engagement history, shell records, files, or image inspection outputs.",
      inputSchema: {
        engagement_id: z.string(),
        agent_id: z.string().optional(),
        action: z.enum(["history", "shells", "file", "image"]),
        path: z.string().optional(),
        question: z.string().optional(),
        max_lines: z.number().optional(),
      },
    },
    async ({ engagement_id, agent_id = "mcp", action, path: artifactPath, question, max_lines = 120 }) => {
      const session = await getOwnedSession(user, engagement_id);
      if (action === "history") {
        return textResult(`Returned ${session.messages.length} messages.`, { messages: session.messages, archive: await HistoryArchiveModel.findOne({ sessionId: engagement_id }).lean() });
      }
      if (action === "shells") {
        return textResult(`Returned ${session.shells.length} shell records.`, { shells: session.shells || [] });
      }
      if (!artifactPath) throw new Error("path is required");
      if (action === "image") {
        const { result } = await executeLowLevelTool(engagement_id, agent_id, "view_image", {
          image_path: artifactPath,
          question,
        });
        return textResult(formatToolResult(result));
      }

      const ctx = await getExecutionContext(engagement_id, agent_id);
      const command = [
        `FILE=${shellEscape(artifactPath)}`,
        `if [ ! -f "$FILE" ]; then echo "__NOT_FOUND__"; exit 0; fi`,
        `MIME=$(file --mime-type -b "$FILE" 2>/dev/null || echo application/octet-stream)`,
        `SIZE=$(wc -c < "$FILE" | tr -d ' ')`,
        `echo "__META__ mime=$MIME size=$SIZE"`,
        `if echo "$MIME" | grep -q '^text/'; then sed -n '1,${max_lines}p' "$FILE"; else echo "__BINARY__"; fi`,
      ].join(" && ");
      const { output } = await ctx.runCommand(command, 20_000);
      return textResult(output.trim());
    },
  );

  return server;
}

export function getMcpHostValidationMiddleware() {
  return (req: any, res: any, next: any) => {
    const rawHostHeader = String(req.headers.host || "");
    const host = rawHostHeader.startsWith("[")
      ? rawHostHeader.slice(1).split("]")[0]
      : rawHostHeader.split(":")[0];
    const origin = String(req.headers.origin || "");
    const allowedHosts = new Set(["localhost", "127.0.0.1", "::1"]);
    if (host && !allowedHosts.has(host)) {
      return res.status(403).json({ message: "Forbidden host header for local MCP endpoint" });
    }

    if (origin) {
      try {
        const originHost = new URL(origin).hostname;
        if (!allowedHosts.has(originHost)) {
          return res.status(403).json({ message: "Forbidden origin for local MCP endpoint" });
        }
      } catch {
        return res.status(403).json({ message: "Invalid origin header" });
      }
    }

    next();
  };
}
