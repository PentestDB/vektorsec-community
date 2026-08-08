import { v4 as uuidv4 } from "uuid";

// ─── Self-hosted Out-of-Band (OOB) Listener ──────────────────────────
// Detects blind vulnerabilities (blind SSRF, blind XXE, blind SQLi,
// template injection, Log4Shell-style lookups, ...) by generating callback
// payloads that the target application is tricked into requesting. The
// VektorSec server itself acts as the listener — no external Burp
// Collaborator / Caido OAST service is required.
//
// Two payload styles are supported:
//   1. Path-based:   http://<server>/api/oob/callback/<token>
//      Works out of the box (no DNS setup).
//   2. Host-based:   http://<token>.oob.<server-domain>/
//      Requires wildcard DNS "*.<domain>.oob." (or "*.oob.<domain>") pointing
//      at the server. The token is extracted from the Host header so ANY
//      path is recorded as an interaction.

const OOB_KEY_PREFIX = "oob:payload:";
const OOB_TTL_SECONDS = 60 * 60 * 24; // 24h
const OOB_MAX_INTERACTIONS = 200;
const OOB_TOKEN_RE = /^[a-f0-9]{16,64}$/i;

// Redis client is resolved lazily so that importing this module (e.g. in unit
// tests) does not boot the whole server. When Redis is unavailable we fall
// back to an in-process store.
let cachedRedisClient: any;

function getRedisClient(): any {
  if (cachedRedisClient === undefined) {
    try {
      if (process.env.NODE_ENV === "test") {
        // Do not boot the server (and its Redis connection) from unit tests.
        cachedRedisClient = null;
      } else {
        cachedRedisClient = require("../server").redisClient ?? null;
      }
    } catch {
      cachedRedisClient = null;
    }
  }
  return cachedRedisClient;
}

function redisAvailable(): boolean {
  const client = getRedisClient();
  try {
    return !!(client && client.isOpen);
  } catch {
    return false;
  }
}

export interface OobInteraction {
  id: string;
  type: string; // "http"
  method: string;
  path: string;
  protocol: string;
  host?: string;
  remoteAddress?: string;
  headers: Record<string, string>;
  bodyPreview: string;
  timestamp: Date;
}

export interface OobPayloadInfo {
  token: string;
  label?: string;
  createdAt: Date;
  expiresAt: Date;
}

export interface OobPayloadUrls {
  /** Path-based payload — works without wildcard DNS. */
  pathUrl: string;
  /** Host-based payload (subdomain) — requires wildcard DNS for *.oob on the server domain. */
  hostUrl: string;
}

interface OobRecord {
  info: OobPayloadInfo;
  interactions: OobInteraction[];
}

// In-memory fallback used when Redis is unreachable.
const memoryStore = new Map<string, OobRecord>();

async function getRecord(token: string): Promise<OobRecord | null> {
  if (redisAvailable()) {
    const raw = await getRedisClient().GET(OOB_KEY_PREFIX + token);
    return raw ? (JSON.parse(raw) as OobRecord) : null;
  }
  return memoryStore.get(token) ?? null;
}

async function saveRecord(token: string, record: OobRecord): Promise<void> {
  if (redisAvailable()) {
    await getRedisClient().SET(OOB_KEY_PREFIX + token, JSON.stringify(record), {
      EX: OOB_TTL_SECONDS,
    });
  } else {
    memoryStore.set(token, record);
  }
}

export function isValidOobToken(token: unknown): boolean {
  return OOB_TOKEN_RE.test(String(token || ""));
}

/**
 * Extract the OOB token from a Host header of the form:
 *   <token>.oob.<domain>   (e.g. 3f9a7c...21a0.oob.vektorsec.local)
 * Returns null when the host does not carry a valid OOB subdomain token.
 */
export function extractOobTokenFromHost(host: unknown): string | null {
  const match = String(host || "").match(/^([a-f0-9]{16,64})\.oob\./i);
  return match ? match[1].toLowerCase() : null;
}

export async function createOobPayload(label?: string): Promise<OobPayloadInfo> {
  const token = uuidv4().replace(/-/g, "").toLowerCase();
  const now = new Date();
  const info: OobPayloadInfo = {
    token,
    label: label || undefined,
    createdAt: now,
    expiresAt: new Date(now.getTime() + OOB_TTL_SECONDS * 1000),
  };
  await saveRecord(token, { info, interactions: [] });
  return info;
}

/** Build full/relative payload URLs for a token and a server base URL. */
export function buildPayloadUrls(baseUrl: string, token: string): OobPayloadUrls {
  const base = String(baseUrl || "").replace(/\/+$/, "");
  const hostBase = base.replace(/^https?:\/\//, "");
  return {
    pathUrl: `${base}/api/oob/callback/${token}`,
    hostUrl: `${token}.oob.${hostBase}`,
  };
}

export interface OobInteractionInput {
  type?: string;
  method: string;
  path: string;
  protocol?: string;
  host?: string;
  remoteAddress?: string;
  headers?: Record<string, string>;
  bodyPreview?: string;
}

/** Record an incoming callback as an OOB interaction for the token. */
export async function recordOobInteraction(
  token: string,
  input: OobInteractionInput,
): Promise<void> {
  if (!isValidOobToken(token)) return;
  let record = await getRecord(token);
  if (!record) {
    // Lazily create a record so callbacks that arrive before an explicit
    // "generate" still get captured under the same token.
    const now = new Date();
    record = {
      info: {
        token,
        createdAt: now,
        expiresAt: new Date(now.getTime() + OOB_TTL_SECONDS * 1000),
      },
      interactions: [],
    };
  }
  const interaction: OobInteraction = {
    id: uuidv4(),
    type: input.type ?? "http",
    method: input.method || "GET",
    path: input.path || "/",
    protocol: input.protocol ?? "http",
    host: input.host,
    remoteAddress: input.remoteAddress,
    headers: input.headers ?? {},
    bodyPreview: String(input.bodyPreview || "").slice(0, 2000),
    timestamp: new Date(),
  };
  record.interactions.push(interaction);
  if (record.interactions.length > OOB_MAX_INTERACTIONS) {
    record.interactions = record.interactions.slice(-OOB_MAX_INTERACTIONS);
  }
  await saveRecord(token, record);
}

export async function pollOobInteractions(
  token: string,
): Promise<{ interactions: OobInteraction[]; info: OobPayloadInfo | null }> {
  if (!isValidOobToken(token)) return { interactions: [], info: null };
  const record = await getRecord(token);
  return {
    interactions: record?.interactions ?? [],
    info: record?.info ?? null,
  };
}

export async function getOobPayloadInfo(
  token: string,
): Promise<OobPayloadInfo | null> {
  if (!isValidOobToken(token)) return null;
  const record = await getRecord(token);
  return record?.info ?? null;
}
