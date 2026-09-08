/**
 * Integration test for the VektorSec Black-Box gateway (frontend/server.js).
 *
 * Spins up a mock backend (HTTP + WebSocket) on :8081, starts the gateway on
 * :3001 in production mode, and verifies:
 *   - HTTP proxying + sensitive-field stripping
 *   - SSE streaming is forwarded untouched
 *   - WebSocket /ws/* is proxied end-to-end
 *   - Next.js page serving + security headers + no x-powered-by
 *   - client chunks are served minified / source maps absent
 *
 * Run:  node scripts/test-gateway.mjs
 */

import { spawn } from "child_process";
import { createServer } from "http";
import { readdirSync, existsSync } from "fs";
import { join } from "path";
import { createRequire } from "module";

const require = createRequire(import.meta.url);

const ROOT = process.cwd();
const GATEWAY_PORT = 3001;
const BACKEND_PORT = 8081;

// Locate `ws` inside pnpm's isolated store (not hoisted to node_modules root).
function resolveWs() {
  const pnpmDir = join(ROOT, "node_modules", ".pnpm");
  if (!existsSync(pnpmDir)) return null;
  const dir = readdirSync(pnpmDir).find((d) => /^ws@/.test(d));
  if (!dir) return null;
  const candidate = join(pnpmDir, dir, "node_modules", "ws");
  return existsSync(candidate) ? candidate : null;
}

const WS_PATH = resolveWs();
// `ws` exports the WebSocket class directly; the server lives at `.Server`.
const wsModule = WS_PATH ? require(join(WS_PATH, "index.js")) : null;
const WebSocket = wsModule;
const WebSocketServer = wsModule ? wsModule.Server : null;

let failures = 0;
const check = (name, ok, detail = "") => {
  const icon = ok ? "PASS" : "FAIL";
  if (!ok) failures += 1;
  console.log(`[${icon}] ${name}${detail ? ` — ${detail}` : ""}`);
};

// ---------------------------------------------------------------- mock backend
const mockBackend = createServer((req, res) => {
  const url = req.url || "/";

  if (url === "/api/healthcheck") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        ok: true,
        user: { name: "tester", passwordHash: "super-secret-hash", role: "user" },
        list: [1, 2, 3],
      }),
    );
    return;
  }

  if (url === "/api/stream") {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    res.write("event: start\ndata: {\"n\":1}\n\n");
    setTimeout(() => res.write("data: {\"n\":2}\n\n"), 30);
    setTimeout(() => {
      res.write("data: {\"n\":3}\n\n");
      res.end();
    }, 60);
    return;
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ message: "not found" }));
});

const wss = WS_PATH ? new WebSocketServer({ server: mockBackend, path: "/ws/shell" }) : null;
if (wss) {
  wss.on("connection", (ws, req) => {
    const url = new URL(req.url, "http://localhost");
    if (!url.searchParams.get("sessionId")) {
      ws.close(1008, "missing sessionId");
      return;
    }
    ws.on("message", (data) => ws.send(`echo:${data}`));
  });
}

await new Promise((resolve) => mockBackend.listen(BACKEND_PORT, "127.0.0.1", resolve));
console.log(`[mock] backend on :${BACKEND_PORT} (ws ${wss ? "enabled" : "UNAVAILABLE — skipped"})`);

// --------------------------------------------------------------------- gateway
const gateway = spawn(
  process.execPath,
  [join(ROOT, "server.js")],
  {
    cwd: ROOT,
    env: {
      ...process.env,
      NODE_ENV: "production",
      PORT: String(GATEWAY_PORT),
      BACKEND_URI: `http://127.0.0.1:${BACKEND_PORT}`,
      VNC_ORIGIN_URI: `http://127.0.0.1:${BACKEND_PORT}`,
      HOSTNAME: "127.0.0.1",
    },
    stdio: ["ignore", "pipe", "pipe"],
  },
);

gateway.stdout.on("data", (d) => process.stdout.write(`[gateway] ${d}`));
gateway.stderr.on("data", (d) => process.stderr.write(`[gateway:err] ${d}`));

async function waitReady(url, timeoutMs = 60000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const r = await fetch(url);
      if (r.status === 200) return true;
    } catch {
      /* not up yet */
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return false;
}

const base = `http://127.0.0.1:${GATEWAY_PORT}`;
const ready = await waitReady(`${base}/api/healthcheck`, 60000);
check("gateway is up", ready);

try {
  if (ready) {
    // 1) JSON filtering
    const r = await fetch(`${base}/api/healthcheck`);
    const json = await r.json();
    check("proxy forwards JSON body", json.ok === true, JSON.stringify(json));
    check(
      "sensitive field stripped",
      json.user?.passwordHash === "[REDACTED]",
      `passwordHash=${JSON.stringify(json.user?.passwordHash)}`,
    );
    check("non-sensitive fields kept", json.user?.role === "user" && json.list.length === 3);

    // 2) hardening headers
    const h = await fetch(`${base}/`);
    const headers = h.headers;
    check("page served (200)", h.status === 200);
    check("x-content-type-options: nosniff", headers.get("x-content-type-options") === "nosniff");
    check("content-security-policy present", (headers.get("content-security-policy") || "").includes("default-src 'self'"));
    check("no x-powered-by", !headers.get("x-powered-by"));
    const html = await h.text();
    check("page contains HTML", /<html/i.test(html));

    // 3) SSE streaming through the gateway
    const sseRes = await fetch(`${base}/api/stream`);
    const sseText = await sseRes.text();
    check("SSE streamed end-to-end", sseText.includes('"n":3') && sseText.includes("event: start"), sseText.replace(/\n/g, "\\n").slice(0, 120));

    // 4) client chunk serving (minified, no source maps)
    const htmlForChunk = await (await fetch(`${base}/login`)).text();
    const srcMatch = htmlForChunk.match(/src="(\/_next\/static\/chunks\/[^"]+\.js)"/);
    check("found a client chunk in HTML", !!srcMatch, srcMatch?.[1] || "");
    if (srcMatch) {
      const chunk = await (await fetch(`${base}${srcMatch[1]}`)).text();
      check("client chunk is served", chunk.length > 0);
      check("no sourceMappingURL in chunk", !chunk.includes("sourceMappingURL"));
    }

    // 5) WebSocket proxying
    if (wss) {
      await new Promise((resolve) => setTimeout(resolve, 300));
      const ws = new WebSocket(`${base.replace("http", "ws")}/ws/shell?sessionId=s1`);
      const wsOk = await new Promise((resolve) => {
        const timer = setTimeout(() => resolve(false), 8000);
        ws.onopen = () => ws.send("hello");
        ws.onmessage = (ev) => {
          clearTimeout(timer);
          resolve(ev.data === "echo:hello");
          ws.close();
        };
        ws.onerror = () => { clearTimeout(timer); resolve(false); };
      });
      check("WebSocket proxied end-to-end", wsOk, `payload="echo:hello"`);
    }
  }
} catch (err) {
  console.error("[test] unexpected error:", err);
  failures += 1;
} finally {
  gateway.kill("SIGTERM");
  await new Promise((resolve) => mockBackend.close(resolve));
  console.log(failures === 0 ? "\nALL TESTS PASSED" : `\n${failures} TEST(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

