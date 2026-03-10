export const WORKSPACE_DIR = process.env.WORKSPACE_DIR || "~/pentest-workspace";

interface DangerCheckResult {
  dangerous: boolean;
  reason: string;
}

const SAFE_RESULT: DangerCheckResult = { dangerous: false, reason: "" };

const DANGEROUS_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  {
    pattern: /\brm\s+(-[a-zA-Z]*f[a-zA-Z]*\s+(-[a-zA-Z]*r[a-zA-Z]*)?|(-[a-zA-Z]*r[a-zA-Z]*\s+)?-[a-zA-Z]*f[a-zA-Z]*)\s+\/(\s|$|\*|etc|boot|bin|sbin|usr|lib|var|dev|proc|sys|root|home)/,
    reason: "Recursive forced deletion of system-critical paths",
  },
  {
    pattern: /\brm\s+(-[a-zA-Z]*r[a-zA-Z]*f[a-zA-Z]*|-[a-zA-Z]*f[a-zA-Z]*r[a-zA-Z]*)\s+[~$]\{?HOME\}?\/?(\s|$)/,
    reason: "Recursive forced deletion of home directory",
  },
  {
    pattern: /\bdd\b.*\bof\s*=\s*\/dev\//,
    reason: "Direct write to block device",
  },
  {
    pattern: /\bmkfs\b/,
    reason: "Filesystem format command",
  },
  {
    pattern: />\s*\/dev\/[sh]d[a-z]/,
    reason: "Redirect to block device",
  },
  {
    pattern: /:\(\)\{\s*:\|\s*:&\s*\}\s*;/,
    reason: "Fork bomb",
  },
  {
    pattern: /\b(shutdown|poweroff|halt)\b(\s|$)/,
    reason: "System shutdown/halt command",
  },
  {
    pattern: /\binit\s+0\b/,
    reason: "System halt via init",
  },
  {
    pattern: /\breboot\b(\s|$)/,
    reason: "System reboot command",
  },
  {
    pattern: /\bchmod\s+(-[a-zA-Z]*R[a-zA-Z]*\s+)?(777|000)\s+\/(\s|$)/,
    reason: "Blanket permission change on root filesystem",
  },
  {
    pattern: /\bchown\s+(-[a-zA-Z]*R[a-zA-Z]*\s+)\S+\s+\/(\s|$)/,
    reason: "Recursive ownership change on root filesystem",
  },
  {
    pattern: /\bmv\s+\/(\*|\s)\s+/,
    reason: "Moving root filesystem contents",
  },
  {
    pattern: />\s*\/dev\/null\s*<\s*\/dev\/null.*\bdd\b|cat\s+\/dev\/(zero|urandom)\s*>\s*\/dev\/[sh]d/,
    reason: "Device destruction via data overwrite",
  },
];

export function isDangerousCommand(command: string): DangerCheckResult {
  if (!command || typeof command !== "string") return SAFE_RESULT;

  const normalized = command.trim();
  for (const { pattern, reason } of DANGEROUS_PATTERNS) {
    if (pattern.test(normalized)) {
      return { dangerous: true, reason };
    }
  }
  return SAFE_RESULT;
}

export function isDangerousShellInput(input: string): DangerCheckResult {
  if (!input || typeof input !== "string") return SAFE_RESULT;

  const lines = input.split("\n").map((l) => l.replace(/\\n/g, "").trim()).filter(Boolean);
  for (const line of lines) {
    const result = isDangerousCommand(line);
    if (result.dangerous) return result;
  }
  return SAFE_RESULT;
}
