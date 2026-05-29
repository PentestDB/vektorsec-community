import { readEnvFile } from "../utils/envWriter";

export type CaidoConnection = {
  url: string;
  pat: string;
  proxyUrl: string;
};

export type CaidoHistoryFilter = {
  search?: string;
  method?: string;
  statusMin?: number;
  statusMax?: number;
  hideAssets?: boolean;
};

export const CAIDO_UNREACHABLE_MSG =
  "Caido appears to be disconnected. Verify Caido is running, the instance is listening on an address WSL can reach, and the URL/PAT in Settings are correct.";

const STATIC_EXT_RE = /\.(?:css|js|mjs|png|jpe?g|gif|svg|ico|webp|woff2?|ttf|map)(?:\?|$)/i;
const STATIC_TYPES = ["image/", "font/", "text/css", "javascript"];

function quietLogger() {
  return {
    debug: () => undefined,
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined,
  };
}

export function getCaidoConnection(): CaidoConnection {
  const env = readEnvFile();
  const url = String(env.CAIDO_URL || "").replace(/\/+$/, "");
  return {
    url,
    pat: String(env.CAIDO_PAT || ""),
    proxyUrl: String(env.CAIDO_PROXY_URL || url),
  };
}

export function isCaidoConfigured(conn = getCaidoConnection()) {
  return !!conn.url && !!conn.pat;
}

export async function createCaidoClient(conn = getCaidoConnection()) {
  const { Client } = await import("@caido/sdk-client");
  const client = new Client({
    url: conn.url,
    auth: { pat: conn.pat },
    request: { timeout: 30_000 },
    logger: quietLogger(),
  });
  await client.connect();
  return client as any;
}

export function normalizeHttpRequest(rawRequest: string): string {
  let normalized = rawRequest.replace(/\r?\n/g, "\r\n");
  const headerBodySplit = normalized.indexOf("\r\n\r\n");
  if (headerBodySplit !== -1) {
    const headersPart = normalized.substring(0, headerBodySplit);
    const bodyPart = normalized.substring(headerBodySplit + 4);
    const bodyLength = Buffer.byteLength(bodyPart, "utf-8");

    if (/Content-Length:\s*\d+/i.test(headersPart)) {
      normalized =
        headersPart.replace(/Content-Length:\s*\d+/i, `Content-Length: ${bodyLength}`) +
        "\r\n\r\n" +
        bodyPart;
    }
  }
  return normalized;
}

function rawToText(raw?: Uint8Array | string): string {
  if (!raw) return "";
  if (typeof raw === "string") return raw;
  return Buffer.from(raw).toString("utf8");
}

function getHeader(raw: string, name: string): string {
  const re = new RegExp(`^${name}:\\s*(.+)$`, "im");
  return raw.match(re)?.[1]?.trim() || "";
}

function requestPath(request: any): string {
  const query = request.query ? `?${request.query}` : "";
  return `${request.path || "/"}${query}`;
}

function mapRequestResponse(item: any, index: number) {
  const request = item.request || item.node?.request;
  const response = item.response || item.node?.response;
  const rawResponse = rawToText(response?.raw);
  const contentType = getHeader(rawResponse, "Content-Type");
  return {
    id: request.id,
    index,
    method: request.method,
    host: request.host,
    port: request.port,
    secure: !!request.isTls,
    path: requestPath(request),
    statusCode: response?.statusCode || 0,
    contentType,
    responseLength: response?.length || rawResponse.length || 0,
    createdAt: request.createdAt,
  };
}

function matchesFilter(entry: any, filter: CaidoHistoryFilter) {
  if (filter.method) {
    const methods = filter.method.split(",").map((m) => m.trim().toUpperCase()).filter(Boolean);
    if (methods.length && !methods.includes(String(entry.method || "").toUpperCase())) return false;
  }
  if (filter.statusMin && entry.statusCode < filter.statusMin) return false;
  if (filter.statusMax && entry.statusCode > filter.statusMax) return false;
  if (filter.hideAssets) {
    const contentType = String(entry.contentType || "").toLowerCase();
    if (STATIC_EXT_RE.test(entry.path || "") || STATIC_TYPES.some((t) => contentType.includes(t))) {
      return false;
    }
  }
  if (filter.search) {
    const needle = filter.search.toLowerCase();
    const haystack = `${entry.method} ${entry.host} ${entry.path} ${entry.statusCode} ${entry.contentType}`.toLowerCase();
    if (!haystack.includes(needle)) return false;
  }
  return true;
}

