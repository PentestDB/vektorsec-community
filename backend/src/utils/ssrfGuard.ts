import dns from "dns";
import net from "net";
import type { NextFunction, Request, RequestHandler, Response } from "express";

/**
 * SSRF protection utility (Server-Side Request Forgery).
 *
 * Guards every code path that turns a user-supplied URL / target IP / host into
 * an outbound request or a scan command. The flow is always:
 *
 *   1. Normalise the input into a hostname (URL → host, `host:port` → host,
 *      bracketed IPv6 → address, bare IP → IP).
 *   2. Resolve the hostname through the system DNS to its *latest* IPv4/IPv6
 *      records (`dns.promises.lookup(..., { all: true, verbatim: true })`).
 *   3. Check every resolved address against the restricted internal ranges
 *      (loopback, RFC1918 private nets, CGNAT, link-local / cloud metadata,
 *      documentation / reserved / multicast ranges, IPv6 loopback/ULA/link-local).
 *   4. Reject the operation immediately with
 *      "Target IP/Domain is restricted for security reasons." if ANY resolved
 *      address is internal — a domain that also points at a public IP is still
 *      dangerous (split-horizon DNS / DNS rebinding), so one bad record wins.
 *
 * Only public IPs / external domains are allowed.
 */

export const SSRF_BLOCK_ERROR = "Target IP/Domain is restricted for security reasons.";

/**
 * Whether SSRF protection is active. Controlled from Admin > Security
 * (SSRF_ENABLED env). Enabled by default — disable only for closed, trusted
 * deployments.
 */
export function isSsrfProtectionEnabled(): boolean {
  return process.env.SSRF_ENABLED !== "0";
}

/** Error thrown by the `assert*` helpers and caught by the middleware. */
export class SsrfBlockedError extends Error {
  constructor(message: string = SSRF_BLOCK_ERROR) {
    super(message);
    this.name = "SsrfBlockedError";
  }
}

// ─── Restricted internal ranges ───────────────────────────────────────
// 127.0.0.0/8 and ::1: loopback
// 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16: private networks
// 100.64.0.0/10: CGNAT (also covers 100.100.100.200 — Alibaba cloud metadata)
// 169.254.0.0/16: link-local (also covers 169.254.169.254 — AWS/GCP/Azure metadata)
// 0.0.0.0/8, TEST-NET, benchmark, multicast, reserved: non-routable / doc
const RESTRICTED_V4_NETS: Array<[string, number]> = [
  ["0.0.0.0", 8], // "this" network
  ["10.0.0.0", 8], // private
  ["100.64.0.0", 10], // CGNAT (100.100.100.200 cloud metadata lives here)
  ["127.0.0.0", 8], // loopback
  ["169.254.0.0", 16], // link-local (169.254.169.254 cloud metadata)
  ["172.16.0.0", 12], // private
  ["192.0.0.0", 24], // IETF protocol assignments
  ["192.0.2.0", 24], // TEST-NET-1
  ["192.168.0.0", 16], // private
  ["198.18.0.0", 15], // benchmarking
  ["198.51.100.0", 24], // TEST-NET-2
  ["203.0.113.0", 24], // TEST-NET-3
  ["224.0.0.0", 4], // multicast
  ["240.0.0.0", 4], // reserved
  ["255.255.255.255", 32], // broadcast
];

const RESTRICTED_V6_NETS: Array<[string, number]> = [
  ["::", 128], // unspecified address
  ["::1", 128], // loopback
  ["fc00::", 7], // unique local addressing (ULA)
  ["fe80::", 10], // link-local
  ["ff00::", 8], // multicast
  ["2001:db8::", 32], // documentation
];

/** Hostnames that are always treated as restricted, no DNS needed. */
const RESTRICTED_HOSTNAMES = new Set<string>([
  "localhost",
  "localhost.localdomain",
  "ip6-localhost",
  "localhost.local",
  "metadata",
  "metadata.google.internal",
  "metadata.azure.internal",
  "metadata.aws.internal",
  "100.100.100.200",
]);

const blockList = new net.BlockList();
for (const [address, prefix] of RESTRICTED_V4_NETS) {
  blockList.addSubnet(address, prefix, "ipv4");
}
for (const [address, prefix] of RESTRICTED_V6_NETS) {
  blockList.addSubnet(address, prefix, "ipv6");
}

