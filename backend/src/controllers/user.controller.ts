import { Response, Request } from "express";
import crypto from "crypto";
import { formatMagnitudeError } from "../utils/magnitudeError";
import axios from "axios";
import moment from "moment";
import { getVncDisplay, getVncRfbPort, getWebsockifyPort } from "../config/constants";
import { getAvailableModels as fetchModelsCatalog } from "../services/models-catalog.service";
import { clearProviderCache } from "../utils/llm/providers";
import {
  buildSwarmModelEnvUpdates,
  normalizeSwarmModelsInput,
  readSwarmModelsFromEnv,
} from "../utils/swarmModelEnv";

export const updateUserProfile = async (req: Request, res: Response) => {
  try {
    const user = res.locals.user;
    const userId = res.locals.userId;

    const { name } = req.body;

    if (!name) {
      return res.status(400).json({
        message: "Invalid name",
      });
    }

    user.name = name;

    await user.save();

    return res.status(200).json({
      message: "User profile updated",
    });
  } catch (error) {
    console.log(error);
    return res.status(400).json({
      message: "Failed to update user profile",
    });
  }
};

export const updateUserProfileImage = async (req: Request, res: Response) => {
  try {
    const user = res.locals.user;
    const userId = res.locals.userId;

    const file = req.file;

    if (!file) {
      return res.status(400).json({
        message: "Invalid file",
      });
    }

    if (file.size > 2097152) {
      return res.status(400).json({ message: "file size is too large" });
    }



    return res.status(200).json({
      message: "User profile image updated",
    });
  } catch (error) {
    console.log(error);
    return res.status(400).json({
      message: "Failed to update user profile image",
    });
  }
};

// Tools

export const updateToolsPreference = async (req: Request, res: Response) => {
  try {
    const user = res.locals.user;
    const userId = res.locals.userId;

    const { tools } = req.body;

    if (!tools) {
      return res.status(400).json({
        message: "Invalid data",
      });
    }

    user.configs.tools = tools;

    await user.save();

    return res.status(200).json({
      message: "Tools preference updated",
    });
  } catch (error) {
    console.log(error);
    return res.status(400).json({
      message: "Failed to update user profile",
    });
  }
};

export const getUserTools = async (req: Request, res: Response) => {
  try {
    const user = res.locals.user;
    const userId = res.locals.userId;

    return res.status(200).json({ tools: user.configs.tools });
  } catch (error) {
    console.log(error);
    return res.status(400).json({
      message: "Failed to get user tools",
    });
  }
};

// ─── Agent Tools Toggle ─────────────────────────────────────────────

import { toolRegistry } from "../tools/registry";

export const getAgentToolsConfig = async (req: Request, res: Response) => {
  try {
    const user = res.locals.user;
    const disabledTools: string[] = user.configs.disabledAgentTools || [];

    const allTools = toolRegistry.getAll().map((t) => ({
      name: t.name,
      description: t.description,
      enabled: !disabledTools.includes(t.name),
    }));

    return res.status(200).json({ tools: allTools });
  } catch (error) {
    console.log(error);
    return res.status(400).json({ message: "Failed to get agent tools config" });
  }
};

export const updateAgentToolsConfig = async (req: Request, res: Response) => {
  try {
    const user = res.locals.user;
    const { disabledTools } = req.body;

    if (!Array.isArray(disabledTools)) {
      return res.status(400).json({ message: "disabledTools must be an array" });
    }

    user.configs.disabledAgentTools = disabledTools;
    await user.save();

    return res.status(200).json({ message: "Agent tools config updated" });
  } catch (error) {
    console.log(error);
    return res.status(400).json({ message: "Failed to update agent tools config" });
  }
};

// ─── Unified Models ──────────────────────────────────────────────────

export const getSwarmModels = async (req: Request, res: Response) => {
  try {
    const env = readEnvFile();
    return res.status(200).json({
      models: readSwarmModelsFromEnv(env),
    });
  } catch (error) {
    console.log(error);
    return res.status(400).json({ message: "Failed to get models" });
  }
};

export const updateSwarmModels = async (req: Request, res: Response) => {
  try {
    const { models } = req.body;

    if (!Array.isArray(models)) {
      return res.status(400).json({ message: "models must be an array" });
    }

    const normalized = normalizeSwarmModelsInput(models);
    if (models.length > 0 && normalized.length !== models.length) {
      return res.status(400).json({ message: "Each model must have label, provider, and model fields" });
    }

    const updates = buildSwarmModelEnvUpdates(normalized);
    updateEnvVars(updates);
    clearProviderCache();

    return res.status(200).json({ message: "Models updated" });
  } catch (error) {
    console.log(error);
    return res.status(400).json({ message: "Failed to update models" });
  }
};

// ─── Capabilities ────────────────────────────────────────────────────

import {
  capabilityBuckets,
  allCapabilities,
  buildDetectionScript,
  parseDetectionOutput,
} from "../capabilities/registry";
import { execSSHCommand } from "../services/ssh.service";

export const getCapabilities = async (req: Request, res: Response) => {
  try {
    const user = res.locals.user;
    return res.status(200).json({
      buckets: capabilityBuckets,
      selectedCapabilities: user.configs.capabilities ?? [],
      installedCapabilities: user.configs.installedCapabilities ?? [],
      requireConsentForAllTools: user.configs.requireConsentForAllTools ?? false,
    });
  } catch (error) {
    console.log(error);
    return res.status(400).json({ message: "Failed to get capabilities" });
  }
};

export const updateCapabilities = async (req: Request, res: Response) => {
  try {
    const user = res.locals.user;
    const { capabilities, requireConsentForAllTools } = req.body;

    if (capabilities !== undefined) {
      if (!Array.isArray(capabilities)) {
        return res.status(400).json({ message: "Invalid capabilities data" });
      }
      user.configs.capabilities = capabilities;

      const toolNames = capabilities.filter((name: string) => {
        const cap = allCapabilities.find((c) => c.name === name);
        return cap && cap.type === "binary";
      });
      user.configs.tools = toolNames;
    }

    if (typeof requireConsentForAllTools === "boolean") {
      user.configs.requireConsentForAllTools = requireConsentForAllTools;
    }

    await user.save();
    return res.status(200).json({ message: "Capabilities updated" });
  } catch (error) {
    console.log(error);
    return res.status(400).json({ message: "Failed to update capabilities" });
  }
};

export const detectCapabilities = async (req: Request, res: Response) => {
  try {
    const user = res.locals.user;
    const selected: string[] = user.configs.capabilities ?? allCapabilities.map((c) => c.name);

    const script = buildDetectionScript(selected);
    const output = await execSSHCommand(script);
    const results = parseDetectionOutput(output);

    const installed = Object.entries(results)
      .filter(([, isInstalled]) => isInstalled)
      .map(([name]) => name);

    user.configs.installedCapabilities = installed;
    await user.save();

    return res.status(200).json({
      installedCapabilities: installed,
      detectionResults: results,
    });
  } catch (error) {
    console.log(error);
    return res.status(400).json({
      message: "Failed to detect capabilities. Ensure SSH/Exploit Box is connected.",
    });
  }
};

// ─── Server-level Model Configuration (reads/writes .env) ────────────

import { readEnvFile, updateEnvVars } from "../utils/envWriter";

const MODEL_ENV_KEYS = {
  provider: "ORCHESTRATOR_PROVIDER",
  model: "ORCHESTRATOR_MODEL",
  apiKey: "ORCHESTRATOR_API_KEY",
  baseURL: "ORCHESTRATOR_BASE_URL",
};

