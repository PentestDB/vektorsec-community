import { isIP } from "net";

import { isScopeGuardLocked } from "./securityPolicy";

const DOMAIN_VALID_REGEX = /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/;

function isDomain(value: string): boolean {
  return DOMAIN_VALID_REGEX.test(value);
}


// ─── Scope Control & Guardrails ─────────────────────────────────────
// Strict Scope Validator: ทุกคำสั่งที่ AI กำลังจะรันต้องผ่านการ Verify
// ว่า IP/Domain/Subnet อยู่ใน Scope Whitelist 100% ก่อนเสมอ

export interface ScopeEntry {
  type: "ip" | "cidr" | "domain" | "subdomain";
  value: string;
  label?: string;
}

export interface ScopeValidationResult {
  allowed: boolean;
  reason: string;
  matchedEntry?: ScopeEntry;
  target?: string;
}

export interface ScopeConfig {
  entries: ScopeEntry[];
  enabled: boolean;
  // เมื่อ true จะ block ทุกคำสั่งที่ target ไม่อยู่ใน scope
  strictMode: boolean;
}

// ─── CIDR helpers ───────────────────────────────────────────────────

function ipToLong(ip: string): number {
  const parts = ip.split(".").map(Number);
  return (
    ((parts[0] << 24) >>> 0) +
    ((parts[1] << 16) >>> 0) +
    ((parts[2] << 8) >>> 0) +
    parts[3]
  );
}

function cidrToRange(cidr: string): { start: number; end: number } | null {
  const [ip, prefixStr] = cidr.split("/");
  if (!ip || !prefixStr || !isIP(ip)) return null;
  const prefix = parseInt(prefixStr, 10);
  if (isNaN(prefix) || prefix < 0 || prefix > 32) return null;
  const ipLong = ipToLong(ip);
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  const start = (ipLong & mask) >>> 0;
  const end = (start | (~mask >>> 0)) >>> 0;
  return { start, end };
}

function isIpInCidr(ip: string, cidr: string): boolean {
  const range = cidrToRange(cidr);
  if (!range || !isIP(ip)) return false;
  const ipLong = ipToLong(ip);
  return ipLong >= range.start && ipLong <= range.end;
}

// ─── Domain helpers ─────────────────────────────────────────────────

function normalizeDomain(domain: string): string {
  return domain.toLowerCase().replace(/\.$/, "");
}

function isSubdomainOf(sub: string, parent: string): boolean {
  const s = normalizeDomain(sub);
  const p = normalizeDomain(parent);
  return s === p || s.endsWith(`.${p}`);
}

// ─── Extract targets from a command ─────────────────────────────────

const IP_REGEX = /\b(?:\d{1,3}\.){3}\d{1,3}\b/g;
const DOMAIN_REGEX = /\b(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}\b/g;

export function extractTargets(command: string): string[] {
  const targets = new Set<string>();
  const ips = command.match(IP_REGEX) ?? [];
  for (const ip of ips) {
    // Filter out obviously invalid IPs (octets > 255)
    if (ip.split(".").every((o) => parseInt(o, 10) <= 255)) {
      targets.add(ip);
    }
  }
  const domains = command.match(DOMAIN_REGEX) ?? [];
  for (const d of domains) {
    targets.add(d);
  }
  return [...targets];
}

// ─── Main validator ─────────────────────────────────────────────────

