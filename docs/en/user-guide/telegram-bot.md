# 📱 VektorSec — Telegram Bot User Guide

Use VektorSec right from your phone via Telegram. No installation needed —
everything runs on our servers.

---

## 📑 Table of Contents

1. [Getting Started](#-getting-started)
2. [Subscribing & Payment](#-subscribing--payment)
3. [Using the Agent](#-using-the-agent)
4. [All Commands](#-all-commands)
5. [Checking Usage & Status](#-checking-usage--status)
6. [Troubleshooting](#-troubleshooting)

---

## 🚀 Getting Started

1. Open **Telegram** on your phone
2. Search for the **VektorSec bot** (the bot username provided by your admin)
3. Press **Start** or type `/start`
4. The bot replies with a welcome message and the list of commands

> 💡 **Tip:** You must have a **platform account** that is **linked** to your
> Telegram ID before you can use the agent. If you haven't been linked yet,
> contact your admin.

---

## 💳 Subscribing & Payment

1. Type `/subscribe` to see the available plans and prices for Telegram
2. Choose a plan
3. Complete the payment (see [Payment Methods](#payment-methods))
4. Once the admin confirms your payment, your subscription is activated

### Payment Methods

| Channel | Type |
|---------|------|
| Google Pay | Card / wallet |
| Alipay | Wallet |
| LINE Pay | Wallet |
| Crypto (ETH / BTC / BNB) | Cryptocurrency |

> After paying, the admin will confirm your order and your plan will be
> activated automatically.

---

## 🤖 Using the Agent

Once you have an active subscription, just send a message in any free-form
style. For example:

```
scan http://testphp.vulnweb.com
```

The bot sends your request to the AI agent and reports progress in real time:

- 💭 **thinking** — the agent is planning
- 🔧 **tool running** — a security tool is executing
- ✅ **tool done** — a tool finished successfully

You can ask for reconnaissance, web scanning, SQL injection testing, and more.
The agent runs the tools, analyzes the results, and iterates automatically.

---

## 📋 All Commands

| Command | Description |
|---------|-------------|
| `/start` | Welcome message + command list |
| `/help` | Show all commands |
| `/subscribe` | Show plans and prices for Telegram |
| `/status` | Check your subscription status |
| `/usage` | Check today's usage (requests, tokens, cost) |
| `/cancel` | Cancel your subscription |
| `/admin` | Admin commands (admins only) — see below |

---

## 🛠️ Admin Commands (for testing)

> ⛔ **Admins only.** A user is considered an admin if **either**:
> 1. Their Telegram ID is listed in the `TELEGRAM_ADMIN_IDS` env var
>    (comma-separated) — the easiest way to test admin commands without
>    linking to a platform account, **or**
> 2. They have a **linked platform account** whose role is `admin`.
>
> Non-admins get an "Access denied" message.

### Setting up a test admin via env var

To grant admin access to a Telegram user for testing, add their Telegram user
ID to the `TELEGRAM_ADMIN_IDS` env var in `backend/.env`:

```
TELEGRAM_ADMIN_IDS=123456789,987654321
```

> 💡 **How to find your Telegram user ID:** message the bot (e.g. `/start`),
> then run `/admin users` as an existing admin, or use `@userinfobot` on
> Telegram. The ID is a numeric value like `123456789`.

Once set, that user can use all `/admin` commands immediately — no platform
account or linking required.


| Command | Description |
|---------|-------------|
| `/admin` | Show admin help |
| `/admin users` | List Telegram users (last 100) |
| `/admin link <telegramId> <userId>` | Link a Telegram user to a platform account |
| `/admin unlink <telegramId>` | Unlink a Telegram user |
| `/admin grant <userId> <plan>` | Activate a subscription (plan: free/pro/team/enterprise) |
| `/admin revoke <userId>` | Cancel a subscription |
| `/admin subs` | List all subscriptions |
| `/admin status` | Show bot status (configured / running) |

### Example — testing the full flow

1. **User** presses `/start` with the bot → a `TelegramUser` record is created.
2. **Admin** runs `/admin users` → find the user's `telegramId`.
3. **Admin** runs `/admin link <telegramId> <userId>` → link to a platform account.
4. **Admin** runs `/admin grant <userId> pro` → activate a paid plan.
5. **User** sends a message → the agent runs.


---

## � Checking Usage & Status

- **`/status`** — shows your current plan, expiry date, and subscription status
- **`/usage`** — shows today's usage (requests, tokens, and estimated cost)

If you reach your plan's daily limit, the bot will notify you:
```
⚠️ Usage limit reached...
```

---

## ❓ Troubleshooting

| Problem | Solution |
|---------|----------|
| Bot doesn't reply | Make sure the bot is configured and running; contact admin |
| "Not linked" error | Your Telegram ID must be linked to a platform account by the admin |
| "No subscription" error | Subscribe with `/subscribe` or ask the admin to activate a plan |
| "Usage limit reached" | You hit your daily limit — wait for reset or upgrade |
| Payment not activated | The admin must confirm your payment order |

---

## 🛡️ Responsible Use

Only test systems you are **authorized** to test. The system blocks targets
outside your allowed scope.

---

## �📚 See Also

- [Back to all guides](./README.md)
- [Online Web User Guide](./online-web.md)
- [Platform User Guide](./platform.md)
