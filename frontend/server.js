/**
 * ============================================================================
 *  VektorSec — Black-Box API Gateway (custom Next.js server)
 * ============================================================================
 *
 *  This process is the ONLY entry point the browser talks to (port 3001).
 *  It acts as a reverse proxy / BFF (Backend for Frontend):
 *
 *     Browser ──▶ :3001 (this server) ──▶ backend (BACKEND_URI, default :8081)
 *                    │  /api/*            ├── HTTP + SSE (streaming preserved)
 *                    │  /ws/*, /socket.io ├── WebSocket (shell streaming)
 *                    │  /novnc, /websockify ├── noVNC static + RFB WebSocket
 *                    └── everything else ── Next.js request handler
 *
 *  The real backend URL (BACKEND_URI / VNC_ORIGIN_URI) is a server-side
 *  secret: it is NEVER inlined into the client bundle or exposed to the
 *  browser. Cookies (session `sid`) are relayed in both directions so the
 *  existing Redis-backed express-session flow keeps working unchanged.
 *
 *  Run:
 *    dev  ->  pnpm dev       (NODE_ENV=development)
 *    prod ->  pnpm start     (NODE_ENV=production)
 * ============================================================================
 */

const { createServer } = require("http");
const next = require("next");
const httpProxy = require("http-proxy");
const { loadEnvConfig } = require("@next/env");
const { stripSensitiveFields } = require("./gateway/filter");

// The `next` CLI loads .env* automatically; a custom server does not.
// Load them before bootstrapping so BACKEND_URI etc. are available.
loadEnvConfig(process.cwd());

// ── Mode detection (FAIL-SAFE toward production) ─────────────────────────
// A bare `node server.js` with no NODE_ENV serves the OBFUSCATED production
// build. Dev mode (readable code + source maps + HMR) only runs when the
// operator explicitly opts in with NODE_ENV=development (pnpm dev).
const dev = process.env.NODE_ENV === "development" || process.env.NEXT_DEV === "1";
if (!process.env.NODE_ENV) {
  console.warn(
    "[gateway] NODE_ENV is not set — assuming PRODUCTION (fail-safe). " +
      "Use `NODE_ENV=development` for the un-obfuscated dev build.",
  );
}
const port = parseInt(process.env.PORT || "3001", 10);
const hostname = process.env.HOSTNAME || "0.0.0.0";

// ---------------------------------------------------------------------------
// Upstream targets — SERVER ONLY. Never expose these to the client.
// ---------------------------------------------------------------------------
const BACKEND_URI = process.env.BACKEND_URI || "http://localhost:8081";
const VNC_ORIGIN_URI = process.env.VNC_ORIGIN_URI || "http://localhost:6080";

// Response-shaping cap: only JSON bodies up to this size are filtered so we
// can strip sensitive fields without buffering large / streaming payloads.
const MAX_FILTER_BYTES = parseInt(
  process.env.GATEWAY_MAX_FILTER_BYTES || String(2 * 1024 * 1024),
  10,
);

// Extra sensitive-field names to strip, comma-separated (normalized match).
// e.g. GATEWAY_STRIP_KEYS=clientSecret,licenseKey
const EXTRA_STRIP_KEYS = (process.env.GATEWAY_STRIP_KEYS || "")
  .split(",")
  .map((key) => key.trim())
  .filter(Boolean);

const app = next({
  dev,
  hostname,
  port,
  turbopack: dev ? process.env.TURBOPACK !== "0" : false,
});

const handle = app.getRequestHandler();
// NOTE: app.getUpgradeHandler() must only be called AFTER app.prepare() —
// it is resolved lazily below in app.prepare().then().

// ---------------------------------------------------------------------------
// HTTP proxy (selfHandleResponse -> we control the exact response bytes so we
// can hide sensitive fields and apply hardening headers).
// ---------------------------------------------------------------------------
const proxyHttp = httpProxy.createProxyServer({
  changeOrigin: true,
  xfwd: true, // forward X-Forwarded-For so backend rate limiting sees the client IP
  selfHandleResponse: true,
});

// WebSocket proxy (shell streaming, socket.io polling upgrades, noVNC RFB).
const proxyWs = httpProxy.createProxyServer({
  changeOrigin: true,
  xfwd: true,
  ws: true,
});

proxyHttp.on("error", (err, _req, res) => {
  if (!res.headersSent) {
    try {
      res.writeHead(502, { "Content-Type": "application/json" });
    } catch { /* headers already sent */ }
  }
  try {
    res.end(JSON.stringify({ message: "Gateway upstream error", error: err.message }));
  } catch { /* socket gone */ }
});

proxyWs.on("error", (_err, _req, socket) => {
  try { socket.destroy(); } catch { /* already closed */ }
});

