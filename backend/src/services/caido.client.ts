import { gql } from "@urql/core";
import type {
  Interaction as QuickSsrfInteraction,
  Provider as QuickSsrfProvider,
  Result as QuickSsrfResult,
  Session as QuickSsrfSession,
  Spec as QuickSsrfSpec,
} from "@caido-community/quickssrf";
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

export type CaidoAutomateInput = {
  host: string;
  port: number;
  secure: boolean;
  rawRequest: string;
  tabName?: string;
  placeholders?: Array<{ start: number; end: number }>;
  payloads?: string[];
  strategy?: "SEQUENTIAL" | "ALL" | "PARALLEL" | "MATRIX";
  run?: boolean;
};

export const CAIDO_UNREACHABLE_MSG =
  "Integration appears to be disconnected. Verify the local instance is running, listening on an address WSL can reach, and the URL/PAT in Settings are correct.";

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
  return client;
}

export async function caidoQuery<TData = any, TVars extends Record<string, unknown> = Record<string, unknown>>(
  document: any,
  variables?: TVars,
): Promise<TData> {
  const client = await createCaidoClient();
  return client.graphql.query(document, variables);
}

export async function caidoMutation<TData = any, TVars extends Record<string, unknown> = Record<string, unknown>>(
  document: any,
  variables?: TVars,
): Promise<TData> {
  const client = await createCaidoClient();
  return client.graphql.mutation(document, variables);
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

function encodeBlob(raw: string): string {
  return Buffer.from(raw, "utf8").toString("base64");
}

function connectionInfo(input: { host: string; port: number; secure: boolean }) {
  return {
    host: input.host,
    port: input.port,
    isTLS: input.secure,
    SNI: input.secure ? input.host : undefined,
  };
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
      message: "Integration is not configured.",
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
  const rawBlob = encodeBlob(raw);
  const session = await client.replay.sessions.create({
    requestSource: {
      raw: rawBlob,
      connection: connectionInfo(input),
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
  const rawBlob = encodeBlob(raw);
  const session = await client.replay.sessions.create({
    requestSource: {
      raw: rawBlob,
      connection: connectionInfo(input),
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
    connection: connectionInfo(input),
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

function defaultAutomateSettings(input: CaidoAutomateInput) {
  return {
    payloads: [
      {
        options: {
          simpleList: {
            list: input.payloads?.length ? input.payloads : ["test"],
          },
        },
        preprocessors: [],
      },
    ],
    placeholders: input.placeholders || [],
    redirect: { strategy: "NEVER", max: 0 },
    strategy: input.strategy || "SEQUENTIAL",
    concurrency: { workers: 1, delay: 0 },
    retryOnFailure: { maximumRetries: 0, backoff: 0 },
    closeConnection: false,
    updateContentLength: true,
  };
}

export async function createCaidoAutomateSession(input: CaidoAutomateInput) {
  const raw = normalizeHttpRequest(input.rawRequest);
  const rawBlob = encodeBlob(raw);
  const connection = connectionInfo(input);

  const created = await caidoMutation(
    gql`
      mutation($input: CreateAutomateSessionInput!) {
      createAutomateSession(input: $input) {
        session { id name }
      }
    }`,
    {
      input: {
        requestSource: {
          raw: { connectionInfo: connection, raw: rawBlob },
        },
      },
    },
  );
  const sessionId = created.createAutomateSession.session.id;

  if (input.tabName) {
    await caidoMutation(
      gql`
        mutation($id: ID!, $name: String!) {
        renameAutomateSession(id: $id, name: $name) { session { id name } }
      }`,
      { id: sessionId, name: input.tabName },
    );
  }

  const shouldConfigure = input.run || input.placeholders?.length || input.payloads?.length;
  if (shouldConfigure) {
    const updated = await caidoMutation(
      gql`
        mutation($id: ID!, $input: UpdateAutomateSessionInput!) {
        updateAutomateSession(id: $id, input: $input) {
          session { id name }
          error { __typename }
        }
      }`,
      {
        id: sessionId,
        input: {
          connection,
          raw: rawBlob,
          settings: defaultAutomateSettings(input),
        },
      },
    );
    if (updated.updateAutomateSession.error) {
      throw new Error(`Automate update failed: ${updated.updateAutomateSession.error.__typename}`);
    }
  }

  let task;
  if (input.run) {
    const started = await caidoMutation(
      gql`
        mutation($id: ID!) {
        startAutomateTask(automateSessionId: $id) {
          automateTask { id paused entry { id name } }
        }
      }`,
      { id: sessionId },
    );
    task = started.startAutomateTask.automateTask;
  }

  return {
    sessionId,
    name: input.tabName || created.createAutomateSession.session.name,
    task,
  };
}

export async function getCaidoInterceptState() {
  const data = await caidoQuery(
    gql`
      query {
      interceptStatus
      interceptOptions {
        request { enabled }
        response { enabled }
        streamWs { enabled }
      }
    }`,
  );
  const status = data.interceptStatus;
  const options = data.interceptOptions;
  return {
    enabled: status === "RUNNING" && !!options?.request?.enabled,
    status,
    options,
  };
}

export async function setCaidoInterceptEnabled(enabled: boolean) {
  if (enabled) {
    const state = await getCaidoInterceptState();
    await caidoMutation(
      gql`
        mutation($input: InterceptOptionsInput!) {
        setInterceptOptions(input: $input) {
          options {
            request { enabled }
            response { enabled }
            streamWs { enabled }
          }
        }
      }`,
      {
        input: {
          request: { enabled: true },
          response: { enabled: !!state.options?.response?.enabled },
          streamWs: { enabled: !!state.options?.streamWs?.enabled },
        },
      },
    );
    await caidoMutation(gql`mutation { resumeIntercept { status } }`);
  } else {
    await caidoMutation(gql`mutation { pauseIntercept { status } }`);
  }

  return getCaidoInterceptState();
}

function unwrapQuickSsrf<T>(result: QuickSsrfResult<T>, action: string): T {
  if (result.kind === "Error") {
    throw new Error(`${action} failed: ${result.error}`);
  }
  return result.value;
}

async function getQuickSsrfPackage(options: { install?: boolean; force?: boolean } = {}) {
  const client = await createCaidoClient();
  let pluginPackage = await client.plugin.pluginPackage<QuickSsrfSpec>("quickssrf");
  if (options.install && (!pluginPackage || options.force)) {
    pluginPackage = await client.plugin.install<QuickSsrfSpec>({
      manifestId: "quickssrf",
      force: options.force,
    });
  }
  return pluginPackage;
}

export async function installCaidoOastPlugin(options: { force?: boolean } = {}) {
  const pluginPackage = await getQuickSsrfPackage({ install: true, force: options.force });
  if (!pluginPackage) throw new Error("Could not install OAST plugin.");
  return {
    installed: true,
    manifestId: pluginPackage.manifestId,
    plugins: pluginPackage.plugins,
  };
}

export async function getCaidoOastStatus() {
  const pluginPackage = await getQuickSsrfPackage();
  if (!pluginPackage) {
    return {
      installed: false,
      providers: [] as QuickSsrfProvider[],
      sessions: [] as QuickSsrfSession[],
    };
  }

  const providers = unwrapQuickSsrf(await pluginPackage.getProviders(), "getProviders");
  const sessions = unwrapQuickSsrf(await pluginPackage.getSessions(), "getSessions");
  return {
    installed: true,
    manifestId: pluginPackage.manifestId,
    providers,
    sessions,
  };
}

export async function getCaidoOastProviders() {
  const pluginPackage = await getQuickSsrfPackage();
  if (!pluginPackage) throw new Error("OAST plugin is not installed. Run install first.");
  return unwrapQuickSsrf(await pluginPackage.getProviders(), "getProviders");
}

export async function getCaidoOastSessions() {
  const pluginPackage = await getQuickSsrfPackage();
  if (!pluginPackage) throw new Error("OAST plugin is not installed. Run install first.");
  return unwrapQuickSsrf(await pluginPackage.getSessions(), "getSessions");
}

export async function createCaidoOastSession(input: { providerId?: string; title?: string } = {}) {
  const pluginPackage = await getQuickSsrfPackage();
  if (!pluginPackage) throw new Error("OAST plugin is not installed. Run install first.");

  let providerId = input.providerId;
  if (!providerId) {
    const providers = unwrapQuickSsrf(await pluginPackage.getProviders(), "getProviders");
    providerId = providers.find((provider) => provider.enabled)?.id || providers[0]?.id;
  }
  if (!providerId) throw new Error("No OAST providers are configured.");

  let session = unwrapQuickSsrf(await pluginPackage.createSession(providerId), "createSession");
  if (input.title) {
    session = unwrapQuickSsrf(
      await pluginPackage.updateSessionTitle(session.id, input.title),
      "updateSessionTitle",
    );
  }
  return session;
}

export async function pollCaidoOastSession(sessionId: string): Promise<QuickSsrfInteraction[]> {
  const pluginPackage = await getQuickSsrfPackage();
  if (!pluginPackage) throw new Error("OAST plugin is not installed. Run install first.");
  return unwrapQuickSsrf(await pluginPackage.pollSession(sessionId), "pollSession");
}

export async function getCaidoOastInteractions(sessionId: string): Promise<QuickSsrfInteraction[]> {
  const pluginPackage = await getQuickSsrfPackage();
  if (!pluginPackage) throw new Error("OAST plugin is not installed. Run install first.");
  return unwrapQuickSsrf(await pluginPackage.getInteractions(sessionId), "getInteractions");
}
