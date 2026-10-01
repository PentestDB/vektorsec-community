# Black-Box Architecture (API Gateway / BFF)

> 🇹🇭 **ไทย**: [สถาปัตยกรรม Black-Box](../BLACKBOX_ARCHITECTURE.md)

> This document explains VektorSec's revised structure, where "the browser only knows a
> single frontend origin" while the backend (business logic / DB / API keys / secrets)
> is hidden 100% behind the gateway.

## 1. Why Black-Box

Previously the browser called backend URLs directly, for example:

```
Browser ──GET/POST──▶ http://localhost:8081/api/...        (axios)
Browser ──WebSocket─▶ ws://localhost:8081/ws/shell          (shell stream)
Browser ──SSE───────▶ http://localhost:8081/api/agent/message
Browser ──noVNC─────▶ http://<backend-host>:6080/vnc.html   (Browser Agent)
```

- `NEXT_PUBLIC_BACKEND_URI` was inlined into the JS bundle at build time, so a user could
  press F12 and immediately see backend endpoints and structure.
- Business logic, API surface and ports were all exposed to the client.

## 2. The New Architecture

```
                        ┌──────────────────────────────────────────────┐
 Browser (user)         │        Frontend = API Gateway (BFF)          │
   │  calls only         │        frontend/server.js  (port 3001)      │
   │  same-origin        │                                              │
   ├─ /api/*            │   ┌────────────────────────────────────┐     │
   ├─ /ws/shell         │   │  http-proxy (HTTP + WebSocket)      │     │
   ├─ /socket.io/*      │   │  - Relay cookies (session sid)      │     │
   ├─ /novnc, /websockify│  │  - Strip sensitive JSON fields      │     │
   └─ regular pages      │   └────────────────────────────────────┘     │
                        └───────────────────┬──────────────────────────┘
                                            │  server-to-server only
                                            ▼
                        ┌──────────────────────────────────────────────┐
                        │  Backend  (port 8081, inside the Docker net)  │
                        │  Business Logic / DB / API Keys / Redis       │
                        └──────────────────────────────────────────────┘
```

Key points:

| # | Detail |
|---|-----------|
| 1 | The browser **never sees** `BACKEND_URI` / `VNC_ORIGIN_URI` — they are server-side variables only (no `NEXT_PUBLIC_` prefix) |
| 2 | `server.js` proxies everything through `http-proxy` (`selfHandleResponse`) — cookies are relayed both ways and SSE streaming passes through |
| 3 | Response payloads are filtered by `gateway/filter.js` — secret fields are replaced with `[REDACTED]` |
| 4 | WebSocket (`/ws/shell`) and noVNC (`/novnc`, `/websockify`) are proxied through the same gateway |
| 5 | `next build` disables source maps (`productionBrowserSourceMaps: false`); standard Next.js minification is used for client chunks |

## 3. Related Files

### New
| File | Purpose |
|------|--------|
| `frontend/server.js` | Custom Next.js server = API Gateway (HTTP + WS proxy, response shaping) |
| `frontend/gateway/filter.js` | Recursive stripper for sensitive fields in JSON |
| `frontend/src/app/session/[session_id]/browser-agent/page.js` | noVNC iframe = `/novnc/vnc.html` |
| `frontend/.env.example`, `.env` | `BACKEND_URI`, `VNC_ORIGIN_URI` |
| `frontend/Dockerfile` | `CMD ["node", "server.js"]`, `ENV NODE_ENV=production` |
| `docker-compose.yml`, `docker-compose.kali.yml` | Pass `BACKEND_URI=http://backend:8081`, `VNC_ORIGIN_URI=http://backend:6080` |
| `backend/.../PaymentGateway.model.ts` + `payment.service.ts` | Adds **Opn Payments / Stripe / 2C2P / GB Prime Pay / GB Pay / K-Payment** and **masks `secret`** (only `hasSecret` is returned) so secrets never reach the DOM |
| `frontend/src/components/pages/AdminPaymentPage.jsx` | Adds labels/icons for the new gateways + masked-placeholder secret form |
| `run.sh` | Renamed the env var to `BACKEND_URI` |

## 4. Environment Variables

