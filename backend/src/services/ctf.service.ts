import axios, { AxiosInstance } from "axios";
import * as cheerio from "cheerio";
import { Client as SSHClient } from "ssh2";
import { buildSSHConfig } from "../utils/sshConfig";
import { WORKSPACE_DIR } from "../utils/commandSafety";

export interface CTFdChallenge {
  id: number;
  name: string;
  category: string;
  description: string;
  value: number;
  files: string[];
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

class SSHSession {
  private client: SSHClient | null = null;
  private ready = false;

  async connect(): Promise<void> {
    const config = buildSSHConfig();
    return new Promise((resolve, reject) => {
      const client = new SSHClient();
      client
        .on("ready", () => {
          this.client = client;
          this.ready = true;
          resolve();
        })
        .on("error", (err) => {
          this.ready = false;
          reject(err);
        })
        .on("close", () => {
          this.ready = false;
        })
        .connect({ ...config, keepaliveInterval: 10_000, readyTimeout: 30_000 });
    });
  }

  async exec(command: string): Promise<string> {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        if (!this.client || !this.ready) {
          console.warn("[CTF] SSH session lost, reconnecting...");
          try { this.client?.end(); } catch {}
          this.client = null;
          await this.connect();
        }
        return await this.doExec(command);
      } catch (err: any) {
        this.ready = false;
        if (attempt === 3) throw err;
        const delay = 1500 * attempt;
        console.warn(`[CTF] SSH exec attempt ${attempt} failed, retrying in ${delay}ms...`);
        await sleep(delay);
        try { this.client?.end(); } catch {}
        this.client = null;
      }
    }
    throw new Error("SSH exec failed after retries");
  }

  private doExec(command: string): Promise<string> {
    return new Promise((resolve, reject) => {
      this.client!.exec(command, (err, stream) => {
        if (err) {
          this.ready = false;
          return reject(err);
        }
        let output = "";
        stream.on("data", (data: Buffer) => { output += data.toString(); });
        stream.stderr.on("data", (data: Buffer) => { output += data.toString(); });
        stream.on("close", () => resolve(output));
      });
    });
  }

  close(): void {
    if (this.client) {
      try { this.client.end(); } catch {}
      this.client = null;
      this.ready = false;
    }
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
    headers: { "User-Agent": "PentestCopilot/1.0" },
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
      "User-Agent": "PentestCopilot/1.0",
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

export async function verifyToken(url: string, token: string): Promise<string> {
  const baseURL = url.replace(/\/+$/, "");
  const client = buildClient(baseURL, undefined, token);
  const res = await client.get("/api/v1/challenges", { params: { limit: 1 } });
  if (!res.data?.success) throw new Error("API token verification failed");

  const pageRes = await axios.get(baseURL, { timeout: 10_000, headers: { "User-Agent": "PentestCopilot/1.0" } });
  const $ = cheerio.load(pageRes.data);
  return $("title").text().trim().replace(/\s*\|.*$/, "") || "CTF";
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
  const listRes = await client.get("/api/v1/challenges");
  if (!listRes.data?.success) throw new Error("Failed to fetch challenges from CTFd");

  const rawChallenges: any[] = listRes.data.data || [];
  const challenges: CTFdChallenge[] = [];
  const total = rawChallenges.length;
  console.log(`[CTF] Found ${total} challenges, fetching details...`);

  for (let i = 0; i < rawChallenges.length; i++) {
    const ch = rawChallenges[i];
    onProgress?.({
      phase: "fetch",
      current: i + 1,
      total,
      name: ch.name,
    });

    try {
      const detailRes = await client.get(`/api/v1/challenges/${ch.id}`);
      const detail = detailRes.data?.data || {};

      const files: string[] = (detail.files || [])
        .map((f: any) => (typeof f === "string" ? f : f.location || ""))
        .filter(Boolean);

      challenges.push({
        id: ch.id,
        name: detail.name || ch.name,
        category: detail.category || ch.category || "Uncategorized",
        description: stripHtml(detail.description || ""),
        value: detail.value ?? ch.value ?? 0,
        files,
      });
    } catch (err: any) {
      console.warn(`[CTF] Failed to fetch details for challenge ${ch.id}: ${err.message}`);
      challenges.push({
        id: ch.id,
        name: ch.name,
        category: ch.category || "Uncategorized",
        description: "",
        value: ch.value ?? 0,
        files: [],
      });
    }
  }

  return challenges;
}

export async function syncToWorkspace(
  ctfName: string,
  challenges: CTFdChallenge[],
  ctfdBaseURL: string,
  cookie?: string,
  token?: string,
  onProgress?: ProgressCallback,
): Promise<{ synced: number; updated: number; skipped: number }> {
  const ssh = new SSHSession();
  await ssh.connect();

  try {
    return await doSync(ssh, ctfName, challenges, ctfdBaseURL, cookie, token, onProgress);
  } finally {
    ssh.close();
  }
}

async function doSync(
  ssh: SSHSession,
  ctfName: string,
  challenges: CTFdChallenge[],
  ctfdBaseURL: string,
  cookie?: string,
  token?: string,
  onProgress?: ProgressCallback,
): Promise<{ synced: number; updated: number; skipped: number }> {
  const safeCTFName = sanitizeDirName(ctfName);
  const baseURL = ctfdBaseURL.replace(/\/+$/, "");

  // Resolve ~ to actual home path so it works inside quotes
  const home = (await ssh.exec("echo $HOME")).trim();
  const resolvedWorkspace = WORKSPACE_DIR.replace(/^~/, home);
  const ctfDir = `${resolvedWorkspace}/${safeCTFName}`;

  console.log(`[CTF] Starting sync for "${ctfName}" -> ${ctfDir}`);

  await ssh.exec(`mkdir -p "${ctfDir}"`);

  const existingRaw = await ssh.exec(`ls -1 "${ctfDir}" 2>/dev/null || true`);
  const existingDirs = new Set(
    existingRaw.split("\n").map((l) => l.trim()).filter(Boolean),
  );

  const curlAuth = buildCurlAuth(cookie, token);

  let synced = 0;
  let updated = 0;
  let skipped = 0;
  const total = challenges.length;

  for (let i = 0; i < challenges.length; i++) {
    const ch = challenges[i];
    const safeName = sanitizeDirName(ch.name);
    const challengeDir = `${ctfDir}/${safeName}`;
    const isExisting = existingDirs.has(safeName);

    if (isExisting) {
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

          const fileUrl = resolveFileUrl(filePath, baseURL);
          await ssh.exec(
            `curl -sS -L --retry 3 --max-time 120 ${curlAuth} -o '${shellEscape(`${challengeDir}/${fileName}`)}' '${shellEscape(fileUrl)}'`,
          );
          didUpdate = true;
        }
      }

      if (didUpdate) {
        updated++;
        onProgress?.({ phase: "sync", current: i + 1, total, name: ch.name, action: "updated" });
      } else {
        skipped++;
        onProgress?.({ phase: "sync", current: i + 1, total, name: ch.name, action: "skipped" });
      }
    } else {
      const challengeTxt = buildChallengeTxt(ch);

      await ssh.exec(`mkdir -p "${challengeDir}"`);
      await writeChallengeTxt(ssh, challengeDir, challengeTxt);

      for (const filePath of ch.files) {
        const fileName = extractFileName(filePath);
        const fileUrl = resolveFileUrl(filePath, baseURL);
        await ssh.exec(
          `curl -sS -L --retry 3 --max-time 120 ${curlAuth} -o '${shellEscape(`${challengeDir}/${fileName}`)}' '${shellEscape(fileUrl)}'`,
        );
      }

      synced++;
      onProgress?.({ phase: "sync", current: i + 1, total, name: ch.name, action: "new" });
    }

    if (i % 10 === 0) {
      console.log(`[CTF] Progress: ${i + 1}/${total} challenges processed`);
    }
  }

  console.log(`[CTF] Sync complete: ${synced} new, ${updated} updated, ${skipped} unchanged`);

  const index = challenges.map((ch) => ({
    name: ch.name,
    category: ch.category,
    value: ch.value,
    safeDir: sanitizeDirName(ch.name),
  }));
  const indexJson = JSON.stringify(index, null, 2).replace(/'/g, "'\\''");
  await ssh.exec(`printf '%s' '${indexJson}' > "${ctfDir}/challenges.json"`);
  console.log(`[CTF] Wrote challenges.json with ${index.length} entries`);

  return { synced, updated, skipped };
}

async function writeChallengeTxt(ssh: SSHSession, challengeDir: string, content: string): Promise<void> {
  const escaped = content.replace(/\\/g, "\\\\").replace(/'/g, "'\\''");
  await ssh.exec(`printf '%s' '${escaped}' > "${challengeDir}/challenge.txt"`);
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
  return [
    `Challenge: ${ch.name}`,
    `Category: ${ch.category}`,
    `Points: ${ch.value}`,
    ``,
    `Description:`,
    ch.description || "(no description)",
  ].join("\n");
}

function extractSetCookies(setCookies: string[] | undefined): string {
  if (!setCookies) return "";
  return setCookies.map((c) => c.split(";")[0]).join("; ");
}

function stripHtml(html: string): string {
  const $ = cheerio.load(html);
  return $.text().trim();
}
