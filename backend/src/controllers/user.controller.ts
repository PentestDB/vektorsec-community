import { Response, Request } from "express";
import crypto from "crypto";
import axios from "axios";
import moment from "moment";

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
  provider: "MODEL_PROVIDER",
  model: "MODEL",
  apiKey: "MODEL_API_KEY",
  baseURL: "MODEL_BASE_PATH",
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

    return res.status(200).json({
      provider,
      model,
      apiKey: mask(apiKey),
      baseURL,
      configured,
      authMethod: isOAuth ? "oauth" : "api_key",
      oauthConnected: isOAuth,
    });
  } catch (error) {
    console.log(error);
    return res.status(400).json({ message: "Failed to get model config" });
  }
};

export const updateModelConfig = async (req: Request, res: Response) => {
  try {
    const { provider, model, apiKey, baseURL } = req.body;

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

    const isApiKeyMasked = apiKey?.includes("•");
    const existingKey = env[MODEL_ENV_KEYS.apiKey] || "";

    const updates: Record<string, string> = {
      [MODEL_ENV_KEYS.provider]: provider,
      [MODEL_ENV_KEYS.model]: model,
      [MODEL_ENV_KEYS.apiKey]: isApiKeyMasked && existingKey ? existingKey : (apiKey || ""),
      [MODEL_ENV_KEYS.baseURL]: baseURL || "",
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

// ─── SSH Configuration (reads/writes .env) ───────────────────────────

export const getSSHConfig = async (_req: Request, res: Response) => {
  try {
    const env = readEnvFile();

    return res.status(200).json({
      host: env.SSH_HOST || "",
      port: env.SSH_PORT || "22",
      username: env.SSH_USERNAME || "",
      authMethod: env.SSH_PRIVATE_KEY ? "key" : "password",
      password: env.SSH_PASSWORD || "",
      hasPrivateKey: !!env.SSH_PRIVATE_KEY,
      configured: !!(env.SSH_HOST && env.SSH_USERNAME),
    });
  } catch (error) {
    console.log(error);
    return res.status(400).json({ message: "Failed to get SSH config" });
  }
};

export const updateSSHConfig = async (req: Request, res: Response) => {
  try {
    const { host, port, username, authMethod, password, privateKeyPath, passphrase } = req.body;

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

    return res.status(200).json({ message: "SSH configuration updated" });
  } catch (error) {
    console.log(error);
    return res.status(400).json({ message: "Failed to update SSH config" });
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