export const getModelConfig = async (_req: Request, res: Response) => {
  try {
    const env = readEnvFile();

    const mask = (key?: string) =>
      key ? `${key.slice(0, 4)}${"•".repeat(Math.max(0, key.length - 8))}${key.slice(-4)}` : "";

    const oauthToken = env.ANTHROPIC_OAUTH_ACCESS_TOKEN || "";
    const oauthConnected = !!oauthToken;

    const provider = env[MODEL_ENV_KEYS.provider] || "openai";
    const model = env[MODEL_ENV_KEYS.model] || "";
    const apiKey = env[MODEL_ENV_KEYS.apiKey] || "";
    const baseURL = env[MODEL_ENV_KEYS.baseURL] || "";
    const isOAuth = provider === "anthropic" && oauthConnected;
    const configured = !!(model && (apiKey || isOAuth));

    const reasoningMode = env.ORCHESTRATOR_REASONING_MODE || "off";

    return res.status(200).json({
      provider,
      model,
      apiKey: mask(apiKey),
      baseURL,
      configured,
      authMethod: isOAuth ? "oauth" : "api_key",
      oauthConnected: isOAuth,
      reasoningMode,
    });
  } catch (error) {
    console.log(error);
    return res.status(400).json({ message: "Failed to get model config" });
  }
};

export const updateModelConfig = async (req: Request, res: Response) => {
  try {
    const { provider, model, apiKey, baseURL, reasoningMode } = req.body;

    if (!provider || !model) {
      return res.status(400).json({ message: "Provider and model are required" });
    }

    const env = readEnvFile();
    const hasOAuth = !!env.ANTHROPIC_OAUTH_ACCESS_TOKEN;
    if (!apiKey && !(provider === "anthropic" && hasOAuth)) {
      return res.status(400).json({ message: "API key is required" });
    }

    const validProviders = ["openai", "anthropic", "openai-compatible"];
    if (!validProviders.includes(provider)) {
      return res.status(400).json({ message: `Invalid provider. Must be one of: ${validProviders.join(", ")}` });
    }

    if (reasoningMode && !["off", "low", "medium", "high"].includes(reasoningMode)) {
      return res.status(400).json({ message: "Invalid reasoning mode. Must be one of: off, low, medium, high" });
    }

    const isApiKeyMasked = apiKey?.includes("•");
    const existingKey = env[MODEL_ENV_KEYS.apiKey] || "";

    const updates: Record<string, string> = {
      [MODEL_ENV_KEYS.provider]: provider,
      [MODEL_ENV_KEYS.model]: model,
      [MODEL_ENV_KEYS.apiKey]: isApiKeyMasked && existingKey ? existingKey : (apiKey || ""),
      [MODEL_ENV_KEYS.baseURL]: baseURL || "",
      ...(reasoningMode !== undefined ? { ORCHESTRATOR_REASONING_MODE: reasoningMode } : {}),
    };

    updateEnvVars(updates);

    const { clearProviderCache } = await import("../utils/llm/providers");
    clearProviderCache();

    return res.status(200).json({ message: "Model config updated" });
  } catch (error) {
    console.log(error);
    return res.status(400).json({ message: "Failed to update model config" });
  }
};

export const deleteModelConfig = async (req: Request, res: Response) => {
  try {
    updateEnvVars({
      [MODEL_ENV_KEYS.provider]: "openai",
      [MODEL_ENV_KEYS.model]: "gpt-4o",
      [MODEL_ENV_KEYS.apiKey]: "",
      [MODEL_ENV_KEYS.baseURL]: "",
      ORCHESTRATOR_REASONING_MODE: "off",
    });

    const { clearProviderCache } = await import("../utils/llm/providers");
    clearProviderCache();

    return res.status(200).json({ message: "Model config reset to defaults" });
  } catch (error) {
    console.log(error);
    return res.status(400).json({ message: "Failed to delete model config" });
  }
};

// ─── Anthropic OAuth (writes tokens to .env) ─────────────────────────

const ANTHROPIC_OAUTH = {
  clientId: "9d1c250a-e61b-44d9-88ed-5944d1962f5e",
  authURL: "https://claude.ai/oauth/authorize",
  tokenURL: "https://console.anthropic.com/v1/oauth/token",
  redirectURI: "https://console.anthropic.com/oauth/code/callback",
  scopes: "org:create_api_key user:profile user:inference",
};

function generatePKCE() {
  const verifier = crypto.randomBytes(32).toString("base64url");
  const challenge = crypto
    .createHash("sha256")
    .update(verifier)
    .digest("base64url");
  return { verifier, challenge };
}

const oauthStateStore = new Map<string, { verifier: string; userId: string; expiresAt: number }>();

setInterval(() => {
  const now = Date.now();
  for (const [key, val] of oauthStateStore) {
    if (val.expiresAt < now) oauthStateStore.delete(key);
  }
}, 60_000);

export const initiateAnthropicOAuth = async (req: Request, res: Response) => {
  try {
    const userId = res.locals.userId;

    const { verifier, challenge } = generatePKCE();
    const state = crypto.randomBytes(16).toString("hex");

    oauthStateStore.set(state, {
      verifier,
      userId: userId.toString(),
      expiresAt: Date.now() + 10 * 60 * 1000,
    });

    const params = new URLSearchParams({
      code: "true",
      client_id: ANTHROPIC_OAUTH.clientId,
      response_type: "code",
      redirect_uri: ANTHROPIC_OAUTH.redirectURI,
      scope: ANTHROPIC_OAUTH.scopes,
      code_challenge: challenge,
      code_challenge_method: "S256",
      state,
    });

    return res.status(200).json({
      authorizationURL: `${ANTHROPIC_OAUTH.authURL}?${params.toString()}`,
      state,
    });
  } catch (error) {
    console.log(error);
    return res.status(400).json({ message: "Failed to initiate OAuth" });
  }
};

export const exchangeAnthropicOAuth = async (req: Request, res: Response) => {
  try {
    const userId = res.locals.userId;
    const { code, state } = req.body;

    if (!code || !state) {
      return res.status(400).json({ message: "Code and state are required" });
    }

    const stored = oauthStateStore.get(state);
    if (!stored || stored.userId !== userId.toString()) {
      return res.status(400).json({ message: "Invalid or expired OAuth state" });
    }

    oauthStateStore.delete(state);

    const codeParts = code.split("#");
    const authCode = codeParts[0];

    const tokenResponse = await axios.post(
      ANTHROPIC_OAUTH.tokenURL,
      new URLSearchParams({
        code: authCode,
        state,
        grant_type: "authorization_code",
        client_id: ANTHROPIC_OAUTH.clientId,
        redirect_uri: ANTHROPIC_OAUTH.redirectURI,
        code_verifier: stored.verifier,
      }).toString(),
      {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      }
    );

    const { access_token, refresh_token, expires_in } = tokenResponse.data;

    updateEnvVars({
      ANTHROPIC_OAUTH_ACCESS_TOKEN: access_token,
      ANTHROPIC_OAUTH_REFRESH_TOKEN: refresh_token,
      ANTHROPIC_OAUTH_EXPIRES_AT: String(Math.floor(Date.now() / 1000) + (expires_in || 3600)),
    });

    const { clearProviderCache } = await import("../utils/llm/providers");
    clearProviderCache();

    return res.status(200).json({ message: "Claude account connected via OAuth" });
  } catch (error: any) {
    console.log("OAuth exchange error:", error?.response?.data || error);
    const msg = error?.response?.data?.error_description || "OAuth token exchange failed";
    return res.status(400).json({ message: msg });
  }
};

export const disconnectAnthropicOAuth = async (_req: Request, res: Response) => {
  try {
    updateEnvVars({
      ANTHROPIC_OAUTH_ACCESS_TOKEN: "",
      ANTHROPIC_OAUTH_REFRESH_TOKEN: "",
      ANTHROPIC_OAUTH_EXPIRES_AT: "",
    });

    const { clearProviderCache } = await import("../utils/llm/providers");
    clearProviderCache();

    return res.status(200).json({ message: "Claude OAuth disconnected" });
  } catch (error) {
    console.log(error);
    return res.status(400).json({ message: "Failed to disconnect OAuth" });
  }
};

// ─── VNC / GUI Configuration (reads/writes .env) ─────────────────────

