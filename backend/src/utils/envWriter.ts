import fs from "fs";
import { getEnvFilePath, reloadEnv } from "./loadConfig";

export function readEnvFile(): Record<string, string> {
  const envPath = getEnvFilePath();
  if (!fs.existsSync(envPath)) return {};

  const vars: Record<string, string> = {};
  const lines = fs.readFileSync(envPath, "utf-8").split("\n");

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;

    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim();
    vars[key] = val;
  }

  return vars;
}

export function writeEnvFile(vars: Record<string, string>): void {
  const envPath = getEnvFilePath();

  const lines: string[] = [
    "# ─── Dynamic Configuration (managed by backend API) ──────────────────",
    "",
  ];

  for (const [key, value] of Object.entries(vars)) {
    lines.push(`${key}=${value}`);
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
