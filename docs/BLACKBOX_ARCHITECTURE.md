# Black-Box Architecture (API Gateway / BFF)

> เอกสารนี้อธิบายโครงสร้างที่ปรับปรุงใหม่ของ VektorSec เพื่อให้ "Browser รู้แค่
> Frontend origin เดียว" ส่วน Backend (Business Logic / DB / API Keys / Secrets)
> จะถูกซ่อนไว้หลัง Gateway 100%

## 1. ทำไมต้อง Black-Box

ก่อนปรับปรุง Browser เรียก URL ของ Backend ตรง ๆ เช่น:

```
Browser ──GET/POST──▶ http://localhost:8081/api/...        (axios)
Browser ──WebSocket─▶ ws://localhost:8081/ws/shell          (shell stream)
Browser ──SSE───────▶ http://localhost:8081/api/agent/message
Browser ──noVNC─────▶ http://<backend-host>:6080/vnc.html   (Browser Agent)
```

- `NEXT_PUBLIC_BACKEND_URI` ถูก inline เข้าไปใน JS bundle ที่ Build เวลา ทำให้
  ผู้ใช้งานกด F12 แล้วเห็น endpoint/โครงสร้าง Backend ได้ทันที
- Business Logic, หน้า API, Port ต่าง ๆ เปิดเผยต่อ Client

## 2. สถาปัตยกรรมใหม่

```
                        ┌──────────────────────────────────────────────┐
 Browser (user)         │        Frontend = API Gateway (BFF)          │
   │  เรียกเฉพาะ         │        frontend/server.js  (port 3001)      │
   │  same-origin        │                                              │
   ├─ /api/*            │   ┌────────────────────────────────────┐     │
   ├─ /ws/shell         │   │  http-proxy (HTTP + WebSocket)      │     │
   ├─ /socket.io/*      │   │  - Relay cookies (session sid)      │     │
   ├─ /novnc, /websockify│  │  - Strip sensitive JSON fields      │     │
   └─ หน้าเว็บทั่วไป      │   └────────────────────────────────────┘     │
                        └───────────────────┬──────────────────────────┘
                                            │  server-to-server only
                                            ▼
                        ┌──────────────────────────────────────────────┐
                        │  Backend  (port 8081, อยู่ใน Docker network)  │
                        │  Business Logic / DB / API Keys / Redis       │
                        └──────────────────────────────────────────────┘
```

จุดสำคัญ:

| ข้อ | รายละเอียด |
|----|-----------|
| 1 | Browser **ไม่เคยรู้จัก** `BACKEND_URI` / `VNC_ORIGIN_URI` — เป็นตัวแปรฝั่งเซิร์ฟเวอร์เท่านั้น (ไม่มี prefix `NEXT_PUBLIC_`) |
| 2 | `server.js` proxy ทุกอย่างผ่าน `http-proxy` (`selfHandleResponse`) — ส่งต่อ Cookie ทั้งสองทาง, SSE streaming ผ่านได้ |
| 3 | Response Payload ถูกกรองด้วย `gateway/filter.js` — ฟิลด์ที่เป็น secret ถูกแทนด้วย `[REDACTED]` |
| 4 | WebSocket (`/ws/shell`) และ noVNC (`/novnc`, `/websockify`) proxy ผ่าน Gateway เดียวกัน |
| 5 | `next build` ปิด Source Maps (`productionBrowserSourceMaps: false`) และ obfuscate ทุก client chunk หลัง build |

## 3. ไฟล์ที่เกี่ยวข้อง

### ใหม่
| ไฟล์ | หน้าที่ |
|------|--------|
| `frontend/server.js` | Custom Next.js server = API Gateway (HTTP + WS proxy, response shaping) |
| `frontend/gateway/filter.js` | Recursive stripper สำหรับฟิลด์ sensitive ใน JSON |
| `frontend/src/app/session/[session_id]/browser-agent/page.js` | noVNC iframe = `/novnc/vnc.html` |
| `frontend/.env.example`, `.env` | `BACKEND_URI`, `VNC_ORIGIN_URI` |
| `frontend/Dockerfile` | `CMD ["node", "server.js"]`, `ENV NODE_ENV=production` |
| `docker-compose.yml`, `docker-compose.kali.yml` | ส่ง `BACKEND_URI=http://backend:8081`, `VNC_ORIGIN_URI=http://backend:6080` |
| `backend/.../PaymentGateway.model.ts` + `payment.service.ts` | เพิ่มช่องทาง **Opn Payments / Stripe / 2C2P / GB Prime Pay / GB Pay / K-Payment** และ **mask `secret`** (ส่งแค่ `hasSecret`) เพื่อไม่ให้ secret หลุดลง DOM |
| `frontend/src/components/pages/AdminPaymentPage.jsx` | เพิ่ม label/icon gateway ใหม่ + ฟอร์ม secret แบบ masked placeholder |
| `run.sh` | เปลี่ยนชื่อ env เป็น `BACKEND_URI` |

## 4. ตัวแปร Environment

```
# frontend/.env (Server-side เท่านั้น — อย่าใช้ prefix NEXT_PUBLIC_)
BACKEND_URI=http://localhost:8081          # upstream API (HTTP + WS)
VNC_ORIGIN_URI=http://localhost:6080       # upstream noVNC/websockify
GATEWAY_MAX_FILTER_BYTES=2097152           # ขนาดสูงสุดของ JSON ที่ filter (byte)
GATEWAY_STRIP_KEYS=foo,bar                 # เพิ่มฟิลด์ที่จะ strip (optional)

# Client-side (public)
NEXT_PUBLIC_DEPLOYMENT=LOCAL
```