const VNC_ENV_KEYS = {
  mode: "VNC_MODE",
  host: "VNC_HOST",
  port: "VNC_PORT",
  password: "VNC_PASSWORD",
  setupDone: "VNC_SETUP_DONE",
  baseUrl: "VNC_BASE_URL",
};

export const getVNCConfig = async (_req: Request, res: Response) => {
  try {
    const env = readEnvFile();
    const mode = env[VNC_ENV_KEYS.mode] || "";
    const host = env[VNC_ENV_KEYS.host] || "";
    const port = env[VNC_ENV_KEYS.port] || "9020";
    const password = env[VNC_ENV_KEYS.password] || "";
    const setupDone = env[VNC_ENV_KEYS.setupDone] === "true";
    const baseUrl = (env[VNC_ENV_KEYS.baseUrl] || "").trim();

    const configured = !!(mode && (mode === "manual" ? (host && password) : setupDone));

    return res.status(200).json({
      mode,
      host,
      port,
      password,
      setupDone,
      baseUrl,
      configured,
    });
  } catch (error) {
    console.log(error);
    return res.status(400).json({ message: "Failed to get VNC config" });
  }
};

export const updateVNCConfig = async (req: Request, res: Response) => {
  try {
    const { mode, host, port, password, baseUrl } = req.body;
    const env = readEnvFile();

    if (!mode || !["auto", "manual"].includes(mode)) {
      return res.status(400).json({ message: "Mode must be 'auto' or 'manual'" });
    }

    if (mode === "manual") {
      if (!host || !password) {
        return res.status(400).json({ message: "Host and password are required for manual mode" });
      }
    }

    const updates: Record<string, string> = {
      [VNC_ENV_KEYS.mode]: mode,
      [VNC_ENV_KEYS.host]: host ?? env[VNC_ENV_KEYS.host] ?? "",
      [VNC_ENV_KEYS.port]: String(port ?? env[VNC_ENV_KEYS.port] ?? 9020),
      [VNC_ENV_KEYS.password]: password !== undefined && password !== "" ? password : (env[VNC_ENV_KEYS.password] || ""),
      [VNC_ENV_KEYS.setupDone]: mode === "manual" ? "true" : (env[VNC_ENV_KEYS.setupDone] || "false"),
      [VNC_ENV_KEYS.baseUrl]: typeof baseUrl === "string" ? baseUrl.trim() : "",
    };

    updateEnvVars(updates);

    return res.status(200).json({ message: "VNC configuration saved" });
  } catch (error) {
    console.log(error);
    return res.status(400).json({ message: "Failed to update VNC config" });
  }
};

export const resetVNCConfig = async (_req: Request, res: Response) => {
  try {
    updateEnvVars({
      [VNC_ENV_KEYS.mode]: "",
      [VNC_ENV_KEYS.host]: "",
      [VNC_ENV_KEYS.port]: "",
      [VNC_ENV_KEYS.password]: "",
      [VNC_ENV_KEYS.setupDone]: "",
      [VNC_ENV_KEYS.baseUrl]: "",
    });

    return res.status(200).json({ message: "VNC configuration reset" });
  } catch (error) {
    console.log(error);
    return res.status(400).json({ message: "Failed to reset VNC config" });
  }
};

