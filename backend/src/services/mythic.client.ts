/**
 * Mythic C2 client.
 *
 * Pentest Copilot talks to an operator-supplied Mythic server over its GraphQL API.
 * NO C2 STATE IS STORED HERE. Callbacks, tasks, payloads, files and credentials all
 * live in Mythic; every call in this file is a live round-trip. The only thing this
 * product persists is the connection config (MYTHIC_URL / MYTHIC_API_TOKEN in .env).
 *
 * Transport: POST {url}/graphql/ — the TRAILING SLASH is required. Mythic's nginx
 * 301-redirects /graphql, and a redirected POST silently degrades to a GET, so
 * requests to the unslashed path fail in a confusing way rather than erroring.
 *
 * Auth: ONE scheme per request, chosen by token shape, with a fallback retry.
 *
 * Mythic 3.x issues JWT API tokens carrying a ~4h `exp`. That expiry IS enforced
 * on the `Authorization: Bearer` path but deliberately NOT on the `apitoken` path
 * (3.x tracks revocation in its database instead). Mythic 4.0 reversed this: it
 * dropped `apitoken` and issues opaque `mtk_`-prefixed tokens used as Bearer.
 *
 * Sending both headers at once looks like cheap version coverage and is a trap:
 * Mythic's auth hook evaluates Bearer first, so once a 3.x JWT ages past four
 * hours every request fails with "Authentication hook unauthorized this request"
 * even though the apitoken header alongside it would have been accepted. So pick
 * the scheme the token shape implies, and fall back to the other one only if the
 * first is rejected.
 *
 * ── Schema drift warning ────────────────────────────────────────────────────────
 * The operation documents at the bottom of this file target Mythic's Hasura schema.
 * Mythic's public docs deliberately point at the Hasura console rather than
 * publishing operation names, and v4 renamed some actions to camelCase with
 * `*_display_id` arguments. Run `pnpm mythic:introspect` against a live server to
 * dump the real schema and correct anything here that does not match. The
 * `mythic_graphql` tool exists as a runtime escape hatch for exactly this reason.
 */

import axios, { AxiosInstance } from "axios";
import https from "https";
import { readEnvFile } from "../utils/envWriter";

export type MythicConnection = {
  url: string;
  token: string;
  insecureTls: boolean;
};

export const MYTHIC_UNREACHABLE_MSG =
  "Mythic appears to be unreachable. Verify the server is running, that its URL (default https://<host>:7443) " +
  "is reachable from Pentest Copilot, and that the URL/API token in Settings are correct.";

export const MYTHIC_UNAUTHORIZED_MSG =
  "Mythic rejected the API token. On Mythic 3.x these tokens are JWTs that expire a few hours after they are " +
  "created, so this usually means the token has aged out. Generate a new one in the Mythic UI " +
  "(Operations → API Tokens) and re-enter it in Settings → Mythic C2.";

export const MYTHIC_NOT_CONFIGURED_MSG =
  "Mythic C2 is not configured. Set the Mythic URL and API token in Settings → Mythic C2.";

export class MythicError extends Error {
  readonly kind: "unreachable" | "unauthorized" | "graphql" | "unknown";

  constructor(kind: MythicError["kind"], message: string) {
    super(message);
    this.name = "MythicError";
    this.kind = kind;
  }
}

/** Normalize whatever the user typed into a usable base URL. */
export function normalizeMythicUrl(raw: string): string {
  let url = String(raw || "").trim();
  if (!url) return "";
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
  return url.replace(/\/+$/, "");
}

export function getMythicConnection(): MythicConnection {
  const env = readEnvFile();
  return {
    url: normalizeMythicUrl(env.MYTHIC_URL || ""),
    token: String(env.MYTHIC_API_TOKEN || ""),
    insecureTls: String(env.MYTHIC_INSECURE_TLS || "").toLowerCase() === "true",
  };
}

export function isMythicConfigured(conn: MythicConnection = getMythicConnection()): boolean {
  return !!conn.url && !!conn.token;
}

/** Hostname operators need for proxychains/rpfwd targets (SOCKS binds on the Mythic host). */
export function getMythicHost(conn: MythicConnection = getMythicConnection()): string {
  try {
    return new URL(conn.url).hostname;
  } catch {
    return conn.url;
  }
}

function httpClient(conn: MythicConnection): AxiosInstance {
  return axios.create({
    baseURL: conn.url,
    timeout: 30_000,
    // Mythic ships a self-signed certificate by default. Strict unless the operator opts out.
    httpsAgent: new https.Agent({ rejectUnauthorized: !conn.insecureTls }),
    // Mythic can return large task output; don't let axios truncate it.
    maxContentLength: 64 * 1024 * 1024,
    maxBodyLength: 64 * 1024 * 1024,
    validateStatus: () => true,
  });
}

