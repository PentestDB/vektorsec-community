# 📖 VektorSec — คู่มือการใช้งาน (User Guide)

> 🇬🇧 **English**: [User Guide](./en/USER_GUIDE.md)

คู่มือนี้ครอบคลุมการใช้งานฟีเจอร์ใหม่ทั้งหมดของ **VektorSec เวอร์ชันใหม่**
รวมถึงระบบ Payment & Plan, Agentic Tools, Sandbox, Knowledge Base,
Audit Trail, Vault และอื่นๆ

---

## 📑 สารบัญ

1. [เริ่มต้นใช้งาน](#-เริ่มต้นใช้งาน)
2. [ระบบ Plan & Subscription](#-ระบบ-plan--subscription)
3. [ระบบ Payment & Checkout](#-ระบบ-payment--checkout)
4. [ระบบ Telegram Bot](#-ระบบ-telegram-bot)
5. [หน้า Admin Payment](#-หน้า-admin-payment)
6. [Agentic Tools ใหม่](#-agentic-tools-ใหม่)
7. [ระบบ Sandbox Isolation](#-ระบบ-sandbox-isolation)
8. [ระบบ Knowledge Base & RAG](#-ระบบ-knowledge-base--rag)
9. [ระบบ Audit Trail](#-ระบบ-audit-trail)
10. [ระบบ Vault (Secrets)](#-ระบบ-vault-secrets)
11. [ระบบ Self-Correction](#-ระบบ-self-correction)
12. [ระบบ Scope Control & HITL](#-ระบบ-scope-control--hitl)
13. [Multi-Model Routing](#-multi-model-routing)
14. [Export รายงาน & ประวัติการใช้งาน](#-export-รายงาน--ประวัติการใช้งาน)

---

## 🚀 เริ่มต้นใช้งาน

1. ติดตั้งตาม [คู่มือการติดตั้ง](./INSTALL_GUIDE.md)
2. เปิดเว็บ `http://localhost:3001`
3. สมัคร/เข้าสู่ระบบ
4. ไปที่ **Settings → Models** เพื่อตั้งค่า Model (จำเป็น)
5. เริ่มแชทกับ Agent เพื่อทำการ pentest

---

## 💳 ระบบ Plan & Subscription

### แผนที่มีให้เลือก (ค่าเริ่มต้น)

> ราคาและฟีเจอร์สามารถปรับได้โดย Admin ผ่านหน้า **Admin → Plans** (`/admin/payment`)

| แผน | ราคา/เดือน | ราคา/ปี | ฟีเจอร์ |
|-----|-----------|---------|---------|
| **Free** | $0 | $0 | พื้นฐาน, จำกัดการใช้งาน |
| **Pro** | $49 | $39/เดือน | ไม่จำกัด, Sandbox, Knowledge Base |
| **Team** | $149 | $119/เดือน | Multi-agent, Priority support |
| **Enterprise** | $499 | $399/เดือน | ทุกฟีเจอร์, SLA, SSO |

### ช่องทางใช้งาน (Channels)

ระบบรองรับ **3 ช่องทาง** ที่แยกการสมัครสมาชิกกัน:

| ช่องทาง | คำอธิบาย |
|---------|----------|
| **Platform** | ใช้งานผ่านเว็บแพลตฟอร์มหลัก |
| **Online** | ใช้งานผ่านช่องทางออนไลน์ (API/Webhook) |
| **Telegram** | ใช้งานผ่าน Telegram Bot |

> แต่ละช่องทางมีราคาแยกกัน (Admin ตั้งค่าได้ผ่าน channel pricing)

### วิธีสมัครแผน

1. เปิดหน้า **Pricing** (`/pricing`)
2. เลือกช่องทางที่ต้องการ (Platform / Online / Telegram)
3. เลือกแผนที่ต้องการ → กด **Upgrade**
4. ระบบจะสร้าง subscription ให้อัตโนมัติหลัง Admin ยืนยันการชำระเงิน
5. ตรวจสอบสถานะได้ที่หน้า **Billing** (`/billing`)

### วิธีอัปเกรดแผน

1. เปิดหน้า **Pricing** (`/pricing`)
2. เลือกแผนที่ต้องการ → กด **Upgrade**
3. เลือกระยะเวลา (Monthly / Annual)
4. เลือกช่องทางชำระเงิน → กด **Checkout**
5. รอ Admin ยืนยันการชำระเงิน → แผนจะถูกอัปเกรดอัตโนมัติ

### ตรวจสอบแผนปัจจุบัน

- เปิดหน้า **Billing** (`/billing`) เพื่อดูแผนปัจจุบัน, วันที่หมดอายุ, และประวัติการชำระเงิน
- เปิดหน้า **Subscription** เพื่อดู subscription ทั้งหมดในทุกช่องทาง
- ตรวจสอบ **Usage** เพื่อดูการใช้งาน (วันนี้ / 30 วัน)


---

## 🛒 ระบบ Payment & Checkout

### ช่องทางชำระเงินที่รองรับ

| ช่องทาง | ประเภท |
|---------|--------|
| Google Pay | บัตร/กระเป๋าเงิน |
| Alipay | กระเป๋าเงิน |
| LINE Pay | กระเป๋าเงิน |
| Crypto (ETH) | สกุลเงินดิจิทัล |
| Crypto (BTC) | สกุลเงินดิจิทัล |
| Crypto (BNB) | สกุลเงินดิจิทัล |

### ขั้นตอน Checkout

1. เลือกแผน → กด **Upgrade** → ไปที่หน้า `/checkout`
2. เลือกช่องทางชำระเงิน
3. ระบบจะสร้าง **Order ID** (เช่น `ORD-XXXX-XXXX`)
4. สำหรับ Crypto: โอนเงินไปยัง wallet address พร้อมระบุ Order ID ใน memo
5. สำหรับอื่นๆ: ทำตามคำแนะนำของช่องทางนั้น
6. รอ Admin ยืนยัน → แผนจะถูกอัปเกรดอัตโนมัติ

---

## 🤖 ระบบ Telegram Bot

ระบบรองรับการใช้ VektorSec ผ่าน **Telegram Bot** นอกเหนือจากเว็บแพลตฟอร์ม

### เริ่มต้นใช้งาน Bot

1. โปรดตรวจสอบว่า Admin ได้ตั้งค่า Bot Token แล้ว (ดู [คู่มือการติดตั้ง](./INSTALL_GUIDE.md))
2. เปิด Telegram → ค้นหา Bot ที่ Admin สร้างไว้
3. กด **Start** หรือพิมพ์ `/start` เพื่อเริ่มต้น
4. พิมพ์ `/help` เพื่อดูคำสั่งทั้งหมด

### คำสั่งที่รองรับ

| คำสั่ง | หน้าที่ |
|--------|---------|
| `/start` | แสดงข้อความต้อนรับและรายการคำสั่ง |
| `/subscribe` | ดูแผนและราคาสำหรับช่องทาง Telegram |
| `/status` | ตรวจสอบสถานะ Subscription |
| `/usage` | ตรวจสอบการใช้งานวันนี้ (requests, tokens, cost) |
| `/cancel` | ยกเลิก Subscription |
| `/help` | แสดงรายการคำสั่ง |

### ใช้ Agent ผ่าน Telegram

เมื่อมี Subscription บนช่องทาง Telegram แล้ว คุณสามารถส่งข้อความฟรีรูปแบบใดก็ได้
เช่น `"สแกน http://testphp.vulnweb.com หน่อย"` — Bot จะส่งให้ Agent และ
รายงานความคืบหน้าแบบ real-time ผ่าน Telegram (💭 thinking, 🔧 tool running, ✅ tool done)

### การ Link บัญชี (จำเป็น)

> ⚠️ ต้องมี **platform account** และถูก **link** กับ Telegram ID ก่อนจึงจะใช้ Agent ได้

Admin ต้องทำการ link ให้ผ่าน API:
```bash
POST /api/telegram/users/:telegramId/link
Body: { "userId": "<platform_user_id>" }
```

### ข้อควรรู้

- Subscription บนช่องทาง Telegram **แยกจาก** Platform/Online
- การใช้งานจะถูกบันทึกใน `UsageRecord` ช่องทาง `telegram`
- ถ้ายังไม่มี Subscription → ต้องสมัครแผนก่อนใช้งาน

### 🛠️ คำสั่ง Admin (สำหรับทดสอบระบบ)

> ⛔ **เฉพาะ Admin เท่านั้น.** ผู้ใช้จะถือเป็น Admin ถ้าเข้าเงื่อนไข **ข้อใดข้อหนึ่ง**:
> 1. Telegram ID อยู่ในตัวแปร `TELEGRAM_ADMIN_IDS` (คั่นด้วยคอมม่า) — วิธีที่ง่ายที่สุด
>    สำหรับทดสอบคำสั่ง admin โดยไม่ต้อง link กับ platform account **หรือ**
> 2. มี **platform account** ที่ถูก link และมีบทบาทเป็น `admin`
>
> ผู้ที่ไม่ใช่ Admin จะได้รับข้อความ "Access denied"

#### วิธีตั้งค่า Admin สำหรับทดสอบผ่าน env var

เพื่อให้สิทธิ์ admin แก่ผู้ใช้ Telegram สำหรับการทดสอบ ให้เพิ่ม Telegram user ID
ลงในตัวแปร `TELEGRAM_ADMIN_IDS` ในไฟล์ `backend/.env`:

```
TELEGRAM_ADMIN_IDS=123456789,987654321
```

> 💡 **วิธีหา Telegram user ID ของคุณ:** ส่งข้อความหา bot (เช่น `/start`),
> จากนั้นรัน `/admin users` ในฐานะ admin ที่มีอยู่ หรือใช้บอท `@userinfobot`
> บน Telegram ID จะเป็นตัวเลข เช่น `123456789`

เมื่อตั้งค่าแล้ว ผู้ใช้ที่มี ID นั้นจะใช้คำสั่ง `/admin` ทั้งหมดได้ทันที —
ไม่ต้องมี platform account หรือการ link

| คำสั่ง | หน้าที่ |
|--------|---------|
| `/admin` | แสดงวิธีใช้คำสั่ง admin |
| `/admin users` | รายชื่อผู้ใช้ Telegram (100 ล่าสุด) |
| `/admin link <telegramId> <userId>` | Link ผู้ใช้ Telegram กับ platform account |
| `/admin unlink <telegramId>` | ยกเลิกการ link ผู้ใช้ Telegram |
| `/admin grant <userId> <plan>` | เปิดใช้งาน Subscription (plan: free/pro/team/enterprise) |
| `/admin revoke <userId>` | ยกเลิก Subscription |
| `/admin subs` | รายการ Subscription ทั้งหมด |
| `/admin status` | แสดงสถานะ bot (configured / running) |

#### ตัวอย่าง — ทดสอบขั้นตอนทั้งหมด

1. **ผู้ใช้** กด `/start` กับ bot → ระบบสร้างระเบียน `TelegramUser`
2. **Admin** รัน `/admin users` → หา `telegramId` ของผู้ใช้
3. **Admin** รัน `/admin link <telegramId> <userId>` → link กับ platform account
4. **Admin** รัน `/admin grant <userId> pro` → เปิดใช้งานแผน Pro
5. **ผู้ใช้** ส่งข้อความ → Agent ทำงาน

---


## 🛠️ หน้า Admin Payment

เข้าถึงได้เฉพาะผู้ใช้ที่มีบทบาท **Admin** ผ่าน `/admin/payment`

### ฟีเจอร์

- **จัดการ Gateway** — เปิด/ปิดช่องทางชำระเงิน, ตั้งค่า merchant ID, wallet address
- **ดูคำสั่งซื้อทั้งหมด** — ดูสถานะ (pending, paid, confirmed, expired, canceled)
- **ยืนยันการชำระเงิน** — กด Confirm เพื่ออัปเกรดแผนให้ผู้ใช้
- **กรองตามสถานะ** — ดูเฉพาะ pending / paid / confirmed
- **จัดการ Plans** — สร้าง/แก้ไข/ลบแผน, ตั้งราคา, ตั้ง channel pricing

### วิธีเปิดใช้งาน Gateway

1. ไปที่ `/admin/payment`
2. ในส่วน Gateway ให้เลือกช่องทางที่ต้องการ
3. กด **Enable**
4. กรอกข้อมูล (merchant ID / wallet address / instructions)
5. บันทึก

### วิธีตั้งราคาแผน (Admin)

Admin สามารถตั้งราคาแผนเองได้โดยไม่ต้องแก้โค้ด:

1. ไปที่ `/admin/payment` → ส่วน **Plans**
2. เลือกแผนที่ต้องการแก้ไข (หรือสร้างแผนใหม่)
3. ตั้งค่า:
   - **ราคา/เดือน** (priceMonthly)
   - **ราคา/ปี** (priceAnnual)
   - **Channel Pricing** — ตั้งราคาแยกตามช่องทาง (platform / online / telegram)
   - **Limits** — จำกัดการใช้งาน (sessions, iterations, workspaces, MCP tokens)
   - **Features** — รายการฟีเจอร์
4. บันทึก → ราคาจะอัปเดตทันทีที่หน้า Pricing และ Checkout

> แผน **Free** ไม่สามารถลบได้ และเป็นแผน fallback สำหรับผู้ใช้ที่ไม่มี subscription


---

## 🤖 Agentic Tools ใหม่

### 1. `run_async_task` — รันงานยาวแบบ Background

รันงาน pentest ที่ใช้เวลานาน (nmap, ffuf, sqlmap) แบบ async ใน Sandbox

```json
{
  "command": "nmap -sV -p- 10.10.10.10",
  "task_type": "nmap_scan",
  "priority": "high",
  "timeout_ms": 300000,
  "target": "10.10.10.10"
}
```

**พารามิเตอร์:**
| พารามิเตอร์ | ประเภท | คำอธิบาย |
|------------|--------|----------|
| `command` | string (required) | คำสั่งที่ต้องการรัน |
| `task_type` | enum | `nmap_scan`, `ffuf_bruteforce`, `sqlmap_dump`, `gobuster_enum`, `custom` |
| `priority` | enum | `low`, `normal`, `high`, `critical` |
| `timeout_ms` | number | หมดเวลา (default 300000) |
| `target` | string | เป้าหมาย (สำหรับ audit log) |

**ผลลัพธ์:** คืนค่า Task ID ที่ใช้ตรวจสอบความคืบหน้า

### 2. `get_task_status` — ตรวจสอบความคืบหน้า

```json
{
  "task_id": "abc123"
}
```

**ผลลัพธ์:** สถานะ (queued, running, completed, failed), progress %, output

### 3. `query_knowledge` — ค้นหา Knowledge Base

```json
{
  "query": "Apache Log4j RCE",
  "category": "cve",
  "limit": 5
}
```

**หมวดหมู่:** `cve`, `exploit`, `owasp`, `technique`, `tool`

### 4. `audit_log` — ดู Audit Trail

```json
{
  "action": "command_executed",
  "severity": "warning",
  "limit": 20
}
```

### 5. `vault_manage` — จัดการ Secrets

```json
{
  "action": "store",
  "key": "API_KEY",
  "value": "sk-xxx"
}
```

**Actions:** `store`, `get`, `delete`, `list`

### 6. `track_attack_chain` — ติดตามขั้นตอนการโจมตี

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

### 7. `store_target_memory` — เก็บความจำเกี่ยวกับเป้าหมาย

```json
{
  "target": "10.10.10.10",
  "key": "open_ports",
  "value": "80,443,8080",
  "importance": "high"
}
```

### 8. `collect_evidence` — เก็บหลักฐาน

```json
{
  "target": "10.10.10.10",
  "type": "screenshot",
  "description": "Login page",
  "data": "base64..."
}
```

---

## 🏖️ ระบบ Sandbox Isolation

งาน async ทั้งหมดจะรันใน **Docker container แบบแยก** เพื่อความปลอดภัย

### ข้อจำกัดของ Sandbox

- **CPU:** จำกัด 1 core
- **Memory:** จำกัด 512MB
- **Network:** จำกัด (เฉพาะที่กำหนด)
- **Timeout:** ตามที่ตั้งค่า (default 5 นาที)

### ถ้าไม่มี Docker

ระบบจะ fallback รันคำสั่งตรงๆ พร้อม warning:
```
[warning] Docker not available - running without sandbox isolation
```

> ⚠️ แนะนำให้ติดตั้ง Docker เพื่อความปลอดภัยสูงสุด

---

## 📚 ระบบ Knowledge Base & RAG

ฐานข้อมูลความรู้สำหรับ pentest ประกอบด้วย:

- **CVE Database** — ช่องโหว่ที่รู้จัก
- **Exploit Database** — วิธี exploit
- **OWASP Top 10** — ความเสี่ยง web application
- **Techniques** — เทคนิคการโจมตี
- **Tools** — ข้อมูลเครื่องมือ

### วิธีใช้งาน

Agent จะใช้ `query_knowledge` อัตโนมัติเมื่อต้องการข้อมูล
หรือผู้ใช้สามารถถามได้โดยตรง เช่น:
- "มี CVE อะไรที่เกี่ยวกับ Apache Tomcat บ้าง?"
- "OWASP Top 10 มีอะไรบ้าง?"
- "วิธี exploit SQL injection"

---

## 📝 ระบบ Audit Trail

บันทึกทุกการกระทำแบบ **Immutable** (แก้ไขไม่ได้) ด้วย Merkle chain

### ข้อมูลที่บันทึก

- การรันคำสั่ง (command_executed)
- การเข้าถึงข้อมูล (data_accessed)
- การเปลี่ยน config (config_changed)
- การจัดการผู้ใช้ (user_management)
- การชำระเงิน (payment_processed)

### วิธีดู

ใช้ tool `audit_log` หรือผ่านหน้า Admin

---

## 🔐 ระบบ Vault (Secrets)

เก็บ secrets แบบเข้ารหัส **AES-256-GCM** ปลอดภัย

### วิธีใช้งาน

```json
// เก็บ secret
{ "action": "store", "key": "AWS_KEY", "value": "AKIA..." }

// อ่าน secret
{ "action": "get", "key": "AWS_KEY" }

// ลบ secret
{ "action": "delete", "key": "AWS_KEY" }

// ดูรายการ
{ "action": "list" }
```

> ⚠️ Secrets ถูกเข้ารหัสใน DB — แม้ DB ถูกขโมยก็อ่านไม่ได้

---

## 🔄 ระบบ Self-Correction

เมื่อ tool ล้มเหลวด้วย error ที่แก้ไขได้ ระบบจะพยายามแก้ไขคำสั่งอัตโนมัติ

### ตัวอย่าง

```
[!] nmap failed with: "Unknown option: -p-"
[→] Self-correction: retrying with correct syntax...
[✓] nmap completed successfully after self-correction (12.3s)
```

### เงื่อนไขการแก้ไข

- **Retryable errors:** syntax error, connection timeout, wrong flag
- **Fatal errors:** ไม่พยายามแก้ไข (เช่น permission denied, tool not found)

---

## 🛡️ ระบบ Scope Control & HITL

### Scope Validation

ทุกคำสั่งจะถูกตรวจสอบว่า target อยู่ใน **scope ที่อนุญาต** ก่อนรัน

```
BLOCKED: Target 192.168.1.1 is not in the allowed scope
```

**ในหน้าแชท** ผลลัพธ์ที่ถูกบล็อกจะแสดงป้ายอธิบายให้เห็นทันที (แม้พับ output อยู่):

| ป้าย | ความหมาย | ต้องทำอะไร |
|------|----------|-------------|
| 🚫 **Blocked by the scope guard** | target ไม่อยู่ใน scope allowlist → ระบบไม่รันอะไรเลย | เพิ่ม target ที่ Workspace settings → Scope แล้วลองใหม่ |
| ⚠️ **Out-of-scope target** | agent เตือนว่าเป้าหมายนอกขอบเขต (โหมด non-strict) | หยุด ถ้าไม่มีหนังสืออนุญาตเป็นลายลักษณ์อักษร |

### Human-in-the-Loop (HITL)

คำสั่งเสี่ยงสูงต้องได้รับ **การอนุมัติจากผู้ใช้** ก่อนรัน

```
APPROVAL REQUIRED: This command is high-risk
Approval ID: appr_abc123
Risk level: high
```

---

## 🧠 Multi-Model Routing

ระบบเลือก model อัตโนมัติตามความซับซ้อนของงาน

| งาน | Model ที่ใช้ |
|-----|-------------|
| ง่าย (ถาม-ตอบ) | Model เร็ว/ถูก |
| ปานกลาง (วิเคราะห์) | Model กลาง |
| ซับซ้อน (pentest) | Model ทรงพลัง |

### วิธีตั้งค่า

**Settings → Models** → เพิ่ม model หลายตัว → กำหนดบทบาท (orchestrator, racer)

---

## 📤 Export รายงาน & ประวัติการใช้งาน

### ดาวน์โหลดรายงานผล (Markdown / HTML / JSON)

1. เปิด session → เมนู **Vulnerabilities**
2. กดปุ่ม **Export report** → เลือกรูปแบบ (Markdown / HTML / JSON)
3. เบราว์เซอร์จะดาวน์โหลดไฟล์ `*-report-YYYY-MM-DD.<ext>`

รายงานประกอบด้วย executive summary (สรุปจำนวน finding แยกตามระดับความรุนแรง),
methodology, findings ทั้งหมด (เรียง critical → info พร้อม CVSS / CWE / CVE / evidence /
ขั้นตอนทำซ้ำ), evidence ที่ agent เก็บไว้ และ recommendations ที่ดึงมาจาก remediation ของแต่ละ finding

เรียก API ตรง ๆ:

```bash
# ดาวน์โหลดเป็นไฟล์
curl -b cookies.txt -o report.html \
  "http://localhost:3001/api/agent/session/<sessionId>/report?format=html"

# เปิดดูในเบราว์เซอร์ (ไม่แนบไฟล์)
open "http://localhost:3001/api/agent/session/<sessionId>/report?format=markdown&inline=1"
```

### ดาวน์โหลดประวัติการใช้งาน (CSV)

- หน้า **Billing → Usage** มีปุ่ม **Export usage (CSV)** ให้เลือก channel (Online / Telegram / Platform)
- หรือเรียก API ตรง ๆ: `GET /api/subscriptions/me/:channel/usage/export?days=30`
- ได้ไฟล์ `usage-<channel>-YYYY-MM-DD.csv` คอลัมน์: `date, channel, requests, tokens_in, tokens_out, total_tokens, cost_usd`

### เริ่ม Trial ฟรี

- หน้า **Pricing** → การ์ด "Welcome Trial" → **Start Free Trial**
  (ล็อกอินอยู่แล้วจะเริ่มทันที ถ้ายังไม่ล็อกอินระบบจะพาไปหน้าสมัครก่อน)
- Telegram: ส่ง `/trial` (หรือ `/trial <planId>`)
- Trial ใช้ได้ **ครั้งเดียวต่อ channel** — ถ้าเคยใช้แล้ว ระบบจะตอบ `409` และแนะนำให้อัปเกรดเป็นแผนเสียเงิน

---

## 🧪 ตัวอย่าง Workflow การใช้งาน

### ตัวอย่าง: สแกนเว็บแอปพลิเคชัน

```
ผู้ใช้: "สแกนเว็บ http://testphp.vulnweb.com หน่อย"
Agent: [ใช้ query_knowledge หาเทคนิค]
       [ใช้ run_async_task รัน nmap แบบ background]
       [ใช้ get_task_status ตรวจสอบ]
       [ใช้ track_attack_chain บันทึกขั้นตอน]
       [ใช้ collect_evidence เก็บหลักฐาน]
       [ใช้ generate_report สร้างรายงาน]
```

### ตัวอย่าง: ตรวจสอบช่องโหว่

```
ผู้ใช้: "มี CVE อะไรที่เกี่ยวกับ WordPress บ้าง?"
Agent: [ใช้ query_knowledge ค้นหา CVE]
       [สรุปผลให้ผู้ใช้]
```

---

## 📚 ดูเพิ่มเติม

- [คู่มือการติดตั้ง (Install Guide)](./INSTALL_GUIDE.md)
- [README.md](../README.md)
