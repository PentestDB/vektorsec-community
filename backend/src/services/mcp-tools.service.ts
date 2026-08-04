import fs from "fs";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import { z } from "zod";
import { Client as SSHClient } from "ssh2";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import SessionsModel, {
  AgentMessageDoc,
} from "../models/Sessions/Sessions.model";
import WorkspaceModel from "../models/Workspace/Workspace.model";
import HistoryArchiveModel from "../models/HistoryArchive/HistoryArchive.model";
import { UserDoc } from "../models/User/User.model";
import { buildExecutionContext } from "./agent.tools";
import { sessionLifecycle } from "./session.lifecycle";
import { toolRegistry } from "../tools/registry";
import { ToolResult } from "../tools/types";
import { readEnvFile, updateEnvVars } from "../utils/envWriter";
import {
  connectSSH,
  execOnWorkHost,
  resolveSessionWorkHost,
} from "./work-host.service";
import { KALI_DATA_DIR } from "../config/constants";
import {
  readModelRegistry,
  writeModelRegistry,
} from "../utils/modelRegistryStore";
import { getMagnitudeModelIssue } from "../utils/magnitudeLlm";
import { getCaidoHealth } from "./caido.client";
import {
  abortSession,
  hasActiveController,
  initAndRun,
  registerAbortController,
  setPaused,
  SSEWriter,
} from "./agent.service";

const SERVER_NAME = "pentest-copilot";
const SERVER_VERSION = "1.0.0";
const VPN_DIR = path.join(KALI_DATA_DIR, "vpn-profiles");

const operationLocks = new Map<string, Promise<unknown>>();

type HealthStatus =
  | "ready"
  | "misconfigured"
  | "missing"
  | "unreachable"
  | "degraded";

interface HealthCheckResult {
  component: string;
  status: HealthStatus;
  canAutoRepair: boolean;
  summary: string;
  missingItems: string[];
  nextAction: string;
}

type McpToolHandler = (
  args: any,
) => Promise<ReturnType<typeof textResult>> | ReturnType<typeof textResult>;

function textResult(
  text: string,
  structuredContent?: Record<string, unknown>,
  isError = false,
) {
  return {
    content: [{ type: "text", text }],
    ...(structuredContent ? { structuredContent } : {}),
    ...(isError ? { isError: true } : {}),
  };
}

function registerMcpTool(
  server: McpServer,
  user: UserDoc,
  name: string,
  config: { description: string; inputSchema: Record<string, z.ZodTypeAny> },
  handler: McpToolHandler,
) {
  server.registerTool(
    name,
    config as any,
    (async (args: any) => {
      const startedAt = new Date();
      try {
        const result = await handler(args);
        await safeRecordMcpActivity(user, {
          args,
          result,
          toolName: name,
          startedAt,
          status: "success",
        });
        return result;
      } catch (error: any) {
        await safeRecordMcpActivity(user, {
          args,
          error: error?.message || String(error),
          toolName: name,
          startedAt,
          status: "error",
        });
        throw error;
      }
    }) as any,
  );
}

function allowDangerousMcpTools(): boolean {
  return process.env.PENTEST_MCP_ALLOW_DANGEROUS === "1";
}

function maxOutputChars(): number {
  return parseInt(process.env.PENTEST_MCP_MAX_OUTPUT_CHARS || "60000", 10);
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
  const limit = maxOutputChars();
  if (output.length <= limit) return output;
  const half = Math.floor(limit / 2);
  return `${output.slice(0, half)}\n\n... [truncated ${output.length - limit} chars] ...\n\n${output.slice(-half)}`;
}

function toolResultPayload(
  result: ToolResult,
  extra: Record<string, unknown> = {},
) {
  const rawOutput = result.output || "";
  const output = truncate(rawOutput);
  return {
    ...extra,
    output,
    exitCode: result.exitCode ?? 0,
    files: result.files || [],
    installSuggestion: result.installSuggestion || null,
    truncated: output.length !== rawOutput.length,
    outputLength: rawOutput.length,
  };
}

function textFromMcpResult(result: ReturnType<typeof textResult>): string {
  return result.content
    .filter(
      (item: any) => item?.type === "text" && typeof item.text === "string",
    )
    .map((item: any) => item.text)
    .join("\n");
}

function deriveEngagementId(
  args: any,
  result?: ReturnType<typeof textResult>,
): string | null {
  if (args?.engagement_id) return String(args.engagement_id);
  const structured = result?.structuredContent as any;
  const engagementId =
    structured?.engagement?.engagementId || structured?.engagement_id;
  return engagementId ? String(engagementId) : null;
}

function redactMcpArgs(value: any): any {
  if (Array.isArray(value)) return value.map(redactMcpArgs);
  if (!value || typeof value !== "object") return value;

  const redacted: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value)) {
    const normalized = key.toLowerCase();
    if (
      normalized.includes("password") ||
      normalized.includes("passphrase") ||
      normalized.includes("privatekey") ||
      normalized.includes("apikey") ||
      normalized.includes("api_key") ||
      normalized.includes("secret") ||
      normalized.includes("token") ||
      normalized.includes("credential") ||
      normalized === "profile_content" ||
      normalized === "profile_content_base64"
    ) {
      redacted[key] = nested ? "[redacted]" : nested;
    } else {
      redacted[key] = redactMcpArgs(nested);
    }
  }
  return redacted;
}

async function recordMcpActivity(
  user: UserDoc,
  event: {
    toolName: string;
    args: any;
    startedAt: Date;
    status: "success" | "error";
    result?: ReturnType<typeof textResult>;
    error?: string;
  },
) {
  const engagementId = deriveEngagementId(event.args, event.result);
  if (!engagementId) return;

  const session = await SessionsModel.findOne({
    uid: user._id,
    sessionId: engagementId,
    status: "active",
  });
  if (!session) return;

  const toolCallId = `mcp_${uuidv4()}`;
  const args = redactMcpArgs(event.args || {});
  const endedAt = new Date();
  const content =
    event.status === "error"
      ? `MCP tool failed: ${event.error || "Unknown error"}`
      : textFromMcpResult(event.result!);

  const assistantMsg: AgentMessageDoc = {
    id: uuidv4(),
    role: "assistant",
    content: null,
    toolCalls: [
      {
        id: toolCallId,
        name: event.toolName,
        arguments: JSON.stringify(args),
      },
    ],
    timestamp: event.startedAt,
    turnIndex: session.turnIndex,
  };

  const toolMsg: AgentMessageDoc = {
    id: uuidv4(),
    role: "tool",
    content: content || "(no output)",
    toolCallId,
    toolName: event.toolName,
    timestamp: endedAt,
    turnIndex: session.turnIndex,
  };

  session.messages.push(assistantMsg, toolMsg);
  await session.save();
}

