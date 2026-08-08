# 📘 VektorSec — สรุประบบทั้งหมด (System Summary)

> สรุปภาพรวมสถาปัตยกรรม โมดูล และฟีเจอร์ของระบบ VektorSec
> อัปเดตล่าสุด: สิงหาคม 2026

---

## 🧭 ภาพรวมระบบ

**VektorSec** คือ AI Copilot สำหรับงาน Pentest (Penetration Testing) ที่ให้บริการผ่าน **3 ช่องทาง**:

```
┌──────────────────────────────────────────────────────────────┐
│                    VEKTORSEC                           │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐   │
│  │ 1. Telegram  │  │ 2. Platform  │  │ 3. Online Web    │   │
│  │     Bot      │  │   Download   │  │                  │   │
│  │   (มือถือ)    │  │     (Git)    │  │  (เบราว์เซอร์)    │   │
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

| ช่องทาง | API | ราคา | อุปกรณ์ |
|---------|-----|------|--------|
| **Telegram Bot** | เราเช่าให้ | รายเดือน (ถูก) | มือถือ |
| **Platform Download** | BYOK (ลูกค้าใส่เอง) | จ่ายครั้งเดียว (แพง) | คอมพิวเตอร์ |
| **Online Web** | เราเช่าให้ | รายเดือน (กลาง) | เบราว์เซอร์ |

---

## 🏗️ สถาปัตยกรรม Backend

**Tech Stack:** Node.js • TypeScript • Express • MongoDB (Mongoose) • JWT Auth

### โครงสร้าง Directory

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
│   ├── utils/                     # Helpers (getSecrets, executeWithTimeout ฯลฯ)
│   └── config/                    # Config (plans.ts ฯลฯ)
├── tests/
└── package.json
```

### วงจรการทำงานหลัก (Request Flow)

```
Client → Middleware (Auth/JWT) → RBAC → RateLimit → UsageLimit
              → Controller → Service → Model/DB
              → Response JSON
```

---

## 📦 Models (ฐานข้อมูล)

| Model | ไฟล์ | หน้าที่ |
|-------|------|--------|
| **User** | `User.model.ts` | บัญชีผู้ใช้, password hash, role, 2FA |
| **Plan** | `Plan.model.ts` | แผนบริการ + ราคา + ขีดจำกัด |
| **Subscription** | `Subscription.model.ts` | สถานะ subscription ของผู้ใช้ต่อช่องทาง |
| **UsageRecord** | `UsageRecord.model.ts` | นับ requests/tokens ต่อผู้ใช้/วัน |
| **PaymentOrder** | `PaymentOrder.model.ts` | คำสั่งซื้อ + สถานะ (pending/paid/confirmed/expired) |
| **PaymentGateway** | `PaymentGateway.model.ts` | ตั้งค่าช่องทางรับเงิน (LINE Pay, Google Pay, Crypto ฯลฯ) + เปิด/ปิด |
| **Billing** | `Billing.model.ts` | ใบแจ้งหนี้ / รายการเรียกเก็บเงิน |
| **AuditLog** | `AuditLog.model.ts` | บันทึกการดำเนินการ (immutable log) |
| **TelegramUser** | `TelegramUser.model.ts` | ผูกบัญชี Telegram กับบัญชีระบบ |

---

## ⚙️ Services (Business Logic)

### Agent / AI Core
| Service | หน้าที่ |
|---------|--------|
| `agent.service.ts` | orchestrator หลักของ AI agent |
| `subagent.manager.ts` | จัดการ sub-agents |
| `swarm.manager.ts` | จัดการ swarm mode (หลาย agents พร้อมกัน) |
| `modelRouter.ts` | เลือก LLM model ให้เหมาะสมกับงาน |
| `selfCorrection.ts` | ให้ agent แก้คำสั่ง/ผลลัพธ์เองเมื่อผิดพลาด |
| `hitlPolicy.ts` | Human-in-the-loop — ขออนุมัติคำสั่งเสี่ยง |
| `toolWrappers.ts` | wrapper ของ security tools |

### Security / Execution
| Service | หน้าที่ |
|---------|--------|
| `sandbox.ts` | รันคำสั่งใน sandbox ปลอดภัย |
| `scopeValidator.ts` | ตรวจสอบว่า target อยู่ใน scope ที่อนุญาต |
| `auditTrail.ts` | บันทึก trail การโจมตีแบบ immutable |
| `attackChain.ts` | สร้าง/ติดตาม attack chain |
| `evidenceCollector.ts` | เก็บ evidence หลักฐานสำหรับรายงาน |
| `taskQueue.ts` | คิวงาน async |

### Knowledge / Data
| Service | หน้าที่ |
|---------|--------|
| `knowledgeBase.ts` | ฐานความรู้ pentest |
| `ragPipeline.ts` | Retrieval-Augmented Generation pipeline |
| `vault.ts` | เก็บ secrets ปลอดภัย (เข้ารหัส) |