/**
 * Auth schemes to try, best-first for this token's shape. Never send both at
 * once — Mythic evaluates Bearer first, so an expired 3.x JWT would mask a valid
 * apitoken and every request would fail with "Authentication hook unauthorized".
 */
function authSchemes(conn: MythicConnection): Array<Record<string, string>> {
  const bearer = { Authorization: `Bearer ${conn.token}` };
  const apitoken = { apitoken: conn.token };
  // Mythic 4.0 issues opaque mtk_ tokens (Bearer only); 3.x issues JWTs, where
  // the apitoken path is the one that ignores expiry.
  return conn.token.startsWith("mtk_") ? [bearer, apitoken] : [apitoken, bearer];
}

function classifyTransportError(err: any, conn: MythicConnection): MythicError {
  const code = err?.code || err?.cause?.code;
  if (
    code === "ECONNREFUSED" ||
    code === "ENOTFOUND" ||
    code === "EHOSTUNREACH" ||
    code === "ETIMEDOUT" ||
    code === "ECONNRESET" ||
    code === "ECONNABORTED"
  ) {
    return new MythicError("unreachable", MYTHIC_UNREACHABLE_MSG);
  }
  if (typeof code === "string" && (code.startsWith("ERR_TLS") || code.includes("CERT"))) {
    return new MythicError(
      "unreachable",
      `TLS error connecting to ${conn.url}: ${code}. Mythic uses a self-signed certificate by default — ` +
        `enable "Allow self-signed certificate" in Settings → Mythic C2 if this is expected.`,
    );
  }
  return new MythicError("unknown", `Mythic request failed: ${err?.message || String(err)}`);
}

/**
 * Execute a GraphQL document against Mythic. Throws MythicError on failure so
 * callers can map to a friendly tool output.
 */
export async function mythicGraphql<T = any>(
  query: string,
  variables: Record<string, any> = {},
  conn: MythicConnection = getMythicConnection(),
): Promise<T> {
  if (!isMythicConfigured(conn)) {
    throw new MythicError("unauthorized", MYTHIC_NOT_CONFIGURED_MSG);
  }

  const client = httpClient(conn);

  // Try the scheme the token shape implies first, then the other one. See the
  // header comment: sending both at once lets an expired Bearer JWT mask a
  // perfectly good apitoken.
  const schemes = authSchemes(conn);

  let authFailure = "";

  for (let attempt = 0; attempt < schemes.length; attempt++) {
    let res;
    try {
      res = await client.post(
        "/graphql/",
        { query, variables },
        {
          headers: { "Content-Type": "application/json", ...schemes[attempt] },
          // Never follow a redirect: a 301 would turn this POST into a GET and
          // return an HTML page instead of GraphQL data. Fail loudly instead.
          maxRedirects: 0,
        },
      );
    } catch (err) {
      throw classifyTransportError(err, conn);
    }

    if (res.status >= 300 && res.status < 400) {
      throw new MythicError(
        "graphql",
        `Mythic redirected the GraphQL request (HTTP ${res.status} to ${res.headers?.location || "?"}). ` +
          `Check that MYTHIC_URL points at the Mythic nginx endpoint.`,
      );
    }
    if (res.status >= 500) {
      throw new MythicError("unreachable", `${MYTHIC_UNREACHABLE_MSG} (HTTP ${res.status})`);
    }

    const payload = res.data;
    const graphqlErrors: string = (payload?.errors ?? [])
      .map((e: any) => e?.message || String(e))
      .join("; ");

    // Mythic reports auth failures two ways: an HTTP status, or — more often —
    // HTTP 200 carrying a GraphQL "Authentication hook unauthorized this request"
    // error. Both must count, or an expired token reads as a generic query error.
    const isAuthFailure =
      res.status === 401 ||
      res.status === 403 ||
      /unauthoriz|authentication hook|access denied|access-denied|not allowed|invalid token/i.test(
        graphqlErrors,
      );

    if (isAuthFailure) {
      authFailure = graphqlErrors || `HTTP ${res.status}`;
      continue; // try the other scheme; if this was the last, fall through below
    }

    if (res.status >= 400) {
      throw new MythicError("graphql", `Mythic returned HTTP ${res.status}: ${summarize(res.data)}`);
    }
    if (graphqlErrors) {
      if (/permission|scope/i.test(graphqlErrors)) {
        throw new MythicError(
          "unauthorized",
          `Mythic denied the request — the API token is missing a required scope: ${graphqlErrors}`,
        );
      }
      throw new MythicError("graphql", `Mythic GraphQL error: ${graphqlErrors}`);
    }

    return payload?.data as T;
  }

  throw new MythicError("unauthorized", `${MYTHIC_UNAUTHORIZED_MSG} (Mythic said: ${authFailure})`);
}

