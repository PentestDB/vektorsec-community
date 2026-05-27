import fs from "fs";
import dotenv from "dotenv";
import { getEnvFilePath, reloadEnv } from "./loadConfig";

/**
 * Escape a value for safe .env writing. Wraps in double quotes and escapes
 * backslashes, double quotes, and newlines so values with special chars
 * (e.g. [ ] # $ in passwords) are preserved correctly.
 */
function escapeEnvValue(value: string): string {
  if (value === undefined || value === null) return '""';
  const s = String(value);
  const escaped = s
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r");
  return `"${escaped}"`;
}

export function readEnvFile(): Record<string, string> {
  const envPath = getEnvFilePath();
  if (!fs.existsSync(envPath)) return {};

  const content = fs.readFileSync(envPath, "utf-8");
  const parsed = dotenv.parse(content);
  return parsed;
}

export function writeEnvFile(vars: Record<string, string>): void {
  const envPath = getEnvFilePath();

  const lines: string[] = [
    "# ─── Dynamic Configuration (managed by backend API) ──────────────────",
    "",
  ];

  for (const [key, value] of Object.entries(vars)) {
    lines.push(`${key}=${escapeEnvValue(value)}`);
  }

  lines.push("");
  fs.writeFileSync(envPath, lines.join("\n"), "utf-8");

  reloadEnv();
}

export function updateEnvVars(updates: Record<string, string>): void {
  const current = readEnvFile();
  const merged = { ...current, ...updates };
  writeEnvFile(merged);
}

export function deleteEnvVars(keys: string[]): void {
  const current = readEnvFile();
  for (const key of keys) {
    delete current[key];
  }
  writeEnvFile(current);
}
