# 💻 VektorSec — Platform (PC) User Guide

Install VektorSec on your own computer, bring your own API key (BYOK),
and get full control — including wireless attack tools (aircrack) and offline mode.

---

## 📑 Table of Contents

1. [Overview](#-overview)
2. [System Requirements](#-system-requirements)
3. [Installation](#-installation)
4. [Activation & License](#-activation--license)
5. [Configuring Your API Key](#-configuring-your-api-key)
6. [Using the Agent](#-using-the-agent)
7. [Wireless Attacks (aircrack)](#-wireless-attacks-aircrack)
8. [Troubleshooting](#-troubleshooting)

---

## 🧭 Overview

The **Platform** version is a self-hosted desktop installation. You run it on
your own machine, so you have **full control** and can work **offline** after
activation. You bring your own API key (BYOK) for the AI models.

| Feature | Platform (PC) |
|---------|---------------|
| Device | Computer |
| Installation | Clone + install |
| API key | BYOK (yours) |
| Pricing | One-time license |
| aircrack / Wi-Fi | ✅ |
| Offline mode | ✅ |

---

## 🖥️ System Requirements

| Resource | Minimum |
|----------|---------|
| RAM | 8 GB (+2 GB if using the built-in Kali container) |
| Disk | 20 GB |
| Docker | v20+ with Compose v2+ |
| Node.js | v22+ (dev mode only) |
| pnpm | v9+ (dev mode only) |

---

## 🛠️ Installation

### Step 1 — Install dependencies

```bash
cd backend
pnpm install

cd ../frontend
pnpm install
```

### Step 2 — Run via launcher

```bash
cd ..
./run.sh start
```

Follow the guided prompts:
1. **Choose How To Run** → choose `1) Normal mode`
2. **Models** → configure a model after startup (see below)
3. **Exploit Box** → choose as needed (Kali VM / External SSH / None)

### Step 3 — Check status

```bash
./run.sh status    # view container status
./run.sh logs      # view logs
```

---

## 🔑 Activation & License

The Platform version uses a **one-time license**. After purchase:

1. Open `http://localhost:3000`
2. Sign up / log in
3. Redeem your license (via the Billing page or a coupon code)
4. Your plan is activated permanently

> Once activated, you can run the system **offline** without any recurring fees.

---

## 🔐 Configuring Your API Key

Since this is BYOK, you need to add your own AI model API key:

1. Open `http://localhost:3000`
2. Go to **Settings → Models**
3. Add a Model Preset (e.g., Anthropic Claude, OpenAI GPT)
4. Enter your API key
5. Set the model as **Orchestrator**
6. Save

> Without a configured model, the agent cannot run.

---

## 🤖 Using the Agent

Open a chat with the agent and describe your task in plain language, for example:

```
Scan the website http://testphp.vulnweb.com
```

The agent will:
- Plan the approach
- Run security tools (nmap, ffuf, sqlmap, nuclei, etc.) in a sandbox
- Analyze results and iterate
- Collect evidence and generate a report

### Example Commands

```
# Run a long scan in the background
run_async_task command="nmap -sV -p- 10.10.10.10" task_type="nmap_scan"

# Check progress
get_task_status task_id=<task_id>

# Search CVEs in the knowledge base
query_knowledge query="Apache Log4j RCE"

# View the audit trail
audit_log action="command_executed"

# Manage secrets
vault_manage action="store" key="API_KEY" value="sk-xxx"
```

---

## 📡 Wireless Attacks (aircrack)

The Platform version supports **wireless attack tools** (aircrack-ng) — a feature
not available on the hosted Telegram/Online channels.

> ⚠️ Only use wireless attacks on networks you **own** or have **explicit written
> permission** to test. Unauthorized wireless attacks are illegal.

To use wireless tools, ensure your machine has a compatible wireless adapter
and the required drivers installed.

---

## ❓ Troubleshooting

| Problem | Solution |
|---------|----------|
| `pnpm` not found | `corepack enable && corepack prepare pnpm@latest --activate` |
| Docker daemon not running | Open Docker Desktop and wait until Running |
| Sandbox not working | Install Docker; otherwise the system falls back to direct execution with a warning |
| Agent not running | Configure a Model in Settings → Models |
| License not active | Redeem your license on the Billing page |

---

## 🛡️ Responsible Use

Only test systems you are **authorized** to test. The system enforces scope
controls and blocks targets outside your allowed scope.

---

## 📚 See Also

- [Back to all guides](./README.md)
- [Telegram Bot User Guide](./telegram-bot.md)
- [Online Web User Guide](./online-web.md)
