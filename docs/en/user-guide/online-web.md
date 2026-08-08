# 🌐 VektorSec — Online Web User Guide

Use VektorSec from your browser — nothing to install. Ideal for quick,
on-the-go pentesting with a hosted API.

---

## 📑 Table of Contents

1. [Overview](#-overview)
2. [Getting Started](#-getting-started)
3. [Plans & Payment](#-plans--payment)
4. [Using the Agent](#-using-the-agent)
5. [Billing & Usage](#-billing--usage)
6. [Troubleshooting](#-troubleshooting)

---

## 🧭 Overview

The **Online Web** version runs entirely in your browser. We host the API and
the AI models, so you don't need to install anything or bring your own API key.

| Feature | Online Web |
|---------|------------|
| Device | Browser |
| Installation | None |
| API key | Hosted (we provide) |
| Pricing | Monthly (mid) |
| aircrack / Wi-Fi | ❌ |
| Offline mode | ❌ |

---

## 🚀 Getting Started

1. Open the VektorSec website in your browser
2. Sign up / log in
3. Subscribe to a plan (see below)
4. Open a chat and start using the agent

---

## 💳 Plans & Payment

### Available Plans

| Plan | Monthly | Annual | Features |
|------|---------|--------|----------|
| **Free** | $0 | $0 | Basic, limited usage |
| **Pro** | $49 | $39/mo | Unlimited, Sandbox, Knowledge Base |
| **Team** | $149 | $119/mo | Multi-agent, Priority support |
| **Enterprise** | $499 | $399/mo | All features, SLA, SSO |

> Prices shown are examples — your admin may adjust them.

### How to Subscribe

1. Go to the **Pricing** page (`/pricing`)
2. Choose a plan → click **Upgrade**
3. Choose the billing period (Monthly / Annual)
4. Choose a payment channel → click **Checkout**
5. Complete the payment
6. Once the admin confirms, your plan is activated automatically

### Payment Methods

| Channel | Type |
|---------|------|
| Google Pay | Card / wallet |
| Alipay | Wallet |
| LINE Pay | Wallet |
| Crypto (ETH / BTC / BNB) | Cryptocurrency |

---

## 🤖 Using the Agent

Open a chat and describe your task in plain language, for example:

```
Scan the website http://testphp.vulnweb.com
```

The agent will:
- Plan the approach
- Run security tools (nmap, ffuf, sqlmap, nuclei, etc.) in a sandbox
- Analyze results and iterate
- Collect evidence and generate a report

You can also use the agentic tools directly:

```
# Run a long scan in the background
run_async_task command="nmap -sV -p- 10.10.10.10" task_type="nmap_scan"

# Check progress
get_task_status task_id=<task_id>

# Search CVEs in the knowledge base
query_knowledge query="Apache Log4j RCE"

# View the audit trail
audit_log action="command_executed"
```

---

## 📊 Billing & Usage

- Open the **Billing** page (`/billing`) to see your current plan, expiry date,
  and payment history
- Open the **Subscription** page to see all subscriptions across channels
- Check **Usage** to see your usage (today / last 30 days)

If you reach your plan's daily limit, the system returns a usage-limit error.
You can wait for the daily reset or upgrade your plan.

---

## ❓ Troubleshooting

| Problem | Solution |
|---------|----------|
| No payment channels on checkout | Contact admin to enable gateways |
| "Usage limit reached" | You hit your daily limit — wait for reset or upgrade |
| Agent not running | Contact admin to configure a model |
| Order stays pending | The admin must confirm your payment |
| Payment not activated | The admin must confirm your payment order |

---

## 🛡️ Responsible Use

Only test systems you are **authorized** to test. The system enforces scope
controls and blocks targets outside your allowed scope.

---

## 📚 See Also

- [Back to all guides](./README.md)
- [Telegram Bot User Guide](./telegram-bot.md)
- [Platform User Guide](./platform.md)
