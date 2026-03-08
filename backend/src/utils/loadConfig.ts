import fs from "fs";
import path from "path";
import TOML from "@iarna/toml";
import dotenv from "dotenv";

const TOML_KEY_MAP: Record<string, Record<string, string>> = {
  server: {
    port: "PORT",
    deployment: "DEPLOYMENT",
    base_url_frontend: "BASE_URL_FRONTEND",
    cors_origins: "CORS_ORIGINS",
  },
  database: {
    mongo_uri: "MONGO_URI",
    mongo_database: "MONGO_DATABASE",
    redis_url: "REDIS_URL",
  },
  session: {
    secret: "SESS_SECRET",
    lifetime: "SESS_LIFETIME",
  },
  frontend: {
    backend_uri: "NEXT_PUBLIC_BACKEND_URI",
    deployment: "NEXT_PUBLIC_DEPLOYMENT",
  },
};

function resolveDataDir(): string {
  if (fs.existsSync("/srv/data")) return "/srv/data";
  return path.resolve(__dirname, "../..");
}

let _loaded = false;

export function getDataDir(): string {
  return resolveDataDir();
}

export function getEnvFilePath(): string {
  return path.join(resolveDataDir(), ".env");
}

export function loadConfig(): void {
  if (_loaded) return;

  const dataDir = resolveDataDir();
  const tomlPath = path.join(dataDir, "config.toml");
  const envPath = path.join(dataDir, ".env");

  if (fs.existsSync(tomlPath)) {
    try {
      const raw = fs.readFileSync(tomlPath, "utf-8");
      const parsed = TOML.parse(raw) as Record<string, any>;

      for (const [section, keys] of Object.entries(TOML_KEY_MAP)) {
        const sectionData = parsed[section];
        if (!sectionData || typeof sectionData !== "object") continue;

        for (const [tomlKey, envKey] of Object.entries(keys)) {
          const val = sectionData[tomlKey];
          if (val !== undefined && val !== null && val !== "") {
            process.env[envKey] = String(val);
          }
        }
      }
    } catch (err) {
      console.warn("[loadConfig] Failed to parse config.toml:", err);
    }
  }

  if (fs.existsSync(envPath)) {
    const envVars = dotenv.parse(fs.readFileSync(envPath, "utf-8"));
    for (const [key, value] of Object.entries(envVars)) {
      process.env[key] = value;
    }
  }

  _loaded = true;
}

export function reloadEnv(): void {
  const envPath = getEnvFilePath();
  if (!fs.existsSync(envPath)) return;

  const envVars = dotenv.parse(fs.readFileSync(envPath, "utf-8"));
  for (const [key, value] of Object.entries(envVars)) {
    process.env[key] = value;
  }
}