### Billing / Subscription / Payment
| Service | หน้าที่ |
|---------|--------|
| `payment.service.ts` | สร้าง order, ตรวจสอบ gateway เปิด/ปิด, ระบบยืนยันชำระเงิน |
| `billing.service.ts` | เรียกเก็บเงิน, ตั้งแผนให้ผู้ใช้ |
| `subscription.service.ts` | จัดการ subscription + activate + auto-renew |
| `plan.service.ts` | CRUD แผนบริการ |
| `usageTracker.service.ts` | นับการใช้งานและตรวจ quota |

### Telegram
| Service | หน้าที่ |
|---------|--------|
| `telegramBot.service.ts` | เชื่อมต่อ Telegram Bot API, จัดการคำสั่ง /start /subscribe /status /usage |

---

## 🛡️ Tool System (Agent Tools)

### Registry
`tools/registry.ts` — ลงทะเบียน tool ทุกตัว เพื่อให้ API ส่งรายการ tool ที่มีอยู่ไปยัง agent

### Handlers
| Tool | หน้าที่ |
|------|--------|
| `run-security-tool` | รัน security tool (nmap, ffuf, sqlmap, nuclei ฯลฯ) ผ่าน sandbox |
| `check-scope` | ตรวจสอบ target ว่า allowlist อยู่ไหม |
| `request-approval` | ขออนุมัติ HITL สำหรับคำสั่งเสี่ยง |
| `approve-command` | อนุมัติคำสั่ง (HITL) |
| `collect-evidence` | เก็บหลักฐาน (screenshot, output) |
| `track-attack-chain` | บันทึกความสัมพันธ์ของ attack chain |
| `store-target-memory` | จำข้อมูล target ระหว่าง sessions |
| `query-knowledge` | สืบค้น knowledge base |
| `route-model` | เลือก/สลับ LLM model |
| `generate-report` | สร้างรายงาน pentest |
| `audit-log` | เขียนบันทึก audit trail |
| `vault-manage` | จัดการ secrets ใน vault |
| `run-async-task` | รันงานแบบ async |
| `get-task-status` | ตรวจสอบสถานะงาน async |

---

## 🔐 Authentication & Authorization

| Middleware | หน้าที่ |
|------------|--------|
| Auth (JWT) | ตรวจสอบ token, ระบุผู้ใช้ |
| `RBAC.middleware.ts` | Role-based access (admin / user) |
| `RateLimit.middleware.ts` | จำกัดอัตราการเรียก API |
| `UsageLimit.middleware.ts` | ตัดการใช้งานเมื่อเกิน quota ตามแผน |

**Security เพิ่มเติม:**
- 2FA (`twoFactor.service.ts`)
- Audit log สำหรับทุกการกระทำสำคัญ
- Rate limiting กัน brute force

---

## 💰 ระบบ Billing / Payment

### ช่องทางรับเงิน (Payment Gateway)
Admin เปิด/ปิดได้ผ่านหน้า Admin Payment (toggle switch) — ไม่ต้องแก้โค้ด

| Channel | Label |
|---------|-------|
| `googlepay` | Google Pay |
| `alipay` | Alipay |
| `linepay` | LINE Pay |
| `crypto_eth` | Crypto (ETH) |
| `crypto_btc` | Crypto (BTC) |
| `crypto_bnb` | Crypto (BNB) |

### Flow การชำระเงิน
```
Pricing → เลือกแผน → Checkout (เลือกช่องทาง) → สร้าง PaymentOrder
       → Admin ตรวจสอบ (AdminPayment) → Mark Paid → Confirm
       → setUserPlan + activateSubscription → ผู้ใช้ได้สิทธิ์
```

### สถานะ Order
`pending` → `paid` → `confirmed` (หรือ `expired` / `canceled` / `refunded`)

---

## 🖥️ Frontend

**Tech Stack:** Next.js (App Router) • React • SCSS Modules

### หน้าหลัก
| Route / Page | หน้าที่ |
|--------------|--------|
| `/pricing` | แสดงแผนบริการ + ราคา (ดึงจาก API) |
| `/checkout` | เลือกช่องทางชำระเงิน + สร้าง order |
| `/billing` | ดูใบแจ้งหนี้ / subscription / usage |
| `/admin/payment` | Admin จัดการ gateway (เปิด/ปิด, ตั้งค่า) + ดู/ยืนยัน orders + จัดการแผน |