function summarize(data: any): string {
  if (data == null) return "(empty response)";
  const text = typeof data === "string" ? data : JSON.stringify(data);
  return text.length > 500 ? `${text.slice(0, 500)}…` : text;
}

/**
 * Stream a downloaded file onto the work host.
 *
 * The obvious implementation — base64 the whole buffer into a single
 * `printf ... | base64 -d` command — dies with "Unable to exec" on anything
 * sizeable: a 1.7 MB implant becomes ~2.3 MB of base64 in one argv entry, well
 * past ARG_MAX. So append in chunks, then decode on the work host. Keeping the
 * transfer on this side also means the Mythic API token never appears in a
 * command line (and therefore never in `ps`) on the work host.
 */
export async function writeBufferToWorkHost(
  buffer: Buffer,
  savePath: string,
  runCommand: (command: string, timeoutMs?: number) => Promise<{ output: string; exitCode: number }>,
): Promise<{ bytes: number; output: string }> {
  const CHUNK = 60_000; // base64 chars per command; comfortably under ARG_MAX
  const b64 = buffer.toString("base64");
  const tmp = `/tmp/.pc_xfer_${Date.now()}_${Math.floor(Math.random() * 1e6)}.b64`;
  const q = (v: string) => JSON.stringify(v);

  const dir = savePath.replace(/\/[^/]*$/, "") || "/";
  const prep = await runCommand(`mkdir -p ${q(dir)} && : > ${tmp}`, 30_000);
  if (prep.exitCode !== 0) {
    return { bytes: 0, output: `Could not prepare ${dir} on the work host:\n${prep.output}` };
  }

  for (let offset = 0; offset < b64.length; offset += CHUNK) {
    const chunk = b64.slice(offset, offset + CHUNK);
    const res = await runCommand(`printf '%s' ${q(chunk)} >> ${tmp}`, 60_000);
    if (res.exitCode !== 0) {
      await runCommand(`rm -f ${tmp}`, 15_000);
      return {
        bytes: 0,
        output: `Transfer failed at byte ${offset} of ${b64.length}:\n${res.output}`,
      };
    }
  }

  const finish = await runCommand(
    `base64 -d ${tmp} > ${q(savePath)} && rm -f ${tmp} && wc -c < ${q(savePath)}`,
    120_000,
  );
  if (finish.exitCode !== 0) {
    await runCommand(`rm -f ${tmp}`, 15_000);
    return { bytes: 0, output: `Could not decode the transfer on the work host:\n${finish.output}` };
  }

  const written = parseInt(finish.output.trim().split(/\s+/).pop() || "0", 10);
  if (written !== buffer.length) {
    return {
      bytes: written,
      output:
        `Size mismatch writing ${savePath}: expected ${buffer.length} bytes, got ${written}. ` +
        `The file on the work host is incomplete.`,
    };
  }
  return { bytes: written, output: `Wrote ${written} bytes to ${savePath} on the work host.` };
}

/** Raw HTTP GET against Mythic (file downloads live outside GraphQL). */
async function mythicGet(path: string, conn: MythicConnection, responseType: "text" | "arraybuffer" = "text") {
  const client = httpClient(conn);
  const schemes = authSchemes(conn);
  let last;
  for (const scheme of schemes) {
    try {
      last = await client.get(path, { responseType, maxRedirects: 0, headers: { ...scheme } });
    } catch (err) {
      throw classifyTransportError(err, conn);
    }
    if (last.status !== 401 && last.status !== 403) return last;
  }
  return last!;
}

// ────────────────────────────────────────────────────────────────────────────────
// Health / scope check
// ────────────────────────────────────────────────────────────────────────────────

export type MythicHealth = {
  configured: boolean;
  connected: boolean;
  url: string;
  operation?: string;
  operator?: string;
  callbackCount?: number;
  error?: string;
};

export async function getMythicHealth(conn: MythicConnection = getMythicConnection()): Promise<MythicHealth> {
  if (!isMythicConfigured(conn)) {
    return { configured: false, connected: false, url: conn.url };
  }
  try {
    const data = await mythicGraphql<{
      callback_aggregate?: { aggregate?: { count?: number } };
      operation?: Array<{ name?: string }>;
    }>(
      `query MythicHealth {
        callback_aggregate { aggregate { count } }
        operation(limit: 1) { name }
      }`,
      {},
      conn,
    );
    return {
      configured: true,
      connected: true,
      url: conn.url,
      operation: data?.operation?.[0]?.name,
      callbackCount: data?.callback_aggregate?.aggregate?.count ?? 0,
    };
  } catch (err: any) {
    return {
      configured: true,
      connected: false,
      url: conn.url,
      error: err?.message || String(err),
    };
  }
}

