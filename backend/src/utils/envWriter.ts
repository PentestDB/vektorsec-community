import fs from "fs";
import { getEnvFilePath } from "./loadConfig";

/**
 * Resolve the canonical .env path — the same file that loadConfig / reloadEnv
 * read from (in Docker this is /srv/data/.env; in dev it is backend/.env).
 * Using process.cwd()/.env here breaks admin UI saves inside the container.
 */
function resolveEnvPath(): string {
  return getEnvFilePath();
}

/**
 * Read the .env file and return its contents as an object.
 */
export function readEnvFile(): Record<string, string> {
  try {
    const envPath = resolveEnvPath();
    if (!fs.existsSync(envPath)) {
      return {};
    }
    const content = fs.readFileSync(envPath, "utf-8");
    const result: Record<string, string> = {};
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIndex = trimmed.indexOf("=");
      if (eqIndex === -1) continue;
      const key = trimmed.slice(0, eqIndex).trim();
      let value = trimmed.slice(eqIndex + 1).trim();
      // Strip surrounding quotes
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      result[key] = value;
    }
    return result;
  } catch (error) {
    console.error("[envWriter] Failed to read .env:", error);
    return {};
  }
}

/**
 * Update specific variables in the .env file.
 * Preserves existing content and comments.
 */
export function updateEnvVars(updates: Record<string, string>): void {
  try {
    const envPath = resolveEnvPath();
    let content = "";
    if (fs.existsSync(envPath)) {
      content = fs.readFileSync(envPath, "utf-8");
    }

    const lines = content.split("\n");
    const keys = Object.keys(updates);

    for (const key of keys) {
      const value = updates[key];
      const lineIndex = lines.findIndex((l) => {
        const trimmed = l.trim();
        return !trimmed.startsWith("#") && trimmed.startsWith(`${key}=`);
      });

      if (lineIndex !== -1) {
        lines[lineIndex] = `${key}=${value}`;
      } else {
        lines.push(`${key}=${value}`);
      }
    }

    fs.writeFileSync(envPath, lines.join("\n"), "utf-8");
  } catch (error) {
    console.error("[envWriter] Failed to update .env:", error);
  }
}

/**
 * Delete specific variables from the .env file.
 * Preserves existing content and comments.
 */
export function deleteEnvVars(keys: string[]): void {
  try {
    const envPath = resolveEnvPath();
    if (!fs.existsSync(envPath)) return;

    const lines = fs.readFileSync(envPath, "utf-8").split("\n");
    const removeSet = new Set(keys);

    const remaining = lines.filter((l) => {
      const trimmed = l.trim();
      if (!trimmed || trimmed.startsWith("#")) return true;
      const eqIndex = trimmed.indexOf("=");
      if (eqIndex === -1) return true;
      const key = trimmed.slice(0, eqIndex).trim();
      return !removeSet.has(key);
    });

    fs.writeFileSync(envPath, remaining.join("\n"), "utf-8");
  } catch (error) {
    console.error("[envWriter] Failed to delete .env vars:", error);
  }
}
