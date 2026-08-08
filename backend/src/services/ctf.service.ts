import axios, { AxiosInstance } from "axios";
import * as cheerio from "cheerio";
import { execOnWorkspaceHost, resolveWorkspaceWorkHost } from "./work-host.service";

const CHALLENGE_DETAIL_CONCURRENCY = 8;
const CHALLENGE_SYNC_CONCURRENCY = 4;

export interface CTFdChallenge {
  id: number;
  name: string;
  category: string;
  description: string;
  value: number;
  files: string[];
  connection_info: string;
}

export interface SyncProgressEvent {
  phase: "fetch" | "sync" | "done" | "error";
  current?: number;
  total?: number;
  name?: string;
  action?: "new" | "updated" | "skipped";
  detail?: string;
  synced?: number;
  updated?: number;
  skipped?: number;
}

export type ProgressCallback = (event: SyncProgressEvent) => void;

class WorkHostSession {
  constructor(private readonly workspaceId: string) {}
  async connect(): Promise<void> {
    await resolveWorkspaceWorkHost(this.workspaceId);
  }
  async exec(command: string): Promise<string> {
    const result = await execOnWorkspaceHost(this.workspaceId, command);
    if (result.code !== 0) throw new Error(result.stderr || result.stdout || `Command failed (${result.code})`);
    return `${result.stdout}${result.stderr}`;
  }
  close(): void {
    // Commands own their short-lived transport; there is nothing to retain.
  }
}