/**
 * Mythic stores several columns as Postgres bytea and exposes them over GraphQL as
 * BASE64, despite the `_text` suffix — filemeta.filename_text, mythictree paths and
 * response_text all arrive encoded. Decode only those known fields: applying this
 * heuristically everywhere would corrupt plain values that happen to look like
 * base64 (the password "Password" is valid base64 and would decode to bytes).
 */
export function decodeMythicText(value?: string | null): string {
  if (!value) return "";
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value) || value.length % 4 !== 0) return value;
  try {
    const decoded = Buffer.from(value, "base64").toString("utf8");
    // Control characters or U+FFFD mean the input was not base64-encoded text.
    if (!decoded || /[\u0000-\u0008\u000e-\u001f\ufffd]/.test(decoded)) return value;
    return decoded;
  } catch {
    return value;
  }
}

// ────────────────────────────────────────────────────────────────────────────────
// Callbacks
// ────────────────────────────────────────────────────────────────────────────────

export type MythicCallback = {
  id: number;
  display_id: number;
  host?: string;
  user?: string;
  domain?: string;
  os?: string;
  architecture?: string;
  pid?: number;
  ip?: string;
  external_ip?: string;
  integrity_level?: number;
  active?: boolean;
  locked?: boolean;
  description?: string;
  last_checkin?: string;
  sleep_info?: string;
  process_name?: string;
  payload?: { payloadtype?: { name?: string } };
};

const CALLBACK_FIELDS = `
  id
  display_id
  host
  user
  domain
  os
  architecture
  pid
  process_name
  ip
  external_ip
  integrity_level
  active
  locked
  description
  last_checkin
  sleep_info
  payload { payloadtype { name } }
`;

export async function getCallbacks(opts: { activeOnly?: boolean; limit?: number } = {}): Promise<MythicCallback[]> {
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
  const where = opts.activeOnly === false ? "{}" : "{active: {_eq: true}}";
  const data = await mythicGraphql<{ callback: MythicCallback[] }>(
    `query Callbacks($limit: Int!) {
      callback(where: ${where}, order_by: {last_checkin: desc}, limit: $limit) { ${CALLBACK_FIELDS} }
    }`,
    { limit },
  );
  return data?.callback ?? [];
}

export async function getCallback(displayId: number): Promise<MythicCallback | null> {
  const data = await mythicGraphql<{ callback: MythicCallback[] }>(
    `query Callback($displayId: Int!) {
      callback(where: {display_id: {_eq: $displayId}}, limit: 1) { ${CALLBACK_FIELDS} }
    }`,
    { displayId },
  );
  return data?.callback?.[0] ?? null;
}

export async function updateCallback(input: {
  displayId: number;
  description?: string;
  locked?: boolean;
  active?: boolean;
}): Promise<string> {
  const data = await mythicGraphql<{ updateCallback?: { status?: string; error?: string } }>(
    `mutation UpdateCallback($input: updateCallbackInput!) {
      updateCallback(input: $input) {
        status
        error
      }
    }`,
    {
      input: {
        callback_display_id: input.displayId,
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.locked !== undefined ? { locked: input.locked } : {}),
        ...(input.active !== undefined ? { active: input.active } : {}),
      },
    },
  );
  const result = data?.updateCallback;
  if (result?.status && result.status !== "success") {
    throw new MythicError("graphql", result.error || "updateCallback failed");
  }
  return result?.status || "success";
}

// ────────────────────────────────────────────────────────────────────────────────
// Tasking
// ────────────────────────────────────────────────────────────────────────────────

export type MythicTask = {
  id: number;
  display_id: number;
  command_name?: string;
  original_params?: string;
  display_params?: string;
  status?: string;
  completed?: boolean;
  stdout?: string;
  stderr?: string;
  timestamp?: string;
  callback?: { display_id?: number; host?: string; user?: string };
};

const TASK_FIELDS = `
  id
  display_id
  command_name
  display_params
  status
  completed
  timestamp
  callback { display_id host user }
`;

export type IssueTaskInput = {
  callbackDisplayId: number;
  command: string;
  /** Raw parameter string as an operator would type it, or a JSON string for dictionary params. */
  params?: string;
  tokenId?: number;
};

export async function issueTask(input: IssueTaskInput): Promise<{ taskDisplayId: number; status: string }> {
  const data = await mythicGraphql<{
    createTask?: { status?: string; id?: number; display_id?: number; error?: string };
  }>(
    // NOTE: the argument is named `callback_id`, but Mythic expects the callback's
    // DISPLAY id here — confirmed against Mythic's own React UI, which passes
    // `callback_by_pk.display_id`. Do not "fix" this to the internal row id.
    `mutation IssueTask($callbackDisplayId: Int!, $command: String!, $params: String!, $tokenId: Int) {
      createTask(
        callback_id: $callbackDisplayId
        command: $command
        params: $params
        token_id: $tokenId
        tasking_location: "command_line"
      ) {
        status
        id
        display_id
        error
      }
    }`,
    {
      callbackDisplayId: input.callbackDisplayId,
      command: input.command,
      params: input.params ?? "",
      tokenId: input.tokenId ?? null,
    },
  );

  const result = data?.createTask;
  if (!result || (result.status && result.status !== "success")) {
    throw new MythicError("graphql", result?.error || "Mythic rejected the task.");
  }
  if (typeof result.display_id !== "number") {
    throw new MythicError("graphql", "Mythic accepted the task but returned no task id.");
  }
  return { taskDisplayId: result.display_id, status: result.status || "success" };
}

