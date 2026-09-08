# 📘 VektorSec — Quick Reference & Admin Manual

A single reference covering **Token/Secrets, API Endpoints, Panel Links, and Admin usage** for Admins/Developers.

---

## 📑 Table of Contents

1. [Access URLs](#-access-urls)
2. [Important Secrets & Tokens](#-important-secrets--tokens)
3. [Creating a Bot Token (Telegram)](#-creating-a-bot-token-telegram)
4. [All API Endpoints](#-all-api-endpoints)
5. [All Panels / Web Pages](#-all-panels--web-pages)
6. [Admin Manual](#-admin-manual)
7. [Telegram Bot Commands](#-telegram-bot-commands)
8. [Troubleshooting](#-troubleshooting)

---

## 🔗 Access URLs

| System | URL (Local) | In Docker |
|--------|-------------|-----------|
| **Frontend (Web App)** | `http://localhost:3001` | `http://localhost:3001` |
| **Backend API** | `http://localhost:8081` | `http://localhost:8081` |
| **Healthcheck** | `http://localhost:8081/api/healthcheck` | — |
| **Kali Box (if any)** | via Agent on the web page | — |

---

## 🔑 Important Secrets & Tokens

### Stored in: `backend/.env` or `config.toml`

| Variable | Required? | Description |
|----------|-----------|-------------|
| `MONGO_URI` | ✅ Required | MongoDB connection string |
| `REDIS_URL` | ✅ Required | Redis connection string (for sessions) |
| `SESS_SECRET` | ✅ Required | Session secret (≥ 32 chars) |
| `DEPLOYMENT` | ✅ Required | `LOCAL` or `PRODUCTION` |
| `TELEGRAM_BOT_TOKEN` | ⬜ Optional | Token from @BotFather (enables Telegram Bot) |
| `ANTHROPIC_OAUTH_ACCESS_TOKEN` | ⬜ Optional | OAuth token for Claude |
| `ANTHROPIC_OAUTH_REFRESH_TOKEN` | ⬜ Optional | OAuth refresh token |
| `ANTHROPIC_OAUTH_EXPIRES_AT` | ⬜ Optional | OAuth expiry timestamp |
| `SSH_PASSWORD` | ⬜ Optional | SSH password for the Exploit Box |
| `SSH_PRIVATE_KEY` | ⬜ Optional | SSH private key |
| `SSH_PRIVATE_KEY_PASSPHRASE` | ⬜ Optional | Private key passphrase |
| `CORS_ORIGINS` | ⬜ Optional | Extra allowed origins (comma-separated) |
| `GOOGLE-API-KEY` | ⬜ Optional | Google Custom Search API key |
| `CUSTOM-SEARCH-ENGINE-ID` | ⬜ Optional | Google Custom Search Engine ID |
| `LANGFUSE_ENABLED` | ⬜ Optional | Enable/disable Langfuse tracing |
| `LANGFUSE_PUBLIC_KEY` | ⬜ Optional | Langfuse public key |
| `LANGFUSE_SECRET_KEY` | ⬜ Optional | Langfuse secret key |
| `LANGFUSE_BASE_URL` | ⬜ Optional | Langfuse base URL |

> ⚠️ **Never commit the `.env` file to Git** — it is already in `.gitignore`.

---

## 🤖 Creating a Bot Token (Telegram)

1. Open Telegram → search for **@BotFather**
2. Type `/newbot`
3. Name the bot → set a Username (ending with `bot`)
4. BotFather gives you a **Token** (format `123456789:ABCdef...`)
5. Store the token in `.env`:
   ```env
   TELEGRAM_BOT_TOKEN=123456789:ABCdef...
   ```
6. Restart the server → the bot starts automatically
   - log: `[telegram] Starting Telegram bot polling...`

---

## 🛠️ All API Endpoints

> Base URL: `http://localhost:8081` (backend)

### 🔐 Authentication

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/auth/register` | Public | Register (rate-limited) |
| POST | `/api/auth/login` | Public | Login (rate-limited) |
| POST | `/api/auth/logout` | Session | Logout |
| GET | `/api/auth/status` | Session | Check session |
| POST | `/api/auth/2fa/setup` | Session | Set up 2FA |
| POST | `/api/auth/2fa/verify` | Session | Verify 2FA setup |
| POST | `/api/auth/2fa/disable` | Session | Disable 2FA |

### 💳 Billing / Plans

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/billing/plans` | Public | All plans (Pricing page) |
| GET | `/api/billing/me` | Session | My billing info |
| GET | `/api/billing/usage` | Session | My usage |
| POST | `/api/billing/upgrade` | Session | Upgrade plan |
| POST | `/api/billing/cancel` | Session | Cancel plan |
| POST | `/api/billing/resume` | Session | Resume plan |
| POST | `/api/billing/redeem-coupon` | Session | Redeem discount code |
| GET | `/api/plans` | Public | Enabled plans (Pricing) |
| GET | `/api/plans/admin` | Admin | All plans (incl. disabled) |
| POST | `/api/plans/admin` | Admin | Create a plan |
| PUT | `/api/plans/admin/:planId` | Admin | Update a plan |
| DELETE | `/api/plans/admin/:planId` | Admin | Delete a plan (Free cannot be deleted) |

### 💰 Payment

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/payment/gateways` | Public | Enabled payment channels |
| POST | `/api/payment/order` | Session | Create an order |
| GET | `/api/payment/orders` | Session | My orders |
| GET | `/api/payment/orders/:orderId` | Session | View a specific order |
| POST | `/api/payment/orders/:orderId/cancel` | Session | Cancel an order |
| GET | `/api/payment/admin/gateways` | Admin | All gateways |
| POST | `/api/payment/admin/gateways` | Admin | Save/configure a gateway |
| GET | `/api/payment/admin/orders` | Admin | All orders |
| POST | `/api/payment/admin/orders/:orderId/paid` | Admin | Mark as paid |
| POST | `/api/payment/admin/orders/:orderId/confirm` | Admin | Confirm payment → upgrade plan |

### 📊 Subscription

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/subscriptions/me` | Session | All my subscriptions (all channels) |
| GET | `/api/subscriptions/me/:channel` | Session | Subscription for a channel |
| GET | `/api/subscriptions/me/:channel/access` | Session | Check access rights |
| GET | `/api/subscriptions/me/:channel/usage` | Session | Channel usage |
| POST | `/api/subscriptions/me/:channel/cancel` | Session | Cancel channel subscription |
| GET | `/api/subscriptions/admin` | Admin | All subscriptions |
| POST | `/api/subscriptions/admin/expire-due` | Admin | Expire due subscriptions |

> **channel** = `platform` | `online` | `telegram`

### 🤖 Telegram Bot

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/telegram/status` | Public | Bot status (`configured` / `running`) |
| POST | `/api/telegram/configure` | Public | Set token + start the bot |
| POST | `/api/telegram/stop` | Public | Stop the bot |
| GET | `/api/telegram/users` | Public | List Telegram users (last 100) |
| POST | `/api/telegram/users/:telegramId/link` | Public | Link Telegram ↔ Platform user |
| POST | `/api/telegram/users/:telegramId/unlink` | Public | Unlink user |

> **Examples:**
> ```bash
> # Configure the bot
> curl -X POST http://localhost:8081/api/telegram/configure \
>   -H "Content-Type: application/json" \
>   -d '{"token": "123456789:ABCdef..."}'
>
> # Link a user
> curl -X POST http://localhost:8081/api/telegram/users/987654321/link \
>   -H "Content-Type: application/json" \
>   -d '{"userId": "65f1a2b3c4d5e6f7a8b9c0d1"}'
> ```

### 🧠 Agent / Task / Workspace

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/agent/session/:id/agent-tools-config` | Session | Tool config for a session |
| POST | `/api/task/*` | Session | Manage async tasks |
| GET | `/api/workspace/*` | Session | Manage workspaces |
| GET | `/api/mcp/*` | Session | MCP endpoints |
| WS | `/api/shell` (WebSocket) | Session | Shell streaming |

---

## 🖥️ All Panels / Web Pages

| Page | URL | Role |
|------|-----|------|
| **Home / Dashboard** | `http://localhost:3001` | Regular user |
| **Pricing** | `http://localhost:3001/pricing` | Regular user |
| **Checkout** | `http://localhost:3001/checkout` | Regular user |
| **Billing / Usage** | `http://localhost:3001/billing` | Regular user |
| **Settings (Models)** | `http://localhost:3001/settings` | Regular user |
| **Admin Payment** | `http://localhost:3001/admin/payment` | ✅ Admin only |
| **Other Admin** | `http://localhost:3001/admin/*` | ✅ Admin only |

---

## 🧑‍💻 Admin Manual

### 1. Configure Models (required)

1. Open `http://localhost:3001` → log in
2. Go to **Settings → Models**
3. Add a Model Preset (Anthropic Claude / OpenAI GPT)
4. Set it as **Orchestrator**
5. Save

> Without a Model, the Agent cannot run.

### 2. Manage Plans & Pricing

1. Open `http://localhost:3001/admin/payment` → **Plans** section
2. Edit/create a plan:
   - **priceMonthly** — monthly price
   - **priceAnnual** — annual price
   - **Channel Pricing** — per-channel prices (platform / online / telegram)
   - **Limits** — maxSessions, maxIterations, maxWorkspaces, maxMcpTokens
   - **🛡️ Token Limits (important for API cost control)**:
     - **Max tokens / day** — total daily token limit (0 = unlimited)
     - **Max requests / day** — daily API call limit (0 = unlimited)
   - **Features** — feature list
3. Save → updates immediately on Pricing/Checkout

> The `free` plan cannot be deleted and is the fallback plan.
>
> 💡 **Recommended Token Limits:**
> - **Free plan**: `10,000 tokens/day`, `50 requests/day`
> - **Pro plan**: `50,000 tokens/day`, `200 requests/day`
> - Adjust as needed without touching code

### ⚡ How Token Limits Are Enforced

The limits run automatically whenever a user runs the Agent on any channel:

| Limit | Covers | Checked when |
|-------|--------|-------------|
| `maxTokensPerDay` | All channels (platform + online + telegram) | Before every Agent turn |
| `maxRequestsPerDay` | All channels | Before every Agent turn |

When a limit is exceeded:
- **Telegram**: the bot sends `⚠️ Usage limit reached...`
- **Platform/Online**: the system returns `PLAN_LIMIT_TOKENS_PER_DAY` / `PLAN_LIMIT_REQUESTS_PER_DAY`

### 3. Configure Payment Gateways

1. Open `http://localhost:3001/admin/payment` → **Gateway** section
2. Select a channel (Google Pay / Alipay / LINE Pay / Crypto)
3. Click **Enable** → fill in merchant ID / wallet address
4. Save

### 4. Configure Telegram Bot

**Method 1: via env (recommended)**
```env
TELEGRAM_BOT_TOKEN=123456789:ABCdef...
```

**Method 2: via API (no restart needed)**
```bash
curl -X POST http://localhost:8081/api/telegram/configure \
  -H "Content-Type: application/json" \
  -d '{"token": "123456789:ABCdef..."}'
```

Verify:
```bash
curl http://localhost:8081/api/telegram/status
# → { "configured": true, "running": true }
```

### 5. Link Telegram Users with Platform

**Steps:**
1. Have the user press `/start` with the bot first (creates a TelegramUser record)
2. Find the `telegramId`:
   ```bash
   curl http://localhost:8081/api/telegram/users
   ```
3. Link with the User ID:
   ```bash
   curl -X POST http://localhost:8081/api/telegram/users/<telegramId>/link \
     -H "Content-Type: application/json" \
     -d '{"userId": "<platform_user_mongodb_id>"}'
   ```
4. Have the user type `/start` again → they should see `✅ Linked to platform account`

### 6. Confirm Payments

1. Open `/admin/payment`
2. View orders with status `pending` / `paid`
3. Verify the payment evidence (receipt / wallet tx)
4. Click **Confirm** → the plan is upgraded automatically

### 7. Manage Subscriptions

1. View all subscriptions at `/api/subscriptions/admin`
2. Manually expire due subscriptions with `POST /api/subscriptions/admin/expire-due`

---

## 🤖 Telegram Bot Commands

| Command | Description |
|---------|-------------|
| `/start` | Welcome + command list |
| `/subscribe` | Show plans/prices for the Telegram channel |
| `/status` | Check subscription status |
| `/usage` | Check today's usage (requests, tokens, cost) |
| `/cancel` | Cancel subscription |
| `/help` | Show command list |

---

## ❓ Troubleshooting

| Problem | Solution |
|---------|----------|
| Telegram bot not responding | Check `/api/telegram/status`; verify the token is set |
| No payment channels on checkout | Enable gateways at `/admin/payment` |
| `PLAN_LIMIT_*` errors | User reached the daily limits — check plan Token Limits |
| Agent not running | Configure a Model in Settings → Models |
| Order stays pending | Admin must confirm the payment at `/admin/payment` |

---

## 📚 See Also

- [User Guide](./USER_GUIDE.md)
- [Installation Guide](./INSTALL_GUIDE.md)
- [README.md](../../README.md)
