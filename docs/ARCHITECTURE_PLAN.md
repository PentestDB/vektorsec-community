# 🏗️ VektorSec — แผนสถาปัตยกรรม 3 ช่องทาง (Architecture Plan)

เอกสารนี้วางแผนสถาปัตยกรรมสำหรับการให้บริการ **VektorSec** ผ่าน 3 ช่องทาง
พร้อมระบบ Trial, ระบบคิดเงิน, และการป้องกัน Reverse Engineering

---

## 📑 สารบัญ

1. [ภาพรวมโมเดลธุรกิจ](#-ภาพรวมโมเดลธุรกิจ)
2. [ช่องทางที่ 1: Telegram Bot (มือถือ)](#-ช่องทางที่-1-telegram-bot-มือถือ)
3. [ช่องทางที่ 2: Platform Download (Git)](#-ช่องทางที่-2-platform-download-git)
4. [ช่องทางที่ 3: Online Web](#-ช่องทางที่-3-online-web)
5. [ระบบ Trial (ทดลองใช้)](#-ระบบ-trial-ทดลองใช้)
6. [ระบบคิดเงิน & Subscription](#-ระบบคิดเงิน--subscription)
7. [การป้องกัน Reverse Engineering](#-การป้องกัน-reverse-engineering)
8. [สถาปัตยกรรม Backend ร่วม](#-สถาปัตยกรรม-backend-ร่วม)
9. [ตารางราคา (ตัวอย่าง)](#-ตารางราคา-ตัวอย่าง)
10. [Roadmap การพัฒนา](#-roadmap-การพัฒนา)

---

## 💼 ภาพรวมโมเดลธุรกิจ

```
┌─────────────────────────────────────────────────────────────────┐
│                    VEKTORSEC                              │
│                                                                 │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────────────┐   │
│  │ 1. Telegram │  │ 2. Platform  │  │ 3. Online Web       │   │
│  │    Bot      │  │    Download  │  │                     │   │
│  │  (มือถือ)    │  │    (Git)     │  │                     │   │
│  └──────┬──────┘  └──────┬───────┘  └─────────┬────────────┘   │
│         │                │                    │                │
│         ▼                ▼                    ▼                │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              API ที่เราเช่า (Hosted API)                 │   │
│  │   เราเช่า LLM API (Claude/GPT) แล้วคิดค่าบริการเพิ่ม      │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              API ของลูกค้าเอง (BYOK)                     │   │
│  │   เฉพาะช่องทาง Platform Download เท่านั้น                │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

### ตารางสรุป 3 ช่องทาง

| คุณสมบัติ | 1. Telegram Bot | 2. Platform Download | 3. Online Web |
|-----------|----------------|----------------------|---------------|
| **อุปกรณ์** | มือถือ | คอมพิวเตอร์ | เบราว์เซอร์ |
| **API** | ใช้ API ที่เราเช่า | ใส่ API เอง (BYOK) | ใช้ API ที่เราเช่า |
| **ราคา** | รายเดือน (ถูก) | จ่ายครั้งเดียว/แพงกว่า | รายเดือน (กลาง) |
| **aircrack** | ❌ ไม่ได้ (มือถือ) | ✅ ได้ (ผ่านคอม) | ❌ จำกัด |
| **ติดตั้ง** | ไม่ต้อง (ใช้ Telegram) | ต้อง clone + ติดตั้ง | ไม่ต้อง (เปิดเว็บ) |
| **ความเสี่ยง reverse** | ต่ำ (อยู่ฝั่งเรา) | **สูง** (ต้องป้องกัน) | ต่ำ (อยู่ฝั่งเรา) |
| **Trial** | ✅ มี | ✅ มี | ✅ มี |

---

## 📱 ช่องทางที่ 1: Telegram Bot (มือถือ)

### แนวคิด
ผู้ใช้ใช้งานผ่าน **Telegram Bot** บนมือถือ โดยไม่ต้องติดตั้งอะไร
ทุกอย่างรันอยู่ฝั่งเซิร์ฟเวอร์ของเรา (API ที่เราเช่า)

### สถาปัตยกรรม

```
┌──────────┐     ┌──────────────────┐     ┌─────────────────┐
│ Telegram │────▶│  Telegram Bot    │────▶│  Pentest Engine │
│  Mobile  │     │  (backend)       │     │  (backend)      │
└──────────┘     └──────────────────┘     └─────────────────┘
                        │                        │
                        ▼                        ▼
                 ┌──────────────┐        ┌──────────────┐
                 │  Subscription│        │  Hosted API  │
                 │  (รายเดือน)   │        │  (เราเช่า)    │
                 └──────────────┘        └──────────────┘
```

### ฟีเจอร์ที่รองรับบนมือถือ
- ✅ Reconnaissance (nmap, subdomain enum)
- ✅ Web scan (nuclei, ffuf)
- ✅ SQL injection (sqlmap)
- ✅ ดูรายงานผล
- ❌ aircrack (ต้องใช้ wireless adapter — ไม่เหมาะกับมือถือ)

### ระบบ Subscription (Telegram)
- ผู้ใช้กด `/start` → ระบบสร้างบัญชี
- กด `/subscribe` → เลือกแผน → ชำระเงิน → เปิดใช้งาน
- กด `/trial` → เปิด trial ฟรี
- กด `/status` → ดูสถานะ subscription
- กด `/usage` → ดูการใช้งาน (tokens, requests)

### ข้อดี
- ไม่ต้องติดตั้งอะไร — ใช้งานได้ทันที
- API อยู่ฝั่งเรา — ลูกค้า reverse ไม่ได้
- ควบคุมการใช้งาน/คิดเงินง่าย

### ข้อจำกัด
- ไม่รองรับ aircrack (ต้องใช้ wireless adapter)
- จำกัดด้วย UI ของ Telegram

---

## 💻 ช่องทางที่ 2: Platform Download (Git)

### แนวคิด
ลูกค้า **clone/download โปรเจกต์จาก Git** แล้วติดตั้งบนเครื่องตัวเอง
ใช้ได้กับ **aircrack** (ต้องใช้ wireless adapter ผ่านคอม)
ให้ใส่ **API ของตัวเอง (BYOK)** ได้ — ราคาแพงกว่า

### สถาปัตยกรรม

```
┌─────────────────────────────────────────────────────────┐
│              เครื่องของลูกค้า (Local)                    │
│                                                         │
│  ┌──────────────┐    ┌──────────────────────────────┐   │
│  │ Pentest CLI  │    │  License Manager (local)     │   │
│  │ (aircrack,   │    │  - ตรวจ license key          │   │
│  │  nmap, ...)  │    │  - ตรวจ trial หมดอายุ        │   │
│  └──────┬───────┘    └──────────────┬───────────────┘   │
│         │                           │                   │
│         ▼                           ▼                   │
│  ┌──────────────────────────────────────────────┐       │
│  │  BYOK API (ลูกค้าใส่ key เอง)                 │       │
│  │  - OpenAI / Anthropic / Local LLM            │       │
│  └──────────────────────────────────────────────┘       │
└─────────────────────────────────────────────────────────┘
                        │
                        ▼  (เฉพาะ license check)
                 ┌──────────────────┐
                 │  License Server  │
                 │  (ฝั่งเรา)        │
                 └──────────────────┘
```

### ฟีเจอร์ที่รองรับ
- ✅ ทุกอย่างรวมถึง **aircrack** (ผ่าน wireless adapter)
- ✅ ใส่ API เอง (BYOK) — OpenAI, Anthropic, Local LLM
- ✅ รันแบบ offline (เมื่อมี API key แล้ว)
- ✅ ควบคุมเครื่องได้เต็มที่

### ระบบ License (Platform)
- **License Key** — ลูกค้าซื้อแล้วได้ key (เช่น `PC-XXXX-XXXX-XXXX`)
- **Trial** — key trial ฟรี 7 วัน (จำกัดฟีเจอร์)
- **ตรวจสอบออนไลน์** — ครั้งแรกต้องเชื่อมต่อ license server เพื่อ activate
- **Offline mode** — หลัง activate แล้วใช้ได้ offline (ตามระยะเวลาที่กำหนด)

### ข้อดี
- ใช้ aircrack ได้ (ผ่านคอม)
- ลูกค้าควบคุมเครื่องได้เต็มที่
- ใส่ API เองได้ — ไม่พึ่ง API เรา

### ข้อจำกัด/ความเสี่ยง
- ⚠️ **เสี่ยง reverse engineering** — ต้องป้องกัน (ดูหัวข้อถัดไป)
- ต้องติดตั้ง dependencies เอง
- ราคาแพงกว่า (จ่ายครั้งเดียว + license)

---

## 🌐 ช่องทางที่ 3: Online Web

### แนวคิด
ผู้ใช้ใช้งานผ่าน **เว็บเบราว์เซอร์** (ระบบที่มีอยู่แล้ว)
ใช้ API ที่เราเช่า — คิดรายเดือน

### สถาปัตยกรรม

```
┌──────────┐     ┌──────────────────┐     ┌─────────────────┐
│ Browser  │────▶│  Frontend (Next) │────▶│  Backend API    │
│  (Web)   │     │  /pricing        │     │  (Express)      │
└──────────┘     │  /checkout       │     └────────┬────────┘
                 │  /billing        │              │
                 └──────────────────┘              ▼
                                            ┌──────────────┐
                                            │  Hosted API  │
                                            │  (เราเช่า)    │
                                            └──────────────┘
```

### ฟีเจอร์
- ✅ ใช้งานผ่านเบราว์เซอร์ ไม่ต้องติดตั้ง
- ✅ ระบบ Payment/Plan ที่มีอยู่แล้ว (Pricing, Checkout, Billing)
- ✅ ใช้ API ที่เราเช่า
- ✅ ดูรายงาน/evidence ออนไลน์

### ข้อจำกัด
- ❌ aircrack ไม่ได้ (ต้องใช้ wireless adapter ผ่านคอม)
- จำกัดด้วย sandbox ของเว็บ

---

## 🎁 ระบบ Trial (ทดลองใช้)

### แนวคิด
ให้ผู้ใช้ทดลองใช้ก่อนตัดสินใจซื้อ — จำกัดฟีเจอร์และระยะเวลา

### ข้อกำหนด Trial (ทุกช่องทาง)

| ข้อกำหนด | รายละเอียด |
|----------|-----------|
| **ระยะเวลา** | 7 วัน (configurable) |
| **จำกัด requests** | เช่น 50 requests/วัน |
| **จำกัด tokens** | เช่น 100K tokens/วัน |
| **จำกัดฟีเจอร์** | ไม่มี aircrack, ไม่มี sandbox, ไม่มี multi-agent |
| **จำกัด target** | เฉพาะ target ที่อนุญาต (ไม่ใช่ production) |
| **ต้องสมัคร** | ต้องมีบัญชี (email/telegram) |
| **1 ครั้ง/คน** | จำกัด trial 1 ครั้งต่อบัญชี/อุปกรณ์ |

### วิธีเปิด Trial

**Telegram:** กด `/trial` → ระบบเปิด trial 7 วัน
**Online Web:** หน้า Pricing → กด "Try Free" → สมัคร → trial เปิดอัตโนมัติ
**Platform:** ดาวน์โหลด → รัน `./vektorsec --trial` → ได้ trial key 7 วัน

### หลัง Trial หมด
- แจ้งเตือนก่อนหมด 24 ชม. (email/telegram)
- บังคับให้ซื้อ subscription ต่อ
- ข้อมูล trial ยังเก็บไว้ (ไม่ลบ) — ต่อ subscription แล้วใช้ต่อได้

---

## 💰 ระบบคิดเงิน & Subscription

> ### ⭐ หลักการสำคัญ: **Admin เป็นคนตั้งราคาเองผ่าน Admin Panel**
> ราคาทั้งหมด **ไม่ hardcode ในโค้ด** — Admin กำหนดเองได้ตลอดเวลา
> ผ่านหน้า Admin Panel โดยไม่ต้องแก้โค้ดหรือ redeploy

### ราคาแยกตามช่องทาง (Channel-based Pricing)

แต่ละช่องทาง (Telegram / Platform / Online) มีราคาเป็นของตัวเอง
แม้จะเป็นแผนเดียวกัน (เช่น Pro) ก็ตั้งราคาต่างกันได้

```
┌─────────────────────────────────────────────────────────────┐
│                    ADMIN PANEL — ตั้งราคา                    │
│                                                             │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  แผน: Pro                                             │  │
│  │                                                       │  │
│  │  ┌──────────┬──────────┬──────────┬──────────┐        │  │
│  │  │ ช่องทาง   │ ราคา/เดือน│ ราคา/ปี  │ เปิด/ปิด  │        │  │
│  │  ├──────────┼──────────┼──────────┼──────────┤        │  │
│  │  │ Telegram │  $19     │  $190    │  [✓]     │        │  │
│  │  │ Online   │  $29     │  $290    │  [✓]     │        │  │
│  │  │ Platform │  $299    │  —       │  [✓]     │        │  │
│  │  └──────────┴──────────┴──────────┴──────────┘        │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### โมเดลราคา (ตัวอย่างเริ่มต้น — Admin เปลี่ยนได้)

| ช่องทาง | แผน | ราคา | API | ฟีเจอร์ |
|---------|-----|------|-----|---------|
| **Telegram** | Trial | ฟรี 7 วัน | เราเช่า | จำกัด |
| **Telegram** | Basic | $19/เดือน | เราเช่า | 100 req/วัน |
| **Telegram** | Pro | $49/เดือน | เราเช่า | ไม่จำกัด |
| **Online** | Trial | ฟรี 7 วัน | เราเช่า | จำกัด |
| **Online** | Basic | $29/เดือน | เราเช่า | 100 req/วัน |
| **Online** | Pro | $79/เดือน | เราเช่า | ไม่จำกัด + sandbox |
| **Platform** | Trial | ฟรี 7 วัน | BYOK | จำกัด |
| **Platform** | Lifetime | $299 (ครั้งเดียว) | BYOK | ทุกอย่าง + aircrack |
| **Platform** | Enterprise | $999 (ครั้งเดียว) | BYOK | ทุกอย่าง + license หลายเครื่อง |

> ⚠️ ตัวเลขข้างต้นเป็นเพียง **ค่าเริ่มต้น** — Admin เปลี่ยนได้ทุกเมื่อผ่าน Admin Panel

### หลักการคิดเงิน
- **Telegram + Online:** ใช้ API ที่เราเช่า → เราคิดค่าบริการเพิ่มจากต้นทุน API
  - เช่น เราเช่า Claude API ต้นทุน $0.01/req → เราคิด $0.05/req
- **Platform:** ลูกค้าใส่ API เอง → เราไม่แบกรับต้นทุน API → ราคา license แพงกว่า
  - แต่ลูกค้าได้ใช้ aircrack + ควบคุมเครื่องเอง

### ระบบ Subscription (ต้อง implement)
- **Subscription model** — เก็บสถานะ active/expired/trial
- **Auto-renew** — ต่ออายุอัตโนมัติ (ผ่าน payment gateway)
- **Usage tracking** — นับ requests/tokens ต่อผู้ใช้
- **Usage limit** — ตัดการใช้งานเมื่อเกิน quota
- **Notification** — แจ้งเตือนก่อนหมดอายุ

### ระบบ Admin ตั้งราคา (ต้อง implement)

#### Backend — เพิ่ม channel pricing ใน Plan model
```typescript
// Plan model เพิ่มฟิลด์ pricing ตามช่องทาง
interface ChannelPricing {
  telegram?: { priceMonthly: number; priceAnnual: number; enabled: boolean };
  online?:   { priceMonthly: number; priceAnnual: number; enabled: boolean };
  platform?: { priceLifetime: number; priceEnterprise: number; enabled: boolean };
}
```

#### API endpoints (Admin)
| Method | Route | หน้าที่ |
|--------|-------|--------|
| `GET` | `/api/plans/admin` | ดูแผนทั้งหมด (มีอยู่แล้ว) |
| `PUT` | `/api/plans/admin/:planId` | แก้ไขแผน + ราคาตามช่องทาง |
| `POST` | `/api/plans/admin` | สร้างแผนใหม่ (มีอยู่แล้ว) |

#### Frontend — หน้า Admin Panel
- **หน้า `/admin/plans`** — ตารางแสดงแผนทั้งหมด
- **ปุ่ม Edit** — เปิด modal แก้ไขราคาแยกตามช่องทาง
- **ฟิลด์:** ราคา/เดือน, ราคา/ปี (Telegram, Online), ราคา Lifetime/Enterprise (Platform)
- **Toggle เปิด/ปิด** แต่ละช่องทาง
- **บันทึก** → เรียก `PUT /api/plans/admin/:planId`

> ระบบ Plan ปัจจุบันรองรับการแก้ไขราคาผ่าน API แล้ว (`updatePlan`)
> แต่ต้องเพิ่ม **channel pricing** และ **หน้า Admin UI** สำหรับแก้ไขราคา


---

## 🔒 การป้องกัน Reverse Engineering

> ⚠️ **สำคัญที่สุดสำหรับช่องทาง Platform Download** — ลูกค้าสามารถ reverse ได้

### กลยุทธ์การป้องกัน (หลายชั้น)

#### ชั้นที่ 1: License Key + Activation
```
┌─────────────────────────────────────────────────────┐
│ 1. ลูกค้าซื้อ → ได้ License Key (PC-XXXX-XXXX)       │
│ 2. รันครั้งแรก → ระบบขอ key + ส่ง HW fingerprint     │
│ 3. License Server ตรวจสอบ + ผูก key กับเครื่อง       │
│ 4. ระบบสร้าง signed token (JWT) เก็บในเครื่อง        │
│ 5. ทุก X วัน → ตรวจสอบกับ server (online check)     │
└─────────────────────────────────────────────────────┘
```

- **HW fingerprint** — ผูก license กับ hardware (MAC, CPU ID, disk serial)
- **Signed token** — ใช้ RSA/Ed25519 sign เพื่อกันปลอมแปลง
- **Online check** — ตรวจสอบเป็นระยะ (เช่น ทุก 7 วัน) กัน bypass

#### ชั้นที่ 2: Code Obfuscation
- **Minify + Obfuscate** JavaScript/TypeScript (ใช้ `javascript-obfuscator`)
- **Compile to binary** — ใช้ `pkg` / `nexe` / Bun compile เพื่อกันอ่านโค้ด
- **Native module** — เขียนส่วนสำคัญ (license check) เป็น native addon (C++/Rust)

#### ชั้นที่ 3: API Key Protection (BYOK)
- **ไม่ hardcode** API key ในโค้ด — เก็บใน env/config
- **Encrypt config** — เข้ารหัส config file ด้วย key ที่ผูกกับเครื่อง
- **Rate limit** — จำกัดการเรียก API ต่อ license

#### ชั้นที่ 4: Server-side Logic
- **ย้าย logic สำคัญไปฝั่ง server** — ลูกค้า reverse ได้แค่ client
- **Feature flag** — ฟีเจอร์ premium ตรวจสอบจาก server
- **Telemetry** — ส่งข้อมูลการใช้งานกลับ (เพื่อตรวจจับการละเมิด)

#### ชั้นที่ 5: Legal & Watermark
- **License agreement** — ระบุข้อห้าม reverse engineering
- **Watermark** — ฝัง watermark ในรายงาน (ระบุ license owner)
- **DMCA takedown** — เตรียมพร้อมสำหรับการละเมิด

### ตารางระดับการป้องกัน

| ระดับ | วิธี | ต้นทุน | ประสิทธิภาพ |
|-------|------|--------|------------|
| พื้นฐาน | License key + HW fingerprint | ต่ำ | ปานกลาง |
| กลาง | + Obfuscate + signed token | กลาง | ดี |
| สูง | + Compile to binary + native module | สูง | ดีมาก |
| สูงสุด | + Server-side logic + telemetry | สูงมาก | ดีที่สุด |

> **คำแนะนำ:** เริ่มที่ระดับกลาง (License + Obfuscate + signed token) แล้วค่อยเพิ่ม
> ไม่มีวิธีใดกัน reverse ได้ 100% — เป้าหมายคือทำให้ "ไม่คุ้มที่จะ reverse"

---

## 🧩 สถาปัตยกรรม Backend ร่วม

### โมดูลที่ใช้ร่วมกันทั้ง 3 ช่องทาง

```
┌─────────────────────────────────────────────────────────────┐
│                    SHARED BACKEND CORE                      │
│                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐   │
│  │ Agent Engine │  │ Tool Wrappers│  │ Self-Correction  │   │
│  │ (orchestrator│  │ (nmap, ffuf, │  │ (แก้คำสั่งอัตโนมัติ)│   │
│  │  swarm, ...) │  │  sqlmap, ...)│  │                  │   │
│  └──────────────┘  └──────────────┘  └──────────────────┘   │
│                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐   │
│  │ Scope Control│  │ HITL Policy  │  │ Audit Trail      │   │
│  │ (ตรวจ scope) │  │ (อนุมัติเสี่ยง)│  │ (immutable log)  │   │
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

### โมดูลใหม่ที่ต้องสร้าง

| โมดูล | หน้าที่ | ช่องทาง |
|-------|--------|---------|
| `subscription.service.ts` | จัดการ subscription, trial, auto-renew | ทั้งหมด |
| `usageTracker.service.ts` | นับ requests/tokens ต่อผู้ใช้ | ทั้งหมด |
| `license.service.ts` | สร้าง/ตรวจ license key, HW fingerprint | Platform |
| `telegramBot.service.ts` | เชื่อมต่อ Telegram Bot API | Telegram |
| `telegramBot.controller.ts` | จัดการคำสั่ง /start /subscribe /trial | Telegram |
| `license.middleware.ts` | ตรวจ license ก่อนรันคำสั่ง | Platform |
| `usageLimit.middleware.ts` | ตัดการใช้งานเมื่อเกิน quota | ทั้งหมด (มีแล้ว) |

### Models ใหม่ที่ต้องสร้าง

| Model | ฟิลด์หลัก |
|-------|----------|
| `Subscription` | userId, plan, channel, status, startDate, endDate, trial |
| `UsageRecord` | userId, channel, date, requests, tokens, cost |
| `License` | licenseKey, userId, hwFingerprint, status, expiresAt, maxDevices |
| `TelegramUser` | telegramId, userId, chatId, subscriptionId |

---

## 💵 ตารางราคา (ตัวอย่าง)

### Telegram Bot (ใช้ API เราเช่า)

| แผน | ราคา/เดือน | Requests/วัน | Tokens/วัน | ฟีเจอร์ |
|-----|-----------|--------------|------------|---------|
| Trial | ฟรี 7 วัน | 20 | 50K | พื้นฐาน |
| Basic | $19 | 100 | 200K | recon + web scan |
| Pro | $49 | ไม่จำกัด | 1M | + sqlmap + report |

### Online Web (ใช้ API เราเช่า)

| แผน | ราคา/เดือน | Requests/วัน | Tokens/วัน | ฟีเจอร์ |
|-----|-----------|--------------|------------|---------|
| Trial | ฟรี 7 วัน | 20 | 50K | พื้นฐาน |
| Basic | $29 | 100 | 200K | recon + web scan |
| Pro | $79 | ไม่จำกัด | 1M | + sandbox + multi-agent |

### Platform Download (BYOK — ใส่ API เอง)

| แผน | ราคา | License | ฟีเจอร์ |
|-----|------|---------|---------|
| Trial | ฟรี 7 วัน | trial key | จำกัด |
| Lifetime | $299 ครั้งเดียว | 1 เครื่อง | ทุกอย่าง + aircrack |
| Enterprise | $999 ครั้งเดียว | 5 เครื่อง | + priority support |

---

## 🗺️ Roadmap การพัฒนา

### Phase 1: ระบบ Subscription & Trial (พื้นฐาน)
- [ ] สร้าง `Subscription` model + service
- [ ] สร้าง `UsageRecord` model + usage tracker
- [ ] เพิ่ม trial flow ในระบบ payment ที่มีอยู่
- [ ] เพิ่ม feature flags ตามแผน (จำกัดฟีเจอร์)

### Phase 2: Online Web (ปรับระบบที่มีอยู่)
- [ ] เพิ่ม trial button ใน Pricing page
- [ ] เพิ่ม Usage dashboard ใน Billing page
- [ ] เชื่อมต่อ hosted API (เราเช่า) กับ backend
- [ ] ตั้งค่า API key ของเราใน config

### Phase 3: Telegram Bot
- [ ] สร้าง `telegramBot.service.ts` (ใช้ `node-telegram-bot-api`)
- [ ] สร้างคำสั่ง /start /subscribe /trial /status /usage
- [ ] เชื่อมต่อกับ Agent Engine
- [ ] ระบบ subscription ผ่าน Telegram

### Phase 4: Platform Download + License
- [ ] สร้าง `license.service.ts` + License model
- [ ] สร้าง HW fingerprint + signed token
- [ ] สร้าง CLI entry point (`vektorsec` command)
- [ ] Obfuscate + compile to binary
- [ ] ระบบ BYOK (ใส่ API เอง)

### Phase 5: ป้องกัน Reverse Engineering
- [ ] License key + HW binding
- [ ] Code obfuscation
- [ ] Signed token + online check
- [ ] (เพิ่มเติม) Compile to binary + native module

---

## 📌 สรุป

1. **Telegram Bot** — ใช้ API เราเช่า, รายเดือน, ไม่ต้องติดตั้ง, ไม่มี aircrack
2. **Platform Download** — ใส่ API เอง (BYOK), ราคาแพงกว่า, ใช้ aircrack ได้, ต้องป้องกัน reverse
3. **Online Web** — ใช้ API เราเช่า, รายเดือน, ระบบ payment ที่มีอยู่แล้ว
4. **Trial** — ฟรี 7 วัน ทุกช่องทาง, จำกัดฟีเจอร์/usage
5. **คิดเงิน** — Telegram/Online คิดตาม usage (API เราเช่า), Platform ขาย license ครั้งเดียว
6. **ป้องกัน reverse** — License + HW fingerprint + obfuscation + signed token (หลายชั้น)

---

## 📚 ดูเพิ่มเติม

- [คู่มือการติดตั้ง (Install Guide)](./INSTALL_GUIDE.md)
- [คู่มือการใช้งาน (User Guide)](./USER_GUIDE.md)
- [README.md](../README.md)
