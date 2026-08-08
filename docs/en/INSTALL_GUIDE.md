# 🚀 VektorSec — Installation Guide

This guide covers installing and running **VektorSec**, including the
Payment & Plan Management system, Agentic Tools, Sandbox Isolation, Knowledge Base,
Audit Trail, Vault, and more.

---

## 📋 Prerequisites

| Tool | Version | Notes |
|------|---------|-------|
| Node.js | >= 22 | Check with `node -v` |
| pnpm | >= 9 | Check with `pnpm -v` |
| Docker | latest | Required for Sandbox Isolation |
| Docker Compose | latest | Used with `docker compose` |
| MongoDB | via Docker | Started automatically by `run.sh` |
| Redis | via Docker | Started automatically by `run.sh` |

> **Note:** The new system **does not require installing additional dependencies** because
> all packages used (openai, stripe, dockerode, tiktoken-node, zod, etc.)
> are already in `backend/package.json`.

---

## 🛠️ Method 1: Docker Installation (recommended)

### Step 1 — Install dependencies

```bash
# Install backend dependencies
cd backend
pnpm install

# Install frontend dependencies
cd ../frontend
pnpm install
```

### Step 2 — Run via Launcher

```bash
# Go back to the project root
cd ..

# Run with guided prompts (choose Normal mode)
./run.sh start

# Or run a Quick Start (reuse existing config)
./run.sh start -q
```

While running, `run.sh` will ask the following:
1. **Choose How To Run** → choose `1) Normal mode`
2. **Models** → if not configured, it will suggest opening Settings → Models after startup
3. **Exploit Box** → choose as needed (Kali VM / External SSH / None)

### Step 3 — Check Status

```bash
./run.sh status    # view container status
./run.sh logs      # view logs
```

---

## 🛠️ Method 2: Developer Mode (run separately)

Suitable for developers who want hot-reload while editing code

### Step 1 — Install dependencies

```bash
cd backend && pnpm install
cd ../frontend && pnpm install
```

### Step 2 — Run Docker for MongoDB + Redis

```bash
./run.sh dev
```

### Step 3 — Run Backend (separate terminal)

```bash
cd backend
pnpm build    # compile TypeScript first time
pnpm dev      # run with nodemon (hot-reload)
```

### Step 4 — Run Frontend (separate terminal)

```bash
cd frontend
pnpm dev
```

---

## ⚙️ Configuration

### Main Config Files

| File | Purpose |
|------|---------|
| `config.toml` | Static values (port, mongo, redis, session secret) |
| `backend/.env` | Dynamic values (API keys, SSH, model presets) |
| `frontend/.env` | Frontend values (backend URL, deployment mode) |

### Configure Models (required)

After startup, open `http://localhost:3000` and go to:
**Settings → Models** → add a Model Preset (e.g., Anthropic Claude, OpenAI GPT)
→ set it as Orchestrator

### Configure Payment Gateways

1. Open `http://localhost:3000/admin/payment`
2. Select a payment channel (Google Pay, Alipay, LINE Pay, Crypto)
3. Click **Enable** and fill in the merchant / wallet address details
4. Save

> The Payment system uses the **PaymentGateway model in MongoDB** to store config
> — no Stripe key in env is needed

### Configure Plans & Pricing (Admin)

The system seeds default plans (Free/Pro/Team/Enterprise) automatically on first run.
Admins can adjust prices and features at `/admin/payment` → **Plans** section:

1. Open `http://localhost:3000/admin/payment`
2. Go to the **Plans** section
3. Edit monthly/annual prices, or set **Channel Pricing** per channel
4. Configure **Limits** (sessions, iterations, workspaces, MCP tokens)
5. Save

> The **Free** plan is the fallback plan for users without a subscription and cannot be deleted.

### Configure Subscription

The Subscription system supports **3 channels** (platform / online / telegram):

- Users subscribe to a plan via the Pricing page → pay → the subscription activates
- Subscriptions are managed through the `Subscription` model in MongoDB
- Usage is tracked through the `UsageRecord` model (today / 30 days)
- The system expires due subscriptions automatically (via `expireDueSubscriptions`)

### Configure Telegram Bot (optional)

The system supports the **Telegram Bot** (uses the HTTP API directly, no extra dependencies)

#### 1. Create a Bot Token with @BotFather

