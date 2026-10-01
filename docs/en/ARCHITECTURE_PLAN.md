# 🏗️ VektorSec — 3-Channel Architecture Plan

> 🇹🇭 **ไทย**: [แผนสถาปัตยกรรม 3 ช่องทาง](../ARCHITECTURE_PLAN.md)

This document plans the architecture for delivering **VektorSec** through three
channels, together with the Trial system, billing, and reverse-engineering protection.

---

## 📑 Table of Contents

1. [Business model overview](#-business-model-overview)
2. [Channel 1: Telegram Bot (mobile)](#-channel-1-telegram-bot-mobile)
3. [Channel 2: Platform Download (Git)](#-channel-2-platform-download-git)
4. [Channel 3: Online Web](#-channel-3-online-web)
5. [Trial system](#-trial-system)
6. [Billing & Subscription](#-billing--subscription)
7. [Reverse-engineering protection](#-reverse-engineering-protection)
8. [Shared backend architecture](#-shared-backend-architecture)
9. [Price table (examples)](#-price-table-examples)
10. [Development roadmap](#-development-roadmap)

---

## 💼 Business model overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    VEKTORSEC                                    │
│                                                                 │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────────────┐   │
│  │ 1. Telegram │  │ 2. Platform  │  │ 3. Online Web       │   │
│  │    Bot      │  │    Download  │  │                     │   │
│  │  (Mobile)   │  │    (Git)     │  │                     │   │
│  └──────┬──────┘  └──────┬───────┘  └─────────┬────────────┘   │
│         │                │                    │                │
│         ▼                ▼                    ▼                │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              Hosted API (we rent it)                   │   │
│  │   We rent the LLM API (Claude/GPT) and add a margin     │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              Customer's own API (BYOK)                  │   │
│  │   Platform Download channel only                        │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

### Summary of the three channels

| Property | 1. Telegram Bot | 2. Platform Download | 3. Online Web |
|-----------|----------------|----------------------|---------------|
| **Device** | Mobile | Computer | Browser |
| **API** | Hosted (we rent it) | BYOK (bring your own key) | Hosted (we rent it) |
| **Pricing** | Monthly (cheap) | One-time / more expensive | Monthly (mid) |
| **aircrack** | ❌ not possible (mobile) | ✅ possible (via computer) | ❌ limited |
| **Installation** | none (uses Telegram) | clone + install | none (open the browser) |
| **Reverse risk** | low (stays on our side) | **high** (needs protection) | low (stays on our side) |
| **Trial** | ✅ yes | ✅ yes | ✅ yes |

---

## 📱 Channel 1: Telegram Bot (mobile)

### Concept
Users work through a **Telegram Bot** on their phone without installing anything.
Everything runs on our servers (the API we rent).

### Architecture

```
┌──────────┐     ┌──────────────────┐     ┌─────────────────┐
│ Telegram │────▶│  Telegram Bot    │────▶│  Pentest Engine │
│  Mobile  │     │  (backend)       │     │  (backend)      │
└──────────┘     └──────────────────┘     └─────────────────┘
                        │                        │
                        ▼                        ▼
                 ┌──────────────┐        ┌──────────────┐
                 │  Subscription│        │  Hosted API  │
                 │  (monthly)   │        │  (we rent)   │
                 └──────────────┘        └──────────────┘
```

### Mobile-friendly features
- ✅ Reconnaissance (nmap, subdomain enum)
- ✅ Web scan (nuclei, ffuf)
- ✅ SQL injection (sqlmap)
- ✅ View result reports
- ❌ aircrack (needs a wireless adapter — not practical on a phone)

### Subscription flow (Telegram)
- `/start` → the system creates an account
- `/subscribe` → pick a plan → pay → activate
- `/trial` → start a free trial
- `/status` → view subscription status
- `/usage` → view usage (tokens, requests)

### Pros
- Nothing to install — usable immediately
- The API lives on our side — customers cannot reverse it
- Easy to control usage and billing

### Limitations
- No aircrack support (needs a wireless adapter)
- Constrained by the Telegram UI

---

## 💻 Channel 2: Platform Download (Git)

### Concept
Customers **clone/download the project from Git** and install it on their own machine.
This is the only channel that works with **aircrack** (it needs a wireless adapter via a computer).
Customers supply **their own API key (BYOK)** — the price is higher.

### Architecture

```
┌─────────────────────────────────────────────────────────┐
│              Customer machine (local)                    │
│                                                         │
│  ┌──────────────┐    ┌──────────────────────────────┐   │
│  │ Pentest CLI  │    │  License Manager (local)     │   │
│  │ (aircrack,   │    │  - validate the license key  │   │
│  │  nmap, ...)  │    │  - check trial expiry        │   │
│  └──────┬───────┘    └──────────────┬───────────────┘   │
│         │                           │                   │
│         ▼                           ▼                   │
│  ┌──────────────────────────────────────────────┐       │
│  │  BYOK API (customer supplies the key)        │       │
│  │  - OpenAI / Anthropic / local LLM            │       │
│  └──────────────────────────────────────────────┘       │
└─────────────────────────────────────────────────────────┘
                        │
                        ▼  (license checks only)
                 ┌──────────────────┐
                 │  License Server  │
                 │  (our side)      │
                 └──────────────────┘
```

### Supported features
- ✅ Everything, including **aircrack** (through a wireless adapter)
- ✅ Bring your own API (BYOK) — OpenAI, Anthropic, local LLM
- ✅ Runs offline (once an API key is configured)
- ✅ Full control of the machine

### License system (Platform)
- **License Key** — customers buy and receive a key (e.g. `PC-XXXX-XXXX-XXXX`)
- **Trial** — a free 7-day key (feature-limited)
- **Online validation** — the first run must reach the license server to activate
- **Offline mode** — after activation it works offline (for a configured period)

### Pros
- aircrack works (through a computer)
- Customers control the machine completely
- Their own API key — no dependency on our API

### Limitations / risks
- ⚠️ **Reverse-engineering risk** — must be protected (see the section below)
- Customers install dependencies themselves
- More expensive (one-time payment + license)

---

## 🌐 Channel 3: Online Web

### Concept
Users work through a **web browser** (the system that already exists) and use the API we
rent — billed monthly.

### Architecture

```
┌──────────┐     ┌──────────────────┐     ┌─────────────────┐
│ Browser  │────▶│  Frontend (Next) │────▶│  Backend API    │
│  (Web)   │     │  /pricing        │     │  (Express)      │
└──────────┘     │  /checkout       │     └────────┬────────┘
                 │  /billing        │              │
                 └──────────────────┘              ▼
                                            ┌──────────────┐
                                            │  Hosted API  │
                                            │  (we rent)   │
                                            └──────────────┘
```

### Features
- ✅ Works in a browser with no installation
- ✅ Uses the existing Payment/Plan system (Pricing, Checkout, Billing)
- ✅ Uses the API we rent
- ✅ View reports/evidence online

### Limitations
- ❌ no aircrack (needs a wireless adapter through a computer)
- Constrained by the web sandbox

---

## 🎁 Trial system

### Concept
Let users try before they buy — with limited features and a limited period.

### Trial rules (all channels)

| Rule | Detail |
|----------|-----------|
| **Duration** | 7 days (configurable) |
| **Request limit** | e.g. 50 requests/day |
| **Token limit** | e.g. 100K tokens/day |
| **Feature limits** | no aircrack, no sandbox, no multi-agent |
| **Target limits** | only allow-listed targets (never production) |
| **Account required** | an account is required (email/telegram) |
| **One per person** | one trial per account/device |

### How to start a trial

**Telegram:** press `/trial` → a 7-day trial starts
**Online Web:** Pricing page → click "Try Free" → sign up → the trial starts automatically
**Platform:** download → run `./vektorsec --trial` → receive a 7-day trial key

### After the trial ends
- Reminder 24 hours before expiry (email/telegram)
- The user must buy a subscription to continue
- Trial data is kept (not deleted) — subscribing continues from the same data

---

## 💰 Billing & Subscription

> ### ⭐ Key principle: **the Admin sets all prices from the Admin Panel**
> Prices are **never hardcoded** — the Admin can change them at any time through the
> Admin Panel without touching code or redeploying.

### Channel-based pricing

Each channel (Telegram / Platform / Online) has its own prices, even for the same plan
(e.g. Pro can be priced differently per channel).

```
┌─────────────────────────────────────────────────────────────┐
│                    ADMIN PANEL — set prices                 │
│                                                             │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  Plan: Pro                                            │  │
│  │                                                       │  │
│  │  ┌──────────┬──────────┬──────────┬──────────┐        │  │
│  │  │ Channel  │ /month   │ /year    │ enabled  │        │  │
│  │  ├──────────┼──────────┼──────────┼──────────┤        │  │
│  │  │ Telegram │  $19     │  $190    │  [✓]     │        │  │
│  │  │ Online   │  $29     │  $290    │  [✓]     │        │  │
│  │  │ Platform │  $299    │  —       │  [✓]     │        │  │
│  │  └──────────┴──────────┴──────────┴──────────┘        │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### Pricing model (default examples — the Admin can change them)

| Channel | Plan | Price | API | Features |
|---------|-----|------|-----|---------|
| **Telegram** | Trial | free 7 days | ours | limited |
| **Telegram** | Basic | $19/month | ours | 100 req/day |
| **Telegram** | Pro | $49/month | ours | unlimited |
| **Online** | Trial | free 7 days | ours | limited |
| **Online** | Basic | $29/month | ours | 100 req/day |
| **Online** | Pro | $79/month | ours | unlimited + sandbox |
| **Platform** | Trial | free 7 days | BYOK | limited |
| **Platform** | Lifetime | $299 (one-time) | BYOK | everything + aircrack |
| **Platform** | Enterprise | $999 (one-time) | BYOK | everything + multi-device license |

> ⚠️ The numbers above are only **defaults** — the Admin can change them any time from the Admin Panel.

### How billing works
- **Telegram + Online:** we rent the API → we charge a margin on top of the API cost
  - e.g. we pay $0.01/req for the Claude API → we charge $0.05/req
- **Platform:** the customer supplies their own API → we carry no API cost → the license is priced higher
  - in return they get aircrack + full control of the machine

### Subscription system (to implement)
- **Subscription model** — tracks active/expired/trial state
- **Auto-renew** — automatic renewal (through a payment gateway)
- **Usage tracking** — count requests/tokens per user
- **Usage limit** — cut off usage once the quota is exceeded
- **Notification** — warn before expiry

### Admin price-management system (to implement)

#### Backend — add channel pricing to the Plan model
```typescript
// add a per-channel pricing field to the Plan model
interface ChannelPricing {
  telegram?: { priceMonthly: number; priceAnnual: number; enabled: boolean };
  online?:   { priceMonthly: number; priceAnnual: number; enabled: boolean };
  platform?: { priceLifetime: number; priceEnterprise: number; enabled: boolean };
}
```

#### API endpoints (admin)
| Method | Route | Purpose |
|--------|-------|--------|
| `GET` | `/api/plans/admin` | list all plans (already exists) |
| `PUT` | `/api/plans/admin/:planId` | edit a plan + per-channel prices |
| `POST` | `/api/plans/admin` | create a plan (already exists) |

#### Frontend — Admin Panel page
- **`/admin/plans` page** — a table of all plans
- **Edit button** — opens a modal to edit per-channel pricing
- **Fields:** price/month, price/year (Telegram, Online), Lifetime/Enterprise price (Platform)
- **Toggle** each channel on/off
- **Save** → calls `PUT /api/plans/admin/:planId`

> The current Plan system already supports editing prices through the API (`updatePlan`),
> but **channel pricing** and the **Admin UI** for editing prices still need to be added.

---

## 🔒 Reverse-engineering protection

> ⚠️ **Most important for the Platform Download channel** — customers can inspect the code

### Protection strategy (defence in depth)

#### Layer 1: License key + activation
```
┌─────────────────────────────────────────────────────┐
│ 1. Customer buys → receives a License Key           │
│ 2. First run → the app asks for the key + sends HW  │
│    fingerprint                                      │
│ 3. The license server validates it + binds the key  │
│    to the machine                                   │
│ 4. The app stores a signed token (JWT) locally      │
│ 5. Every X days → re-check with the server (online) │
└─────────────────────────────────────────────────────┘
```

- **HW fingerprint** — bind the license to hardware (MAC, CPU ID, disk serial)
- **Signed token** — sign with RSA/Ed25519 to prevent tampering
- **Online check** — periodic validation (e.g. every 7 days) to stop bypasses

#### Layer 2: Code obfuscation
- **Minify + obfuscate** JavaScript/TypeScript (with `javascript-obfuscator`)
- **Compile to binary** — use `pkg` / `nexe` / Bun compile so the code cannot be read
- **Native module** — implement the critical part (license check) as a native addon (C++/Rust)

#### Layer 3: API key protection (BYOK)
- **Never hardcode** API keys — keep them in env/config
- **Encrypt config** — encrypt the config file with a machine-bound key
- **Rate limit** — cap API calls per license

#### Layer 4: Server-side logic
- **Move critical logic server-side** — customers can only reverse the client
- **Feature flags** — premium features are validated by the server
- **Telemetry** — report usage back (to detect abuse)

#### Layer 5: Legal & watermark
- **License agreement** — explicitly forbid reverse engineering
- **Watermark** — embed a watermark in reports (identifies the license owner)
- **DMCA takedown** — be ready for violations

### Protection levels

| Level | Method | Cost | Effectiveness |
|-------|------|--------|------------|
| Basic | License key + HW fingerprint | low | medium |
| Medium | + obfuscation + signed token | medium | good |
| High | + compile to binary + native module | high | very good |
| Maximum | + server-side logic + telemetry | very high | best |

> **Recommendation:** start at the medium level (license + obfuscation + signed token) and
> add more over time. Nothing stops reverse engineering 100% — the goal is to make it
> "not worth reversing".

---

## 🧩 Shared backend architecture

### Modules shared by all three channels

```
┌─────────────────────────────────────────────────────────────┐
│                    SHARED BACKEND CORE                      │
│                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐   │
│  │ Agent Engine │  │ Tool Wrappers│  │ Self-Correction  │   │
│  │ (orchestrator│  │ (nmap, ffuf, │  │ (auto-fix the    │   │
│  │  swarm, ...) │  │  sqlmap, ...)│  │  command)        │   │
│  └──────────────┘  └──────────────┘  └──────────────────┘   │
│                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐   │
│  │ Scope Control│  │ HITL Policy  │  │ Audit Trail      │   │
│  │ (check scope)│  │ (approve     │  │ (immutable log)  │   │
│  │              │  │  risky ops)  │  │                  │   │
│  └──────────────┘  └──────────────┘  └──────────────────┘   │
│                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐   │
│  │ Knowledge    │  │ Vault        │  │ Task Queue       │   │
│  │ Base + RAG   │  │ (secrets)    │  │ (async jobs)     │   │
│  └──────────────┘  └──────────────┘  └──────────────────┘   │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  NEW: Subscription & License Manager                 │   │
│  │  - Trial management                                  │   │
│  │  - Usage tracking (requests/tokens)                  │   │
│  │  - License key generation & validation               │   │
│  │  - HW fingerprint binding                            │   │
│  │  - Plan enforcement (feature flags)                  │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### New modules to build

| Module | Purpose | Channel |
|-------|--------|---------|
| `subscription.service.ts` | manage subscriptions, trials, auto-renew | all |
| `usageTracker.service.ts` | count requests/tokens per user | all |
| `license.service.ts` | generate/validate license keys, HW fingerprint | Platform |
| `telegramBot.service.ts` | connect to the Telegram Bot API | Telegram |
| `telegramBot.controller.ts` | handle the /start /subscribe /trial commands | Telegram |
| `license.middleware.ts` | verify the license before running a command | Platform |
| `usageLimit.middleware.ts` | cut off usage when the quota is exceeded | all (exists) |

### New models to create

| Model | Main fields |
|-------|----------|
| `Subscription` | userId, plan, channel, status, startDate, endDate, trial |
| `UsageRecord` | userId, channel, date, requests, tokens, cost |
| `License` | licenseKey, userId, hwFingerprint, status, expiresAt, maxDevices |
| `TelegramUser` | telegramId, userId, chatId, subscriptionId |

---

## 💵 Price table (examples)

### Telegram Bot (uses the API we rent)

| Plan | Price/month | Requests/day | Tokens/day | Features |
|-----|-----------|--------------|------------|---------|
| Trial | free 7 days | 20 | 50K | basic |
| Basic | $19 | 100 | 200K | recon + web scan |
| Pro | $49 | unlimited | 1M | + sqlmap + report |

### Online Web (uses the API we rent)

| Plan | Price/month | Requests/day | Tokens/day | Features |
|-----|-----------|--------------|------------|---------|
| Trial | free 7 days | 20 | 50K | basic |
| Basic | $29 | 100 | 200K | recon + web scan |
| Pro | $79 | unlimited | 1M | + sandbox + multi-agent |

### Platform Download (BYOK — bring your own API key)

| Plan | Price | License | Features |
|-----|------|---------|---------|
| Trial | free 7 days | trial key | limited |
| Lifetime | $299 one-time | 1 machine | everything + aircrack |
| Enterprise | $999 one-time | 5 machines | + priority support |

---

## 🗺️ Development roadmap

### Phase 1: Subscription & Trial system (foundation)
- [x] Create the `Subscription` model + service → `models/Subscription/Subscription.model.ts`, `services/subscription.service.ts`
- [x] Create the `UsageRecord` model + usage tracker → `models/UsageRecord/UsageRecord.model.ts`, `services/usageTracker.service.ts`
- [x] Add the trial flow to the existing payment system → `startTrial()` + `POST /api/subscriptions/me/:channel/trial` + the "Start Free Trial" button on the Pricing page + the Telegram `/trial` command
- [x] Add per-plan feature flags (feature limiting) → `Plan.features[]`, `Plan.limits`, `middlewares/UsageLimit.middleware.ts`

### Phase 2: Online Web (adapt the existing system)
- [x] Add a trial button to the Pricing page → the "Welcome Trial" card (the `free` plan) in `frontend/src/components/pages/PricingPage.jsx`
- [x] Add a usage dashboard to the Billing page → `BillingPage.jsx` calls `getUsage()` and renders usage bars
- [x] Connect the hosted API (that we rent) to the backend → through the model registry (Settings → Models) that stores provider API keys
- [x] Configure our API key in config → `backend/model-registry.json` (never committed) + the Settings → Models page

### Phase 3: Telegram Bot
- [x] Create `telegramBot.service.ts` → calls the Telegram Bot API over HTTP directly (no `node-telegram-bot-api`)
- [x] Implement the /start /subscribe /trial /status /usage commands → complete (`/trial` reuses the same `startTrial()` service as the web checkout)
- [ ] Connect it to the Agent Engine → nothing in the Telegram flow calls the agent runtime yet
- [ ] Subscription handling through Telegram → plans/status are shown, but the full subscribe + pay flow in chat is missing

### Phase 4: Platform Download + License
- [ ] Create `license.service.ts` + the License model → **not implemented** (there is no License model in the repo)
- [ ] Create HW fingerprint + signed token
- [ ] Create a CLI entry point (the `vektorsec` command)
- [ ] Obfuscate + compile to a binary → note: the obfuscator was intentionally removed (see `docs/en/BLACKBOX_ARCHITECTURE.md`, Build Pipeline)
- [x] BYOK support (bring your own API key) → works in practice through the model registry (Settings → Models)

### Phase 5: Reverse-engineering protection
- [ ] License key + HW binding
- [ ] Code obfuscation → for a public repo this is limited to minify + disabled source maps (`next.config.js`)
- [ ] Signed token + online check
- [ ] (Extra) compile to binary + native module

> 📌 Implementation status above was verified against the actual code (September 2026) — see
> [ROADMAP_NEXT.md](./ROADMAP_NEXT.md) for the remaining work and its priority.

> ℹ️ In practice Phases 1–3 are already largely implemented in this repo
> (`subscription.service.ts`, `usageTracker.service.ts`, `telegramBot.service.ts`,
> `Subscription`/`UsageRecord`/`TelegramUser` models, `/admin/plans`). Phases 4–5 are
> **not** implemented — there is no License model, CLI entry point or obfuscation yet.

---

## 📌 Summary

1. **Telegram Bot** — uses the API we rent, monthly, nothing to install, no aircrack
2. **Platform Download** — BYOK, more expensive, aircrack works, needs reverse protection
3. **Online Web** — uses the API we rent, monthly, the existing payment system
4. **Trial** — free 7 days on every channel, with feature/usage limits
5. **Billing** — Telegram/Online are usage-based (our API), Platform sells a one-time license
6. **Reverse protection** — license + HW fingerprint + obfuscation + signed token (defence in depth)

---

## 📚 See Also

- [Install Guide](./INSTALL_GUIDE.md)
- [User Guide](./USER_GUIDE.md)
- [System Summary](./SYSTEM_SUMMARY.md)
- [Next Roadmap](./ROADMAP_NEXT.md)
- [README.md](../../README.md)