/**
 * Response shaping for every proxied HTTP response:
 *  - always adds a few hardening headers,
 *  - JSON responses under MAX_FILTER_BYTES are re-serialised with sensitive
 *    fields removed, so the browser only receives what it needs to render.
 */
proxyHttp.on("proxyRes", (proxyRes, _req, res) => {
  const statusCode = proxyRes.statusCode || 502;
  const contentType = String(proxyRes.headers["content-type"] || "");
  const contentEncoding = String(proxyRes.headers["content-encoding"] || "identity").toLowerCase();

  const isJson = contentType.includes("application/json") || contentType.includes("+json");
  const isStream = contentType.includes("text/event-stream");

  const headers = Object.assign({}, proxyRes.headers);
  // http-proxy does not forward content-length under selfHandleResponse and
  // may leave a stale transfer-encoding; we recompute both here. Keeping
  // content-length AND transfer-encoding together produces an invalid
  // HTTP/1.1 response.
  delete headers["content-length"];
  delete headers["transfer-encoding"];
  headers["X-Content-Type-Options"] = "nosniff";
  headers["X-Frame-Options"] = "SAMEORIGIN";
  headers["Referrer-Policy"] = "strict-origin-when-cross-origin";
  delete headers["x-powered-by"];

  const canFilter = isJson && !isStream && contentEncoding === "identity";

  if (!canFilter) {
    // Streaming / binary / compressed responses: forward untouched.
    res.writeHead(statusCode, headers);
    proxyRes.pipe(res);
    return;
  }

  const chunks = [];
  let size = 0;
  let overflow = false;

  proxyRes.on("data", (chunk) => {
    if (overflow) {
      // Body grew past the filter cap — stream the remainder untouched.
      res.write(chunk);
      return;
    }
    size += chunk.length;
    if (size <= MAX_FILTER_BYTES) {
      chunks.push(chunk);
    } else {
      overflow = true;
      res.writeHead(statusCode, headers);
      for (const buffered of chunks) res.write(buffered);
      res.write(chunk);
    }
  });

  proxyRes.on("end", () => {
    if (overflow) {
      res.end();
      return;
    }
    const original = Buffer.concat(chunks);
    try {
      const filtered = stripSensitiveFields(JSON.parse(original.toString("utf8")), EXTRA_STRIP_KEYS);
      const body = JSON.stringify(filtered);
      res.writeHead(statusCode, Object.assign({}, headers, {
        "content-length": Buffer.byteLength(body),
      }));
      res.end(body);
    } catch {
      // Not valid JSON or stripper failed — fall back to the original payload.
      res.writeHead(statusCode, Object.assign({}, headers, {
        "content-length": original.length,
      }));
      res.end(original);
    }
  });

  proxyRes.on("error", () => {
    try { res.destroy(); } catch { /* already closed */ }
  });
});

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
app
  .prepare()
  .then(() => {
    const upgradeHandler =
      typeof app.getUpgradeHandler === "function" ? app.getUpgradeHandler() : null;

    const server = createServer((req, res) => {
      const url = req.url || "/";

      // API gateway paths -> backend
      if (url.startsWith("/api/") || url === "/mcp" || url.startsWith("/mcp/")) {
        proxyHttp.web(req, res, { target: BACKEND_URI });
        return;
      }
      // noVNC static files + websockify handshake -> VNC origin
      if (url.startsWith("/novnc/") || url.startsWith("/websockify")) {
        proxyHttp.web(req, res, { target: VNC_ORIGIN_URI });
        return;
      }

      // Everything else is handled by Next.js itself.
      handle(req, res);
    });

    // WebSocket upgrade handling.
    server.on("upgrade", (req, socket, head) => {
      const url = req.url || "";

      if (url.startsWith("/ws/") || url.startsWith("/socket.io/")) {
        proxyWs.ws(req, socket, head, { target: BACKEND_URI });
        return;
      }
      if (url.startsWith("/websockify")) {
        proxyWs.ws(req, socket, head, { target: VNC_ORIGIN_URI });
        return;
      }

      // Anything else (e.g. dev-mode HMR) goes to Next's own upgrade handler.
      if (upgradeHandler) {
        upgradeHandler(req, socket, head);
        return;
      }
      socket.destroy();
    });

    server.listen(port, hostname, (err) => {
      if (err) throw err;
      console.log(`[gateway] VektorSec Black-Box gateway listening on http://${hostname}:${port}`);
      console.log(`[gateway] dev=${dev} | BACKEND_URI=${BACKEND_URI} | VNC_ORIGIN_URI=${VNC_ORIGIN_URI}`);
    });
  })
  .catch((err) => {
    console.error("[gateway] Failed to prepare Next.js app:", err);
    process.exit(1);
  });