export async function getCaidoHealth() {
  const conn = getCaidoConnection();
  if (!isCaidoConfigured(conn)) {
    return {
      configured: false,
      connected: false,
      message: "Caido is not configured.",
    };
  }

  try {
    const client = await createCaidoClient(conn);
    const viewer = await client.user.viewer();
    return {
      configured: true,
      connected: true,
      url: conn.url,
      viewer,
    };
  } catch (error: any) {
    return {
      configured: true,
      connected: false,
      url: conn.url,
      message: error?.message || CAIDO_UNREACHABLE_MSG,
    };
  }
}

export async function getCaidoHistory(params: {
  page: number;
  pageSize: number;
  filter: CaidoHistoryFilter;
}) {
  const client = await createCaidoClient();
  const fetchCount = Math.min(500, Math.max(params.page * params.pageSize, params.pageSize));
  const connection = await client.request
    .list()
    .includeRaw({ request: false, response: true })
    .descending("req", "created_at")
    .first(fetchCount);

  const allEntries = connection.edges
    .map((edge: any, idx: number) => mapRequestResponse(edge.node, idx + 1))
    .filter((entry: any) => matchesFilter(entry, params.filter));

  const start = (params.page - 1) * params.pageSize;
  return {
    entries: allEntries.slice(start, start + params.pageSize),
    total: allEntries.length,
    page: params.page,
    pageSize: params.pageSize,
  };
}

export async function getCaidoEntry(id: string) {
  const client = await createCaidoClient();
  const item = await client.request.get(id, {
    requestRaw: true,
    responseRaw: true,
  });
  if (!item) return undefined;

  const request = item.request;
  const response = item.response;
  return {
    id: request.id,
    method: request.method,
    host: request.host,
    port: request.port,
    secure: !!request.isTls,
    path: requestPath(request),
    rawRequest: rawToText(request.raw),
    rawResponse: rawToText(response?.raw),
    statusCode: response?.statusCode || 0,
  };
}

export async function createCaidoReplaySession(input: {
  host: string;
  port: number;
  secure: boolean;
  rawRequest: string;
  tabName?: string;
}) {
  const client = await createCaidoClient();
  const raw = normalizeHttpRequest(input.rawRequest);
  const rawBlob = Buffer.from(raw, "utf8").toString("base64");
  const session = await client.replay.sessions.create({
    requestSource: {
      raw: rawBlob,
      connection: {
        host: input.host,
        port: input.port,
        isTLS: input.secure,
        SNI: input.secure ? input.host : undefined,
      },
    },
  });
  if (input.tabName) {
    try {
      await client.replay.sessions.rename(session.id, input.tabName);
    } catch {
      // The replay session still exists even if rename fails.
    }
  }
  return session;
}

export async function sendCaidoReplayRequest(input: {
  host: string;
  port: number;
  secure: boolean;
  rawRequest: string;
  tabName?: string;
}) {
  const client = await createCaidoClient();
  const raw = normalizeHttpRequest(input.rawRequest);
  const rawBlob = Buffer.from(raw, "utf8").toString("base64");
  const session = await client.replay.sessions.create({
    requestSource: {
      raw: rawBlob,
      connection: {
        host: input.host,
        port: input.port,
        isTLS: input.secure,
        SNI: input.secure ? input.host : undefined,
      },
    },
  });
  if (input.tabName) {
    try {
      await client.replay.sessions.rename(session.id, input.tabName);
    } catch {
      // Non-fatal.
    }
  }
  const result = await client.replay.send(session.id, {
    raw,
    connection: {
      host: input.host,
      port: input.port,
      isTLS: input.secure,
      SNI: input.secure ? input.host : undefined,
    },
    settings: { updateContentLength: true },
  });

  return {
    hasResponse: !!result.entry?.response?.raw,
    rawResponse: rawToText(result.entry?.response?.raw),
    status: result.status,
    error: result.error,
    sessionId: session.id,
    entryId: result.entry?.id,
  };
}

export function caidoUnsupported(feature: string) {
  return {
    supported: false,
    message: `${feature} is not exposed by the current Caido client API used by Pentest Copilot v1.`,
  };
}
