# 📘 VektorSec — System Summary

> An overview of the architecture, modules, and features of VektorSec.
> Last updated: August 2026

---

## 🧭 System Overview

**VektorSec** is an AI copilot for Penetration Testing, delivered through **3 channels**:

```
┌──────────────────────────────────────────────────────────────┐
│                    VEKTORSEC                           │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐   │
│  │ 1. Telegram  │  │ 2. Platform  │  │ 3. Online Web    │   │
│  │     Bot      │  │   Download   │  │                  │   │
│  │   (Mobile)   │  │     (Git)    │  │  (Browser)       │   │
│  └──────┬───────┘  └──────┬───────┘  └────────┬─────────┘   │
│         │                 │                    │            │
│         ▼                 ▼                    ▼            │
│  ┌──────────────────────────────────────────────────────┐   │
│  │           Shared Backend Core (Agent Engine)          │   │
│  │  Agent Orchestration • Tools • Scope • HITL • Audit   │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Billing & Subscription & Payment Gateway System      │   │
│  └──────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────┘
```

| Channel | API | Pricing | Device |
|---------|-----|---------|--------|
| **Telegram Bot** | Hosted for you | Monthly (cheap) | Mobile |
| **Platform Download** | BYOK (bring your own) | One-time (expensive) | Computer |
| **Online Web** | Hosted for you | Monthly (mid) | Browser |

---

## 🏗️ Backend Architecture

**Tech Stack:** Node.js • TypeScript • Express • MongoDB (Mongoose) • JWT Auth

### Directory Structure

```
backend/
├── src/
│   ├── server.ts                  # Entry point + bootstrap
│   ├── models/                    # Mongoose models
│   ├── controllers/               # Route handlers
│   ├── routes/                    # Express routers
│   ├── services/                  # Business logic
│   ├── middlewares/               # Auth / RBAC / RateLimit / UsageLimit
│   ├── tools/                     # Agent tool system
│   │   ├── registry.ts            # Tool registry
│   │   └── handlers/              # Tool handlers
│   ├── utils/                     # Helpers (getSecrets, executeWithTimeout, etc.)
│   └── config/                    # Config (plans.ts, etc.)
├── tests/
└── package.json
```

### Request Flow

```
Client → Middleware (Auth/JWT) → RBAC → RateLimit → UsageLimit
              → Controller → Service → Model/DB
              → Response JSON
```

---

## 📦 Database Models

| Model | File | Purpose |
|-------|------|---------|
| **User** | `User.model.ts` | User accounts, password hash, role, 2FA |
| **Plan** | `Plan.model.ts` | Service plans + pricing + limits |
| **Subscription** | `Subscription.model.ts` | User subscription status per channel |
| **UsageRecord** | `UsageRecord.model.ts` | Requests/tokens per user/day |
| **PaymentOrder** | `PaymentOrder.model.ts` | Orders + status (pending/paid/confirmed/expired) |
| **PaymentGateway** | `PaymentGateway.model.ts` | Payment channels (LINE Pay, Google Pay, Crypto, etc.) + enable/disable |
| **Billing** | `Billing.model.ts` | Invoices / charges |
| **AuditLog** | `AuditLog.model.ts` | Immutable action log |
| **TelegramUser** | `TelegramUser.model.ts` | Links Telegram accounts with system accounts |

---

## ⚙️ Services (Business Logic)

### Agent / AI Core
| Service | Purpose |
|---------|---------|
| `agent.service.ts` | Main AI agent orchestrator |
| `subagent.manager.ts` | Manage sub-agents |
| `swarm.manager.ts` | Swarm mode (multiple agents in parallel) |
| `modelRouter.ts` | Route to the right LLM model per task |
| `selfCorrection.ts` | Auto-correct agent commands/results on error |
| `hitlPolicy.ts` | Human-in-the-loop — request approval for risky commands |
| `toolWrappers.ts` | Wrappers for security tools |