### Components หลัก
| Component | หน้าที่ |
|-----------|--------|
| `Navbar` | เมนูนำทาง |
| `SettingsOverlay` | การตั้งค่าผู้ใช้ (API keys, 2FA ฯลฯ) |
| `AgentToolsPanel` | แผงแสดงเครื่องมือ agent ที่พร้อมใช้ |
| `ToolCallBlock` | แสดงการเรียก tool ใน chat transcript |
| `PricingPage` | หน้าแสดงราคาแผน |
| `CheckoutPage` | หน้าเลือกช่องทางชำระเงิน |
| `BillingPage` | หน้าบัญชี/ค่าใช้จ่าย |
| `AdminPaymentPage` | หน้าจัดการ payment สำหรับ Admin |

### Services (API Client)
| Service | หน้าที่ |
|---------|--------|
| `plan.service.js` | ดึง/จัดการแผน |
| `payment.service.js` | สร้าง order, list gateways, admin actions |
| `billing.service.js` | เรียกดูใบแจ้งหนี้ |
| `subscription.service.js` | ดู/จัดการ subscription |

---

## 🔗 API Routes สรุป

### Auth
| Method | Route | หน้าที่ |
|--------|-------|--------|
| POST | `/api/auth/*` | register, login, 2FA, refresh token |

### Agent
| Method | Route | หน้าที่ |
|--------|-------|--------|
| POST/GET | `/api/agent/*` | ส่งคำสั่งให้ agent, ดูสถานะ session |

### Payment
| Method | Route | หน้าที่ |
|--------|-------|--------|
| GET | `/api/payment/gateways` | ช่องทางที่เปิดใช้งาน (public) |
| POST | `/api/payment/order` | สร้าง order (auth) |
| GET | `/api/payment/orders` | ดู orders ของตัวเอง (auth) |
| GET | `/api/payment/admin/gateways` | ดู gateway ทั้งหมด (admin) |
| POST | `/api/payment/admin/gateways` | บันทึก/เปิดปิด gateway (admin) |
| GET | `/api/payment/admin/orders` | ดู orders ทั้งหมด (admin) |
| POST | `/api/payment/admin/orders/:id/paid` | ทำเครื่องหมายชำระแล้ว (admin) |
| POST | `/api/payment/admin/orders/:id/confirm` | ยืนยัน + เปิดแผน (admin) |

### Plans
| Method | Route | หน้าที่ |
|--------|-------|--------|
| GET/POST | `/api/plans/*` | ดู/จัดการแผนบริการ |

### Billing / Subscription
| Method | Route | หน้าที่ |
|--------|-------|--------|
| GET/POST | `/api/billing/*` | ใบแจ้งหนี้ |
| GET/POST | `/api/subscription/*` | subscription ของผู้ใช้ |

### Telegram
| Method | Route | หน้าที่ |
|--------|-------|--------|
| POST | `/api/telegram/webhook` | webhook จาก Telegram |

---

## 🧩 ฟีเจอร์เด่นของระบบ

1. **AI Agent Orchestration** — swarm, sub-agents, self-correction
2. **Scope Control** — ป้องกันการโจมตีนอกขอบเขต
3. **HITL (Human-in-the-Loop)** — ขออนุมัติคำสั่งเสี่ยงก่อนรัน
4. **Sandbox** — รันเครื่องมือในสภาพแวดล้อมปลอดภัย
5. **Audit Trail** — บันทึกทุกการกระทำแบบย้อนกลับไม่ได้
6. **Evidence Collection** — เก็บหลักฐานอัตโนมัติ + สร้างรายงาน
7. **RAG Knowledge Base** — ให้ AI รู้จักเทคนิค/ข้อมูลล่าสุด
8. **Vault** — จัดเก็บ secrets แบบเข้ารหัส
9. **Multi-channel Billing** — รับเงินผ่าน LINE Pay / Google Pay / Crypto
10. **Admin ตั้งราคาเอง** — ไม่ต้องแก้โค้ด, เปิด/ปิด gateway ได้ทันที
11. **Usage-based limits** — ตัดการใช้งานตามแผนที่ซื้อ
12. **Telegram Bot** — ใช้งานผ่านมือถือได้

---

## 🚀 การรันระบบ

```bash
# Backend
cd backend && pnpm install && pnpm dev

# Frontend
cd frontend && pnpm install && pnpm dev

# ทั้งระบบ (Docker)
docker compose up -d
```

ดูรายละเอียดเพิ่มเติม: [INSTALL_GUIDE.md](./INSTALL_GUIDE.md) • [USER_GUIDE.md](./USER_GUIDE.md) • [ARCHITECTURE_PLAN.md](./ARCHITECTURE_PLAN.md)

---

## 📌 สรุป

VektorSec เป็นระบบ AI pentest copilot แบบ multi-channel ประกอบด้วย
**Agent Engine** (orchestration + tools + scope + HITL + audit), 
**Billing/Payment/Subscription** (multi-gateway + admin panel),
และ **3 ช่องทางให้บริการ** (Telegram Bot / Platform Download / Online Web)
พร้อมระบบความปลอดภัยชั้นสูง (2FA, RBAC, RateLimit, Sandbox, Vault, Audit Log)