export function sanitizeDirName(name: string): string {
  return name
    .replace(/[\/\\:*?"<>|]/g, "_")
    .replace(/\s+/g, "_")
    .replace(/\.{2,}/g, "_")
    .replace(/^\.+|\.+$/g, "")
    .substring(0, 200);
}

/**
 * CTFd page routes people naturally copy out of the address bar. Only these are
 * stripped, so CTFd instances hosted under a sub-path (https://host/ctf) keep
 * working — blindly discarding the whole path would break them.
 */
const CTFD_PAGE_ROUTES = new Set([
  "challenges",
  "scoreboard",
  "users",
  "teams",
  "team",
  "login",
  "register",
  "settings",
  "profile",
  "notifications",
  "setup",
]);

/**
 * Normalises a user-entered CTFd URL to the instance root: adds a scheme if
 * missing, drops query/hash, and removes a trailing page route such as
 * `/challenges` (the page you are usually looking at when you copy the URL).
 */
export function normalizeCtfdUrl(input: string): string {
  let raw = (input || "").trim();
  if (!raw) return "";
  if (!/^https?:\/\//i.test(raw)) raw = `https://${raw}`;

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return raw.replace(/\/+$/, "");
  }

  const segments = parsed.pathname.split("/").filter(Boolean);
  while (segments.length > 0 && CTFD_PAGE_ROUTES.has(segments[segments.length - 1].toLowerCase())) {
    segments.pop();
  }

  const path = segments.length > 0 ? `/${segments.join("/")}` : "";
  return `${parsed.origin}${path}`.replace(/\/+$/, "");
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function shellEscape(s: string): string {
  return s.replace(/'/g, "'\\''");
}

function buildClient(baseURL: string, cookie?: string, token?: string): AxiosInstance {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Token ${token}`;
  if (cookie) headers["Cookie"] = cookie;
  return axios.create({ baseURL, headers, maxRedirects: 5, timeout: 30_000 });
}

export async function loginWithCredentials(
  url: string,
  username: string,
  password: string,
): Promise<{ sessionCookie: string; ctfName: string }> {
  const baseURL = url.replace(/\/+$/, "");

  const loginPageRes = await axios.get(`${baseURL}/login`, {
    maxRedirects: 5,
    timeout: 15_000,
    headers: { "User-Agent": "VektorSec/1.0" },
  });

  const $ = cheerio.load(loginPageRes.data);
  const nonce = $('input[name="nonce"]').val() as string;
  if (!nonce) throw new Error("Could not extract CSRF nonce from CTFd login page");

  const ctfName = $("title").text().trim().replace(/\s*\|.*$/, "") || "CTF";

  const params = new URLSearchParams();
  params.append("name", username);
  params.append("password", password);
  params.append("nonce", nonce);
  params.append("_submit", "Submit");

  const loginRes = await axios.post(`${baseURL}/login`, params.toString(), {
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": "VektorSec/1.0",
      Cookie: extractSetCookies(loginPageRes.headers["set-cookie"]),
    },
    maxRedirects: 0,
    validateStatus: (s) => s >= 200 && s < 400,
    timeout: 15_000,
  });

  const setCookies = loginRes.headers["set-cookie"];
  if (!setCookies || setCookies.length === 0) {
    throw new Error("Login failed - no session cookie received. Check your credentials.");
  }

  const sessionCookie = extractSetCookies(setCookies);
  if (!sessionCookie) {
    throw new Error("Login failed - could not parse session cookie.");
  }

  return { sessionCookie, ctfName };
}

export class CtfConnectError extends Error {
  constructor(
    message: string,
    /** Machine-readable cause so callers can decide whether it is fatal. */
    readonly code: "bad_url" | "bad_token" | "not_available" | "unreachable",
    readonly status?: number,
  ) {
    super(message);
    this.name = "CtfConnectError";
  }
}

async function fetchCtfName(baseURL: string): Promise<string> {
  try {
    const pageRes = await axios.get(baseURL, {
      timeout: 10_000,
      headers: { "User-Agent": "PentestCopilot/1.0" },
    });
    const $ = cheerio.load(pageRes.data);
    return $("title").text().trim().replace(/\s*\|.*$/, "") || "CTF";
  } catch {
    return "CTF";
  }
}

export interface VerifyTokenResult {
  ctfName: string;
  /**
   * False when the token is valid but CTFd will not serve challenges yet —
   * typically because the event has not started, or (in team mode) the account
   * has not joined a team. The workspace is still usable; sync succeeds later.
   */
  challengesAvailable: boolean;
  /** Human-readable reason when challengesAvailable is false. */
  unavailableReason?: string;
}

export async function verifyToken(url: string, token: string): Promise<VerifyTokenResult> {
  const baseURL = url.replace(/\/+$/, "");
  const client = buildClient(baseURL, undefined, token);

  try {
    const res = await client.get("/api/v1/challenges", { params: { limit: 1 } });
    if (!res.data?.success) {
      throw new CtfConnectError("CTFd rejected the API token.", "bad_token");
    }
    return { ctfName: await fetchCtfName(baseURL), challengesAvailable: true };
  } catch (err: any) {
    if (err instanceof CtfConnectError) throw err;

    const status = err?.response?.status;

    if (status === 404) {
      throw new CtfConnectError(
        "No CTFd API found at that URL. Use the site root (for example https://ctf.example.com), not a page like /challenges.",
        "bad_url",
        404,
      );
    }

    if (status === 401) {
      throw new CtfConnectError(
        "CTFd rejected the API token. Generate a new token in your CTFd profile settings.",
        "bad_token",
        401,
      );
    }

    // 403 with an accepted token means CTFd is withholding challenges rather
    // than refusing the credential — the event has not opened, or team mode
    // requires joining a team first. Connect anyway and let the user sync later.
    if (status === 403) {
      return {
        ctfName: await fetchCtfName(baseURL),
        challengesAvailable: false,
        unavailableReason:
          "CTFd is not serving challenges yet. This usually means the event has not started, " +
          "or the CTF runs in team mode and your account has not joined a team. " +
          "Use Sync Challenges once it opens.",
      };
    }

    throw new CtfConnectError(
      `Could not reach the CTFd API (${err?.message ?? "unknown error"}).`,
      "unreachable",
      status,
    );
  }
}

/**
 * Try to detect a common flag format pattern from challenge descriptions.
 * Looks for patterns like "flag format is FLAG{...}", "flags look like CTF{...}", etc.
 */
export function detectFlagFormat(challenges: CTFdChallenge[]): string | null {
  const patterns = [
    /flag\s*format\s*(?:is|:)\s*[`"']?([A-Za-z0-9_-]+\{[^}]*\})[`"']?/i,
    /flags?\s+(?:look|are)\s+like\s*[`"']?([A-Za-z0-9_-]+\{[^}]*\})[`"']?/i,
    /submit\s+(?:in\s+)?(?:the\s+)?format\s*[`"':]\s*([A-Za-z0-9_-]+\{[^}]*\})[`"']?/i,
    /([A-Za-z0-9_-]{2,})\{[a-zA-Z0-9_.*?!]+\}/,
  ];

  const prefixCounts = new Map<string, number>();

  for (const ch of challenges) {
    const text = ch.description || "";
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        const prefix = match[1]?.split("{")[0] || match[0]?.split("{")[0];
        if (prefix && prefix.length >= 2 && prefix.length <= 30) {
          prefixCounts.set(prefix, (prefixCounts.get(prefix) || 0) + 1);
        }
      }
    }
  }

  if (prefixCounts.size === 0) return null;

  const sorted = [...prefixCounts.entries()].sort((a, b) => b[1] - a[1]);
  const bestPrefix = sorted[0][0];
  return `${bestPrefix}{...}`;
}

export async function fetchChallenges(
  url: string,
  cookie?: string,
  token?: string,
  onProgress?: ProgressCallback,
): Promise<CTFdChallenge[]> {
  const baseURL = url.replace(/\/+$/, "");
  const client = buildClient(baseURL, cookie, token);

  console.log(`[CTF] Fetching challenge list from ${baseURL}...`);
  let listRes;
  try {
    listRes = await client.get("/api/v1/challenges");
  } catch (err: any) {
    const status = err?.response?.status;
    // Same distinction as verifyToken: 403 means CTFd is withholding challenges
    // (event not open, or team mode with no team), not that auth is broken.
    if (status === 403) {
      throw new CtfConnectError(
        "CTFd is not serving challenges yet — the event may not have started, or you need to join a team first.",
        "not_available",
        403,
      );
    }
    if (status === 401) {
      throw new CtfConnectError(
        "CTFd rejected the stored credentials. Re-authenticate this workspace.",
        "bad_token",
        401,
      );
    }
    throw err;
  }
  if (!listRes.data?.success) throw new Error("Failed to fetch challenges from CTFd");

  const rawChallenges: any[] = listRes.data.data || [];
  const challenges: CTFdChallenge[] = [];
  const total = rawChallenges.length;
  console.log(`[CTF] Found ${total} challenges, fetching details with concurrency ${CHALLENGE_DETAIL_CONCURRENCY}...`);

  let completed = 0;
  const results = await mapLimit(rawChallenges, CHALLENGE_DETAIL_CONCURRENCY, async (ch: any) => {
    try {
      const detailRes = await client.get(`/api/v1/challenges/${ch.id}`);
      const detail = detailRes.data?.data || {};

      const files: string[] = (detail.files || [])
        .map((f: any) => (typeof f === "string" ? f : f.location || ""))
        .filter(Boolean);

      return {
        id: ch.id,
        name: detail.name || ch.name,
        category: detail.category || ch.category || "Uncategorized",
        description: stripHtml(detail.description || ""),
        value: detail.value ?? ch.value ?? 0,
        files,
        connection_info: (detail.connection_info || "").trim(),
      };
    } catch (err: any) {
      console.warn(`[CTF] Failed to fetch details for challenge ${ch.id}: ${err.message}`);
      return {
        id: ch.id,
        name: ch.name,
        category: ch.category || "Uncategorized",
        description: "",
        value: ch.value ?? 0,
        files: [],
        connection_info: "",
      };
    } finally {
      completed++;
      onProgress?.({
        phase: "fetch",
        current: completed,
        total,
        name: ch.name,
      });
    }
  });

  challenges.push(...results);
  return challenges;
}

export async function syncToWorkspace(
  workspaceId: string,
  ctfName: string,
  challenges: CTFdChallenge[],
  ctfdBaseURL: string,
  cookie?: string,
  token?: string,
  onProgress?: ProgressCallback,
): Promise<{ synced: number; updated: number; skipped: number }> {
  const ssh = new WorkHostSession(workspaceId);
  try {
    await ssh.connect();
  } catch (err: any) {
    throw new Error(
      `The workspace work host is not reachable or its folder is unavailable. ` +
      `${err?.code ? `(${err.code})` : ""}`,
    );
  }

  try {
    return await doSync(workspaceId, ssh, ctfName, challenges, ctfdBaseURL, cookie, token, onProgress);
  } finally {
    ssh.close();
  }
}

async function mapLimit<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  const workerCount = Math.min(Math.max(limit, 1), items.length);

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (nextIndex < items.length) {
        const index = nextIndex++;
        results[index] = await worker(items[index], index);
      }
    }),
  );

  return results;
}