export const autoSetupVNC = async (_req: Request, res: Response) => {
  const VNC_DISPLAY = getVncDisplay();
  const VNC_RFBPORT = getVncRfbPort();
  const WEBSOCKIFY_PORT = getWebsockifyPort();
  const { buildSSHConfig } = await import("../utils/sshConfig");
  const ssh2 = await import("ssh2");
  const { generateRandomPassword } = await import("../utils/fileUtils");

  try {
    const sshConfig = buildSSHConfig();
    const sshClient = new ssh2.Client();

    sshClient
      .on("ready", async () => {
        try {
          const steps = [
            { label: "Checking for VNC server", done: false },
            { label: "Installing VNC & GUI packages", done: false },
            { label: "Configuring VNC", done: false },
            { label: "Starting VNC server", done: false },
            { label: "Starting noVNC proxy", done: false },
          ];

          const execCmd = (cmd: string): Promise<string> => {
            return new Promise((resolve, reject) => {
              sshClient.exec(cmd, (err, stream) => {
                if (err) return reject(err);
                let out = "";
                stream
                  .on("close", () => resolve(out))
                  .on("data", (d: Buffer) => { out += d.toString(); })
                  .stderr.on("data", (d: Buffer) => { out += d.toString(); });
              });
            });
          };

          // Step 1: Check if VNC + websockify already installed
          let vncBin = "";
          const vncRaw = await execCmd(VNC_SEARCH_CMD);
          vncBin = parseVncPath(vncRaw);

          let wsInstalled = false;
          try {
            const wsRaw = await execCmd('command -v websockify 2>/dev/null');
            wsInstalled = parseVncPath(wsRaw).length > 0;
          } catch { /* not installed */ }

          const alreadyInstalled = vncBin.length > 0 && wsInstalled;
          steps[0].done = true;

          // Step 2: Install packages if anything is missing
          if (!alreadyInstalled) {
            // Install Xvnc + lightweight GUI deps; try tigervnc first, fall back to tightvncserver
            await execCmd(
              "export DEBIAN_FRONTEND=noninteractive && " +
              "sudo apt-get update -qq 2>&1 && " +
              "sudo apt-get install -y -qq " +
              "tigervnc-standalone-server tigervnc-common " +
              "novnc python3-websockify " +
              "xterm xfonts-base x11-xserver-utils " +
              "dbus-x11 2>&1 || true"
            );

            // If tigervnc failed (no Xvnc), try tightvncserver as fallback
            let recheck = await execCmd(VNC_SEARCH_CMD);
            vncBin = parseVncPath(recheck);
            if (!vncBin) {
              await execCmd(
                "export DEBIAN_FRONTEND=noninteractive && " +
                "sudo apt-get install -y -qq tightvncserver 2>&1 || true"
              );
              recheck = await execCmd(VNC_SEARCH_CMD);
              vncBin = parseVncPath(recheck);
            }

            if (!vncBin) {
              const dpkgInfo = await execCmd("dpkg -l | grep -i vnc 2>/dev/null || true").catch(() => "");
              const findInfo = await execCmd("find /usr -maxdepth 4 -type f \\( -name '*vnc*' -o -name '*Xvnc*' \\) 2>/dev/null | head -20").catch(() => "");
              console.log("VNC binary not found after install. dpkg:", dpkgInfo, "find:", findInfo);
              sshClient.end();
              return res.status(400).json({
                message: `VNC binary not found after package install. Installed VNC packages: ${dpkgInfo.trim().split("\n").filter(l => l.startsWith("ii")).map(l => l.split(/\s+/)[1]).join(", ") || "none"}. Found files: ${findInfo.trim().split("\n").slice(0, 5).join(", ") || "none"}`,
              });
            }
          }
          steps[1].done = true;

          // Discover vncpasswd binary
          let vncPasswdBin = "vncpasswd";
          try {
            const raw = await execCmd(
              'export PATH="$PATH:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/usr/libexec"; ' +
              'for b in vncpasswd tigervncpasswd; do p="$(command -v "$b" 2>/dev/null)" && [ -x "$p" ] && echo "$p" && break; done; ' +
              'for p in /usr/bin/vncpasswd /usr/bin/tigervncpasswd; do [ -x "$p" ] && echo "$p" && break; done'
            );
            const found = parseVncPath(raw);
            if (found) vncPasswdBin = found;
          } catch { /* use default */ }

          const isXvncDirect = vncBin.endsWith("Xvnc") || vncBin.endsWith("Xtigervnc");
          const isX11vnc = vncBin.endsWith("x11vnc");

          // Step 3: Configure VNC
          const randomPassword = generateRandomPassword();
          await execCmd(
            `mkdir -p ~/.vnc && ` +
            `echo '#!/bin/bash\\nexport DISPLAY=${VNC_DISPLAY}\\n[ -f $$HOME/.Xresources ] && xrdb $$HOME/.Xresources\\nif command -v startxfce4 >/dev/null 2>&1; then\\n  startxfce4 &\\nelif command -v openbox-session >/dev/null 2>&1; then\\n  openbox-session &\\nelse\\n  xterm &\\nfi' > ~/.vnc/xstartup && ` +
            `chmod +x ~/.vnc/xstartup`
          );
          // Kill all existing VNC/Xvfb processes for a clean start
          await execCmd(
            "pkill -f '[X](vnc|tigervnc)' 2>/dev/null || true; " +
            "pkill -f x11vnc 2>/dev/null || true; " +
            "pkill -f 'Xvfb' 2>/dev/null || true; " +
            `for display in {1..99}; do vncserver -kill ":$display" 2>/dev/null || true; done`
          );
          const escapedPw = randomPassword.replace(/'/g, "'\\''");
          if (!isX11vnc) {
            await execCmd(
              `echo '${escapedPw}' | ${vncPasswdBin} -f > ~/.vnc/passwd && chmod 600 ~/.vnc/passwd`
            );
          }
          steps[2].done = true;

          // Step 4: Start VNC server with DISPLAY=${VNC_DISPLAY}
          if (isXvncDirect) {
            await execCmd(
              `${vncBin} ${VNC_DISPLAY} -geometry 1280x800 -depth 24 -rfbport ${VNC_RFBPORT} ` +
              `-SecurityTypes VncAuth -PasswordFile ~/.vnc/passwd ` +
              `-pn > /dev/null 2>&1 &`
            );
            await new Promise((resolve) => setTimeout(resolve, 1500));
            await execCmd(`export DISPLAY=${VNC_DISPLAY} && ~/.vnc/xstartup &`);
          } else if (isX11vnc) {
            await execCmd(
              "command -v Xvfb >/dev/null 2>&1 || " +
              "(export DEBIAN_FRONTEND=noninteractive && sudo apt-get install -y -qq xvfb 2>&1 || true)"
            );
            await execCmd(`Xvfb ${VNC_DISPLAY} -screen 0 1280x800x24 > /dev/null 2>&1 &`);
            await new Promise((resolve) => setTimeout(resolve, 2000));
            await execCmd(`export DISPLAY=${VNC_DISPLAY} && ~/.vnc/xstartup &`);
            await execCmd(
              `x11vnc -display ${VNC_DISPLAY} -rfbport ${VNC_RFBPORT} -passwd '${escapedPw}' ` +
              `-forever -shared -noxdamage > /dev/null 2>&1 &`
            );
            await new Promise((resolve) => setTimeout(resolve, 1500));
            // Verify x11vnc actually started
            const verify = await execCmd(
              `(ss -tlnp 2>/dev/null || netstat -tlnp 2>/dev/null) | grep ':${VNC_RFBPORT}' || echo NOTLISTENING`
            );
            if (verify.includes("NOTLISTENING")) {
              sshClient.end();
              return res.status(400).json({
                message: `x11vnc failed to start on rfbport ${VNC_RFBPORT}. Check that display ${VNC_DISPLAY} is available and no other process uses port ${VNC_RFBPORT}.`,
              });
            }
          } else {
            await execCmd(`${vncBin} -geometry 1280x800 -depth 24 ${VNC_DISPLAY}`);
          }
          // Ensure DISPLAY is exported in the user's shell profile
          await execCmd(
            `grep -q "export DISPLAY=${VNC_DISPLAY}" ~/.bashrc 2>/dev/null || ` +
            `echo "export DISPLAY=${VNC_DISPLAY}" >> ~/.bashrc`
          );
          steps[3].done = true;

          // Step 5: Start noVNC proxy
          await execCmd(`pkill -f 'websockify.*${WEBSOCKIFY_PORT}' 2>/dev/null || true`);
          await execCmd(
            `websockify --web /usr/share/novnc/ ${WEBSOCKIFY_PORT} localhost:${VNC_RFBPORT} > /dev/null 2>&1 &`
          );
          await new Promise((resolve) => setTimeout(resolve, 1000));
          steps[4].done = true;

          const vncHost = sshConfig.host || "localhost";
          const vncPort = "9020";

          const isDockerInternal = vncHost !== "localhost" && vncHost !== "127.0.0.1" && !/^\d+\.\d+\.\d+\.\d+$/.test(vncHost) && !vncHost.includes(".");
          const baseUrl = isDockerInternal ? `http://localhost:${vncPort}` : "";

          updateEnvVars({
            [VNC_ENV_KEYS.mode]: "auto",
            [VNC_ENV_KEYS.host]: vncHost,
            [VNC_ENV_KEYS.port]: vncPort,
            [VNC_ENV_KEYS.password]: randomPassword,
            [VNC_ENV_KEYS.setupDone]: "true",
            [VNC_ENV_KEYS.baseUrl]: baseUrl,
          });

          sshClient.end();

          return res.status(200).json({
            message: "VNC setup completed successfully",
            vncURL: `${vncHost}:${vncPort}`,
            password: randomPassword,
            steps,
          });
        } catch (error) {
          sshClient.end();
          console.log("VNC auto-setup error:", error);
          return res.status(400).json({
            message: "VNC setup failed during installation. Ensure the exploit box has internet access for package installation.",
          });
        }
      })
      .on("error", (err: Error) => {
        console.log("SSH connection error during VNC setup:", err);
        return res.status(400).json({
          message: "Cannot connect to exploit box via SSH. Please configure SSH settings first.",
        });
      });

    sshClient.connect(sshConfig);
  } catch (error) {
    console.log(error);
    return res.status(400).json({
      message: "VNC auto-setup failed. Ensure SSH/Exploit Box is configured.",
    });
  }
};

// ─── VNC Diagnostics & Repair ─────────────────────────────────────────

interface DiagCheck {
  id: string;
  label: string;
  status: "pass" | "fail" | "skip";
  detail: string;
}

const VNC_SEARCH_CMD = [
  'export PATH="$PATH:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/snap/bin:/usr/libexec";',
  // Prefer Xvnc/Xtigervnc (the actual binaries) over wrapper scripts
  'for b in Xvnc Xtigervnc vncserver tigervncserver x11vnc; do',
  '  p="$(command -v "$b" 2>/dev/null)" && [ -x "$p" ] && echo "$p" && exit 0;',
  'done;',
  'for p in /usr/bin/Xvnc /usr/bin/Xtigervnc /usr/bin/vncserver /usr/bin/tigervncserver',
  '  /usr/local/bin/Xvnc /usr/local/bin/vncserver /usr/libexec/vncserver /usr/sbin/vncserver',
  '  /usr/bin/x11vnc /snap/bin/vncserver; do',
  '  [ -x "$p" ] && echo "$p" && exit 0;',
  'done;',
  'dpkg -L tigervnc-standalone-server 2>/dev/null | grep -m1 -E "/(Xvnc|Xtigervnc|vncserver|tigervncserver)$";',
  'find /usr -maxdepth 4 \\( -name "Xvnc" -o -name "Xtigervnc" -o -name "vncserver" -o -name "tigervncserver" -o -name "x11vnc" \\) -type f 2>/dev/null | head -1',
].join(' ');

function parseVncPath(raw: string): string {
  for (const line of raw.trim().split("\n")) {
    const trimmed = line.trim();
    if (trimmed.startsWith("/") && !trimmed.includes(" ")) return trimmed;
  }
  return "";
}

async function runDiagnostics(): Promise<DiagCheck[]> {
  const VNC_DISPLAY = getVncDisplay();
  const VNC_RFBPORT = getVncRfbPort();
  const WEBSOCKIFY_PORT = getWebsockifyPort();
  const { execSSHCommand } = await import("../services/ssh.service");

  const checks: DiagCheck[] = [];
  console.log("[VNC Diagnose] Starting diagnostics...");

  // 1. SSH connectivity
  try {
    const whoami = await execSSHCommand("whoami");
    console.log(`[VNC Diagnose] SSH: connected as ${whoami.trim()}`);
    checks.push({
      id: "ssh",
      label: "SSH connectivity",
      status: "pass",
      detail: `Connected as ${whoami.trim()}`,
    });
  } catch (err: any) {
    console.error("[VNC Diagnose] SSH: connection failed:", err?.message || err);
    checks.push({
      id: "ssh",
      label: "SSH connectivity",
      status: "fail",
      detail: err?.message || "Cannot connect via SSH",
    });
    const skipRest = ["vnc_installed", "websockify_installed", "vnc_running", "websockify_running", "novnc_reachable"];
    for (const id of skipRest) {
      checks.push({ id, label: "", status: "skip", detail: "Skipped — SSH failed" });
    }
    return checks;
  }

  // 2. VNC server installed
  let vncBinaryPath = "";
  try {
    const out = await execSSHCommand(VNC_SEARCH_CMD);
    console.log("[VNC Diagnose] VNC search raw output:", out.trim());
    vncBinaryPath = parseVncPath(out);
    const found = vncBinaryPath.length > 0;
    console.log(`[VNC Diagnose] VNC installed: ${found ? vncBinaryPath : "NOT FOUND"}`);
    checks.push({
      id: "vnc_installed",
      label: "VNC server installed",
      status: found ? "pass" : "fail",
      detail: found ? `Found: ${vncBinaryPath}` : "No VNC binary found (vncserver, Xvnc, Xtigervnc)",
    });
  } catch (err: any) {
    console.error("[VNC Diagnose] VNC installed check failed:", err?.message || err);
    checks.push({ id: "vnc_installed", label: "VNC server installed", status: "fail", detail: "Check failed" });
  }

  // 3. Websockify installed
  try {
    const out = await execSSHCommand("which websockify 2>/dev/null && echo FOUND || echo MISSING");
    const found = out.trim().endsWith("FOUND");
    console.log(`[VNC Diagnose] Websockify installed: ${found ? out.split("\\n")[0]?.trim() : "NOT FOUND"}`);
    checks.push({
      id: "websockify_installed",
      label: "Websockify (noVNC proxy) installed",
      status: found ? "pass" : "fail",
      detail: found ? `websockify at ${out.split("\n")[0]?.trim()}` : "websockify not found in PATH",
    });
  } catch (err: any) {
    console.error("[VNC Diagnose] Websockify installed check failed:", err?.message || err);
    checks.push({ id: "websockify_installed", label: "Websockify installed", status: "fail", detail: "Check failed" });
  }

  // 4. VNC server running on DISPLAY=${VNC_DISPLAY} (rfbport ${VNC_RFBPORT})
  try {
    const psOut = await execSSHCommand(
      "ps aux 2>/dev/null | grep -E 'Xvnc|Xtigervnc|Xvfb|x11vnc|vncserver' | grep -v grep || true"
    );
    console.log("[VNC Diagnose] VNC processes:\n", psOut.trim() || "(none)");

    const portCheck = await execSSHCommand(
      `(ss -tlnp 2>/dev/null || netstat -tlnp 2>/dev/null) | grep ':${VNC_RFBPORT}' || true`
    );
    console.log(`[VNC Diagnose] Port ${VNC_RFBPORT} check:`, portCheck.trim() || "(not listening)");
    const rfbPortListening = portCheck.trim().length > 0;

    const hasAnyVnc = psOut.trim().length > 0;

    const healthy = rfbPortListening;
    let detail = "";
    if (rfbPortListening) {
      detail = `VNC listening on rfbport ${VNC_RFBPORT} (DISPLAY=${VNC_DISPLAY})`;
    } else if (hasAnyVnc) {
      detail = `VNC process found but not listening on port ${VNC_RFBPORT}. Run repair to fix.`;
    } else {
      detail = "No VNC server process found";
    }
    console.log(`[VNC Diagnose] VNC running: ${healthy ? "PASS" : "FAIL"} — ${detail}`);

    checks.push({
      id: "vnc_running",
      label: `VNC on DISPLAY=${VNC_DISPLAY} (port ${VNC_RFBPORT})`,
      status: healthy ? "pass" : "fail",
      detail,
    });
  } catch (err: any) {
    console.error("[VNC Diagnose] VNC running check failed:", err?.message || err);
    checks.push({ id: "vnc_running", label: `VNC on DISPLAY=${VNC_DISPLAY}`, status: "fail", detail: "Check failed" });
  }

  // 5. Websockify running: port ${WEBSOCKIFY_PORT} -> localhost:${VNC_RFBPORT}
  try {
    const out = await execSSHCommand("ps aux 2>/dev/null | grep 'websockify' | grep -v grep || true");
    console.log("[VNC Diagnose] Websockify processes:\n", out.trim() || "(none)");
    const lines = out.trim().split("\n").filter(l => l.trim().length > 0);
    const correctProxy = lines.some(l => l.includes(String(WEBSOCKIFY_PORT)) && l.includes(String(VNC_RFBPORT)));
    const anyWs = lines.length > 0;

    let status: "pass" | "fail" = correctProxy ? "pass" : "fail";
    let detail = "";
    if (correctProxy) {
      detail = `websockify proxying ${WEBSOCKIFY_PORT} → localhost:${VNC_RFBPORT}`;
    } else if (anyWs) {
      detail = `websockify running but not proxying ${WEBSOCKIFY_PORT} → ${VNC_RFBPORT}. Run repair to fix.`;
    } else {
      detail = "No websockify process found";
    }
    console.log(`[VNC Diagnose] Websockify running: ${status.toUpperCase()} — ${detail}`);

    checks.push({
      id: "websockify_running",
      label: `Websockify on port ${WEBSOCKIFY_PORT} → ${VNC_RFBPORT}`,
      status,
      detail,
    });
  } catch (err: any) {
    console.error("[VNC Diagnose] Websockify running check failed:", err?.message || err);
    checks.push({ id: "websockify_running", label: "Websockify running", status: "fail", detail: "Check failed" });
  }

  // 6. noVNC reachable locally
  try {
    const out = await execSSHCommand(`curl -s -o /dev/null -w "%{http_code}" http://localhost:${WEBSOCKIFY_PORT}/ 2>/dev/null || echo 000`);
    const code = out.trim();
    const ok = code === "200" || code === "301" || code === "302";
    console.log(`[VNC Diagnose] noVNC reachable: HTTP ${code} — ${ok ? "PASS" : "FAIL"}`);
    checks.push({
      id: "novnc_reachable",
      label: `noVNC web UI reachable (localhost:${WEBSOCKIFY_PORT})`,
      status: ok ? "pass" : "fail",
      detail: ok ? `HTTP ${code}` : `HTTP ${code} — noVNC not responding on port ${WEBSOCKIFY_PORT}`,
    });
  } catch (err: any) {
    console.error("[VNC Diagnose] noVNC reachable check failed:", err?.message || err);
    checks.push({ id: "novnc_reachable", label: "noVNC reachable", status: "fail", detail: "Check failed" });
  }

  console.log("[VNC Diagnose] Completed. Results:", JSON.stringify(checks, null, 2));
  return checks;
}

export const diagnoseVNC = async (_req: Request, res: Response) => {
  try {
    console.log("[VNC Diagnose] Diagnose endpoint called");
    const checks = await runDiagnostics();
    const allPassed = checks.every((c) => c.status === "pass");
    console.log(`[VNC Diagnose] All passed: ${allPassed}`);
    return res.status(200).json({ checks, allPassed });
  } catch (error: any) {
    console.error("[VNC Diagnose] Top-level error:", error);
    return res.status(400).json({
      message: error?.message || "Diagnostics failed. Ensure SSH is configured.",
    });
  }
};

export const repairVNC = async (req: Request, res: Response) => {
  try {
    const VNC_DISPLAY = getVncDisplay();
    const VNC_RFBPORT = getVncRfbPort();
    const WEBSOCKIFY_PORT = getWebsockifyPort();
    const { execSSHCommand } = await import("../services/ssh.service");
    const env = readEnvFile();
    const savedPassword = env[VNC_ENV_KEYS.password] || "";
    const fix = req.body?.fix || "all";

    console.log(`[VNC Repair] Starting repair (fix=${fix})`);

    const log: string[] = [];

    // Discover which VNC binary is actually available
    let vncBin = "vncserver";
    let vncMissing = false;
    try {
      const raw = await execSSHCommand(VNC_SEARCH_CMD);
      console.log("[VNC Repair] VNC search raw output:", raw.trim());
      const found = parseVncPath(raw);
      if (found) {
        vncBin = found;
        log.push(`Using VNC binary: ${vncBin}`);
        console.log(`[VNC Repair] Using VNC binary: ${vncBin}`);
      } else {
        vncMissing = true;
        console.log("[VNC Repair] VNC binary not found");
      }
    } catch (e: any) {
      vncMissing = true;
      console.error("[VNC Repair] VNC search failed:", e?.message || e);
    }

    // Check if websockify is missing too
    let websockifyMissing = false;
    try {
      const wsOut = await execSSHCommand('command -v websockify 2>/dev/null');
      if (!parseVncPath(wsOut)) {
        websockifyMissing = true;
        console.log("[VNC Repair] Websockify not found");
      } else {
        console.log("[VNC Repair] Websockify found:", wsOut.trim());
      }
    } catch {
      websockifyMissing = true;
      console.log("[VNC Repair] Websockify check failed");
    }

    // Install missing packages
    if ((fix === "all" || fix === "vnc_server") && (vncMissing || websockifyMissing)) {
      log.push("Installing missing VNC/noVNC packages...");
      console.log("[VNC Repair] Installing packages (vncMissing=%s, websockifyMissing=%s)", vncMissing, websockifyMissing);
      try {
        const installOut = await execSSHCommand(
          "export DEBIAN_FRONTEND=noninteractive && " +
          "sudo apt-get update -qq 2>&1 && " +
          "sudo apt-get install -y -qq " +
          "tigervnc-standalone-server tigervnc-common " +
          "novnc python3-websockify " +
          "xterm xfonts-base x11-xserver-utils dbus-x11 2>&1 || true"
        );
        console.log("[VNC Repair] Package install output:", installOut.trim().slice(-500));
        log.push("Package installation completed");

        let found = parseVncPath(await execSSHCommand(VNC_SEARCH_CMD));
        if (!found) {
          log.push("tigervnc not found, trying tightvncserver fallback...");
          console.log("[VNC Repair] tigervnc not found, trying tightvncserver...");
          await execSSHCommand(
            "export DEBIAN_FRONTEND=noninteractive && " +
            "sudo apt-get install -y -qq tightvncserver 2>&1 || true"
          );
          found = parseVncPath(await execSSHCommand(VNC_SEARCH_CMD));
        }
        if (found) {
          vncBin = found;
          vncMissing = false;
          log.push(`VNC binary now available: ${vncBin}`);
          console.log(`[VNC Repair] VNC binary now available: ${vncBin}`);
        } else {
          log.push("WARNING: VNC binary still not found after install");
          console.warn("[VNC Repair] WARNING: VNC binary still not found after install");
        }
      } catch (e: any) {
        log.push(`Package install failed: ${e.message}`);
        console.error("[VNC Repair] Package install failed:", e.message);
      }
    }

    // Determine the right vncpasswd binary
    let vncPasswdBin = "vncpasswd";
    try {
      const raw = await execSSHCommand(
        'export PATH="$PATH:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/usr/libexec"; ' +
        'for b in vncpasswd tigervncpasswd; do p="$(command -v "$b" 2>/dev/null)" && [ -x "$p" ] && echo "$p" && break; done; ' +
        'for p in /usr/bin/vncpasswd /usr/bin/tigervncpasswd; do [ -x "$p" ] && echo "$p" && break; done'
      );
      const found = parseVncPath(raw);
      if (found) vncPasswdBin = found;
      console.log(`[VNC Repair] vncpasswd binary: ${vncPasswdBin}`);
    } catch { /* use default */ }

    if (fix === "all" || fix === "vnc_server") {
      const isXvncDirect = vncBin.endsWith("Xvnc") || vncBin.endsWith("Xtigervnc");
      const isX11vnc = vncBin.endsWith("x11vnc");
      console.log(`[VNC Repair] VNC type: isXvncDirect=${isXvncDirect}, isX11vnc=${isX11vnc}, binary=${vncBin}`);

      try {
        await execSSHCommand(
          `mkdir -p ~/.vnc && ` +
          `echo '#!/bin/bash\\nexport DISPLAY=${VNC_DISPLAY}\\n[ -f $$HOME/.Xresources ] && xrdb $$HOME/.Xresources\\nif command -v startxfce4 >/dev/null 2>&1; then\\n  startxfce4 &\\nelif command -v openbox-session >/dev/null 2>&1; then\\n  openbox-session &\\nelse\\n  xterm &\\nfi' > ~/.vnc/xstartup && ` +
          `chmod +x ~/.vnc/xstartup`
        );
        log.push(`Configured xstartup with DISPLAY=${VNC_DISPLAY}`);
        console.log(`[VNC Repair] Configured xstartup with DISPLAY=${VNC_DISPLAY}`);
      } catch (e: any) {
        log.push(`xstartup config failed: ${e.message}`);
        console.error("[VNC Repair] xstartup config failed:", e.message);
      }

      try {
        await execSSHCommand(
          "pkill -f '[X](vnc|tigervnc)' 2>/dev/null || true; " +
          "pkill -f x11vnc 2>/dev/null || true; " +
          "pkill -f 'Xvfb' 2>/dev/null || true; " +
          "for display in {1..99}; do vncserver -kill \":$display\" 2>/dev/null || true; done"
        );
        log.push("Killed all existing VNC/Xvfb processes");
        console.log("[VNC Repair] Killed all existing VNC/Xvfb processes");
      } catch (e: any) {
        log.push(`Kill VNC failed: ${e.message}`);
        console.error("[VNC Repair] Kill VNC failed:", e.message);
      }

      if (savedPassword && !isX11vnc) {
        try {
          const escaped = savedPassword.replace(/'/g, "'\\''");
          await execSSHCommand(
            `echo '${escaped}' | ${vncPasswdBin} -f > ~/.vnc/passwd && chmod 600 ~/.vnc/passwd`
          );
          log.push("Set VNC password");
          console.log("[VNC Repair] Set VNC password");
        } catch (e: any) {
          log.push(`Set password failed: ${e.message}`);
          console.error("[VNC Repair] Set password failed:", e.message);
        }
      }

      try {
        if (isXvncDirect) {
          console.log(`[VNC Repair] Starting Xvnc directly: ${vncBin} ${VNC_DISPLAY} rfbport=${VNC_RFBPORT}`);
          await execSSHCommand(
            `${vncBin} ${VNC_DISPLAY} -geometry 1280x800 -depth 24 -rfbport ${VNC_RFBPORT} ` +
            `-SecurityTypes VncAuth -PasswordFile ~/.vnc/passwd ` +
            `-pn > /dev/null 2>&1 &`
          );
          await new Promise((r) => setTimeout(r, 1500));
          await execSSHCommand(`export DISPLAY=${VNC_DISPLAY} && ~/.vnc/xstartup &`);
          log.push(`Started Xvnc directly on ${VNC_DISPLAY}`);
          console.log(`[VNC Repair] Started Xvnc directly on ${VNC_DISPLAY}`);
        } else if (isX11vnc) {
          console.log(`[VNC Repair] Starting x11vnc flow: Xvfb ${VNC_DISPLAY} + x11vnc rfbport=${VNC_RFBPORT}`);
          await execSSHCommand(
            "command -v Xvfb >/dev/null 2>&1 || " +
            "(export DEBIAN_FRONTEND=noninteractive && sudo apt-get install -y -qq xvfb 2>&1 || true)"
          );
          await execSSHCommand(`Xvfb ${VNC_DISPLAY} -screen 0 1280x800x24 > /dev/null 2>&1 &`);
          await new Promise((r) => setTimeout(r, 2000));

          // Verify Xvfb started
          const xvfbCheck = await execSSHCommand(
            `ps aux 2>/dev/null | grep 'Xvfb.*${VNC_DISPLAY}' | grep -v grep || true`
          );
          console.log("[VNC Repair] Xvfb process check:", xvfbCheck.trim() || "(not found)");

          await execSSHCommand(`export DISPLAY=${VNC_DISPLAY} && ~/.vnc/xstartup &`);
          const escaped = (savedPassword || "").replace(/'/g, "'\\''");
          await execSSHCommand(
            `x11vnc -display ${VNC_DISPLAY} -rfbport ${VNC_RFBPORT} -passwd '${escaped}' -forever -shared -noxdamage > /dev/null 2>&1 &`
          );
          await new Promise((r) => setTimeout(r, 1500));

          // Verify x11vnc started and port is listening
          const portCheck = await execSSHCommand(
            `(ss -tlnp 2>/dev/null || netstat -tlnp 2>/dev/null) | grep ':${VNC_RFBPORT}' || echo NOTLISTENING`
          );
          console.log(`[VNC Repair] Port ${VNC_RFBPORT} check after x11vnc start:`, portCheck.trim());
          if (portCheck.includes("NOTLISTENING")) {
            log.push(`WARNING: x11vnc started but port ${VNC_RFBPORT} not listening`);
            console.warn(`[VNC Repair] x11vnc started but port ${VNC_RFBPORT} not listening`);
          } else {
            log.push(`Started x11vnc with Xvfb on ${VNC_DISPLAY}`);
            console.log(`[VNC Repair] Started x11vnc with Xvfb on ${VNC_DISPLAY}`);
          }
        } else {
          console.log(`[VNC Repair] Starting via vncserver wrapper: ${vncBin} ${VNC_DISPLAY}`);
          await execSSHCommand(`${vncBin} -geometry 1280x800 -depth 24 ${VNC_DISPLAY}`);
          log.push(`Started VNC server on ${VNC_DISPLAY}`);
          console.log(`[VNC Repair] Started VNC server on ${VNC_DISPLAY}`);
        }
        await execSSHCommand(
          `grep -q "export DISPLAY=${VNC_DISPLAY}" ~/.bashrc 2>/dev/null || echo "export DISPLAY=${VNC_DISPLAY}" >> ~/.bashrc`
        );
        console.log(`[VNC Repair] Ensured DISPLAY=${VNC_DISPLAY} in ~/.bashrc`);
      } catch (e: any) {
        log.push(`Start VNC failed: ${e.message}`);
        console.error("[VNC Repair] Start VNC failed:", e.message);
      }
    }

    if (fix === "all" || fix === "websockify") {
      try {
        await execSSHCommand(`pkill -f 'websockify.*${WEBSOCKIFY_PORT}' 2>/dev/null || true`);
        log.push("Killed existing websockify");
        console.log("[VNC Repair] Killed existing websockify");
      } catch (e: any) {
        log.push(`Kill websockify failed: ${e.message}`);
        console.error("[VNC Repair] Kill websockify failed:", e.message);
      }

      try {
        await execSSHCommand(
          `websockify --web /usr/share/novnc/ ${WEBSOCKIFY_PORT} localhost:${VNC_RFBPORT} > /dev/null 2>&1 &`
        );
        await new Promise((resolve) => setTimeout(resolve, 1500));
        log.push(`Started websockify on port ${WEBSOCKIFY_PORT}`);
        console.log(`[VNC Repair] Started websockify ${WEBSOCKIFY_PORT} → localhost:${VNC_RFBPORT}`);
      } catch (e: any) {
        log.push(`Start websockify failed: ${e.message}`);
        console.error("[VNC Repair] Start websockify failed:", e.message);
      }
    }

    console.log("[VNC Repair] Repair steps done. Running post-repair diagnostics...");
    const checks = await runDiagnostics();
    const allPassed = checks.every((c) => c.status === "pass");
    console.log(`[VNC Repair] Post-repair all passed: ${allPassed}. Log:`, log);

    return res.status(200).json({ checks, allPassed, repairLog: log });
  } catch (error: any) {
    console.error("[VNC Repair] Top-level error:", error);
    return res.status(400).json({
      message: error?.message || "Repair failed. Ensure SSH is configured.",
    });
  }
};

// ─── SSH Configuration (reads/writes .env) ───────────────────────────

export const getSSHConfig = async (_req: Request, res: Response) => {
  try {
    const env = readEnvFile();
    const user = res.locals.user;

    return res.status(200).json({
      host: env.SSH_HOST || "",
      port: env.SSH_PORT || "22",
      username: env.SSH_USERNAME || "",
      authMethod: env.SSH_PRIVATE_KEY ? "key" : "password",
      password: env.SSH_PASSWORD || "",
      hasPrivateKey: !!env.SSH_PRIVATE_KEY,
      configured: !!(env.SSH_HOST && env.SSH_USERNAME),
      disableSafetyProtections: user?.configs?.disableSafetyProtections ?? false,
    });
  } catch (error) {
    console.log(error);
    return res.status(400).json({ message: "Failed to get SSH config" });
  }
};

export const updateSSHConfig = async (req: Request, res: Response) => {
  try {
    const { host, port, username, authMethod, password, privateKeyPath, passphrase, disableSafetyProtections } = req.body;

    if (!host || !username) {
      return res.status(400).json({ message: "Host and username are required" });
    }

    const env = readEnvFile();
    const updates: Record<string, string> = {
      SSH_HOST: host,
      SSH_PORT: String(port || 22),
      SSH_USERNAME: username,
    };

    if (authMethod === "key") {
      updates.SSH_PRIVATE_KEY = privateKeyPath || env.SSH_PRIVATE_KEY || "";
      updates.SSH_PRIVATE_KEY_PASSPHRASE = passphrase || env.SSH_PRIVATE_KEY_PASSPHRASE || "";
      updates.SSH_PASSWORD = "";
    } else {
      updates.SSH_PASSWORD = password || env.SSH_PASSWORD || "";
      updates.SSH_PRIVATE_KEY = "";
      updates.SSH_PRIVATE_KEY_PASSPHRASE = "";
    }

    updateEnvVars(updates);

    if (typeof disableSafetyProtections === "boolean") {
      const user = res.locals.user;
      user.configs.disableSafetyProtections = disableSafetyProtections;
      await user.save();
    }

    return res.status(200).json({ message: "SSH configuration updated" });
  } catch (error) {
    console.log(error);
    return res.status(400).json({ message: "Failed to update SSH config" });
  }
};

export const updateSafetyProtections = async (req: Request, res: Response) => {
  try {
    const user = res.locals.user;
    const { disableSafetyProtections } = req.body;

    if (typeof disableSafetyProtections !== "boolean") {
      return res.status(400).json({ message: "disableSafetyProtections must be a boolean" });
    }

    user.configs.disableSafetyProtections = disableSafetyProtections;
    await user.save();

    return res.status(200).json({ message: "Safety protections updated", disableSafetyProtections });
  } catch (error) {
    console.log(error);
    return res.status(400).json({ message: "Failed to update safety protections" });
  }
};

export const saveUserInformation = async (req: Request, res: Response) => {
  try {
    const user = res.locals.user;
    const userId = res.locals.userId;

    const { industry, experience, discoveryMethod } = req.body;

    if (!industry || !experience || !discoveryMethod) {
      return res.status(400).json({ message: "Missing user information!" });
    }

    if (user.firstLogin === false) {
      return res
        .status(400)
        .json({ message: "User information already saved!" });
    }



    user.workingIndustry = industry;
    user.workingExperience = experience;
    user.referralSource = discoveryMethod;

    user.firstLogin = false;

    user.configs.tools = [
      "nmap",
      "feroxbuster",
      "subfinder",
      "hydra",
      "sqlmap",
    ];

    await user.save();

    return res.status(200).json({ message: "User information saved!" });
  } catch (error) {
    console.log(error);
    return res.status(400).json({ message: "Error! failed to save details" });
  }
};

export const getAvailableModels = async (_req: Request, res: Response) => {
  try {
    const providers = await fetchModelsCatalog();
    return res.status(200).json({ providers });
  } catch (error: any) {
    console.error("[user] Failed to fetch available models:", error.message);
    return res.status(500).json({ message: "Failed to fetch available models" });
  }
};

export const getBurpConfig = async (_req: Request, res: Response) => {
  try {
    const env = readEnvFile();
    return res.status(200).json({
      host: env.BURP_RPC_HOST || "",
      port: env.BURP_RPC_PORT || "50051",
      configured: !!env.BURP_RPC_HOST,
    });
  } catch (error) {
    console.log(error);
    return res.status(400).json({ message: "Failed to get Burp config" });
  }
};

export const updateBurpConfig = async (req: Request, res: Response) => {
  try {
    const { host, port } = req.body;

    if (!host) {
      return res.status(400).json({ message: "Host is required" });
    }

    updateEnvVars({
      BURP_RPC_HOST: host,
      BURP_RPC_PORT: String(port || 50051),
    });

    return res.status(200).json({ message: "Burp configuration updated" });
  } catch (error) {
    console.log(error);
    return res.status(400).json({ message: "Failed to update Burp config" });
  }
};

// ─── Magnitude Browser Agent Configuration ───────────────────────────

export const getMagnitudeConfig = async (_req: Request, res: Response) => {
  try {
    const env = readEnvFile();

    const mask = (key?: string) =>
      key ? `${key.slice(0, 4)}${"•".repeat(Math.max(0, key.length - 8))}${key.slice(-4)}` : "";

    return res.status(200).json({
      enabled: env.MAGNITUDE_ENABLED === "true",
      proxyUrl: env.MAGNITUDE_PROXY_URL || "",
      headless: env.MAGNITUDE_HEADLESS !== "false",
      displayPort: env.MAGNITUDE_DISPLAY || "",
      configured: env.MAGNITUDE_ENABLED === "true",
      modelProvider: env.MAGNITUDE_MODEL_PROVIDER || "",
      model: env.MAGNITUDE_MODEL || "",
      apiKey: mask(env.MAGNITUDE_MODEL_API_KEY),
      baseURL: env.MAGNITUDE_MODEL_BASE_URL || "",
    });
  } catch (error) {
    console.log(error);
    return res.status(400).json({ message: "Failed to get Magnitude config" });
  }
};

export const updateMagnitudeConfig = async (req: Request, res: Response) => {
  try {
    const { enabled, proxyUrl, headless, displayPort, modelProvider, model, apiKey, baseURL } = req.body;

    const updates: Record<string, string> = {
      MAGNITUDE_ENABLED: String(!!enabled),
      MAGNITUDE_HEADLESS: String(headless !== false),
    };

    if (proxyUrl !== undefined) {
      updates.MAGNITUDE_PROXY_URL = proxyUrl || "";
    }

    if (displayPort !== undefined) {
      updates.MAGNITUDE_DISPLAY = displayPort || "";
    }

    if (modelProvider !== undefined) updates.MAGNITUDE_MODEL_PROVIDER = modelProvider || "";
    if (model !== undefined) updates.MAGNITUDE_MODEL = model || "";
    if (apiKey !== undefined && !apiKey.includes("•")) {
      updates.MAGNITUDE_MODEL_API_KEY = apiKey || "";
    }
    if (baseURL !== undefined) updates.MAGNITUDE_MODEL_BASE_URL = baseURL || "";

    updateEnvVars(updates);

    return res.status(200).json({ message: "Magnitude configuration updated" });
  } catch (error) {
    console.log(error);
    return res.status(400).json({ message: "Failed to update Magnitude config" });
  }
};

export const startMagnitudeAgent = async (req: Request, res: Response) => {
  try {
    const { goal, targetUrl } = req.body;

    if (!goal) {
      return res.status(400).json({ message: "A goal is required to start the browser agent" });
    }

    if (!targetUrl) {
      return res.status(400).json({ message: "A target URL is required" });
    }

    const env = readEnvFile();

    if (env.MAGNITUDE_ENABLED !== "true") {
      return res.status(400).json({ message: "Magnitude browser agent is not enabled. Enable it in Settings first." });
    }

    const provider = env.MAGNITUDE_MODEL_PROVIDER || "openai";
    const model = env.MAGNITUDE_MODEL || "gpt-4o";
    const apiKey = env.MAGNITUDE_MODEL_API_KEY || "";
    const baseURL = env.MAGNITUDE_MODEL_BASE_URL || "";
    const proxyUrl = env.MAGNITUDE_PROXY_URL || "";
    const headless = env.MAGNITUDE_HEADLESS !== "false";
    const display = env.MAGNITUDE_DISPLAY || process.env.DISPLAY || ":99";
    const normalizedDisplay = display.startsWith(":") ? display : `:${display}`;

    if (!apiKey) {
      return res.status(400).json({ message: "No API key configured for the Browser Agent. Configure a model in Settings → Browser Agent." });
    }

    // Always ensure DISPLAY is set for the process
    process.env.DISPLAY = normalizedDisplay;

    const PROVIDER_MAP: Record<string, string> = {
      anthropic: "anthropic",
      openai: "openai",
      google: "google-ai",
      "openai-compatible": "openai-generic",
    };
    const magnitudeLlmProvider = PROVIDER_MAP[provider] || "openai";

    const { startBrowserAgent } = await import("magnitude-core");

    const launchOptions: any = { headless };
    if (proxyUrl) {
      launchOptions.proxy = { server: proxyUrl };
    }
    if (!headless) {
      launchOptions.env = { ...process.env, DISPLAY: normalizedDisplay };
    }

    const agentConfig: any = {
      url: targetUrl,
      narrate: true,
      browser: {
        launchOptions,
        contextOptions: { ignoreHTTPSErrors: true },
      },
      llm: {
        provider: magnitudeLlmProvider,
        options: {
          model,
          apiKey,
          ...(baseURL ? { baseUrl: baseURL } : {}),
        },
      },
    };

    const agent = await startBrowserAgent(agentConfig);

    try {
      await agent.act(goal);
      await agent.stop();
      return res.status(200).json({
        message: "Browser agent completed the goal successfully",
        goal,
        targetUrl,
      });
    } catch (agentError: any) {
      try { await agent.stop(); } catch {}
      return res.status(500).json({
        message: `Browser agent failed: ${formatMagnitudeError(agentError)}`,
        goal,
        targetUrl,
      });
    }
  } catch (error: any) {
    console.log(error);
    return res.status(500).json({
      message: `Failed to start Magnitude agent: ${formatMagnitudeError(error)}`,
    });
  }
};

export const getBrowserAgentVNC = async (_req: Request, res: Response) => {
  try {
    const env = readEnvFile();
    const magnitudeEnabled = env.MAGNITUDE_ENABLED === "true";
    const headless = env.MAGNITUDE_HEADLESS !== "false";
    const display = env.MAGNITUDE_DISPLAY || process.env.DISPLAY || ":99";
    const novncPort = process.env.BROWSER_AGENT_NOVNC_PORT || "6080";

    const fs = await import("fs");
    const inDocker = fs.existsSync("/.dockerenv");

    return res.status(200).json({
      available: magnitudeEnabled && !headless,
      enabled: magnitudeEnabled,
      headless,
      display,
      novncPort,
      vncRunning: inDocker,
      mode: inDocker ? "docker" : "dev",
    });
  } catch (error) {
    console.log(error);
    return res.status(400).json({ message: "Failed to get Browser Agent VNC config" });
  }
};