### Security / Execution
| Service | Purpose |
|---------|---------|
| `sandbox.ts` | Run commands in a safe sandbox |
| `scopeValidator.ts` | Verify the target is within the allowed scope |
| `auditTrail.ts` | Immutable attack trail logging |
| `attackChain.ts` | Build/track the attack chain |
| `evidenceCollector.ts` | Collect evidence for reports |
| `taskQueue.ts` | Async job queue |

### Knowledge / Data
| Service | Purpose |
|---------|---------|
| `knowledgeBase.ts` | Pentest knowledge base |
| `ragPipeline.ts` | Retrieval-Augmented Generation pipeline |
| `vault.ts` | Securely store secrets (encrypted) |

### Billing / Subscription / Payment
| Service | Purpose |
|---------|---------|
| `payment.service.ts` | Create orders, check enabled gateways, payment confirmation |
| `billing.service.ts` | Charging, plan assignment |
| `subscription.service.ts` | Manage subscriptions + activate + auto-renew |
| `plan.service.ts` | Plan CRUD |
| `usageTracker.service.ts` | Track usage and enforce quotas |

### Telegram
| Service | Purpose |
|---------|---------|
| `telegramBot.service.ts` | Telegram Bot API, /start /subscribe /status /usage handling |

---

## 🛡️ Tool System (Agent Tools)

### Registry
`tools/registry.ts` — registers every tool so the API can list available tools to the agent.

### Handlers
| Tool | Purpose |
|------|---------|
| `run-security-tool` | Run security tools (nmap, ffuf, sqlmap, nuclei, etc.) via sandbox |
| `check-scope` | Check whether the target is allowlisted |
| `request-approval` | Request HITL approval for risky commands |
| `approve-command` | Approve a command (HITL) |
| `collect-evidence` | Collect evidence (screenshot, output) |
| `track-attack-chain` | Record attack chain relationships |
| `store-target-memory` | Remember target data between sessions |
| `query-knowledge` | Query the knowledge base |
| `route-model` | Choose/switch LLM model |
| `generate-report` | Generate pentest reports |
| `audit-log` | Write audit trail entries |
| `vault-manage` | Manage secrets in the vault |
| `run-async-task` | Run async tasks |
| `get-task-status` | Check async task status |

---

## 🔐 Authentication & Authorization

| Middleware | Purpose |
|------------|---------|
| Auth (JWT) | Validate tokens, identify users |
| `RBAC.middleware.ts` | Role-based access (admin / user) |
| `RateLimit.middleware.ts` | Limit API call rates |
| `UsageLimit.middleware.ts` | Enforce plan quotas |

**Additional security:**
- 2FA (`twoFactor.service.ts`)
- Audit log for every important action
- Rate limiting against brute force

---

## 💰 Billing / Payment System

### Payment Channels
Admins can enable/disable each gateway from the Admin Payment page (toggle switch) — no code changes needed.

| Channel | Label |
|---------|-------|
| `googlepay` | Google Pay |
| `alipay` | Alipay |
| `linepay` | LINE Pay |
| `crypto_eth` | Crypto (ETH) |
| `crypto_btc` | Crypto (BTC) |
| `crypto_bnb` | Crypto (BNB) |

### Payment Flow
```
Pricing → choose plan → Checkout (choose channel) → create PaymentOrder
       → Admin reviews (AdminPayment) → Mark Paid → Confirm
       → setUserPlan + activateSubscription → user gets access
```

### Order Status
`pending` → `paid` → `confirmed` (or `expired` / `canceled` / `refunded`)

---

## 🖥️ Frontend

**Tech Stack:** Next.js (App Router) • React • SCSS Modules

### Main Pages
| Route / Page | Purpose |
|--------------|---------|
| `/pricing` | Show service plans + prices (from API) |
| `/checkout` | Choose payment channel + create order |
| `/billing` | Invoices / subscription / usage |
| `/admin/payment` | Admin gateway management (enable/disable, config) + view/confirm orders + plan management |

