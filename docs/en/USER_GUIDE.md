# 📖 VektorSec — User Guide

This guide covers all the new features of **VektorSec**, including
the Payment & Plan system, Agentic Tools, Sandbox, Knowledge Base,
Audit Trail, Vault, and more.

---

## 📑 Table of Contents

1. [Getting Started](#-getting-started)
2. [Plans & Subscription](#-plans--subscription)
3. [Payment & Checkout](#-payment--checkout)
4. [Telegram Bot](#-telegram-bot)
5. [Admin Payment Panel](#-admin-payment-panel)
6. [Agentic Tools](#-agentic-tools)
7. [Sandbox Isolation](#-sandbox-isolation)
8. [Knowledge Base & RAG](#-knowledge-base--rag)
9. [Audit Trail](#-audit-trail)
10. [Vault (Secrets)](#-vault-secrets)
11. [Self-Correction](#-self-correction)
12. [Scope Control & HITL](#-scope-control--hitl)
13. [Multi-Model Routing](#-multi-model-routing)

---

## 🚀 Getting Started

1. Follow the [Installation Guide](./INSTALL_GUIDE.md)
2. Open `http://localhost:3001`
3. Sign up / Log in
4. Go to **Settings → Models** to configure a Model (required)
5. Start chatting with the Agent to run pentests

---

## 💳 Plans & Subscription

### Available Plans (default)

> Prices and features can be adjusted by the Admin via **Admin → Plans** (`/admin/payment`)

| Plan | Monthly | Annual | Features |
|------|---------|--------|----------|
| **Free** | $0 | $0 | Basic, limited usage |
| **Pro** | $49 | $39/mo | Unlimited, Sandbox, Knowledge Base |
| **Team** | $149 | $119/mo | Multi-agent, Priority support |
| **Enterprise** | $499 | $399/mo | All features, SLA, SSO |

### Usage Channels

The system supports **3 channels**, each with its own subscription:

| Channel | Description |
|---------|-------------|
| **Platform** | Main web platform |
| **Online** | Online access (API/Webhook) |
| **Telegram** | Telegram Bot |

> Each channel has its own pricing (configurable via channel pricing by Admin)

### How to Subscribe

1. Open the **Pricing** page (`/pricing`)
2. Choose a channel (Platform / Online / Telegram)
3. Choose a plan → click **Upgrade**
4. The system creates a subscription automatically after the Admin confirms payment
5. Check the status on the **Billing** page (`/billing`)

### How to Upgrade Your Plan

1. Open the **Pricing** page (`/pricing`)
2. Choose a plan → click **Upgrade**
3. Choose the billing period (Monthly / Annual)
4. Choose a payment channel → click **Checkout**
5. Wait for the Admin to confirm the payment → your plan is upgraded automatically

### Check Your Current Plan

- Open the **Billing** page (`/billing`) to see your current plan, expiry date, and payment history
- Open the **Subscription** page to see all subscriptions across channels
- Check **Usage** to see your usage (today / last 30 days)

---

## 🛒 Payment & Checkout

### Supported Payment Channels

| Channel | Type |
|---------|------|
| Google Pay | Card / wallet |
| Alipay | Wallet |
| LINE Pay | Wallet |
| Crypto (ETH) | Cryptocurrency |
| Crypto (BTC) | Cryptocurrency |
| Crypto (BNB) | Cryptocurrency |

### Checkout Steps

1. Choose a plan → click **Upgrade** → go to `/checkout`
2. Select a payment channel
3. The system creates an **Order ID** (e.g., `ORD-XXXX-XXXX`)
4. For Crypto: transfer funds to the wallet address and include the Order ID in the memo
5. For other channels: follow the instructions for that channel
6. Wait for the Admin to confirm → your plan is upgraded automatically

---

## 🤖 Telegram Bot

The system supports using VektorSec through a **Telegram Bot**, in addition to the web platform.

### Getting Started with the Bot

1. Make sure the Admin has configured the Bot Token (see [Installation Guide](./INSTALL_GUIDE.md))
2. Open Telegram → search for the Bot created by the Admin
3. Press **Start** or type `/start` to begin
4. Type `/help` to see all commands

### Supported Commands

| Command | Description |
|---------|-------------|
| `/start` | Shows a welcome message and the list of commands |
| `/subscribe` | Shows plans and prices for the Telegram channel |
| `/status` | Checks your Subscription status |
| `/usage` | Checks today's usage (requests, tokens, cost) |
| `/cancel` | Cancels the Subscription |
| `/help` | Shows the list of commands |

### Using the Agent via Telegram

Once you have a subscription on the Telegram channel, you can send any free-form message,
e.g., `"scan http://testphp.vulnweb.com"` — the Bot sends it to the Agent and
reports progress in real-time via Telegram (💭 thinking, 🔧 tool running, ✅ tool done).

### Linking Your Account (required)

> ⚠️ You must have a **platform account** and be **linked** with your Telegram ID before you can use the Agent.

The Admin must link your accounts via the API:
```bash
POST /api/telegram/users/:telegramId/link
Body: { "userId": "<platform_user_id>" }
```

### Notes

- Subscriptions on the Telegram channel are **separate** from Platform/Online
- Usage is recorded in `UsageRecord` with channel `telegram`
- If you don't have a subscription → you need to subscribe to a plan first

---

## 🛠️ Admin Payment Panel

Only accessible to users with the **Admin** role at `/admin/payment`

### Features

- **Manage Gateways** — enable/disable payment channels, configure merchant ID, wallet address
- **View All Orders** — view status (pending, paid, confirmed, expired, canceled)
- **Confirm Payments** — click Confirm to upgrade a user's plan
- **Filter by Status** — view only pending / paid / confirmed
- **Manage Plans** — create/edit/delete plans, set prices, set channel pricing

### How to Enable a Gateway

1. Go to `/admin/payment`
2. In the Gateway section, select the channel you want
3. Click **Enable**
4. Fill in the details (merchant ID / wallet address / instructions)
5. Save

### How to Set Plan Pricing (Admin)

Admins can set plan prices without touching code:

1. Go to `/admin/payment` → **Plans** section
2. Select the plan to edit (or create a new plan)
3. Configure:
   - **Monthly price** (priceMonthly)
   - **Annual price** (priceAnnual)
   - **Channel Pricing** — set different prices per channel (platform / online / telegram)
   - **Limits** — usage limits (sessions, iterations, workspaces, MCP tokens)
   - **Features** — feature list
4. Save → prices update immediately on the Pricing and Checkout pages

> The **Free** plan cannot be deleted and is the fallback plan for users without a subscription.

---

## 🤖 Agentic Tools

### 1. `run_async_task` — Run Long Tasks in the Background

Run long pentest tasks (nmap, ffuf, sqlmap) asynchronously in the Sandbox

```json
{
  "command": "nmap -sV -p- 10.10.10.10",
  "task_type": "nmap_scan",
  "priority": "high",
  "timeout_ms": 300000,
  "target": "10.10.10.10"
}
```

**Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `command` | string (required) | The command to run |
| `task_type` | enum | `nmap_scan`, `ffuf_bruteforce`, `sqlmap_dump`, `gobuster_enum`, `custom` |
| `priority` | enum | `low`, `normal`, `high`, `critical` |
| `timeout_ms` | number | Timeout (default 300000) |
| `target` | string | Target (for audit log) |

**Result:** Returns a Task ID used to check progress

### 2. `get_task_status` — Check Progress

```json
{
  "task_id": "abc123"
}
```

**Result:** Status (queued, running, completed, failed), progress %, output

### 3. `query_knowledge` — Search the Knowledge Base

```json
{
  "query": "Apache Log4j RCE",
  "category": "cve",
  "limit": 5
}
```

**Categories:** `cve`, `exploit`, `owasp`, `technique`, `tool`

### 4. `audit_log` — View the Audit Trail

```json
{
  "action": "command_executed",
  "severity": "warning",
  "limit": 20
}
```

### 5. `vault_manage` — Manage Secrets

```json
{
  "action": "store",
  "key": "API_KEY",
  "value": "sk-xxx"
}
```

**Actions:** `store`, `get`, `delete`, `list`

### 6. `track_attack_chain` — Track Attack Steps

```json
{
  "action": "add_step",
  "phase": "reconnaissance",
  "tool": "nmap",
  "target": "10.10.10.10",
  "finding": "Open port 80"
}
```

**Phases:** `reconnaissance`, `scanning`, `exploitation`, `post_exploitation`, `reporting`

### 7. `store_target_memory` — Remember Target Details

```json
{
  "target": "10.10.10.10",
  "key": "open_ports",
  "value": "80,443,8080",
  "importance": "high"
}
```

### 8. `collect_evidence` — Collect Evidence

```json
{
  "target": "10.10.10.10",
  "type": "screenshot",
  "description": "Login page",
  "data": "base64..."
}
```

---

## 🏖️ Sandbox Isolation

All async tasks run inside **isolated Docker containers** for safety

### Sandbox Limits

- **CPU:** limited to 1 core
- **Memory:** limited to 512MB
- **Network:** restricted (as configured)
- **Timeout:** as configured (default 5 minutes)

### If Docker Is Not Available

The system falls back to running commands directly with a warning:
```
[warning] Docker not available - running without sandbox isolation
```

> ⚠️ Installing Docker is recommended for maximum safety

---

## 📚 Knowledge Base & RAG

The pentest knowledge database includes:

- **CVE Database** — known vulnerabilities
- **Exploit Database** — exploitation techniques
- **OWASP Top 10** — web application risks
- **Techniques** — attack techniques
- **Tools** — tool documentation

### How to Use

The Agent automatically uses `query_knowledge` when it needs information,
or you can ask directly, e.g.:
- "What CVEs are there related to Apache Tomcat?"
- "What's in the OWASP Top 10?"
- "How to exploit SQL injection"

---

## 📝 Audit Trail

Records every action as **Immutable** (tamper-proof) using a Merkle chain

### Recorded Events

- Command execution (command_executed)
- Data access (data_accessed)
- Config changes (config_changed)
- User management (user_management)
- Payment processing (payment_processed)

### How to View

Use the `audit_log` tool or through the Admin panel

---

## 🔐 Vault (Secrets)

Stores secrets encrypted with **AES-256-GCM**

### How to Use

```json
// Store a secret
{ "action": "store", "key": "AWS_KEY", "value": "AKIA..." }

// Read a secret
{ "action": "get", "key": "AWS_KEY" }

// Delete a secret
{ "action": "delete", "key": "AWS_KEY" }

// List secrets
{ "action": "list" }
```

> ⚠️ Secrets are encrypted in the DB — even if the DB is stolen, they cannot be read

---

## 🔄 Self-Correction

When a tool fails with a fixable error, the system automatically retries with corrected input

### Example

```
[!] nmap failed with: "Unknown option: -p-"
[→] Self-correction: retrying with correct syntax...
[✓] nmap completed successfully after self-correction (12.3s)
```

### Correction Conditions

- **Retryable errors:** syntax errors, connection timeouts, wrong flags
- **Fatal errors:** not retried (e.g., permission denied, tool not found)

---

## 🛡️ Scope Control & HITL

### Scope Validation

Every command is checked to ensure the target is in the **allowed scope** before running

```
BLOCKED: Target 192.168.1.1 is not in the allowed scope
```

### Human-in-the-Loop (HITL)

High-risk commands require **user approval** before running

```
APPROVAL REQUIRED: This command is high-risk
Approval ID: appr_abc123
Risk level: high
```

---

## 🧠 Multi-Model Routing

The system automatically selects the model based on task complexity

| Task | Model Used |
|------|-----------|
| Simple (Q&A) | Fast / cheap model |
| Medium (analysis) | Mid-range model |
| Complex (pentest) | Powerful model |

### How to Configure

**Settings → Models** → add multiple models → assign roles (orchestrator, racer)

---

## 🧪 Example Workflows

### Example: Scan a Web Application

```
User: "Scan the website http://testphp.vulnweb.com"
Agent: [uses query_knowledge to find techniques]
       [uses run_async_task to run nmap in the background]
       [uses get_task_status to check progress]
       [uses track_attack_chain to record steps]
       [uses collect_evidence to collect evidence]
       [uses generate_report to create a report]
```

### Example: Check for Vulnerabilities

```
User: "What CVEs are related to WordPress?"
Agent: [uses query_knowledge to search CVEs]
       [summarizes results for the user]
```

---

## 📚 See Also

- [Installation Guide](./INSTALL_GUIDE.md)
- [Quick Reference](./QUICK_REFERENCE.md)
- [README.md](../../README.md)
