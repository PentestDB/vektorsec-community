import { loadConfig } from "./loadConfig";

loadConfig();

const OPTIONAL_KEYS = new Set([
  "MODEL_API_KEY",
  "MODEL_BASE_PATH",
  "SSH_PASSWORD",
  "SSH_PRIVATE_KEY",
  "SSH_PRIVATE_KEY_PASSPHRASE",
  "ANTHROPIC_OAUTH_ACCESS_TOKEN",
  "ANTHROPIC_OAUTH_REFRESH_TOKEN",
  "ANTHROPIC_OAUTH_EXPIRES_AT",
  "CORS_ORIGINS",
]);

const getSecrets = async (key: string) => {
  const secret = process.env[key];

  if (!secret) {
    if (!OPTIONAL_KEYS.has(key)) {
      console.error(`Secret ${key} not found`);
    }
    return "";
  }

  return secret;
};

export default getSecrets;