ใน Docker: `docker-compose.yml` จะ override `BACKEND_URI` ให้ชี้ `http://backend:8081`
(ชื่อ service ใน network) โดยอัตโนมัติ

## 5. Build Pipeline (Production)

`pnpm build` รัน:

```
next build --turbopack
```

**Standard Next.js build เท่านั้น** — Minify + ปิด Source Maps
(`productionBrowserSourceMaps: false`, `turbopack: { debugIds: false }` ใน `next.config.js`)

> ⚠️ **ประวัติ:** เดิมเคยมี `scripts/obfuscate-build.mjs` (javascript-obfuscator) และ
> `scripts/randomize-css-classes.mjs` ถูกถอนออกอย่างเด็ดขาดแล้ว เนื่องจาก:
> - Obfuscator rename identifier จน **object shorthand ใน request payload**
>   (เช่น `{ email, password }`) กลายเป็น key มั่ว → Backend ตอบ **"Invalid credentials"**
> - CSS Module class name randomization ทำให้สไตล์ /admin /login /payment พัง
>
> ตั้งแต่นี้ build จะใช้ของมาตรฐานของ Next.js เท่านั้น → CSS กับ JS class map ตรงกันเสมอ
> และ request payload ถูกต้อง 100%

### Next.js Config ที่ใช้บังคับ
```js
// next.config.js
productionBrowserSourceMaps: false,   // ปิด source maps ฝั่ง browser (ทุก build target)
turbopack: { debugIds: false },       // ปิด debug IDs ที่ Turbopack ฝังลง bundle/map
poweredByHeader: false,
```

> หมายเหตุ: โปรเจกต์นี้ **ไม่มี custom webpack/turbopack plugin** — build ใช้ Turbopack
> เต็มรูปแบบ (การ obfuscate แบบ post-build จึงครอบคลุมทุก chunk ไม่มี plugin ขาดตก)
> ตรวจสอบได้ว่า `next.config.js` ไม่มี `webpack()` hook

### โหมด dev กับ Production (fail-safe)
- `pnpm dev` = `NODE_ENV=development` → มี source maps / โค้ดอ่านง่าย (เพื่อ debug)
- `node server.js` โดยไม่ตั้ง NODE_ENV → **ถือเป็น PRODUCTION อัตโนมัติ** (fail-safe)
- `pnpm start` = `NODE_ENV=production` → obfuscated + ไม่มี source maps

> ถ้าอยากเปิด dev ให้ชัดเจน: `NODE_ENV=development node server.js`
> ถ้าอยากปิด dev source maps ไม่ได้ตั้งค่าผ่าน Next (เป็น feature ของ dev mode)

## 6. Developer Tools (Frontend)

ระบบ anti-inspect เดิม (`src/lib/security/inlineGuard.js`, `src/components/security/SecurityGuard.jsx`,
`src/components/security/AdminSecurityGuard.jsx` — block F12 / Ctrl+Shift+I/J / context menu /
debugger loop) **ถูกลบออกทั้งหมดแล้ว** เพื่อให้เปิด DevTools (F12) และคลิกขวา → Inspect
ได้ตามปกติสำหรับการ debug Console Error / network / element

> หมายเหตุ: Next.js App Router ฝัง **RSC flight payload** (ข้อมูล serialize ของ component)
> ไว้ใน `<script>self.__next_f.push(...)</script>` ใน HTML — นี่คือ **ข้อมูล** ไม่ใช่ซอร์สโค้ด
> ของแอป

## 7. ข้อควรระวัง / Note

1. **OAuth redirect (Google/GitHub):** เบราว์เซอร์เริ่ม OAuth ที่
   `/api/auth/google` (ผ่าน Gateway) แล้ว Google จะ redirect กลับไปที่
   `GOOGLE_OAUTH_REDIRECT_URI` ใน `backend/.env` ถ้าต้องการให้ callback
   ผ่าน Gateway ด้วย ให้ตั้งค่าเป็น URL ของ Frontend เช่น
   `https://vektorsec.ai/api/auth/google/callback` (Gateway จะ forward ต่อให้)
2. **Session cookie:** Backend ใช้ Redis session (`sid`) — Gateway relay
   `Set-Cookie` / `Cookie` ให้อัตโนมัติ ไม่ต้องแก้ backend
3. **VNC/noVNC:** หน้า GUI (Desktop) ที่ผู้ใช้ config URL VNC เอง (settings)
   ยังคงเปิดไปที่ host ที่ผู้ใช้กำหนดได้ (เป็นคุณสมบัติปกติ) ส่วน Browser Agent
   noVNC จะผ่าน Gateway เสมอ
4. **ถ้า dev บนเครื่องตัวเอง:** รัน `docker compose -f docker-compose.dev.yml up -d`
   (mongo+redis) แล้ว `cd backend && pnpm run dev`, `cd frontend && pnpm run dev`
   — Gateway จะ proxy ไป `BACKEND_URI=http://localhost:8081`
5. **กด F12 แล้วเห็น Source Maps:** ตรวจได้ว่าไม่มี `*.js.map` ใน `.next/static`
   และ `productionBrowserSourceMaps` ต้องเป็น `false`