export function validateTargetInScope(
  target: string,
  scope: ScopeConfig,
): ScopeValidationResult {
  if (!scope.enabled) {
    return { allowed: true, reason: "Scope validation disabled" };
  }

  if (!scope.entries.length) {
    return {
      allowed: !scope.strictMode,
      reason: scope.strictMode
        ? "No scope entries configured and strict mode is enabled"
        : "No scope entries configured (non-strict)",
    };
  }

  const normalized = normalizeDomain(target);

  for (const entry of scope.entries) {
    switch (entry.type) {
      case "ip":
        if (isIP(normalized) && normalized === entry.value) {
          return { allowed: true, reason: `IP ${target} in scope`, matchedEntry: entry, target };
        }
        break;
      case "cidr":
        if (isIP(normalized) && isIpInCidr(normalized, entry.value)) {
          return { allowed: true, reason: `IP ${target} in CIDR ${entry.value}`, matchedEntry: entry, target };
        }
        break;
      case "domain":
        if (isSubdomainOf(normalized, entry.value)) {
          return { allowed: true, reason: `Domain ${target} in scope (${entry.value})`, matchedEntry: entry, target };
        }
        break;
      case "subdomain":
        if (normalized === entry.value) {
          return { allowed: true, reason: `Exact subdomain ${target} in scope`, matchedEntry: entry, target };
        }
        break;
    }
  }

  return {
    allowed: false,
    reason: `Target ${target} is OUT OF SCOPE`,
    target,
  };
}

export function validateCommandScope(
  command: string,
  scope: ScopeConfig,
): ScopeValidationResult {
  if (!scope.enabled) return { allowed: true, reason: "Scope validation disabled" };

  const targets = extractTargets(command);

  // No targets found — allow (e.g. local commands like `ls`, `pwd`)
  if (targets.length === 0) {
    return { allowed: true, reason: "No network targets detected in command" };
  }

  for (const target of targets) {
    const result = validateTargetInScope(target, scope);
    if (!result.allowed) return result;
  }

  return {
    allowed: true,
    reason: `All targets in scope: ${targets.join(", ")}`,
  };
}

// ─── Default scope config ───────────────────────────────────────────

export function createDefaultScopeConfig(): ScopeConfig {
  // Read live config from the .env file (updated via Admin > Scope).
  // Falls back to process.env if loadConfig has already populated it.
  // Scope Guard is locked ON in this distribution (utils/securityPolicy.ts):
  // SCOPE_ENABLED may still be written by the admin UI, but it can never switch
  // enforcement off. Only an unlocked vendor build (SCOPE_GUARD_LOCK=0) or the
  // SCOPE_GUARD_LOCKED_IN_CODE switch hands control back to the env.
  const enabled = isScopeGuardLocked() || process.env.SCOPE_ENABLED === "1";
  const strictMode = process.env.SCOPE_STRICT_MODE === "1";
  const raw = process.env.SCOPE_ENTRIES || "";
  return {
    entries: parseScopeString(raw),
    enabled,
    strictMode,
  };
}

/**
 * Build a ScopeConfig from an explicit input, falling back to env defaults
 * for any field that is not provided.
 */
export function buildScopeConfig(input?: {
  entries?: string;
  enabled?: boolean;
  strictMode?: boolean;
}): ScopeConfig {
  const config = createDefaultScopeConfig();
  if (input?.entries !== undefined) {
    config.entries = parseScopeString(input.entries);
  }
  if (input?.enabled !== undefined) {
    // An explicit *enable* is honoured; disabling is refused while the guard is
    // locked in this build (utils/securityPolicy.ts).
    config.enabled = input.enabled || isScopeGuardLocked();
  }
  if (input?.strictMode !== undefined) {
    config.strictMode = input.strictMode;
  }
  return config;
}


export function parseScopeString(input: string): ScopeEntry[] {
  const entries: ScopeEntry[] = [];
  const parts = input.split(/[\s,;]+/).filter(Boolean);

  for (const part of parts) {
    if (part.includes("/")) {
      entries.push({ type: "cidr", value: part });
    } else if (isIP(part)) {
      entries.push({ type: "ip", value: part });
    } else if (part.startsWith("*.")) {
      entries.push({ type: "domain", value: part.slice(2) });
    } else if (isDomain(part)) {
      entries.push({ type: "domain", value: part });
    } else {
      entries.push({ type: "subdomain", value: part });
    }
  }

  return entries;
}