export async function getTask(taskDisplayId: number): Promise<MythicTask | null> {
  const data = await mythicGraphql<{ task: MythicTask[] }>(
    `query Task($taskDisplayId: Int!) {
      task(where: {display_id: {_eq: $taskDisplayId}}, limit: 1) { ${TASK_FIELDS} }
    }`,
    { taskDisplayId },
  );
  return data?.task?.[0] ?? null;
}

export async function getTasks(opts: { callbackDisplayId?: number; limit?: number } = {}): Promise<MythicTask[]> {
  const limit = Math.min(Math.max(opts.limit ?? 25, 1), 100);
  const where =
    typeof opts.callbackDisplayId === "number"
      ? `{callback: {display_id: {_eq: $callbackDisplayId}}}`
      : "{}";
  const varDecl = typeof opts.callbackDisplayId === "number" ? "$callbackDisplayId: Int!, " : "";
  const data = await mythicGraphql<{ task: MythicTask[] }>(
    `query Tasks(${varDecl}$limit: Int!) {
      task(where: ${where}, order_by: {id: desc}, limit: $limit) { ${TASK_FIELDS} }
    }`,
    typeof opts.callbackDisplayId === "number"
      ? { callbackDisplayId: opts.callbackDisplayId, limit }
      : { limit },
  );
  return data?.task ?? [];
}

/** Task output is stored as base64 chunks in the `response` table. */
export async function getTaskOutput(taskDisplayId: number): Promise<string> {
  const data = await mythicGraphql<{ response: Array<{ response_text?: string; response?: string }> }>(
    `query TaskOutput($taskDisplayId: Int!) {
      response(where: {task: {display_id: {_eq: $taskDisplayId}}}, order_by: {id: asc}) {
        response_text
      }
    }`,
    { taskDisplayId },
  );
  const chunks = data?.response ?? [];
  return chunks.map((chunk) => decodeMythicText(chunk.response_text ?? chunk.response)).join("");
}

const TERMINAL_STATUSES = ["completed", "error", "success"];

export function isTaskFinished(task: MythicTask | null): boolean {
  if (!task) return false;
  if (task.completed) return true;
  const status = (task.status || "").toLowerCase();
  return TERMINAL_STATUSES.some((s) => status.includes(s));
}

/**
 * Poll until the task reaches a terminal status or the deadline passes.
 * Polling (not a WS subscription) is deliberate: the tool execution model is
 * request/response with a hard timeout, so a long-lived socket buys nothing.
 */