async function safeRecordMcpActivity(
  user: UserDoc,
  event: Parameters<typeof recordMcpActivity>[1],
) {
  try {
    await recordMcpActivity(user, event);
  } catch (error) {
    console.warn("[mcp] Failed to record MCP activity:", error);
  }
}

function createMemorySSEWriter(): SSEWriter & {
  events: Array<{ event: string; data: any }>;
} {
  const events: Array<{ event: string; data: any }> = [];
  return {
    events,
    write(event: string, data: any) {
      events.push({ event, data });
    },
    end() {},
  };
}

async function withSerializedLock<T>(
  key: string,
  work: () => Promise<T>,
): Promise<T> {
  const prior = operationLocks.get(key) || Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  operationLocks.set(
    key,
    prior.then(() => current),
  );
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

function listLocalProfiles(): Array<{
  name: string;
  filename: string;
  path: string;
  size: number;
}> {
  ensureVPNDir();
  const files = fs
    .readdirSync(VPN_DIR)
    .filter((entry) => entry.endsWith(".ovpn") || entry.endsWith(".conf"));
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

function sudoWrap(
  command: string,
  sshConfig: { username?: string; password?: string },
  isScriptPath = false,
): string {
  const run = isScriptPath
    ? `bash ${shellEscape(command)}`
    : `sh -c ${shellEscape(command)}`;
  if (sshConfig.username === "root") return run;
  if (sshConfig.password) {
    return `echo ${shellEscape(sshConfig.password)} | sudo -S ${run}`;
  }
  return `sudo -n ${run}`;
}

function uploadFileViaSftp(
  ssh: SSHClient,
  localPath: string,
  remotePath: string,
): Promise<void> {
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

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  label: string,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`${label} timed out after ${timeoutMs}ms`)),
      timeoutMs,
    );
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

async function executeLowLevelTool(
  sessionId: string,
  agentId: string,
  toolName: string,
  args: Record<string, unknown>,
) {
  const tool = toolRegistry.get(toolName);
  if (!tool) throw new Error(`Unsupported tool: ${toolName}`);
  const ctx = await getExecutionContext(sessionId, agentId);
  const dangerous =
    tool.shouldRequireConsent?.(args, ctx) ?? tool.requiresConsent ?? false;
  if (dangerous && !allowDangerousMcpTools()) {
    throw new Error(
      `Blocked: ${toolName} was flagged as consent-gated. Enable "Allow Consent-Gated MCP Tools" in Settings -> MCP Access to allow MCP clients to run these actions.`,
    );
  }
  const result = await tool.execute(args, ctx);
  return { result, ctx };
}

async function executeBackendTool(
  toolName: string,
  args: Record<string, unknown>,
) {
  const tool = toolRegistry.get(toolName);
  if (!tool) throw new Error(`Unsupported tool: ${toolName}`);
  const result = await tool.execute(args, {} as any);
  return { result };
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
    artifactsCount: session.mcpArtifacts?.length || 0,
    shellCount: session.shells?.length || 0,
    totalTokens: session.totalTokens || 0,
  };
}