### Key Components
| Component | Purpose |
|-----------|---------|
| `Navbar` | Navigation menu |
| `SettingsOverlay` | User settings (API keys, 2FA, etc.) |
| `AgentToolsPanel` | Panel showing available agent tools |
| `ToolCallBlock` | Show tool calls in the chat transcript |
| `PricingPage` | Plan pricing page |
| `CheckoutPage` | Payment channel selection page |
| `BillingPage` | Account/billing page |
| `AdminPaymentPage` | Admin payment management page |

### Services (API Clients)
| Service | Purpose |
|---------|---------|
| `plan.service.js` | Fetch/manage plans |
| `payment.service.js` | Create orders, list gateways, admin actions |
| `billing.service.js` | Fetch invoices |
| `subscription.service.js` | View/manage subscriptions |

---

## 🔗 API Route Summary

### Auth
| Method | Route | Purpose |
|--------|-------|---------|
| POST | `/api/auth/*` | register, login, 2FA, refresh token |

### Agent
| Method | Route | Purpose |
|--------|-------|---------|
| POST/GET | `/api/agent/*` | Send commands to the agent, view session status |

### Payment
| Method | Route | Purpose |
|--------|-------|---------|
| GET | `/api/payment/gateways` | Enabled channels (public) |
| POST | `/api/payment/order` | Create order (auth) |
| GET | `/api/payment/orders` | View own orders (auth) |
| GET | `/api/payment/admin/gateways` | View all gateways (admin) |
| POST | `/api/payment/admin/gateways` | Save/enable/disable gateways (admin) |
| GET | `/api/payment/admin/orders` | View all orders (admin) |
| POST | `/api/payment/admin/orders/:id/paid` | Mark as paid (admin) |
| POST | `/api/payment/admin/orders/:id/confirm` | Confirm + activate plan (admin) |

### Plans
| Method | Route | Purpose |
|--------|-------|---------|
| GET/POST | `/api/plans/*` | View/manage service plans |

### Billing / Subscription
| Method | Route | Purpose |
|--------|-------|---------|
| GET/POST | `/api/billing/*` | Invoices |
| GET/POST | `/api/subscription/*` | User subscriptions |

### Telegram
| Method | Route | Purpose |
|--------|-------|---------|
| POST | `/api/telegram/webhook` | Webhook from Telegram |

---

## 🧩 Key Features

1. **AI Agent Orchestration** — swarm, sub-agents, self-correction
2. **Scope Control** — prevent out-of-scope attacks
3. **HITL (Human-in-the-Loop)** — approval for risky commands
4. **Sandbox** — run tools in a safe environment
5. **Audit Trail** — immutable logging
6. **Evidence Collection** — automatic evidence + report generation
7. **RAG Knowledge Base** — up-to-date techniques/data for the AI
8. **Vault** — encrypted secret storage
9. **Multi-channel Billing** — LINE Pay / Google Pay / Crypto
10. **Admin-managed pricing** — no code changes; enable/disable gateways instantly
11. **Usage-based limits** — enforce plan quotas
12. **Telegram Bot** — use from your mobile

---

## 🚀 Running the System

```bash
# Backend
cd backend && pnpm install && pnpm dev

# Frontend
cd frontend && pnpm install && pnpm dev

# Everything (Docker)
docker compose up -d
```

See also: [INSTALL_GUIDE.md](./INSTALL_GUIDE.md) • [USER_GUIDE.md](./USER_GUIDE.md) • [ARCHITECTURE_PLAN.md](../ARCHITECTURE_PLAN.md)

---

## 📌 Summary

VektorSec is a multi-channel AI pentest copilot system consisting of
an **Agent Engine** (orchestration + tools + scope + HITL + audit),
a **Billing/Payment/Subscription** system (multi-gateway + admin panel),
and **3 service channels** (Telegram Bot / Platform Download / Online Web),
with layered security (2FA, RBAC, RateLimit, Sandbox, Vault, Audit Log).