export async function waitForTaskOutput(
  taskDisplayId: number,
  opts: { timeoutMs?: number; pollIntervalMs?: number } = {},
): Promise<{ task: MythicTask | null; output: string; timedOut: boolean }> {
  const timeoutMs = opts.timeoutMs ?? 120_000;
  const pollIntervalMs = opts.pollIntervalMs ?? 2_000;
  const deadline = Date.now() + timeoutMs;

  let task: MythicTask | null = null;
  while (Date.now() < deadline) {
    task = await getTask(taskDisplayId);
    if (isTaskFinished(task)) {
      return { task, output: await getTaskOutput(taskDisplayId), timedOut: false };
    }
    await sleep(Math.min(pollIntervalMs, Math.max(0, deadline - Date.now())));
  }
  return { task, output: await getTaskOutput(taskDisplayId), timedOut: true };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ────────────────────────────────────────────────────────────────────────────────
// Pivoting — SOCKS / reverse port forwards
// ────────────────────────────────────────────────────────────────────────────────

export type MythicCallbackPort = {
  id: number;
  port_type: string;
  /** Port opened on the MYTHIC SERVER (this is the SOCKS listener for socks entries). */
  local_port?: number;
  remote_port?: number;
  remote_ip?: string;
  deleted?: boolean;
  callback?: { display_id?: number; host?: string; user?: string };
};

export async function getCallbackPorts(callbackDisplayId?: number): Promise<MythicCallbackPort[]> {
  const filters = ["{deleted: {_eq: false}}"];
  if (typeof callbackDisplayId === "number") {
    filters.push("{callback: {display_id: {_eq: $callbackDisplayId}}}");
  }
  const where = `{_and: [${filters.join(", ")}]}`;
  const varDecl = typeof callbackDisplayId === "number" ? "($callbackDisplayId: Int!)" : "";
  const data = await mythicGraphql<{ callbackport: MythicCallbackPort[] }>(
    `query CallbackPorts${varDecl} {
      callbackport(where: ${where}, order_by: {id: desc}) {
        id
        port_type
        local_port
        remote_port
        remote_ip
        deleted
        callback { display_id host user }
      }
    }`,
    typeof callbackDisplayId === "number" ? { callbackDisplayId } : {},
  );
  return data?.callbackport ?? [];
}

// ────────────────────────────────────────────────────────────────────────────────
// Payloads, payload types and C2 profiles
// ────────────────────────────────────────────────────────────────────────────────

export async function getPayloadTypes(): Promise<Array<{ name: string; supported_os?: string; note?: string }>> {
  const data = await mythicGraphql<{ payloadtype: Array<any> }>(
    `query PayloadTypes {
      payloadtype(where: {deleted: {_eq: false}}, order_by: {name: asc}) {
        name
        supported_os
        note
      }
    }`,
  );
  return data?.payloadtype ?? [];
}

export async function getC2Profiles(): Promise<
  Array<{ id: number; name: string; running?: boolean; container_running?: boolean; description?: string }>
> {
  const data = await mythicGraphql<{ c2profile: Array<any> }>(
    `query C2Profiles {
      c2profile(where: {deleted: {_eq: false}}, order_by: {name: asc}) {
        id
        name
        running
        container_running
        description
        is_p2p
      }
    }`,
  );
  return data?.c2profile ?? [];
}

export async function startStopC2Profile(input: {
  id: number;
  action: "start" | "stop";
}): Promise<{ status: string; output?: string; error?: string }> {
  const data = await mythicGraphql<{ startStopProfile?: { status?: string; error?: string; output?: string } }>(
    `mutation StartStopProfile($id: Int!, $action: String!) {
      startStopProfile(id: $id, action: $action) {
        status
        error
        output
      }
    }`,
    { id: input.id, action: input.action },
  );
  const result = data?.startStopProfile;
  if (!result || (result.status && result.status !== "success")) {
    throw new MythicError("graphql", result?.error || `Failed to ${input.action} C2 profile.`);
  }
  return { status: result.status || "success", output: result.output, error: result.error };
}

export type MythicPayload = {
  id: number;
  uuid: string;
  description?: string;
  filemetum?: { agent_file_id?: string; filename_text?: string };
  payloadtype?: { name?: string };
  build_phase?: string;
  build_message?: string;
  os?: string;
};

export async function getPayloads(limit = 25): Promise<MythicPayload[]> {
  const data = await mythicGraphql<{ payload: MythicPayload[] }>(
    `query Payloads($limit: Int!) {
      payload(where: {deleted: {_eq: false}}, order_by: {id: desc}, limit: $limit) {
        id
        uuid
        description
        build_phase
        build_message
        os
        payloadtype { name }
        filemetum { agent_file_id filename_text }
      }
    }`,
    { limit: Math.min(Math.max(limit, 1), 100) },
  );
  return (data?.payload ?? []).map((payload) => ({
    ...payload,
    filemetum: payload.filemetum
      ? { ...payload.filemetum, filename_text: decodeMythicText(payload.filemetum.filename_text) }
      : payload.filemetum,
  }));
}

/**
 * Build a payload. `definition` is Mythic's payload definition object — the same
 * JSON the Mythic UI posts when you click "Generate". Shape is payload-type
 * specific, which is why we take it opaquely rather than modelling it.
 */
export async function createPayload(definition: Record<string, any>): Promise<{ uuid: string; status: string }> {
  const data = await mythicGraphql<{ createPayload?: { status?: string; error?: string; uuid?: string } }>(
    `mutation CreatePayload($payloadDefinition: String!) {
      createPayload(payloadDefinition: $payloadDefinition) {
        status
        error
        uuid
      }
    }`,
    { payloadDefinition: JSON.stringify(definition) },
  );
  const result = data?.createPayload;
  if (result?.uuid) {
    return { uuid: result.uuid, status: result.status || "success" };
  }

  // Mythic's createPayload webhook can return a non-JSON body even when it has
  // accepted the build and started it. Treating that as a hard failure produced a
  // false negative on every single call — builds succeeded while the tool reported
  // an error, and genuine build failures were indistinguishable from it. When we
  // see that specific noise, fall through and let the caller poll build state.
  const message = result?.error || "";
  if (/not a valid json response from webhook/i.test(message)) {
    throw new MythicPayloadSubmitted(message);
  }
  throw new MythicError("graphql", message || "Mythic rejected the payload definition.");
}

/**
 * Signals that Mythic probably started a build but did not return a usable
 * response. The build is real; only the acknowledgement is unreliable, so the
 * caller must resolve the outcome by polling the payload list.
 */
export class MythicPayloadSubmitted extends Error {
  constructor(readonly detail: string) {
    super(detail);
    this.name = "MythicPayloadSubmitted";
  }
}

/**
 * Resolve what a payload build actually did, regardless of what the mutation said.
 * Polls until the newest payload leaves the "building" phase.
 */
export async function waitForPayloadBuild(opts: {
  uuid?: string;
  knownIds?: Set<number>;
  timeoutMs?: number;
}): Promise<MythicPayload | null> {
  const deadline = Date.now() + (opts.timeoutMs ?? 120_000);
  while (Date.now() < deadline) {
    const payloads = await getPayloads(10);
    const match = opts.uuid
      ? payloads.find((p) => p.uuid === opts.uuid)
      : payloads.find((p) => !opts.knownIds?.has(p.id));
    const phase = String(match?.build_phase || "").toLowerCase();
    if (match && phase && phase !== "building" && phase !== "submitted") return match;
    await sleep(3_000);
  }
  const payloads = await getPayloads(10);
  return opts.uuid
    ? payloads.find((p) => p.uuid === opts.uuid) ?? null
    : payloads.find((p) => !opts.knownIds?.has(p.id)) ?? null;
}

// ────────────────────────────────────────────────────────────────────────────────
// Loot — file browser, files, credentials
// ────────────────────────────────────────────────────────────────────────────────

export type MythicFile = {
  id: number;
  agent_file_id: string;
  filename_text?: string;
  full_remote_path_text?: string;
  complete?: boolean;
  is_download_from_agent?: boolean;
  is_screenshot?: boolean;
  chunks_received?: number;
  total_chunks?: number;
  timestamp?: string;
  task?: { display_id?: number; callback?: { display_id?: number; host?: string } };
};

export async function getFiles(opts: { callbackDisplayId?: number; limit?: number } = {}): Promise<MythicFile[]> {
  const limit = Math.min(Math.max(opts.limit ?? 25, 1), 100);
  const where =
    typeof opts.callbackDisplayId === "number"
      ? `{_and: [{deleted: {_eq: false}}, {task: {callback: {display_id: {_eq: $callbackDisplayId}}}}]}`
      : "{deleted: {_eq: false}}";
  const varDecl = typeof opts.callbackDisplayId === "number" ? "$callbackDisplayId: Int!, " : "";
  const data = await mythicGraphql<{ filemeta: MythicFile[] }>(
    `query Files(${varDecl}$limit: Int!) {
      filemeta(where: ${where}, order_by: {id: desc}, limit: $limit) {
        id
        agent_file_id
        filename_text
        full_remote_path_text
        complete
        is_download_from_agent
        is_screenshot
        chunks_received
        total_chunks
        timestamp
        task { display_id callback { display_id host } }
      }
    }`,
    typeof opts.callbackDisplayId === "number" ? { callbackDisplayId: opts.callbackDisplayId, limit } : { limit },
  );
  return (data?.filemeta ?? []).map((file) => ({
    ...file,
    filename_text: decodeMythicText(file.filename_text),
    full_remote_path_text: decodeMythicText(file.full_remote_path_text),
  }));
}

export type MythicTreeNode = {
  id: number;
  name_text?: string;
  full_path_text?: string;
  can_have_children?: boolean;
  success?: boolean;
  tree_type?: string;
  host?: string;
  metadata?: any;
};

/** Mythic's unified file browser is the `mythictree` table (tree_type = "file"). */
export async function getFileBrowserTree(opts: {
  host?: string;
  pathPrefix?: string;
  limit?: number;
}): Promise<MythicTreeNode[]> {
  const limit = Math.min(Math.max(opts.limit ?? 100, 1), 500);
  const filters = [`{tree_type: {_eq: "file"}}`, "{deleted: {_eq: false}}"];
  const vars: Record<string, any> = { limit };
  const decls: string[] = ["$limit: Int!"];
  if (opts.host) {
    filters.push("{host: {_ilike: $host}}");
    decls.push("$host: String!");
    vars.host = opts.host;
  }
  if (opts.pathPrefix) {
    filters.push("{full_path_text: {_ilike: $pathPrefix}}");
    decls.push("$pathPrefix: String!");
    vars.pathPrefix = `${opts.pathPrefix}%`;
  }
  const data = await mythicGraphql<{ mythictree: MythicTreeNode[] }>(
    `query FileBrowser(${decls.join(", ")}) {
      mythictree(where: {_and: [${filters.join(", ")}]}, order_by: {full_path_text: asc}, limit: $limit) {
        id
        host
        name_text
        full_path_text
        can_have_children
        success
        tree_type
        metadata
      }
    }`,
    vars,
  );
  return (data?.mythictree ?? []).map((node) => ({
    ...node,
    name_text: decodeMythicText(node.name_text),
    full_path_text: decodeMythicText(node.full_path_text),
  }));
}

/** Download a file Mythic has already collected, by its agent_file_id. */
export async function downloadFile(
  agentFileId: string,
  conn: MythicConnection = getMythicConnection(),
): Promise<Buffer> {
  const res = await mythicGet(`/direct/download/${encodeURIComponent(agentFileId)}`, conn, "arraybuffer");
  if (res.status === 401 || res.status === 403) throw new MythicError("unauthorized", MYTHIC_UNAUTHORIZED_MSG);
  if (res.status >= 400) {
    throw new MythicError("graphql", `Mythic returned HTTP ${res.status} downloading file ${agentFileId}.`);
  }
  return Buffer.from(res.data);
}

/**
 * Register a file with Mythic so an agent's `upload` command can reference it.
 * Mythic's operator upload route is multipart at /direct/upload and returns the
 * new file's agent_file_id.
 */
export async function uploadFileToMythic(
  input: { filename: string; content: Buffer },
  conn: MythicConnection = getMythicConnection(),
): Promise<string> {
  const boundary = `----pentestcopilot${Math.random().toString(36).slice(2)}`;
  const head = Buffer.from(
    `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="file"; filename="${input.filename.replace(/"/g, "")}"\r\n` +
      `Content-Type: application/octet-stream\r\n\r\n`,
    "utf8",
  );
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`, "utf8");
  const body = Buffer.concat([head, input.content, tail]);

  const client = httpClient(conn);
  let res;
  for (const scheme of authSchemes(conn)) {
    try {
      res = await client.post("/api/v1.4/task_upload_file_webhook", body, {
        maxRedirects: 0,
        headers: {
          "Content-Type": `multipart/form-data; boundary=${boundary}`,
          ...scheme,
          MythicSource: "pentest-copilot",
        },
      });
    } catch (err) {
      throw classifyTransportError(err, conn);
    }
    if (res.status !== 401 && res.status !== 403) break;
  }
  if (!res) throw new MythicError("unknown", "Mythic upload produced no response.");

  if (res.status === 401 || res.status === 403) throw new MythicError("unauthorized", MYTHIC_UNAUTHORIZED_MSG);
  if (res.status >= 400) {
    throw new MythicError("graphql", `Mythic returned HTTP ${res.status} registering the file: ${summarize(res.data)}`);
  }

  const fileId =
    res.data?.agent_file_id || res.data?.files?.[0]?.agent_file_id || res.data?.file_id || res.data?.uuid;
  if (!fileId) {
    throw new MythicError("graphql", `Mythic accepted the upload but returned no file id: ${summarize(res.data)}`);
  }
  return String(fileId);
}

export type MythicCredential = {
  id: number;
  type?: string;
  account?: string;
  realm?: string;
  credential_text?: string;
  comment?: string;
  timestamp?: string;
  task?: { display_id?: number };
};

export async function getCredentials(limit = 50): Promise<MythicCredential[]> {
  const data = await mythicGraphql<{ credential: MythicCredential[] }>(
    `query Credentials($limit: Int!) {
      credential(where: {deleted: {_eq: false}}, order_by: {id: desc}, limit: $limit) {
        id
        type
        account
        realm
        credential_text
        comment
        timestamp
        task { display_id }
      }
    }`,
    { limit: Math.min(Math.max(limit, 1), 200) },
  );
  return data?.credential ?? [];
}

export async function addCredential(input: {
  type: string;
  account: string;
  realm: string;
  credential: string;
  comment?: string;
}): Promise<number> {
  const data = await mythicGraphql<{ createCredential?: { status?: string; error?: string; id?: number } }>(
    `mutation CreateCredential(
      $type: String!, $account: String!, $realm: String!, $credential: String!, $comment: String
    ) {
      createCredential(
        credential_type: $type
        account: $account
        realm: $realm
        credential: $credential
        comment: $comment
      ) {
        status
        error
        id
      }
    }`,
    {
      type: input.type,
      account: input.account,
      realm: input.realm,
      credential: input.credential,
      comment: input.comment ?? "",
    },
  );
  const result = data?.createCredential;
  if (!result || (result.status && result.status !== "success")) {
    throw new MythicError("graphql", result?.error || "Mythic rejected the credential.");
  }
  return result.id ?? 0;
}

/**
 * Map a MythicError (or anything else) onto a friendly single-line tool output.
 * Every handler funnels failures through this so the agent never sees a stack.
 */
export function describeMythicError(err: any): string {
  if (err instanceof MythicError) return err.message;
  if (err?.message) return `Mythic request failed: ${err.message}`;
  return `Mythic request failed: ${String(err)}`;
}