async function doSync(
  workspaceId: string,
  ssh: WorkHostSession,
  ctfName: string,
  challenges: CTFdChallenge[],
  ctfdBaseURL: string,
  cookie?: string,
  token?: string,
  onProgress?: ProgressCallback,
): Promise<{ synced: number; updated: number; skipped: number }> {
  const safeCTFName = sanitizeDirName(ctfName);
  const baseURL = ctfdBaseURL.replace(/\/+$/, "");

  // Work-host commands already start in the workspace folder. Relative paths
  // avoid accidentally quoting away remote ~/ expansion.
  const ctfDir = safeCTFName;

  console.log(`[CTF] Starting sync for "${ctfName}" -> ${ctfDir}`);

  await ssh.exec(`mkdir -p "${ctfDir}"`);

  const existingRaw = await ssh.exec(`ls -1 "${ctfDir}" 2>/dev/null || true`);
  const existingDirs = new Set(
    existingRaw.split("\n").map((l) => l.trim()).filter(Boolean),
  );

  const curlAuth = buildCurlAuth(cookie, token);

  const total = challenges.length;
  console.log(`[CTF] Syncing challenge files with concurrency ${CHALLENGE_SYNC_CONCURRENCY}...`);

  let completed = 0;
  const actions = await mapLimit(challenges, CHALLENGE_SYNC_CONCURRENCY, async (ch) => {
    const workerSsh = new WorkHostSession(workspaceId);
    await workerSsh.connect();
    try {
      const action = await syncChallenge(workerSsh, ch, ctfDir, baseURL, curlAuth, existingDirs);
      completed++;
      onProgress?.({ phase: "sync", current: completed, total, name: ch.name, action });
      if (completed === 1 || completed % 10 === 0 || completed === total) {
        console.log(`[CTF] Progress: ${completed}/${total} challenges processed`);
      }
      return action;
    } finally {
      workerSsh.close();
    }
  });

  const synced = actions.filter((action) => action === "new").length;
  const updated = actions.filter((action) => action === "updated").length;
  const skipped = actions.filter((action) => action === "skipped").length;

  console.log(`[CTF] Sync complete: ${synced} new, ${updated} updated, ${skipped} unchanged`);

  const index = challenges.map((ch) => ({
    id: ch.id,
    name: ch.name,
    category: ch.category,
    value: ch.value,
    safeDir: sanitizeDirName(ch.name),
    connection_info: ch.connection_info || undefined,
  }));
  const indexJson = JSON.stringify(index, null, 2).replace(/'/g, "'\\''");
  await ssh.exec(`printf '%s' '${indexJson}' > "${ctfDir}/challenges.json"`);
  console.log(`[CTF] Wrote challenges.json with ${index.length} entries`);

  return { synced, updated, skipped };
}

async function syncChallenge(
  ssh: WorkHostSession,
  ch: CTFdChallenge,
  ctfDir: string,
  baseURL: string,
  curlAuth: string,
  existingDirs: Set<string>,
): Promise<"new" | "updated" | "skipped"> {
  const safeName = sanitizeDirName(ch.name);
  const challengeDir = `${ctfDir}/${safeName}`;
  const isExisting = existingDirs.has(safeName);

  if (!isExisting) {
    const challengeTxt = buildChallengeTxt(ch);
    await ssh.exec(`mkdir -p "${challengeDir}"`);
    await writeChallengeTxt(ssh, challengeDir, challengeTxt);

    for (const filePath of ch.files) {
      await downloadChallengeFile(ssh, challengeDir, filePath, baseURL, curlAuth);
    }

    return "new";
  }

  let didUpdate = false;
  const challengeTxt = buildChallengeTxt(ch);
  const oldContent = await ssh.exec(
    `cat "${challengeDir}/challenge.txt" 2>/dev/null || echo ""`,
  );

  if (oldContent.trim() !== challengeTxt.trim()) {
    await writeChallengeTxt(ssh, challengeDir, challengeTxt);
    didUpdate = true;
  }

  if (ch.files.length > 0) {
    const existingFilesRaw = await ssh.exec(
      `ls -1 "${challengeDir}" 2>/dev/null || true`,
    );
    const existingFiles = new Set(
      existingFilesRaw.split("\n").map((l) => l.trim()).filter(Boolean),
    );

    for (const filePath of ch.files) {
      const fileName = extractFileName(filePath);
      if (existingFiles.has(fileName)) continue;

      await downloadChallengeFile(ssh, challengeDir, filePath, baseURL, curlAuth);
      didUpdate = true;
    }
  }

  return didUpdate ? "updated" : "skipped";
}

async function writeChallengeTxt(ssh: WorkHostSession, challengeDir: string, content: string): Promise<void> {
  const escaped = content.replace(/\\/g, "\\\\").replace(/'/g, "'\\''");
  await ssh.exec(`printf '%s' '${escaped}' > "${challengeDir}/challenge.txt"`);
}

async function downloadChallengeFile(
  ssh: WorkHostSession,
  challengeDir: string,
  filePath: string,
  baseURL: string,
  curlAuth: string,
): Promise<void> {
  const fileName = extractFileName(filePath);
  const fileUrl = resolveFileUrl(filePath, baseURL);
  await ssh.exec(
    `curl -sS -L --retry 3 --max-time 120 ${curlAuth} -o '${shellEscape(`${challengeDir}/${fileName}`)}' '${shellEscape(fileUrl)}'`,
  );
}

function buildCurlAuth(cookie?: string, token?: string): string {
  const parts: string[] = [];
  if (token) parts.push(`-H 'Authorization: Token ${shellEscape(token)}'`);
  if (cookie) parts.push(`-b '${shellEscape(cookie)}'`);
  return parts.join(" ");
}

function resolveFileUrl(filePath: string, baseURL: string): string {
  return filePath.startsWith("http")
    ? filePath
    : `${baseURL}/${filePath.replace(/^\//, "")}`;
}

function extractFileName(filePath: string): string {
  const rawName = filePath.split("?")[0].split("/").pop() || "attachment";
  return sanitizeDirName(decodeURIComponent(rawName));
}

function buildChallengeTxt(ch: CTFdChallenge): string {
  const lines = [
    `Challenge: ${ch.name}`,
    `Category: ${ch.category}`,
    `Points: ${ch.value}`,
  ];
  if (ch.connection_info) {
    lines.push(`Connection: ${ch.connection_info}`);
  }
  lines.push("", "Description:", ch.description || "(no description)");
  return lines.join("\n");
}

export interface CtfdSubmitResult {
  status: "correct" | "incorrect" | "already_solved" | "unknown";
  message: string;
  /** HTTP status from CTFd for the attempt request */
  httpStatus?: number;
  /** Parsed JSON body from CTFd (for debugging; do not log secrets elsewhere) */
  rawData?: unknown;
}

function isRetryableStatus(status?: number): boolean {
  return status === 429 || status === 502 || status === 503 || status === 504;
}


function extractCtfdMessage(body: unknown, status: number): string {
  const msg = (body as any)?.data?.message;
  if (typeof msg === "string" && msg.trim()) return msg.trim();

  if (typeof body === "string" && body.trim()) {
    const stripped = stripHtml(body).replace(/\s+/g, " ").trim();
    if (stripped) return stripped.slice(0, 220);
  }

  return `CTFd returned HTTP ${status}`;
}

async function postWithRetry(
  url: string,
  data: Record<string, any>,
  config: any,
  label: string,
): Promise<any> {
  const delays = [0, 1000, 2500];
  let lastRes: any = null;

  for (let i = 0; i < delays.length; i += 1) {
    if (delays[i] > 0) await sleep(delays[i]);

    const res = await axios.post(url, data, config);
    lastRes = res;

    if (!isRetryableStatus(res.status)) {
      return res;
    }

    console.warn(`[CTF] ${label} got retryable HTTP ${res.status} (attempt ${i + 1}/${delays.length})`);
  }

  return lastRes;
}

export async function submitFlagToCtfd(
  url: string,
  challengeId: number,
  flag: string,
  cookie?: string,
  token?: string,
): Promise<CtfdSubmitResult> {
  const baseURL = url.replace(/\/+$/, "");
  const payload = { challenge_id: challengeId, submission: flag.trim() };

  const attemptUrl = `${baseURL}/api/v1/challenges/attempt`;
  const logCtx = { challengeId, attemptUrl, auth: token ? "token" : "session_cookie" };

  if (token) {
    const res = await postWithRetry(
      attemptUrl,
      payload,
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Token ${token}`,
        },
        timeout: 30_000,
        validateStatus: () => true,
      },
      "submitFlag(token)",
    );
    const status = res.data?.data?.status ?? "unknown";
    const message = extractCtfdMessage(res.data, res.status);
    console.log(
      `[CTF submitFlagToCtfd] token auth req=${JSON.stringify({ ...logCtx, payload })} res=${JSON.stringify({
        httpStatus: res.status,
        body: res.data,
      })}`,
    );
    return { status, message, httpStatus: res.status, rawData: res.data };
  }

  if (!cookie) {
    console.warn(`[CTF submitFlagToCtfd] no cookie and no token`, logCtx);
    return { status: "unknown", message: "No auth credentials available" };
  }

  // Session-cookie auth: need CSRF nonce from the same session
  const csrfNonce = await fetchCsrfNonce(baseURL, cookie);
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Cookie: cookie,
  };
  if (csrfNonce) headers["CSRF-Token"] = csrfNonce;

  let res = await postWithRetry(
    attemptUrl,
    payload,
    {
      headers,
      timeout: 30_000,
      validateStatus: () => true, // don't throw on 403
    },
    "submitFlag(session)",
  );

  // Retry once on 403 — CSRF nonce may have gone stale
  if (res.status === 403 && csrfNonce) {
    console.warn("[CTF submitFlagToCtfd] 403, retrying with fresh CSRF nonce...");
    const freshNonce = await fetchCsrfNonce(baseURL, cookie, true);
    if (freshNonce && freshNonce !== csrfNonce) {
      headers["CSRF-Token"] = freshNonce;
      res = await postWithRetry(
        attemptUrl,
        payload,
        {
          headers,
          timeout: 30_000,
          validateStatus: () => true,
        },
        "submitFlag(session,csrf-retry)",
      );
    }
  }

  const sessionLog = {
    ...logCtx,
    payload,
    csrfPresent: !!csrfNonce,
    httpStatus: res.status,
    body: res.data,
  };
  console.log(`[CTF submitFlagToCtfd] session auth ${JSON.stringify(sessionLog)}`);

  if (res.status === 403) {
    console.error("[CTF submitFlagToCtfd] still 403 after CSRF retry. Cookie may have expired.");
    return {
      status: "unknown",
      message: "CTFd returned 403 — session may have expired. Re-connect CTFd.",
      httpStatus: res.status,
      rawData: res.data,
    };
  }

  if (res.status >= 400) {
    return {
      status: "unknown",
      message: extractCtfdMessage(res.data, res.status),
      httpStatus: res.status,
      rawData: res.data,
    };
  }

  const status = res.data?.data?.status ?? "unknown";
  const message = extractCtfdMessage(res.data, res.status);
  return { status, message, httpStatus: res.status, rawData: res.data };
}

async function fetchCsrfNonce(baseURL: string, cookie: string, bustCache = false): Promise<string | null> {
  try {
    const cacheBuster = bustCache ? `?_=${Date.now()}` : "";
    const res = await axios.get(`${baseURL}/challenges${cacheBuster}`, {
      headers: { Cookie: cookie, "User-Agent": "VektorSec/1.0" },
      timeout: 10_000,
      maxRedirects: 5,
    });
    const match = res.data.match(/csrfNonce':\s*"([A-Fa-f0-9]+)"/);
    if (!match) console.warn("[CTF] Could not extract csrfNonce from /challenges page");
    return match ? match[1] : null;
  } catch (err: any) {
    console.warn("[CTF] fetchCsrfNonce failed:", err.message);
    return null;
  }
}

export async function fetchSolvedChallengeNames(
  url: string,
  cookie?: string,
  token?: string,
): Promise<Set<string>> {
  const baseURL = url.replace(/\/+$/, "");
  const client = buildClient(baseURL, cookie, token);
  const delays = [0, 1000, 2500];

  for (let i = 0; i < delays.length; i += 1) {
    try {
      if (delays[i] > 0) await sleep(delays[i]);

      const meRes = await client.get("/api/v1/users/me");
      const userData = meRes.data?.data || {};

      let solvesPath: string;
      if (userData.team_id) {
        solvesPath = `/api/v1/teams/${userData.team_id}/solves`;
      } else if (userData.id) {
        solvesPath = `/api/v1/users/${userData.id}/solves`;
      } else {
        return new Set();
      }

      const solvesRes = await client.get(solvesPath);
      const solves: any[] = solvesRes.data?.data || [];
      return new Set(
        solves
          .map((s: any) => s.challenge?.name)
          .filter(Boolean),
      );
    } catch (err: any) {
      const status = err?.response?.status;
      const isRetryable = isRetryableStatus(status);
      const attempt = i + 1;
      const total = delays.length;
      console.warn(
        `[CTF] Failed to fetch solved names (attempt ${attempt}/${total})`,
        status ? `HTTP ${status}` : err.message,
      );
      if (!isRetryable || attempt === total) {
        return new Set();
      }
    }
  }

  return new Set();
}

function extractSetCookies(setCookies: string[] | undefined): string {
  if (!setCookies) return "";
  return setCookies.map((c) => c.split(";")[0]).join("; ");
}

function stripHtml(html: string): string {
  const $ = cheerio.load(html);
  return $.text().trim();
}

// ─── Challenge focus ─────────────────────────────────────────────────

export interface FocusedChallenge {
  name: string;
  safeDir: string;
  category: string;
  points: number;
  challengeDir: string;
  challengeTxt: string;
  files: string[];
}

export type FocusChallengeResult =
  | { ok: true; challenge: FocusedChallenge }
  | { ok: false; reason: FocusFailureReason; message: string; candidates?: string[] };

export type FocusFailureReason =
  | "session_not_found"
  | "no_ctf"
  | "work_host_unavailable"
  | "not_synced"
  | "no_match"
  | "ambiguous";

/**
 * Points a session at a specific CTF challenge: resolves the challenge from the
 * work host's synced `challenges.json`, records it as the session's activeSolve
 * and opens a solveHistory entry.
 *
 * Shared by the `/solve` slash command and the workspace-level "solve all" so
 * both produce identical session state. Returns a result object rather than
 * writing to SSE, since only the slash command has a client attached.
 */
export async function focusSessionOnChallenge(params: {
  sessionId: string;
  query: string;
  userNotes?: string;
  /**
   * Mirror the choice onto the workspace's single activeSolve field. Correct for
   * an interactive `/solve`, but meaningless during a bulk start where every
   * session targets a different challenge and the last writer would simply win.
   */
  syncWorkspaceActiveSolve?: boolean;
}): Promise<FocusChallengeResult> {
  const { sessionId, query, userNotes = "", syncWorkspaceActiveSolve = false } = params;

  const SessionsModel = (await import("../models/Sessions/Sessions.model")).default;
  const WorkspaceModel = (await import("../models/Workspace/Workspace.model")).default;
  const { execOnWorkHost } = await import("./work-host.service");

  const session = await SessionsModel.findOne({ sessionId });
  if (!session) {
    return { ok: false, reason: "session_not_found", message: "Session not found." };
  }

  let ctfConfig: any = session.ctfConfig;
  if (!ctfConfig?.ctfName && session.workspaceId) {
    const workspace = await WorkspaceModel.findOne({ workspaceId: session.workspaceId }).lean();
    if (workspace?.ctfConfig?.ctfName) ctfConfig = workspace.ctfConfig;
  }
  if (!ctfConfig?.ctfName) {
    return {
      ok: false,
      reason: "no_ctf",
      message: "No CTF connected. Connect to a CTFd instance first.",
    };
  }

  const ctfDir = sanitizeDirName(ctfConfig.ctfName);

  try {
    const probe = await execOnWorkHost(sessionId, "pwd", 10_000);
    if (probe.code !== 0) throw new Error(probe.stderr || "Work host unavailable");
  } catch {
    return {
      ok: false,
      reason: "work_host_unavailable",
      message:
        "Cannot access this workspace's work host and folder. Open Connection and verify the host.",
    };
  }

  let challenges: Array<{
    id?: number;
    name: string;
    category: string;
    value: number;
    safeDir: string;
    connection_info?: string;
  }> = [];
  try {
    const result = await execOnWorkHost(sessionId, `cat "${ctfDir}/challenges.json" 2>/dev/null || echo "[]"`);
    challenges = JSON.parse(`${result.stdout}${result.stderr}`.trim());
  } catch {
    return {
      ok: false,
      reason: "not_synced",
      message: "No challenges synced yet. Run sync from the CTF settings panel first.",
    };
  }
  if (challenges.length === 0) {
    return {
      ok: false,
      reason: "not_synced",
      message: "No challenges synced yet. Run sync from the CTF settings panel first.",
    };
  }

  const queryLower = query.trim().toLowerCase();
  let matched = challenges.filter((c) => c.name.toLowerCase() === queryLower);
  if (matched.length === 0) matched = challenges.filter((c) => c.safeDir.toLowerCase() === queryLower);
  if (matched.length === 0) matched = challenges.filter((c) => c.name.toLowerCase().includes(queryLower));
  if (matched.length === 0) matched = challenges.filter((c) => c.safeDir.toLowerCase().includes(queryLower));

  if (matched.length === 0) {
    return {
      ok: false,
      reason: "no_match",
      message: `No challenge matching "${query}" found.`,
      candidates: challenges.map((c) => `${c.name} (${c.category}, ${c.value} pts)`),
    };
  }
  if (matched.length > 1) {
    const exact = matched.filter((c) => c.name.toLowerCase() === queryLower);
    if (exact.length === 1) {
      matched = exact;
    } else {
      return {
        ok: false,
        reason: "ambiguous",
        message: `Multiple challenges match "${query}". Be more specific.`,
        candidates: matched.map((c) => `${c.name} (${c.category}, ${c.value} pts)`),
      };
    }
  }

  const challenge = matched[0];
  const challengeDir = `${ctfDir}/${challenge.safeDir}`;

  let challengeTxt = "";
  try {
    const result = await execOnWorkHost(sessionId, `cat "${challengeDir}/challenge.txt" 2>/dev/null`);
    challengeTxt = `${result.stdout}${result.stderr}`;
  } catch {
    challengeTxt = `Challenge: ${challenge.name}\nCategory: ${challenge.category}\nPoints: ${challenge.value}`;
  }

  let files: string[] = [];
  try {
    const result = await execOnWorkHost(sessionId, `ls -1 "${challengeDir}" 2>/dev/null`);
    files = `${result.stdout}${result.stderr}`
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l && l !== "challenge.txt");
  } catch {}

  const activeSolve = {
    name: challenge.name,
    safeDir: challenge.safeDir,
    challengeTxt,
    files,
    category: challenge.category || undefined,
    points: challenge.value || undefined,
    connectionInfo: challenge.connection_info || undefined,
    userNotes: userNotes || undefined,
    setAt: new Date(),
  };

  const update: any = { $set: { "ctfConfig.activeSolve": activeSolve } };

  const existing = await SessionsModel.findOne({ sessionId }).select("ctfConfig.solveHistory").lean();
  const alreadyTracked = (existing?.ctfConfig?.solveHistory ?? []).some(
    (r: any) => r.challengeName === challenge.name,
  );
  if (!alreadyTracked) {
    update.$push = {
      "ctfConfig.solveHistory": {
        challengeName: challenge.name,
        challengeId: challenge.id || undefined,
        safeDir: challenge.safeDir,
        category: challenge.category || "",
        status: "solving",
        attempts: 0,
        startedAt: new Date(),
        submittedToCtfd: false,
      },
    };
  }

  await SessionsModel.updateOne({ sessionId }, update);

  if (syncWorkspaceActiveSolve && session.workspaceId) {
    await WorkspaceModel.updateOne(
      { workspaceId: session.workspaceId },
      { $set: { "ctfConfig.activeSolve": activeSolve } },
    ).catch(() => {});
  }

  return {
    ok: true,
    challenge: {
      name: challenge.name,
      safeDir: challenge.safeDir,
      category: challenge.category || "",
      points: challenge.value || 0,
      challengeDir,
      challengeTxt,
      files,
    },
  };
}
