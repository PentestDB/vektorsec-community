# 📘 VektorSec — Quick Reference & Admin Manual (ฉบับสมบูรณ์)

> 🇬🇧 **English**: [Quick Reference & Admin Manual](./en/QUICK_REFERENCE.md)

เอกสารอ้างอิงฉบับเดียวที่รวม **Token/Secrets, API Endpoints, Panel Links, และคู่มือการใช้งาน** สำหรับ Admin/Developer

---

## 📑 สารบัญ

1. [ข้อมูลการเข้าถึงระบบ (URLs)](#-ข้อมูลการเข้าถึงระบบ-urls)
2. [Secrets & Token ที่สำคัญ](#-secrets--token-ที่สำคัญ)
3. [วิธีการสร้าง Bot Token (Telegram)](#-วิธีการสร้าง-bot-token-telegram)
4. [API Endpoints ทั้งหมด](#-api-endpoints-ทั้งหมด)
   - [Authentication](#-authentication)
   - [Billing / Plans](#-billing--plans)
   - [Payment](#-payment)
   - [Subscription](#-subscription)
   - [Telegram Bot](#-telegram-bot)
   - [Agent / Task / Workspace](#-agent--task--workspace)
5. [Panel / หน้าเว็บทั้งหมด](#-panel--หน้าเว็บทั้งหมด)
6. [คู่มือการใช้งาน Admin](#-คู่มือการใช้งาน-admin)
   - [ตั้งค่า Model (จำเป็น)](#1-ตั้งค่า-model-จำเป็น)
   - [จัดการ Plans & ราคา](#2-จัดการ-plans--ราคา)
   - [ตั้งค่า Payment Gateway](#3-ตั้งค่า-payment-gateway)
   - [ตั้งค่า Telegram Bot](#4-ตั้งค่า-telegram-bot)
   - [Link ผู้ใช้ Telegram กับ Platform](#5-link-ผู้ใช้-telegram-กับ-platform)
   - [ยืนยันการชำระเงิน](#6-ยืนยันการชำระเงิน)
   - [จัดการ Subscription](#7-จัดการ-subscription)
7. [คำสั่ง Telegram Bot](#-คำสั่ง-telegram-bot)
8. [การ Troubleshooting](#-การ-troubleshooting)

---

## 🔗 ข้อมูลการเข้าถึงระบบ (URLs)

| ระบบ | URL (Local) | ใน Docker |
|------|-------------|-----------|
| **Frontend (Web App)** | `http://localhost:3001` | `http://localhost:3001` |
| **Backend API** | `http://localhost:8081` | `http://localhost:8081` |
| **Healthcheck** | `http://localhost:8081/api/healthcheck` | — |
| **Readiness (Mongo + Redis)** | `http://localhost:8081/api/ready` → `{"status":"ready"}` (503 = ยังไม่พร้อม) | — |
| **Kali Box (ถ้ามี)** | ผ่าน Agent ในหน้าเว็บ | — |

---

## 🔑 Secrets & Token ที่สำคัญ

### ไฟล์ที่ใช้เก็บ: `backend/.env` หรือ `config.toml`

| ตัวแปร | จำเป็น? | คำอธิบาย |
|--------|---------|----------|
| `MONGO_URI` | ✅ จำเป็น | MongoDB connection string |
| `REDIS_URL` | ✅ จำเป็น | Redis connection string (สำหรับ session) |
| `SESS_SECRET` | ✅ จำเป็น | Session secret (≥ 32 ตัวอักษร) |
| `DEPLOYMENT` | ✅ จำเป็น | `LOCAL` หรือ `PRODUCTION` |
| `TELEGRAM_BOT_TOKEN` | ⬜ ไม่บังคับ | Token จาก @BotFather (เปิด Telegram Bot) |
| `ANTHROPIC_OAUTH_ACCESS_TOKEN` | ⬜ ไม่บังคับ | OAuth token สำหรับ Claude |
| `ANTHROPIC_OAUTH_REFRESH_TOKEN` | ⬜ ไม่บังคับ | OAuth refresh token |
| `ANTHROPIC_OAUTH_EXPIRES_AT` | ⬜ ไม่บังคับ | OAuth expiry timestamp |
| `SSH_PASSWORD` | ⬜ ไม่บังคับ | SSH password สำหรับ Exploit Box |
| `SSH_PRIVATE_KEY` | ⬜ ไม่บังคับ | SSH private key |
| `SSH_PRIVATE_KEY_PASSPHRASE` | ⬜ ไม่บังคับ | Passphrase ของ private key |
| `CORS_ORIGINS` | ⬜ ไม่บังคับ | รายชื่อ origins เพิ่มเติม (คั่นด้วย `,`) |
| `GOOGLE-API-KEY` | ⬜ ไม่บังคับ | Google Custom Search API key |
| `CUSTOM-SEARCH-ENGINE-ID` | ⬜ ไม่บังคับ | Google Custom Search Engine ID |
| `LANGFUSE_ENABLED` | ⬜ ไม่บังคับ | เปิด/ปิด Langfuse tracing |
| `LANGFUSE_PUBLIC_KEY` | ⬜ ไม่บังคับ | Langfuse public key |
| `LANGFUSE_SECRET_KEY` | ⬜ ไม่บังคับ | Langfuse secret key |
| `LANGFUSE_BASE_URL` | ⬜ ไม่บังคับ | Langfuse base URL |
| `TOOLS_EXTENSIONS_DIR` | ⬜ ไม่บังคับ | โฟลเดอร์ plugin ที่จะโหลดอัตโนมัติตอน start (ค่าเริ่มต้น `backend/src/tools/extensions/`) |
| `LOG_LEVEL` | ⬜ ไม่บังคับ | ระดับ log: `debug`\|`info`\|`warn`\|`error` (ค่าเริ่มต้น debug ใน dev, info ใน production) |
| `LOG_JSON` | ⬜ ไม่บังคับ | `1` = ออก log เป็น JSON บรรทัดเดียว (ค่าเริ่มต้นเปิดเมื่อ production) |
| `NOTIFY_WEBHOOK_URL` | ⬜ ไม่บังคับ | URL ปลายทางแจ้งเตือน (Slack/Discord/LINE/webhook) — ไม่ตั้ง = ปิดฟีเจอร์ |
| `NOTIFY_WEBHOOK_KIND` | ⬜ ไม่บังคับ | `generic`\|`slack`\|`discord`\|`line` (ค่าเริ่มต้น generic) |
| `NOTIFY_MIN_SEVERITY` | ⬜ ไม่บังคับ | ระดับต่ำสุดที่จะส่ง: `info`\|`warning`\|`critical` |
| `NOTIFY_TYPES` | ⬜ ไม่บังคับ | รายการ event ที่จะส่ง คั่นด้วย `,` (เช่น `payment_confirmed,agent_run_failed`) |

> ⚠️ **ห้าม commit ไฟล์ `.env` ลง Git** — `.gitignore` มีไว้แล้ว

---

## 🤖 วิธีการสร้าง Bot Token (Telegram)

1. เปิด Telegram → ค้นหา **@BotFather**
2. พิมพ์ `/newbot`
3. ตั้งชื่อ Bot → ตั้ง Username (ลงท้ายด้วย `bot`)
4. BotFather จะให้ **Token** (รูปแบบ `123456789:ABCdef...`)
5. เก็บ Token ลง `.env`:
   ```env
   TELEGRAM_BOT_TOKEN=123456789:ABCdef...
   ```
6. Restart server → Bot จะเริ่มทำงานอัตโนมัติ
   - log: `[telegram] Starting Telegram bot polling...`

---

## 🛠️ API Endpoints ทั้งหมด

> Base URL: `http://localhost:8081` (backend)

### 🔐 Authentication

| Method | Endpoint | Auth | คำอธิบาย |
|--------|----------|------|----------|
| POST | `/api/auth/register` | Public | สมัครสมาชิก (rate-limited) |
| POST | `/api/auth/login` | Public | เข้าสู่ระบบ (rate-limited) |
| POST | `/api/auth/logout` | Session | ออกจากระบบ |
| GET | `/api/auth/status` | Session | ตรวจสอบ session |
| POST | `/api/auth/2fa/setup` | Session | ตั้งค่า 2FA |
| POST | `/api/auth/2fa/verify` | Session | ยืนยัน 2FA setup |
| POST | `/api/auth/2fa/disable` | Session | ปิด 2FA |

### 💳 Billing / Plans

| Method | Endpoint | Auth | คำอธิบาย |
|--------|----------|------|----------|
| GET | `/api/billing/plans` | Public | รายการแผนทั้งหมด (หน้า Pricing) |
| GET | `/api/billing/me` | Session | ข้อมูล billing ของฉัน |
| GET | `/api/billing/usage` | Session | การใช้งานของฉัน |
| POST | `/api/billing/upgrade` | Session | อัปเกรดแผน |
| POST | `/api/billing/cancel` | Session | ยกเลิกแผน |
| POST | `/api/billing/resume` | Session | กลับมาใช้แผนต่อ |
| POST | `/api/billing/redeem-coupon` | Session | ใช้โค้ดส่วนลด |
| GET | `/api/plans` | Public | แผนที่ enable (Pricing) |
| GET | `/api/plans/admin` | Admin | แผนทั้งหมด (รวม disabled) |
| POST | `/api/plans/admin` | Admin | สร้างแผนใหม่ |
| PUT | `/api/plans/admin/:planId` | Admin | แก้ไขแผน |
| DELETE | `/api/plans/admin/:planId` | Admin | ลบแผน (ลบ Free ไม่ได้) |

### 💰 Payment

| Method | Endpoint | Auth | คำอธิบาย |
|--------|----------|------|----------|
| GET | `/api/payment/gateways` | Public | ช่องทางชำระเงินที่ enable |
| POST | `/api/payment/order` | Session | สร้าง Order ใหม่ |
| GET | `/api/payment/orders` | Session | คำสั่งซื้อของฉัน |
| GET | `/api/payment/orders/:orderId` | Session | ดู Order ที่ระบุ |
| POST | `/api/payment/orders/:orderId/cancel` | Session | ยกเลิก Order |
| GET | `/api/payment/admin/gateways` | Admin | ช่องทางทั้งหมด |
| POST | `/api/payment/admin/gateways` | Admin | บันทึก/ตั้งค่า gateway |
| GET | `/api/payment/admin/orders` | Admin | คำสั่งซื้อทั้งหมด |
| POST | `/api/payment/admin/orders/:orderId/paid` | Admin | ระบุว่าได้รับเงินแล้ว |
| POST | `/api/payment/admin/orders/:orderId/confirm` | Admin | ยืนยันการชำระเงิน → อัปเกรดแผน |

### 📊 Subscription

| Method | Endpoint | Auth | คำอธิบาย |
|--------|----------|------|----------|
| GET | `/api/subscriptions/me` | Session | Subscription ทั้งหมดของฉัน (ทุก channel) |
| GET | `/api/subscriptions/me/:channel` | Session | Subscription ของ channel นั้น |
| GET | `/api/subscriptions/me/:channel/access` | Session | ตรวจสอบว่ามีสิทธิ์ใช้ไหม |
| GET | `/api/subscriptions/me/:channel/usage` | Session | การใช้งาน channel นั้น |
| GET | `/api/subscriptions/me/:channel/usage/export?days=30` | Session | ดาวน์โหลดประวัติการใช้งานเป็น CSV |
| POST | `/api/subscriptions/me/:channel/trial` | Session | เริ่ม trial ฟรี (ใช้ได้ครั้งเดียว → 409 ถ้าใช้ไปแล้ว) |
| POST | `/api/subscriptions/me/:channel/cancel` | Session | ยกเลิก subscription channel |
| GET | `/api/subscriptions/admin` | Admin | Subscription ทั้งหมด |
| POST | `/api/subscriptions/admin/expire-due` | Admin | Expire subscription ที่หมดอายุ |

> **channel** = `platform` | `online` | `telegram`

### 🤖 Telegram Bot

| Method | Endpoint | Auth | คำอธิบาย |
|--------|----------|------|----------|
| GET | `/api/telegram/status` | Public | สถานะ Bot (`configured` / `running`) |
| POST | `/api/telegram/configure` | Public | ตั้งค่า Token + เริ่ม Bot |
| POST | `/api/telegram/stop` | Public | หยุด Bot |
| GET | `/api/telegram/users` | Public | รายชื่อ Telegram users (100 ล่าสุด) |
| POST | `/api/telegram/users/:telegramId/link` | Public | Link Telegram ↔ Platform user |
| POST | `/api/telegram/users/:telegramId/unlink` | Public | ยกเลิก link |

> **ตัวอย่าง:**
> ```bash
> # ตั้งค่า Bot
> curl -X POST http://localhost:8081/api/telegram/configure \
>   -H "Content-Type: application/json" \
>   -d '{"token": "123456789:ABCdef..."}'
>
> # Link ผู้ใช้
> curl -X POST http://localhost:8081/api/telegram/users/987654321/link \
>   -H "Content-Type: application/json" \
>   -d '{"userId": "65f1a2b3c4d5e6f7a8b9c0d1"}'
> ```

### 🧠 Agent / Task / Workspace

| Method | Endpoint | Auth | คำอธิบาย |
|--------|----------|------|----------|
| GET | `/api/agent/session/:id/agent-tools-config` | Session | Config tools ของ session |
| GET | `/api/agent/session/:id/report?format=markdown\|html\|json` | Session | ดาวน์โหลดรายงาน (แนบไฟล์; ใส่ `&inline=1` เพื่อเปิดในเบราว์เซอร์) |
| POST | `/api/task/*` | Session | จัดการ async tasks |
| GET | `/api/workspace/*` | Session | จัดการ workspaces |
| GET | `/api/mcp/*` | Session | MCP endpoints |
| WS | `/api/shell` (WebSocket) | Session | Shell streaming |

---

## 🖥️ Panel / หน้าเว็บทั้งหมด

| หน้า | URL | บทบาท |
|------|-----|-------|
| **หน้าแรก / Dashboard** | `http://localhost:3001` | ผู้ใช้ทั่วไป |
| **Pricing** | `http://localhost:3001/pricing` | ผู้ใช้ทั่วไป |
| **Checkout** | `http://localhost:3001/checkout` | ผู้ใช้ทั่วไป |
| **Billing / Usage** | `http://localhost:3001/billing` | ผู้ใช้ทั่วไป |
| **Settings (Models)** | `http://localhost:3001/settings` | ผู้ใช้ทั่วไป |
| **Admin Payment** | `http://localhost:3001/admin/payment` | ✅ Admin เท่านั้น |
| **Admin อื่นๆ** | `http://localhost:3001/admin/*` | ✅ Admin เท่านั้น |

---

## 🧑‍💻 คู่มือการใช้งาน Admin

### 1. ตั้งค่า Model (จำเป็น)

1. เปิด `http://localhost:3001` → เข้าสู่ระบบ
2. ไปที่ **Settings → Models**
3. เพิ่ม Model Preset (Anthropic Claude / OpenAI GPT)
4. กำหนดให้เป็น **Orchestrator**
5. บันทึก

> ถ้าไม่มี Model ระบบจะไม่สามารถรัน Agent ได้

### 2. จัดการ Plans & ราคา

1. เปิด `http://localhost:3001/admin/payment` → ส่วน **Plans**
2. แก้ไข/สร้างแผน:
   - **priceMonthly** — ราคา/เดือน
   - **priceAnnual** — ราคา/ปี
   - **Channel Pricing** — ตั้งราคาแยก platform / online / telegram
   - **Limits** — maxSessions, maxIterations, maxWorkspaces, maxMcpTokens
   - **🛡️ Token Limits (สำคัญสำหรับการควบคุมค่า API)**:
     - **Max tokens / day** — จำกัด token ที่ใช้ได้ต่อวันทั้งระบบ (0 = ไม่จำกัด)
     - **Max requests / day** — จำกัดจำนวน API calls ต่อวัน (0 = ไม่จำกัด)
   - **Features** — รายการฟีเจอร์
3. บันทึก → อัปเดตทันทีที่หน้า Pricing/Checkout

> แผน `free` ลบไม่ได้ และเป็นแผน fallback
>
> 💡 **คำแนะนำการตั้งค่า Token Limits:**
> - **Free plan**: `10,000 tokens/day`, `50 requests/day`
> - **Pro plan**: `50,000 tokens/day`, `200 requests/day`
> - ปรับได้ตามความต้องการ ไม่ต้องแก้โค้ด

### ⚡ กลไกการบังคับใช้ Token Limits

Limits ทั้ง 2 ตัวทำงานอัตโนมัติเมื่อผู้ใช้รัน Agent ผ่านช่องทางใดก็ได้:

| Limit | ครอบคลุม | ตรวจสอบเมื่อ |
|-------|----------|-------------|
| `maxTokensPerDay` | รวมทุกช่องทาง (platform + online + telegram) | ทุกครั้งก่อนเริ่ม Agent turn |
| `maxRequestsPerDay` | รวมทุกช่องทาง | ทุกครั้งก่อนเริ่ม Agent turn |

เมื่อเกิน limit:
- **Telegram**: Bot ส่งข้อความ `⚠️ Usage limit reached...` แจ้งผู้ใช้
- **Platform/Online**: ระบบให้ error `PLAN_LIMIT_TOKENS_PER_DAY` / `PLAN_LIMIT_REQUESTS_PER_DAY`

### 3. ตั้งค่า Payment Gateway

1. เปิด `http://localhost:3001/admin/payment` → ส่วน **Gateway**
2. เลือกช่องทาง (Google Pay / Alipay / LINE Pay / Crypto)
3. กด **Enable** → กรอก merchant ID / wallet address
4. บันทึก

### 4. ตั้งค่า Telegram Bot

**วิธีที่ 1: ผ่าน env (recommended)**
```env
TELEGRAM_BOT_TOKEN=123456789:ABCdef...
```

**วิธีที่ 2: ผ่าน API (ไม่ต้อง restart)**
```bash
curl -X POST http://localhost:8081/api/telegram/configure \
  -H "Content-Type: application/json" \
  -d '{"token": "123456789:ABCdef..."}'
```

ตรวจสอบ:
```bash
curl http://localhost:8081/api/telegram/status
# → { "configured": true, "running": true }
```

### 5. Link ผู้ใช้ Telegram กับ Platform

**ขั้นตอน:**
1. ให้ผู้ใช้กด `/start` กับ Bot ก่อน (ระบบจะสร้าง TelegramUser record)
2. Admin หา `telegramId`:
   ```bash
   curl http://localhost:8081/api/telegram/users
   ```
3. Link กับ User ID:
   ```bash
   curl -X POST http://localhost:8081/api/telegram/users/<telegramId>/link \
     -H "Content-Type: application/json" \
     -d '{"userId": "<platform_user_mongodb_id>"}'
   ```
4. ผู้ใช้พิมพ์ `/start` อีกครั้ง → ควรเห็น `✅ Linked to platform account`

### 6. ยืนยันการชำระเงิน

1. เปิด `/admin/payment`
2. ดู Order ที่สถานะ `pending` / `paid`
3. ตรวจสอบหลักฐานการชำระเงิน (สลิป / wallet tx)
4. กด **Confirm** → ระบบอัปเกรดแผนอัตโนมัติ

### 7. จัดการ Subscription

- Admin ดูทั้งหมดได้ที่ `/api/subscriptions/admin`
- ระบบมี endpoint `/api/subscriptions/admin/expire-due` สำหรับ expire อัตโนมัติ

---

## 🤖 คำสั่ง Telegram Bot

| คำสั่ง | หน้าที่ |
|--------|---------|
| `/start` | ข้อความต้อนรับ + สถานะ link |
| `/subscribe` | ดูแผนสำหรับช่องทาง Telegram |
| `/status` | เช็ค subscription |
| `/usage` | เช็คการใช้งาน (requests/tokens/cost) |
| `/cancel` | ยกเลิก subscription |
| `/help` | แสดงคำสั่งทั้งหมด |

**ใช้ Agent:** ส่งข้อความปกติ เช่น `"สแกน http://testphp.vulnweb.com หน่อย"`
→ Bot จะรายงานความคืบหน้า real-time (💭 thinking, 🔧 tool running, ✅ tool done)

---

## 🗄️ Database Migrations

```bash
cd backend
pnpm migrate               # รัน migration ที่ค้างอยู่ทั้งหมด
pnpm migrate:status        # ดูว่า migration ไหน applied / pending
pnpm migrate -- --dry-run  # ดูว่าจะรันอะไร โดยยังไม่เขียนข้อมูล
```

- Ledger เก็บใน collection `migrations` (`id`, `appliedAt`, `durationMs`) → รันซ้ำแล้วไม่ทำอะไร
- บน VPS / ใน container ใช้ไฟล์ที่ compile แล้ว: `docker compose exec backend node dist/migrations/cli.js --list`
- migration ใหม่ให้เพิ่มไฟล์ `backend/src/migrations/002-...ts` แล้วลงทะเบียนใน `src/migrations/index.ts` (ห้ามเรียงสลับหรือเปลี่ยน id ที่ applied แล้ว)

## 💾 Backup / Restore

```bash
bash deploy/backup.sh                     # หยุด backend/frontend → dump volumes + kali-data → start กลับให้
bash deploy/backup.sh --no-stop           # ไม่หยุด stack (ได้ snapshot แบบ dirty)
bash deploy/backup.sh --out ~/backups/man # กำหนดโฟลเดอร์ปลายทางเอง
bash deploy/restore.sh ./backups/<stamp>  # กู้คืน (ถามยืนยัน; ใส่ --force ถ้าจะทับข้อมูลเดิม)
```

---

## 🔧 การ Troubleshooting

| ปัญหา | วิธีแก้ |
|--------|---------|
| Bot ไม่ตอบ | ตรวจ `TELEGRAM_BOT_TOKEN` ถูกต้อง และดู log `[telegram]` |
| `configured: false` | ยังไม่ได้ตั้ง Token (env / API) |
| `running: false` แต่ configured true | ตรวจ polling loop crash ใน log |
| ผู้ใช้ใช้ Agent ไม่ได้ | ยังไม่ได้ link → ทำตามขั้นตอนที่ 5 |
| Subscription ไม่ active | ตรวจ `/api/subscriptions/me/:channel` หรือรอ expire |
| Payment ไม่แสดง | ไป `/admin/payment` → Enable gateway |
| หน้าเว็บไม่โหลด | ตรวจ backend `http://localhost:8081/api/healthcheck` |

---

## 📚 เอกสารอื่นๆ

- [คู่มือการติดตั้ง (INSTALL_GUIDE.md)](./INSTALL_GUIDE.md)
- [คู่มือการใช้งาน (USER_GUIDE.md)](./USER_GUIDE.md)
- [สถาปัตยกรรมระบบ (ARCHITECTURE_PLAN.md)](./ARCHITECTURE_PLAN.md)
- [README.md](../README.md)