/**
 * True when `ip` falls inside any restricted internal range.
 * IPv4-mapped IPv6 addresses (`::ffff:127.0.0.1`) are matched against the
 * IPv4 rules by Node's BlockList, so they cannot bypass the guard.
 *
 * The family is always passed explicitly: Node's `BlockList.check()` infers
 * the wrong family for some addresses (e.g. `::1`, `::ffff:127.0.0.1`) when
 * called without a type, which would silently let them bypass the check.
 */
export function isRestrictedIp(ip: string): boolean {
  if (!ip || typeof ip !== "string") return false;
  const trimmed = ip.trim();
  const family = net.isIP(trimmed);
  if (family === 0) return false;
  try {
    return blockList.check(trimmed, family === 4 ? "ipv4" : "ipv6");
  } catch {
    return false;
  }
}

// ─── Host extraction ──────────────────────────────────────────────────

/**
 * Normalise an arbitrary user target (URL, host:port, bracketed IPv6,
 * scheme-less host, bare IP/domain) into a plain hostname.
 */
export function extractHostnameFromTarget(input: string): string {
  if (!input || typeof input !== "string") return "";
  let raw = input.trim();
  if (!raw) return "";

  // Full URL — `new URL` also drops userinfo (http://admin@host/ → host).
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//i.test(raw)) {
    try {
      return new URL(raw).hostname;
    } catch {
      // fall through to manual parsing
    }
  }

  // Strip any remaining scheme prefix.
  raw = raw.replace(/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//i, "");

  // Strip path / query / fragment (scheme-less URLs).
  const pathIndex = raw.search(/[/?#]/);
  if (pathIndex !== -1) raw = raw.slice(0, pathIndex);

  // Strip userinfo (e.g. admin@host).
  const atIndex = raw.lastIndexOf("@");
  if (atIndex !== -1) raw = raw.slice(atIndex + 1);

  // Bracketed IPv6 literal ([::1]:8080 → ::1).
  const bracket = raw.match(/^\[([^\]]+)\]/);
  if (bracket) return bracket[1];

  // Already a literal IPv4 or bare IPv6 (no port).
  if (net.isIP(raw) !== 0) return raw;

  // host:port → host (IPv4 or hostname). A bare IPv6 with a port has no
  // brackets and cannot be split unambiguously — treat it as-is (lookup will
  // fail and the target is rejected under strict policy).
  const hostPort = raw.match(/^([^:]+):\d{1,5}$/);
  if (hostPort) return hostPort[1];

  return raw;
}

const DOMAIN_REGEX =
  /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/;

/** Tokens that look like filenames/wordlists rather than network targets. */
const FILE_EXTENSION_REGEX =
  /\.(?:txt|log|json|xml|csv|md|html?|sh|py|js|ts|ya?ml|conf|cfg|ini|bak|tmp|db|sqlite?|zip|tar|gz|bz2|pcap|pem|key|jks|pub|asc|ovpn|crt|cer|der|toml|env|out|err|bin)$/i;

/**
 * Extract candidate network targets from free-form text (shell commands).
 * Returns a de-duplicated list of hostnames / IPs.
 *
 * Heuristics are tuned to avoid flagging files, wordlists and option values:
 * - tokens starting with `-` are options;
 * - tokens containing `/` (outside a URL) are paths;
 * - tokens ending in a common file extension are files;
 * - explicit URLs (scheme://host) are always extracted.
 */
export function extractTargetHostsFromText(text: string): string[] {
  if (!text || typeof text !== "string") return [];
  const hosts = new Set<string>();

  const add = (value: string) => {
    const host = extractHostnameFromTarget(value);
    if (host) hosts.add(host.toLowerCase());
  };

  // URLs anywhere in the text (may be glued to surrounding punctuation).
  const urlRegex = /\b[a-zA-Z][a-zA-Z0-9+.-]*:\/\/[^\s"'<>]+/g;
  for (const match of text.match(urlRegex) ?? []) {
    add(match);
  }

  // Token scan for bare IPs / hostnames / host:port pairs / user@host / host:path.
  for (const rawToken of text.split(/[\s;]+/)) {
    let token = rawToken.replace(/^["'<>()]+|["'<>(),.;]+$/g, "");
    if (!token) continue;
    if (token.startsWith("-")) continue; // option flag
    if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//i.test(token)) continue; // URL, handled above

    // Strip userinfo (ssh user@host, scp user@host:path, git@host:user/repo).
    const atIndex = token.lastIndexOf("@");
    if (atIndex !== -1) token = token.slice(atIndex + 1);
    if (!token) continue;

    // Path-bearing tokens (scp/rsync host:path, git host:user/repo.git).
    if (token.includes("/")) {
      const beforePath = token.split("/")[0];
      const hostCandidate = beforePath.replace(/:.*$/, "") || beforePath;
      if (
        net.isIP(hostCandidate) === 4 ||
        net.isIP(hostCandidate) === 6 ||
        DOMAIN_REGEX.test(hostCandidate) ||
        hostCandidate.toLowerCase() === "localhost"
      ) {
        hosts.add(hostCandidate.toLowerCase());
      }
      continue;
    }

    if (FILE_EXTENSION_REGEX.test(token)) continue; // wordlist / output file

    if (net.isIP(token) === 4) {
      hosts.add(token);
      continue;
    }
    if (net.isIP(token) === 6) {
      hosts.add(token.toLowerCase());
      continue;
    }

    const hostPort = token.match(/^([^:]+):\d{1,5}$/);
    if (hostPort) {
      const host = hostPort[1];
      if (net.isIP(host) === 4 || DOMAIN_REGEX.test(host) || host.toLowerCase() === "localhost") {
        hosts.add(host.toLowerCase());
      }
      continue;
    }

    if (DOMAIN_REGEX.test(token) || token.toLowerCase() === "localhost") {
      hosts.add(token.toLowerCase());
    }
  }

  return [...hosts];
}

// ─── DNS resolution ───────────────────────────────────────────────────

/**
 * Resolve `host` to its latest IPv4/IPv6 addresses using the system DNS.
 * Literal IPs are returned untouched (no DNS round-trip needed).
 */
export async function resolveHostToIps(host: string): Promise<string[]> {
  const trimmed = (host || "").trim();
  if (!trimmed) return [];
  if (net.isIP(trimmed) !== 0) return [trimmed];

  const ips: string[] = [];
  const seen = new Set<string>();
  const push = (address: string) => {
    const normalized = address.toLowerCase();
    if (!seen.has(normalized)) {
      seen.add(normalized);
      ips.push(normalized);
    }
  };

  // Primary: getaddrinfo-backed lookup returning every A/AAAA record in the
  // resolver's current order (verbatim keeps the latest records as-is).
  try {
    const records = await dns.promises.lookup(trimmed, { all: true, verbatim: true });
    for (const record of records) push(record.address);
  } catch {
    // fall through to explicit per-family resolution below
  }

  // Fallback: explicit A + AAAA queries (also catches hosts that only resolve
  // through one family or where getaddrinfo was unavailable).
  if (ips.length === 0) {
    const families: Array<Promise<string[]>> = [
      dns.promises.resolve4(trimmed),
      dns.promises.resolve6(trimmed),
    ];
    const settled = await Promise.allSettled(families);
    for (const result of settled) {
      if (result.status === "fulfilled") {
        for (const address of result.value) push(address);
      }
    }
  }

  return ips;
}

// ─── Validation ───────────────────────────────────────────────────────

export interface SsrfValidationOptions {
  /** When true, an unresolvable hostname is allowed instead of rejected. */
  allowDnsFailure?: boolean;
  /** Extra hostnames (lowercase) that must always be rejected. */
  extraRestrictedHostnames?: string[];
}

export interface SsrfValidationResult {
  allowed: boolean;
  host?: string;
  ips: string[];
  restrictedIps: string[];
  reason?: string;
}

/**
 * Validate a single user-supplied target. The target is rejected when it
 * resolves (even partially) to a private/internal address, or when it cannot
 * be resolved to a public address at all.
 */
export async function validateTargetSafety(
  input: string,
  options: SsrfValidationOptions = {},
): Promise<SsrfValidationResult> {
  if (!isSsrfProtectionEnabled()) {
    return { allowed: true, ips: [], restrictedIps: [], reason: "SSRF protection disabled by policy" };
  }

  const host = extractHostnameFromTarget(input);
  if (!host) {
    return { allowed: true, ips: [], restrictedIps: [], reason: "No target host detected" };
  }

  const restrictedHosts = new Set<string>([
    ...RESTRICTED_HOSTNAMES,
    ...(options.extraRestrictedHostnames ?? []),
  ]);
  if (restrictedHosts.has(host.toLowerCase())) {
    return {
      allowed: false,
      host,
      ips: [],
      restrictedIps: [],
      reason: `Hostname '${host}' is restricted`,
    };
  }

  const ips = await resolveHostToIps(host);
  if (ips.length === 0) {
    if (options.allowDnsFailure) {
      return {
        allowed: true,
        host,
        ips: [],
        restrictedIps: [],
        reason: "DNS resolution failed; allowed by policy",
      };
    }
    return {
      allowed: false,
      host,
      ips: [],
      restrictedIps: [],
      reason: `Unable to resolve '${host}' to a public IP`,
    };
  }

  const restrictedIps = ips.filter((ip) => isRestrictedIp(ip));
  if (restrictedIps.length > 0) {
    return {
      allowed: false,
      host,
      ips,
      restrictedIps,
      reason: `'${host}' resolves to restricted address(es): ${restrictedIps.join(", ")}`,
    };
  }

  return {
    allowed: true,
    host,
    ips,
    restrictedIps: [],
    reason: `'${host}' resolves to public address(es) only`,
  };
}

/** Throws {@link SsrfBlockedError} when `input` is not an external target. */
export async function assertTargetIsExternal(
  input: string,
  options?: SsrfValidationOptions,
): Promise<void> {
  const result = await validateTargetSafety(input, options);
  if (!result.allowed) throw new SsrfBlockedError(SSRF_BLOCK_ERROR);
}

/**
 * Validate every network target referenced by free-form text (a shell
 * command). Rejects as soon as any target is internal or unresolvable.
 */
export async function validateCommandTargetsSafety(
  text: string,
  options: SsrfValidationOptions = {},
): Promise<SsrfValidationResult> {
  const hosts = extractTargetHostsFromText(text);
  if (hosts.length === 0) {
    return { allowed: true, ips: [], restrictedIps: [], reason: "No network targets detected" };
  }
  for (const host of hosts) {
    const result = await validateTargetSafety(host, options);
    if (!result.allowed) return result;
  }
  return {
    allowed: true,
    ips: [],
    restrictedIps: [],
    reason: `All detected targets are external: ${hosts.join(", ")}`,
  };
}

/** Throws {@link SsrfBlockedError} when any target in `text` is restricted. */
export async function assertCommandTargetsAreExternal(
  text: string,
  options?: SsrfValidationOptions,
): Promise<void> {
  const result = await validateCommandTargetsSafety(text, options);
  if (!result.allowed) throw new SsrfBlockedError(SSRF_BLOCK_ERROR);
}

/** Convenience `{ output, exitCode }` shape used by the agent tool handlers. */
export function blockedTargetResult(): { output: string; exitCode: number } {
  return {
    output: `BLOCKED: ${SSRF_BLOCK_ERROR}`,
    exitCode: 1,
  };
}

// ─── Express middleware ───────────────────────────────────────────────

/**
 * Express middleware factory. Validates `req.body[field]` for each given
 * field. When a field is present and its target is internal, responds with
 * HTTP 403 and `"Target IP/Domain is restricted for security reasons."`.
 *
 * Example:
 *   router.post("/:id/connect", [verifySess, ssrfValidateBody("url")], connectCtf);
 */
export function ssrfValidateBody(...fields: string[]): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      for (const field of fields) {
        const value = (req.body as Record<string, unknown> | undefined)?.[field];
        if (typeof value !== "string" || !value.trim()) continue;
        await assertTargetIsExternal(value.trim());
      }
      next();
    } catch (err: any) {
      if (err instanceof SsrfBlockedError) {
        return res.status(403).json({ message: err.message, code: "SSRF_BLOCKED" });
      }
      return res.status(400).json({ message: "Failed to validate target address" });
    }
  };
}