async function collectPlatformHealth(
  component = "all",
  sessionId?: string,
): Promise<HealthCheckResult[]> {
  const env = readEnvFile();
  const checks: HealthCheckResult[] = [];
  const selected =
    component === "all"
      ? ["ssh", "shell", "burp", "caido", "magnitude", "vpn", "google_search"]
      : [component];

  if (selected.includes("ssh") || selected.includes("shell")) {
    if (!sessionId) {
      checks.push({
        component: "work_host",
        status: "missing",
        canAutoRepair: false,
        summary: "engagement_id is required to check a workspace work host",
        missingItems: ["engagement_id"],
        nextAction: "Pass the active engagement_id and retry.",
      });
    } else {
      try {
        const target = await resolveSessionWorkHost(sessionId);
        const result = await execOnWorkHost(sessionId, "whoami", 8_000);
        const whoami = result.stdout.trim();
        checks.push({
          component: "work_host",
          status: "ready",
          canAutoRepair: false,
          summary: `${target.kind} work host ready as ${whoami} in ${target.workFolder}`,
          missingItems: [],
          nextAction: "None",
        });
      } catch (error: any) {
        checks.push({
          component: "work_host",
          status: "unreachable",
          canAutoRepair: false,
          summary: `Work host connection failed: ${error.message || error}`,
          missingItems: [],
          nextAction:
            "Open Connection and verify the workspace host and folder.",
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
        nextAction:
          "Set Burp host/port in platform_setup or Settings -> Burp Suite.",
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
          nextAction:
            "Open Burp locally, load the Burp RPC extension, and ensure the configured host/port are correct.",
        });
      }
    }
  }

  if (selected.includes("caido")) {
    if (!env.CAIDO_URL || !env.CAIDO_PAT) {
      checks.push({
        component: "caido",
        status: "missing",
        canAutoRepair: false,
        summary: "Integration is not configured",
        missingItems: ["CAIDO_URL", "CAIDO_PAT"],
        nextAction: "Set URL/PAT in platform_setup or Settings.",
      });
    } else {
      const health = await getCaidoHealth();
      checks.push({
        component: "caido",
        status: health.connected ? "ready" : "unreachable",
        canAutoRepair: false,
        summary: health.connected
          ? `Reachable (${health.url || env.CAIDO_URL})`
          : `Configured but unreachable: ${health.message || "connection failed"}`,
        missingItems: [],
        nextAction: health.connected
          ? "None"
          : "Start the local instance, bind it to an address WSL can reach, and verify CAIDO_URL/CAIDO_PAT.",
      });
    }
  }

  if (selected.includes("magnitude")) {
    const enabled = env.MAGNITUDE_ENABLED === "true";
    const registry = readModelRegistry();
    const browserModel = registry.models.find(
      (model) => model.id === registry.assignments.browserModelId,
    );
    const missing = [
      !enabled && "MAGNITUDE_ENABLED=true",
      !browserModel && "browser model assignment",
      browserModel && !browserModel.apiKey && "browser model API key",
      browserModel && getMagnitudeModelIssue(browserModel),
    ].filter(Boolean) as string[];

    if (missing.length > 0) {
      checks.push({
        component: "magnitude",
        status: "missing",
        canAutoRepair: false,
        summary: "Magnitude is not fully configured",
        missingItems: missing,
        nextAction:
          "Configure a model preset and select it for Browser Agent, then retry platform_health.",
      });
    } else {
      try {
        await import("magnitude-core");
        checks.push({
          component: "magnitude",
          status: "ready",
          canAutoRepair: false,
          summary: `Magnitude ready with ${browserModel!.label} (${browserModel!.provider}/${browserModel!.model})`,
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
          nextAction:
            "Reinstall backend dependencies and verify browser-agent packages are present.",
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
        nextAction:
          "Use vpn_manage upload_profile before attempting a connection.",
      });
    } else {
      try {
        if (!sessionId) throw new Error("engagement_id is required");
        await execOnWorkHost(
          sessionId,
          "command -v openvpn >/dev/null 2>&1 && echo READY || echo MISSING",
          8_000,
        );
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
          summary: `VPN prerequisites could not be verified on the work host: ${error.message || error}`,
          missingItems: [],
          nextAction: "Verify the workspace work host, then rerun platform_health.",
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
      summary:
        missing.length > 0
          ? "Google Custom Search is not fully configured"
          : "Google Custom Search is configured",
      missingItems: missing,
      nextAction:
        missing.length > 0
          ? "Run platform_setup with google_search settings."
          : "None",
    });
  }

  return checks.filter(
    (check) => component === "all" || check.component === component,
  );
}

function buildRepairSteps(
  component: string,
  health: HealthCheckResult[],
): string {
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

  const caidoStep = [
    "1. Start the local instance.",
    "2. Edit the instance to listen on 0.0.0.0:8096 if Pentest Copilot is running in WSL.",
    "3. Allow caido-cli through Windows Firewall.",
    "4. Create a Personal Access Token.",
    "5. Save CAIDO_URL, CAIDO_PAT, and optionally CAIDO_PROXY_URL via platform_setup or Settings.",
    "6. Re-run platform_health for caido.",
  ].join("\n");

  const magnitudeStep = [
    "1. Set MAGNITUDE_ENABLED=true.",
    "2. Configure a reusable model preset in Settings -> Models.",
    "3. Select that preset as the Browser Agent model, or pass magnitude.browserModelId to platform_setup.",
    "4. Optionally set MAGNITUDE_PROXY_URL and MAGNITUDE_DISPLAY.",
    "5. Re-run platform_health for magnitude, then test with browser_run.",
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

  if (component === "all") {
    return health
      .map(
        (item) =>
          `## ${item.component}\n${buildRepairSteps(item.component, health)}`,
      )
      .join("\n\n");
  }

  const mapping: Record<string, string> = {
    ssh: sshStep,
    shell: sshStep,
    burp: burpStep,
    caido: caidoStep,
    magnitude: magnitudeStep,
    vpn: vpnStep,
    google_search: googleStep,
  };

  return mapping[component] || "";
}

async function applyRepair(component: string, sessionId?: string): Promise<string> {
  if (component === "vpn") {
    if (!sessionId) throw new Error("engagement_id is required to repair VPN on a work host");
    await execOnWorkHost(
      sessionId,
      "command -v openvpn >/dev/null 2>&1 || " +
        "(export DEBIAN_FRONTEND=noninteractive && sudo apt-get update -qq && sudo apt-get install -y -qq openvpn)",
      120_000,
    );
    return "Attempted to install openvpn on the attack box.";
  }

  if (component === "all") {
    const results: string[] = [];
    try {
      results.push(await applyRepair("vpn", sessionId));
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
  caido?: Record<string, unknown>;
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
    if (ssh.username !== undefined)
      updates.SSH_USERNAME = String(ssh.username || "");
    if (ssh.password !== undefined)
      updates.SSH_PASSWORD = String(ssh.password || "");
    if (ssh.privateKey !== undefined)
      updates.SSH_PRIVATE_KEY = String(ssh.privateKey || "");
    if (ssh.privateKeyPassphrase !== undefined) {
      updates.SSH_PRIVATE_KEY_PASSPHRASE = String(
        ssh.privateKeyPassphrase || "",
      );
    }
  }

  if (input.burp) {
    const burp = input.burp;
    if (burp.host !== undefined)
      updates.BURP_RPC_HOST = String(burp.host || "");
    if (burp.port !== undefined)
      updates.BURP_RPC_PORT = String(burp.port || "50051");
  }

  if (input.caido) {
    const caido = input.caido;
    if (caido.url !== undefined)
      updates.CAIDO_URL = String(caido.url || "").replace(/\/+$/, "");
    if (caido.pat !== undefined) updates.CAIDO_PAT = String(caido.pat || "");
    if (caido.proxyUrl !== undefined)
      updates.CAIDO_PROXY_URL = String(caido.proxyUrl || "").replace(/\/+$/, "");
  }

  if (input.magnitude) {
    const magnitude = input.magnitude;
    if (magnitude.enabled !== undefined)
      updates.MAGNITUDE_ENABLED = String(!!magnitude.enabled);
    if (magnitude.proxyUrl !== undefined)
      updates.MAGNITUDE_PROXY_URL = String(magnitude.proxyUrl || "");
    if (magnitude.headless !== undefined)
      updates.MAGNITUDE_HEADLESS = String(magnitude.headless !== false);
    if (magnitude.display !== undefined)
      updates.MAGNITUDE_DISPLAY = String(magnitude.display || "");
    if (magnitude.browserModelId !== undefined) {
      const registry = readModelRegistry();
      writeModelRegistry(registry.models, {
        ...registry.assignments,
        browserModelId: String(magnitude.browserModelId || ""),
      });
    }
  }

  if (input.google_search) {
    const google = input.google_search;
    if (google.apiKey !== undefined)
      updates["GOOGLE-API-KEY"] = String(google.apiKey || "");
    if (google.searchEngineId !== undefined) {
      updates["CUSTOM-SEARCH-ENGINE-ID"] = String(google.searchEngineId || "");
    }
  }

  if (input.safety) {
    const safety = input.safety;
    if (safety.allowDangerousMcp !== undefined) {
      updates.PENTEST_MCP_ALLOW_DANGEROUS = String(
        safety.allowDangerousMcp ? 1 : 0,
      );
    }
    if (safety.maxOutputChars !== undefined) {
      updates.PENTEST_MCP_MAX_OUTPUT_CHARS = String(
        safety.maxOutputChars || env.PENTEST_MCP_MAX_OUTPUT_CHARS || "60000",
      );
    }
  }

  updateEnvVars(updates);
  return updates;
}

async function uploadVpnProfile(
  profileName: string,
  content: string,
  encoded = false,
) {
  ensureVPNDir();
  const safeName = sanitizeProfileName(profileName);
  const ext =
    safeName.endsWith(".conf") || safeName.endsWith(".ovpn") ? "" : ".ovpn";
  const filename = `${safeName}${ext}`;
  const filePath = path.join(VPN_DIR, filename);
  const buffer = encoded
    ? Buffer.from(content, "base64")
    : Buffer.from(content, "utf8");
  fs.writeFileSync(filePath, buffer);
  return {
    filename,
    path: filePath,
    size: buffer.length,
    name: filename.replace(/\.(ovpn|conf)$/i, ""),
  };
}

async function connectVpnProfile(sessionId: string, profileName: string) {
  const safeName = sanitizeProfileName(profileName);
  const profile = listLocalProfiles().find(
    (candidate) => candidate.name === safeName,
  );
  if (!profile) {
    throw new Error(`VPN profile not found: ${safeName}`);
  }

  const target = await resolveSessionWorkHost(sessionId);
  let ssh: SSHClient | null = null;
  try {
    const remotePath = `/tmp/vpn-${safeName}.ovpn`;
    if (target.kind === "ssh") {
      ssh = await connectSSH(target.sshConfig!, 15_000);
      await withTimeout(uploadFileViaSftp(ssh, profile.path, remotePath), 30000, "Upload VPN profile");
    } else {
      const preflight = await execOnWorkHost(sessionId, "command -v openvpn >/dev/null 2>&1 && test -c /dev/net/tun", 5_000);
      if (preflight.code !== 0) throw new Error("Local VPN requires OpenVPN, /dev/net/tun, and NET_ADMIN");
      await fs.promises.copyFile(profile.path, remotePath);
    }

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

    if (target.kind === "ssh") {
      const localScriptPath = path.join(VPN_DIR, `vpn-start-${safeName}.sh`);
      fs.writeFileSync(localScriptPath, scriptContent, "utf8");
      try {
        await withTimeout(uploadFileViaSftp(ssh!, localScriptPath, scriptPath), 10000, "Upload VPN start script");
      } finally {
        fs.unlinkSync(localScriptPath);
      }
      ssh!.end();
      ssh = null;
    } else {
      await fs.promises.writeFile(scriptPath, scriptContent, { mode: 0o700 });
    }

    const privilege = target.kind === "ssh" ? target.sshConfig! : { username: process.getuid?.() === 0 ? "root" : process.env.USER };
    const startCmd = sudoWrap(scriptPath, privilege, true);
    const { stdout, stderr, code } = await withTimeout(
      execOnWorkHost(sessionId, startCmd, 25_000),
      25000,
      "VPN start",
    );
    if (code === 0 && stdout.includes("STARTED")) {
      return { message: `VPN "${safeName}" connected`, profileName: safeName };
    }
    throw new Error(
      stderr?.trim() ||
        stdout.replace("FAILED", "").trim() ||
        `Failed to start VPN "${safeName}"`,
    );
  } finally {
    ssh?.end();
  }
}

async function disconnectVpnConnection(sessionId: string, pid?: string, profileName?: string) {
  const target = await resolveSessionWorkHost(sessionId);
  {
    let rawCommand = "";
    if (pid) {
      rawCommand = `kill ${parseInt(pid, 10)} 2>/dev/null && echo 'KILLED'`;
    } else if (profileName) {
      const safeName = sanitizeProfileName(profileName);
      const pidFile = `/tmp/openvpn-${safeName}.pid`;
      rawCommand = `if [ -f ${pidFile} ]; then kill $(cat ${pidFile}) 2>/dev/null && rm -f ${pidFile} && echo 'KILLED'; else echo 'NOT_FOUND'; fi`;
    } else {
      rawCommand =
        "pkill openvpn 2>/dev/null; rm -f /tmp/openvpn-*.pid /tmp/vpn-*.ovpn; echo 'DONE'";
    }
    const privilege = target.kind === "ssh" ? target.sshConfig! : { username: process.getuid?.() === 0 ? "root" : process.env.USER };
    const { stdout } = await execOnWorkHost(sessionId, sudoWrap(rawCommand, privilege), 15_000);
    return stdout.trim();
  }
}

async function vpnStatus(sessionId: string) {
  {
    const { stdout: pgrepOut, code } = await execOnWorkHost(sessionId, "pgrep -a openvpn 2>/dev/null", 10_000);
    if (code !== 0 || !pgrepOut.trim()) {
      return {
        success: false,
        connections: [],
        message: "No VPN connections active",
      };
    }

    const lines = pgrepOut.trim().split("\n").filter(Boolean);
    const connections = lines.map((line) => {
      const parts = line.trim().split(/\s+/);
      const pid = parts[0];
      const configIndex = parts.indexOf("--config");
      const configFile = configIndex !== -1 ? parts[configIndex + 1] || "" : "";
      const profileName = configFile
        ? path
            .basename(configFile, path.extname(configFile))
            .replace(/^vpn-/, "")
        : "unknown";
      return { pid, profile_name: profileName, config_file: configFile };
    });
    return {
      success: true,
      connections,
      message: `${connections.length} VPN connection(s) active`,
    };
  }
}

async function addSessionArtifact(
  user: UserDoc,
  input: {
    engagementId: string;
    type:
      | "note"
      | "file"
      | "image"
      | "browser_observation"
      | "request"
      | "other";
    title: string;
    content?: string;
    url?: string;
    path?: string;
    mimeType?: string;
    createdBy?: string;
    metadata?: Record<string, string>;
  },
) {
  const session = await getOwnedSession(user, input.engagementId);
  const artifact = {
    artifactId: uuidv4(),
    type: input.type,
    title: input.title.substring(0, 160),
    content: input.content,
    url: input.url,
    path: input.path,
    mimeType: input.mimeType,
    createdBy: input.createdBy || "mcp",
    createdAt: new Date(),
    metadata: input.metadata || {},
  };
  session.mcpArtifacts = [...(session.mcpArtifacts || []), artifact];
  await session.save();
  return artifact;
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

  registerMcpTool(
    server,
    user,
    "platform_health",
    {
      description:
        "Check whether SSH, shell, Burp, Caido, Magnitude, VPN, and Google search are correctly configured and reachable.",
      inputSchema: {
        engagement_id: z.string().optional(),
        component: z
          .enum([
            "all",
            "ssh",
            "shell",
            "burp",
            "caido",
            "magnitude",
            "vpn",
            "google_search",
          ])
          .optional(),
      },
    },
    async ({ component = "all", engagement_id }) => {
      if (engagement_id) await getOwnedSession(user, engagement_id);
      const health = await collectPlatformHealth(component, engagement_id);
      const text = health
        .map((item) => `- ${item.component}: ${item.status} — ${item.summary}`)
        .join("\n");
      return textResult(text || "No health checks were run.", { health });
    },
  );

  registerMcpTool(
    server,
    user,
    "platform_setup",
    {
      description:
        "Persist platform configuration for SSH, Burp, Caido, Browser Agent, Google search, and MCP safety flags.",
      inputSchema: {
        ssh: z
          .object({
            host: z.string().optional(),
            port: z.union([z.string(), z.number()]).optional(),
            username: z.string().optional(),
            password: z.string().optional(),
            privateKey: z.string().optional(),
            privateKeyPassphrase: z.string().optional(),
          })
          .optional(),
        burp: z
          .object({
            host: z.string().optional(),
            port: z.union([z.string(), z.number()]).optional(),
          })
          .optional(),
        caido: z
          .object({
            url: z.string().optional(),
            pat: z.string().optional(),
            proxyUrl: z.string().optional(),
          })
          .optional(),
        magnitude: z
          .object({
            enabled: z.boolean().optional(),
            proxyUrl: z.string().optional(),
            headless: z.boolean().optional(),
            display: z.string().optional(),
            browserModelId: z.string().optional(),
          })
          .optional(),
        google_search: z
          .object({
            apiKey: z.string().optional(),
            searchEngineId: z.string().optional(),
          })
          .optional(),
        safety: z
          .object({
            allowDangerousMcp: z.boolean().optional(),
            maxOutputChars: z.number().optional(),
          })
          .optional(),
      },
    },
    async (args) => {
      const updated = await withSerializedLock("platform_setup", () =>
        applyPlatformSetup(args),
      );
      return textResult(
        `Updated ${Object.keys(updated).length} configuration values.`,
        { updated },
      );
    },
  );

  registerMcpTool(
    server,
    user,
    "platform_repair",
    {
      description:
        "Explain or apply repair steps for Burp, Magnitude, VPN, SSH, shell, or Google search setup issues.",
      inputSchema: {
        engagement_id: z.string().optional(),
        component: z.enum([
          "all",
          "ssh",
          "shell",
          "burp",
          "caido",
          "magnitude",
          "vpn",
          "google_search",
        ]),
        mode: z.enum(["explain", "apply_safe", "apply"]).default("explain"),
      },
    },
    async ({ component, mode, engagement_id }) => {
      if (engagement_id) await getOwnedSession(user, engagement_id);
      const health = await collectPlatformHealth(
        component === "all" ? "all" : component,
        engagement_id,
      );
      if (mode === "explain") {
        return textResult(buildRepairSteps(component, health), { health });
      }

      const outcome = await withSerializedLock(
        `repair:${component}`,
        async () => applyRepair(component, engagement_id),
      );
      const after = await collectPlatformHealth(
        component === "all" ? "all" : component,
        engagement_id,
      );
      return textResult(
        `${outcome}\n\nPost-repair health:\n${after.map((item) => `- ${item.component}: ${item.status}`).join("\n")}`,
        { health: after },
      );
    },
  );

  registerMcpTool(
    server,
    user,
    "engagement_open",
    {
      description:
        "Create a new engagement or reopen an existing one. Engagements map to Pentest Copilot sessions.",
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
    async ({
      engagement_id,
      name,
      workspace_name,
      description,
      target,
      scope,
      notes,
      credentials,
      labels,
    }) => {
      if (engagement_id) {
        const session = await getOwnedSession(user, engagement_id);
        return textResult(`Resumed engagement ${session.sessionId}.`, {
          engagement: sessionSummary(session),
        });
      }

      const workspaceId = uuidv4();
      const workspaceName = (
        workspace_name ||
        name ||
        target ||
        "MCP Engagement"
      ).substring(0, 50);
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

      return textResult(`Created engagement ${sessionId}.`, {
        engagement: sessionSummary(session),
      });
    },
  );

  registerMcpTool(
    server,
    user,
    "engagement_status",
    {
      description:
        "Return the current state of an engagement, including context, shells, findings, and agent state.",
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
            artifacts: session.mcpArtifacts || [],
            messageCount: session.messages.length,
          },
        },
      );
    },
  );

  registerMcpTool(
    server,
    user,
    "engagement_update",
    {
      description:
        "Update target context, notes, credentials, scope, labels, or engagement naming metadata.",
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
      if (updates.name !== undefined)
        session.name = updates.name.substring(0, 50);
      if (updates.description !== undefined)
        session.description = updates.description.substring(0, 500);
      session.mcpContext = {
        ...(session.mcpContext || {}),
        ...(updates.target !== undefined ? { target: updates.target } : {}),
        ...(updates.scope !== undefined ? { scope: updates.scope } : {}),
        ...(updates.notes !== undefined ? { notes: updates.notes } : {}),
        ...(updates.credentials !== undefined
          ? { credentials: updates.credentials }
          : {}),
        ...(updates.labels !== undefined ? { labels: updates.labels } : {}),
      };
      await session.save();
      return textResult(`Updated engagement ${engagement_id}.`, {
        engagement: sessionSummary(session),
      });
    },
  );

  registerMcpTool(
    server,
    user,
    "engagement_pause",
    {
      description:
        "Pause an engagement and abort any active built-in agent controller if one is running.",
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

  registerMcpTool(
    server,
    user,
    "engagement_history",
    {
      description:
        "Return engagement message history, archive history, shell summaries, and findings.",
      inputSchema: {
        engagement_id: z.string(),
        limit: z.number().optional(),
      },
    },
    async ({ engagement_id, limit = 50 }) => {
      const session = await getOwnedSession(user, engagement_id);
      const archive = await HistoryArchiveModel.findOne({
        sessionId: engagement_id,
      }).lean();
      const messages = session.messages.slice(-limit);
      return textResult(
        `Returned ${messages.length} live messages and ${(archive?.history || []).length} archived history items.`,
        {
          liveMessages: messages,
          archiveHistory: archive?.history || [],
          shells: session.shells || [],
          findings: session.mcpFindings || [],
          artifacts: session.mcpArtifacts || [],
        },
      );
    },
  );

  registerMcpTool(
    server,
    user,
    "agent_message",
    {
      description:
        "Send a message into the native Pentest Copilot agent loop for an engagement and wait for the turn to complete, pause, or error.",
      inputSchema: {
        engagement_id: z.string(),
        message: z.string(),
      },
    },
    async ({ engagement_id, message }) => {
      const session = await getOwnedSession(user, engagement_id);
      if (
        session.agentState === "running" &&
        hasActiveController(engagement_id)
      ) {
        throw new Error(
          `Agent is already running for engagement ${engagement_id}`,
        );
      }
      if (session.agentState === "running") {
        await SessionsModel.updateOne(
          { sessionId: engagement_id },
          { $set: { agentState: "idle" } },
        );
      }

      const sse = createMemorySSEWriter();
      const abortCtrl = registerAbortController(engagement_id);
      try {
        await initAndRun({
          sessionId: engagement_id,
          userId: user._id.toString(),
          userMessage: message,
          sse,
          abortSignal: abortCtrl.signal,
        });
      } finally {
        abortSession(engagement_id);
      }

      const updated = await getOwnedSession(user, engagement_id);
      const terminalEvent = [...sse.events]
        .reverse()
        .find((item) => ["done", "paused", "error"].includes(item.event));
      const toolEvents = sse.events.filter((item) =>
        ["tool_start", "tool_done", "tool_error", "consent_required"].includes(
          item.event,
        ),
      );

      return textResult(
        terminalEvent?.event === "error"
          ? `Native agent returned an error for engagement ${engagement_id}.`
          : `Native agent turn completed for engagement ${engagement_id}.`,
        {
          engagement: sessionSummary(updated),
          terminalEvent: terminalEvent || null,
          toolEventCount: toolEvents.length,
          events: sse.events,
        },
      );
    },
  );

  registerMcpTool(
    server,
    user,
    "shell_exec",
    {
      description:
        "Run a one-shot command on the attack box within an engagement context.",
      inputSchema: {
        engagement_id: z.string(),
        agent_id: z.string().optional(),
        command: z.string(),
        timeout_seconds: z.number().optional(),
      },
    },
    async ({ engagement_id, agent_id = "mcp", command, timeout_seconds }) => {
      await getOwnedSession(user, engagement_id);
      const { result } = await executeLowLevelTool(
        engagement_id,
        agent_id,
        "run_bash",
        { command, timeout_seconds },
      );
      const structured = toolResultPayload(result, {
        command,
        timeout_seconds,
      });
      return textResult(
        formatToolResult(result),
        structured,
        (result.exitCode ?? 0) !== 0,
      );
    },
  );

  registerMcpTool(
    server,
    user,
    "shell_session",
    {
      description:
        "Manage persistent shell sessions for an engagement. Actions: open, write, read, close, list.",
      inputSchema: {
        engagement_id: z.string(),
        agent_id: z.string().optional(),
        action: z.enum(["open", "write", "read", "close", "list"]),
        label: z.string().optional(),
        purpose: z
          .enum(["exploit-box", "reverse-shell", "listener"])
          .optional(),
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
        return textResult(`Found ${session.shells.length} shell records.`, {
          shells: session.shells || [],
        });
      }

      const mapping: Record<string, string> = {
        open: "spawn_shell",
        write: "write_to_shell",
        read: "read_shell",
        close: "close_shell",
      };
      const { result } = await executeLowLevelTool(
        engagement_id,
        agent_id,
        mapping[action],
        rest,
      );
      const structured = toolResultPayload(result, { action, ...rest });
      return textResult(formatToolResult(result), structured);
    },
  );

  registerMcpTool(
    server,
    user,
    "burp",
    {
      description:
        "Operate Burp Suite through Pentest Copilot. Actions: status, request, intruder, history, collaborator.",
      inputSchema: {
        engagement_id: z.string().optional(),
        agent_id: z.string().optional(),
        action: z.enum([
          "status",
          "request",
          "intruder",
          "history",
          "collaborator",
        ]),
        host: z.string().optional(),
        port: z.number().optional(),
        secure: z.boolean().optional(),
        raw_request: z.string().optional(),
        tab_name: z.string().optional(),
        insertion_points: z
          .array(z.object({ start: z.number(), end: z.number() }))
          .optional(),
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
    async ({
      engagement_id = "mcp",
      agent_id = "mcp",
      action,
      collaborator_action,
      ...rest
    }) => {
      if (action === "status") {
        const health = await collectPlatformHealth("burp");
        return textResult(health[0]?.summary || "Burp status unavailable.", {
          health,
        });
      }
      if (action === "request") {
        const { result } = await executeBackendTool(
          "send_to_burp_repeater",
          rest,
        );
        const structured = toolResultPayload(result, { action, ...rest });
        return textResult(formatToolResult(result), structured);
      }
      if (action === "intruder") {
        const { result } = await executeBackendTool(
          "send_to_burp_intruder",
          rest,
        );
        const structured = toolResultPayload(result, { action, ...rest });
        return textResult(formatToolResult(result), structured);
      }
      if (action === "history") {
        const toolArgs =
          rest.entry_id != null
            ? { action: "get", entry_id: rest.entry_id }
            : { action: "search", ...rest };
        const { result } = await executeBackendTool(
          "search_burp_proxy_history",
          toolArgs,
        );
        const structured = toolResultPayload(result, { action, ...toolArgs });
        return textResult(formatToolResult(result), structured);
      }
      const { result } = await executeBackendTool("burp_collaborator", {
        action: collaborator_action,
        secret_key: rest.secret_key,
        custom_data: rest.custom_data,
      });
      const structured = toolResultPayload(result, {
        action,
        collaborator_action,
      });
      return textResult(formatToolResult(result), structured);
    },
  );

  registerMcpTool(
    server,
    user,
    "caido",
    {
      description:
        "Operate the configured Caido integration. Actions: status, request, replay, automate, history, intercept, oast.",
      inputSchema: {
        engagement_id: z.string().optional(),
        agent_id: z.string().optional(),
        action: z.enum([
          "status",
          "request",
          "replay",
          "automate",
          "history",
          "intercept",
          "oast",
        ]),
        host: z.string().optional(),
        port: z.number().optional(),
        secure: z.boolean().optional(),
        raw_request: z.string().optional(),
        tab_name: z.string().optional(),
        placeholders: z
          .array(z.object({ start: z.number(), end: z.number() }))
          .optional(),
        payloads: z.array(z.string()).optional(),
        strategy: z
          .enum(["SEQUENTIAL", "ALL", "PARALLEL", "MATRIX"])
          .optional(),
        run: z.boolean().optional(),
        search: z.string().optional(),
        methods: z.string().optional(),
        status_min: z.number().optional(),
        status_max: z.number().optional(),
        hide_assets: z.boolean().optional(),
        entry_id: z.string().optional(),
        intercept_action: z.enum(["status", "enable", "disable"]).optional(),
        oast_action: z
          .enum(["status", "install", "providers", "generate", "poll", "interactions", "sessions"])
          .optional(),
        provider_id: z.string().optional(),
        session_id: z.string().optional(),
        title: z.string().optional(),
        force: z.boolean().optional(),
      },
    },
    async ({ action, intercept_action, oast_action, ...rest }) => {
      if (action === "status") {
        const health = await collectPlatformHealth("caido");
        return textResult(health[0]?.summary || "Status unavailable.", {
          health,
        });
      }
      if (action === "request" || action === "replay") {
        const { result } = await executeBackendTool(
          "send_to_caido_replay",
          rest,
        );
        const structured = toolResultPayload(result, { action, ...rest });
        return textResult(formatToolResult(result), structured);
      }
      if (action === "automate") {
        const { result } = await executeBackendTool(
          "send_to_caido_automate",
          rest,
        );
        const structured = toolResultPayload(result, { action, ...rest });
        return textResult(formatToolResult(result), structured);
      }
      if (action === "history") {
        const toolArgs =
          rest.entry_id != null
            ? { action: "get", entry_id: rest.entry_id }
            : { action: "search", ...rest };
        const { result } = await executeBackendTool(
          "search_caido_http_history",
          toolArgs,
        );
        const structured = toolResultPayload(result, { action, ...toolArgs });
        return textResult(formatToolResult(result), structured);
      }
      if (action === "oast") {
        const { result } = await executeBackendTool("caido_oast", {
          action: oast_action || "status",
          provider_id: rest.provider_id,
          session_id: rest.session_id,
          title: rest.title,
          force: rest.force,
        });
        const structured = toolResultPayload(result, {
          action,
          oast_action,
          ...rest,
        });
        return textResult(formatToolResult(result), structured);
      }
      const { result } = await executeBackendTool("caido_intercept_control", {
        action: intercept_action || "status",
      });
      const structured = toolResultPayload(result, {
        action,
        intercept_action,
      });
      return textResult(formatToolResult(result), structured);
    },
  );

  registerMcpTool(
    server,
    user,
    "browser_run",
    {
      description:
        "Run a browser task through the Magnitude agent for a given engagement.",
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
      const structured = await withSerializedLock("browser_run", async () => {
        const { result } = await executeLowLevelTool(
          engagement_id,
          agent_id,
          "browser_action",
          { url, goal, extract },
        );
        return toolResultPayload(result, { url, goal, extract });
      });
      return textResult(
        String(structured.output || ""),
        structured,
        Number(structured.exitCode || 0) !== 0,
      );
    },
  );

  registerMcpTool(
    server,
    user,
    "vpn_manage",
    {
      description:
        "Manage VPN profiles and connections. Actions: upload_profile, list_profiles, connect, disconnect, status.",
      inputSchema: {
        engagement_id: z.string().optional(),
        action: z.enum([
          "upload_profile",
          "list_profiles",
          "connect",
          "disconnect",
          "status",
        ]),
        profile_name: z.string().optional(),
        profile_content: z.string().optional(),
        profile_content_base64: z.string().optional(),
        pid: z.string().optional(),
      },
    },
    async ({
      engagement_id,
      action,
      profile_name,
      profile_content,
      profile_content_base64,
      pid,
    }) => {
      if (action === "upload_profile") {
        if (!profile_name || (!profile_content && !profile_content_base64)) {
          throw new Error("profile_name and profile content are required");
        }
        const profile = await uploadVpnProfile(
          profile_name,
          profile_content_base64 || profile_content || "",
          !!profile_content_base64,
        );
        return textResult(`Uploaded VPN profile ${profile.name}.`, { profile });
      }

      if (action === "list_profiles") {
        const profiles = listLocalProfiles();
        return textResult(`Found ${profiles.length} VPN profile(s).`, {
          profiles,
        });
      }

      if (!engagement_id) {
        throw new Error(
          "engagement_id is required for VPN connect/disconnect/status",
        );
      }
      await getOwnedSession(user, engagement_id);

      if (action === "connect") {
        if (!profile_name) throw new Error("profile_name is required");
        const connected = await withSerializedLock("vpn_connect", async () =>
          connectVpnProfile(engagement_id, profile_name),
        );
        return textResult(connected.message, connected);
      }

      if (action === "disconnect") {
        const outcome = await withSerializedLock("vpn_disconnect", async () =>
          disconnectVpnConnection(engagement_id, pid, profile_name),
        );
        return textResult(`VPN disconnect result: ${outcome}`);
      }

      const status = await vpnStatus(engagement_id);
      return textResult(
        status.message,
        status as unknown as Record<string, unknown>,
      );
    },
  );

  registerMcpTool(
    server,
    user,
    "findings_manage",
    {
      description:
        "List, add, update, close, or export engagement findings stored by MCP.",
      inputSchema: {
        engagement_id: z.string(),
        agent_id: z.string().optional(),
        action: z.enum(["list", "add", "update", "close", "export"]),
        finding_id: z.string().optional(),
        title: z.string().optional(),
        content: z.string().optional(),
        severity: z
          .enum(["info", "low", "medium", "high", "critical"])
          .optional(),
        status: z.enum(["open", "closed"]).optional(),
      },
    },
    async ({
      engagement_id,
      agent_id = "mcp",
      action,
      finding_id,
      title,
      content,
      severity = "info",
      status,
    }) => {
      const session = await getOwnedSession(user, engagement_id);
      const findings = session.mcpFindings || [];

      if (action === "list") {
        return textResult(`Found ${findings.length} finding(s).`, { findings });
      }

      if (action === "add") {
        if (!title || !content)
          throw new Error("title and content are required");
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
        const markdown = findings
          .map((finding, index) =>
            [
              `## ${index + 1}. ${finding.title}`,
              `Severity: ${finding.severity}`,
              `Status: ${finding.status}`,
              `Created By: ${finding.createdBy}`,
              "",
              finding.content,
            ].join("\n"),
          )
          .join("\n\n");
        return textResult(markdown || "No findings recorded yet.", {
          findings,
        });
      }

      if (!finding_id) throw new Error("finding_id is required");
      const finding = findings.find(
        (candidate) => candidate.findingId === finding_id,
      );
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

  registerMcpTool(
    server,
    user,
    "artifact_add",
    {
      description:
        "Attach a note, file reference, image reference, request, or other external artifact to an engagement so it is visible in Pentest Copilot history.",
      inputSchema: {
        engagement_id: z.string(),
        agent_id: z.string().optional(),
        type: z
          .enum([
            "note",
            "file",
            "image",
            "browser_observation",
            "request",
            "other",
          ])
          .default("other"),
        title: z.string(),
        content: z.string().optional(),
        url: z.string().optional(),
        path: z.string().optional(),
        mime_type: z.string().optional(),
        metadata: z.record(z.string()).optional(),
      },
    },
    async ({
      engagement_id,
      agent_id = "mcp",
      type,
      title,
      content,
      url,
      path: artifactPath,
      mime_type,
      metadata,
    }) => {
      const artifact = await addSessionArtifact(user, {
        engagementId: engagement_id,
        type,
        title,
        content,
        url,
        path: artifactPath,
        mimeType: mime_type,
        createdBy: agent_id,
        metadata,
      });
      return textResult(`Added artifact ${artifact.artifactId}.`, {
        artifact,
      });
    },
  );

  registerMcpTool(
    server,
    user,
    "browser_observation_add",
    {
      description:
        "Report browser work performed outside Pentest Copilot, such as via Claude Code/Codex Playwright MCP, back into an engagement.",
      inputSchema: {
        engagement_id: z.string(),
        agent_id: z.string().optional(),
        url: z.string(),
        title: z.string().optional(),
        summary: z.string(),
        screenshot_path: z.string().optional(),
        screenshot_mime_type: z.string().optional(),
        page_text: z.string().optional(),
        metadata: z.record(z.string()).optional(),
      },
    },
    async ({
      engagement_id,
      agent_id = "mcp",
      url,
      title,
      summary,
      screenshot_path,
      screenshot_mime_type,
      page_text,
      metadata,
    }) => {
      const content = [
        summary,
        page_text ? `\n\nPage text:\n${page_text}` : "",
      ].join("");
      const artifact = await addSessionArtifact(user, {
        engagementId: engagement_id,
        type: "browser_observation",
        title: title || `Browser observation: ${url}`,
        content,
        url,
        path: screenshot_path,
        mimeType: screenshot_mime_type,
        createdBy: agent_id,
        metadata,
      });
      return textResult(`Added browser observation ${artifact.artifactId}.`, {
        artifact,
      });
    },
  );

  registerMcpTool(
    server,
    user,
    "artifact_get",
    {
      description:
        "Fetch useful artifacts such as engagement history, shell records, files, or image inspection outputs.",
      inputSchema: {
        engagement_id: z.string(),
        agent_id: z.string().optional(),
        action: z.enum(["history", "shells", "artifacts", "file", "image"]),
        path: z.string().optional(),
        question: z.string().optional(),
        max_lines: z.number().optional(),
      },
    },
    async ({
      engagement_id,
      agent_id = "mcp",
      action,
      path: artifactPath,
      question,
      max_lines = 120,
    }) => {
      const session = await getOwnedSession(user, engagement_id);
      if (action === "history") {
        return textResult(`Returned ${session.messages.length} messages.`, {
          messages: session.messages,
          archive: await HistoryArchiveModel.findOne({
            sessionId: engagement_id,
          }).lean(),
        });
      }
      if (action === "shells") {
        return textResult(`Returned ${session.shells.length} shell records.`, {
          shells: session.shells || [],
        });
      }
      if (action === "artifacts") {
        const artifacts = session.mcpArtifacts || [];
        return textResult(`Returned ${artifacts.length} artifact(s).`, {
          artifacts,
        });
      }
      if (!artifactPath) throw new Error("path is required");
      if (action === "image") {
        const { result } = await executeLowLevelTool(
          engagement_id,
          agent_id,
          "view_image",
          {
            image_path: artifactPath,
            question,
          },
        );
        const structured = toolResultPayload(result, {
          action,
          path: artifactPath,
          question,
        });
        return textResult(formatToolResult(result), structured);
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
      return textResult(output.trim(), {
        action,
        path: artifactPath,
        max_lines,
        output: output.trim(),
      });
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
      return res
        .status(403)
        .json({ message: "Forbidden host header for local MCP endpoint" });
    }

    if (origin) {
      try {
        const originHost = new URL(origin).hostname;
        if (!allowedHosts.has(originHost)) {
          return res
            .status(403)
            .json({ message: "Forbidden origin for local MCP endpoint" });
        }
      } catch {
        return res.status(403).json({ message: "Invalid origin header" });
      }
    }

    next();
  };
}