1. Open Telegram → search for **@BotFather** (Telegram's official bot)
2. Type `/newbot` to create a new bot
3. Name the bot (e.g., `My VektorSec`)
4. Set a Username (must end with `bot`, e.g., `myvektorsec_bot`)
5. BotFather replies with the **HTTP API Token** (format `123456789:ABCdefGHI...`)
6. **Keep this Token secret** — never publish it or commit it to Git

#### 2. Configure in config

Add `TELEGRAM_BOT_TOKEN` to the **`.env` file** (backend) or **`config.toml`**:

```env
TELEGRAM_BOT_TOKEN=123456789:ABCdefGHI...
```

> **Note:** If no token is set, the system runs normally but the Telegram bot is disabled.
> You can enable it later via the API `/api/telegram/configure`.

#### 3. Getting Started

Once the token is set, the system starts polling automatically when the server starts.
Users can press `/start` with the bot, and the admin must **link** the Telegram user
with a platform account via the API/Admin first (see [User Guide](./USER_GUIDE.md)).

#### 4. API Endpoints (Admin)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/telegram/status` | Check bot status |
| POST | `/api/telegram/configure` | Set token and start the bot (`{ "token": "..." }`) |
| POST | `/api/telegram/stop` | Stop the bot |
| GET | `/api/telegram/users` | List Telegram users |
| POST | `/api/telegram/users/:telegramId/link` | Link user (`{ "userId": "..." }`) |
| POST | `/api/telegram/users/:telegramId/unlink` | Unlink user |

---

## 🧪 Testing

### 1. Check TypeScript compilation

```bash
cd backend
pnpm build
```

### 2. Run the test suite

```bash
cd backend
pnpm test
```

### 3. Test the Payment system

1. Open `http://localhost:3000/pricing`
2. Choose a plan (e.g., Pro) → click **Upgrade**
3. Choose a payment channel → click **Checkout**
4. The system creates an Order ID (e.g., `ORD-XXXX-XXXX`)
5. Go to `/admin/payment` → click **Confirm** to confirm the payment
6. The user's plan is upgraded automatically

### 4. Test Subscription

1. Open `http://localhost:3000/pricing`
2. Choose a plan (e.g., Pro) → click **Upgrade**
3. Pay through an enabled channel → the system activates the subscription automatically
4. Open the **Billing** page (`/billing`) to check the subscription status
5. Check **Usage** to see usage (today / 30 days)
6. Test canceling a subscription → status changes to canceled

### 5. Test Agentic Tools

Open a chat with the Agent and try:

```
# Run a long task in the background
run_async_task command="nmap -sV -p- 10.10.10.10" task_type="nmap_scan"

# Check progress
get_task_status task_id=<task_id>

# Search CVEs in the Knowledge Base
query_knowledge query="Apache Log4j RCE"

# View the audit trail
audit_log action="command_executed"

# Manage secrets
vault_manage action="store" key="API_KEY" value="sk-xxx"
```

---

## 🐳 Docker Compose Files

| File | Used for |
|------|----------|
| `docker-compose.yml` | Normal mode (backend + frontend + mongo + redis) |
| `docker-compose.kali.yml` | Normal mode + Kali container |
| `docker-compose.dev.yml` | Developer mode (mongo + redis only) |

---

## ❓ Troubleshooting

### Q: `pnpm` command not found
```bash
corepack enable
corepack prepare pnpm@latest --activate
```

### Q: Docker daemon not running
- Open Docker Desktop and wait until the status is Running

### Q: Sandbox not working (no Docker)
- The system falls back to running commands directly with a warning
- Installing Docker is recommended for safety

### Q: Payment page shows no payment channels
- Go to `/admin/payment` and click **Enable** on the gateway you want

### Q: Need to rebuild after editing code
```bash
./run.sh start   # then choose to rebuild backend/frontend
```

### Q: A service (e.g. redis) does not start or exits immediately (port conflict)

Running two VektorSec stacks at the same time (`vektorsec` and `vektorsec-community`)
uses the same host ports (3000, 8080, 27017, 6379). After a Docker Desktop restart,
containers configured with `restart: always` come back on their own and can steal a
port from the other stack, so a service may fail to start or get terminated instantly.

Fix:

1. Check which containers are running and who owns the port:
   docker ps
   docker ps -a
2. Stop the stack you are not using (run this inside its own folder):
   docker compose down
3. Restart the stack you want:
   docker compose up -d
4. Verify the container is healthy again:
   docker ps
   docker logs <container-name>

Tip: use `restart: unless-stopped` in docker-compose.yml so a manually stopped
container does not come back on its own after a Docker Desktop restart.


---

## 📚 See Also

- [User Guide](./USER_GUIDE.md)
- [Quick Reference](./QUICK_REFERENCE.md)
- [README.md](../../README.md)