```
# frontend/.env (server-side only — do NOT use the NEXT_PUBLIC_ prefix)
BACKEND_URI=http://localhost:8081          # upstream API (HTTP + WS)
VNC_ORIGIN_URI=http://localhost:6080       # upstream noVNC/websockify
GATEWAY_MAX_FILTER_BYTES=2097152           # max size of a JSON body to filter (bytes)
GATEWAY_STRIP_KEYS=foo,bar                 # extra fields to strip (optional)

# Client-side (public)
NEXT_PUBLIC_DEPLOYMENT=LOCAL
```

In Docker, `docker-compose.yml` automatically overrides `BACKEND_URI` to point at
`http://backend:8081` (the service name inside the network).

## 5. Build Pipeline (Production)

`pnpm build` runs:

```
next build --turbopack
```

**A standard Next.js build only** — minify + source maps disabled
(`productionBrowserSourceMaps: false`, `turbopack: { debugIds: false }` in `next.config.js`)

> ⚠️ **History:** `scripts/obfuscate-build.mjs` (javascript-obfuscator) and
> `scripts/randomize-css-classes.mjs` used to exist and were removed for good because:
> - The obfuscator renamed identifiers until **object shorthand in request payloads**
>   (e.g. `{ email, password }`) turned into random keys → the backend replied **"Invalid credentials"**
> - CSS Module class-name randomization broke the styles of /admin /login /payment
>
> From now on builds use stock Next.js only → CSS and JS class maps always match and
> request payloads are 100% correct.

### Enforced Next.js Config
```js
// next.config.js
productionBrowserSourceMaps: false,   // no browser source maps (every build target)
turbopack: { debugIds: false },       // no debug IDs embedded by Turbopack
poweredByHeader: false,
```

> Note: this project has **no custom webpack/turbopack plugin** — builds use Turbopack
> fully (so post-build transformations would cover every chunk with no missing plugin).
> You can verify that `next.config.js` has no `webpack()` hook.

### Dev vs Production mode (fail-safe)
- `pnpm dev` = `NODE_ENV=development` → source maps on / readable code (for debugging)
- `node server.js` without NODE_ENV → **treated as PRODUCTION automatically** (fail-safe)
- `pnpm start` = `NODE_ENV=production` → minified + no source maps

> To force dev explicitly: `NODE_ENV=development node server.js`
> (you cannot disable dev source maps through Next — it is a dev-mode feature)

## 6. Developer Tools (Frontend)

The old anti-inspect system (`src/lib/security/inlineGuard.js`, `src/components/security/SecurityGuard.jsx`,
`src/components/security/AdminSecurityGuard.jsx` — blocking F12 / Ctrl+Shift+I/J / context menu /
debugger loops) **has been removed entirely** so you can open DevTools (F12) and right-click → Inspect
normally to debug console errors, network traffic and elements.

> Note: the Next.js App Router embeds an **RSC flight payload** (serialised component data)
> in `<script>self.__next_f.push(...)</script>` inside the HTML — that is **data**, not the
> application source code.

## 7. Notes / Caveats

1. **OAuth redirect (Google/GitHub):** the browser starts OAuth at
   `/api/auth/google` (through the gateway), then Google redirects back to
   `GOOGLE_OAUTH_REDIRECT_URI` from `backend/.env`. If you want the callback to come
   back through the gateway too, set it to a frontend URL such as
   `https://vektorsec.ai/api/auth/google/callback` (the gateway forwards it).
2. **Session cookie:** the backend uses a Redis session (`sid`) — the gateway relays
   `Set-Cookie` / `Cookie` automatically, so no backend change is needed.
3. **VNC/noVNC:** the GUI (Desktop) page where users configure their own VNC URL (settings)
   still connects to the host the user provides (that is expected behaviour). Browser Agent
   noVNC always goes through the gateway.
4. **If you develop locally:** run `docker compose -f docker-compose.dev.yml up -d`
   (mongo+redis), then `cd backend && pnpm run dev` and `cd frontend && pnpm run dev`
   — the gateway proxies to `BACKEND_URI=http://localhost:8081`.
5. **Press F12 and still see source maps?** Verify there is no `*.js.map` in `.next/static`
   and that `productionBrowserSourceMaps` is `false`.

---

## 📚 See Also

- [System Summary](./SYSTEM_SUMMARY.md)
- [Architecture Plan](./ARCHITECTURE_PLAN.md)
- [Install Guide](./INSTALL_GUIDE.md)
- [README.md](../../README.md)
