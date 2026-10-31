# 🚀 VektorSec — คู่มือการติดตั้ง (Installation Guide)

> 🇬🇧 **English**: [Installation Guide](./en/INSTALL_GUIDE.md)

คู่มือนี้สำหรับการติดตั้งและรัน **VektorSec เวอร์ชันใหม่** ที่เพิ่มระบบ
Payment & Plan Management, Agentic Tools, Sandbox Isolation, Knowledge Base,
Audit Trail, Vault และอื่นๆ อีกมากมาย

---

## 📋 ความต้องการของระบบ (Prerequisites)

| เครื่องมือ | เวอร์ชัน | หมายเหตุ |
|-----------|---------|----------|
| Node.js | >= 22 | ตรวจสอบด้วย `node -v` |
| pnpm | >= 9 | ตรวจสอบด้วย `pnpm -v` |
| Docker | ล่าสุด | จำเป็นสำหรับ Sandbox Isolation |
| Docker Compose | ล่าสุด | ใช้กับ `docker compose` |
| MongoDB | ผ่าน Docker | รันอัตโนมัติโดย `run.sh` |
| Redis | ผ่าน Docker | รันอัตโนมัติโดย `run.sh` |

> **หมายเหตุ:** ระบบใหม่นี้ **ไม่ต้องติดตั้ง dependencies เพิ่มเติม** เพราะ
> ทุกแพ็กเกจที่ใช้ (openai, stripe, dockerode, tiktoken-node, zod ฯลฯ)
> มีอยู่ใน `backend/package.json` อยู่แล้ว

---

## 🛠️ วิธีที่ 1: ติดตั้งด้วย Docker (แนะนำ)

### ขั้นตอนที่ 1 — ติดตั้ง dependencies

```bash
# ติดตั้ง backend dependencies
cd backend
pnpm install

# ติดตั้ง frontend dependencies
cd ../frontend
pnpm install
```

### ขั้นตอนที่ 2 — รันผ่าน Launcher

```bash
# กลับไปที่ root ของโปรเจกต์
cd ..

# รันแบบมีคำแนะนำ (เลือก Normal mode)
./run.sh start

# หรือรันแบบ Quick Start (ใช้ config เดิม)
./run.sh start -q
```

ระหว่างรัน `run.sh` จะถามคำถามดังนี้:
1. **Choose How To Run** → เลือก `1) Normal mode`
2. **Models** → ถ้ายังไม่ตั้งค่า จะแนะนำให้เปิด Settings → Models หลังรันเสร็จ
3. **Exploit Box** → เลือกตามต้องการ (Kali VM / External SSH / ไม่ใช้)

### ขั้นตอนที่ 3 — ตรวจสอบสถานะ

```bash
./run.sh status    # ดูสถานะ container
./run.sh logs      # ดู logs
```

---

## 🛠️ วิธีที่ 2: Developer Mode (รันแยก)

เหมาะสำหรับนักพัฒนาที่ต้องการแก้ไขโค้ดแบบ hot-reload

### ขั้นตอนที่ 1 — ติดตั้ง dependencies

```bash
cd backend && pnpm install
cd ../frontend && pnpm install
```

### ขั้นตอนที่ 2 — รัน Docker สำหรับ MongoDB + Redis

```bash
./run.sh dev
```

### ขั้นตอนที่ 3 — รัน Backend (terminal แยก)

```bash
cd backend
pnpm build    # compile TypeScript ครั้งแรก
pnpm dev      # รันด้วย nodemon (hot-reload)
```

### ขั้นตอนที่ 4 — รัน Frontend (terminal แยก)

```bash
cd frontend
pnpm dev
```

---

## ⚙️ การตั้งค่า Config

### ไฟล์ config หลัก

| ไฟล์ | หน้าที่ |
|------|---------|
| `config.toml` | ค่า static (port, mongo, redis, session secret) |
| `backend/.env` | ค่า dynamic (API keys, SSH, model presets) |
| `frontend/.env` | ค่า frontend (backend URL, deployment mode) |

### ตั้งค่า Model (จำเป็น)

หลังรันเสร็จ เปิดเว็บ `http://localhost:3001` แล้วไปที่:
**Settings → Models** → เพิ่ม Model Preset (เช่น Anthropic Claude, OpenAI GPT)
→ กำหนดให้เป็น Orchestrator

### ตั้งค่า Payment Gateway (สำหรับระบบใหม่)

1. เปิด `http://localhost:3001/admin/payment`
2. เลือกช่องทางชำระเงิน (Google Pay, Alipay, LINE Pay, Crypto)
3. กด **Enable** และกรอกข้อมูล merchant / wallet address
4. บันทึก

> ระบบ Payment ใช้ **PaymentGateway model ใน MongoDB** เก็บ config
> ไม่ต้องตั้งค่า Stripe key ใน env

### ตั้งค่า Plans & ราคา (Admin)

ระบบจะ seed แผนเริ่มต้น (Free/Pro/Team/Enterprise) อัตโนมัติเมื่อรันครั้งแรก
Admin สามารถปรับราคาและฟีเจอร์ได้ที่ `/admin/payment` → ส่วน **Plans**:

1. เปิด `http://localhost:3001/admin/payment`
2. ไปที่ส่วน **Plans**
3. แก้ไขราคา/เดือน, ราคา/ปี, หรือตั้ง **Channel Pricing** แยกตามช่องทาง
4. ตั้งค่า **Limits** (sessions, iterations, workspaces, MCP tokens)
5. บันทึก

> แผน **Free** เป็นแผน fallback สำหรับผู้ใช้ที่ไม่มี subscription และไม่สามารถลบได้

### ตั้งค่า Subscription

ระบบ Subscription รองรับ **3 ช่องทาง** (platform / online / telegram):

- ผู้ใช้สมัครแผนผ่านหน้า Pricing → ชำระเงิน → subscription เปิดใช้งาน
- Subscription ถูกจัดการผ่าน `Subscription` model ใน MongoDB
- Usage ถูกติดตามผ่าน `UsageRecord` model (วันนี้ / 30 วัน)
- ระบบจะ expire subscription ที่หมดอายุอัตโนมัติ (ผ่าน `expireDueSubscriptions`)

### ตั้งค่า Telegram Bot (ไม่บังคับ)

ระบบรองรับการใช้งานผ่าน **Telegram Bot** (ใช้ HTTP API ตรง ไม่ต้องติดตั้ง dependency เพิ่ม)

#### 1. สร้าง Bot Token กับ @BotFather

1. เปิด Telegram → ค้นหา **@BotFather** (Bot ทางการของ Telegram)
2. พิมพ์คำสั่ง `/newbot` เพื่อสร้าง Bot ใหม่
3. ตั้งชื่อ Bot (เช่น `My VektorSec`)
4. ตั้ง Username (ต้องลงท้ายด้วย `bot` เช่น `myvektorsec_bot`)
5. BotFather จะตอบกลับด้วย **HTTP API Token** (รูปแบบ `123456789:ABCdefGHI...`)
6. **เก็บ Token นี้ไว้เป็นความลับ** — ห้ามเผยแพร่หรือ commit ลง Git

#### 2. กำหนดค่าใน config

เพิ่ม `TELEGRAM_BOT_TOKEN` ใน **ไฟล์ `.env`** (backend) หรือ **`config.toml`**:

```env
TELEGRAM_BOT_TOKEN=123456789:ABCdefGHI...
```

> **หมายเหตุ:** ถ้าไม่ตั้งค่า Bot ระบบจะรันได้ตามปกติ แต่ Telegram bot จะถูกปิด (disable)
> และคุณสามารถเปิดใช้ทีหลังได้ผ่าน API `/api/telegram/configure`

#### 3. เริ่มต้นใช้งาน

เมื่อตั้งค่า Token แล้ว ระบบจะเริ่ม polling อัตโนมัติตอน server เริ่มทำงาน
ผู้ใช้สามารถกด `/start` กับ Bot เพื่อเริ่มใช้งาน และ admin ต้อง **link** Telegram user
กับ platform account ผ่าน API/Admin ก่อน (ดู [User Guide](./USER_GUIDE.md))

#### 4. API Endpoints (Admin)

| Method | Endpoint | หน้าที่ |
|--------|----------|---------|
| GET | `/api/telegram/status` | ตรวจสอบสถานะ Bot |
| POST | `/api/telegram/configure` | ตั้งค่า Token และเริ่ม Bot (`{ "token": "..." }`) |
| POST | `/api/telegram/stop` | หยุด Bot |
| GET | `/api/telegram/users` | รายชื่อ Telegram users |
| POST | `/api/telegram/users/:telegramId/link` | Link user (`{ "userId": "..." }`) |
| POST | `/api/telegram/users/:telegramId/unlink` | Unlink user |


---

## 🧪 การทดสอบระบบ (Testing)

### 1. ตรวจสอบ TypeScript compile

```bash
cd backend
pnpm build
```

### 2. รัน test suite

```bash
cd backend
pnpm test
```

### 3. ทดสอบระบบ Payment

1. เปิด `http://localhost:3001/pricing`
2. เลือกแผน (เช่น Pro) → กด **Upgrade**
3. เลือกช่องทางชำระเงิน → กด **Checkout**
4. ระบบจะสร้าง Order ID (เช่น `ORD-XXXX-XXXX`)
5. ไปที่ `/admin/payment` → กด **Confirm** เพื่อยืนยันการชำระเงิน
6. แผนของผู้ใช้จะถูกอัปเกรดอัตโนมัติ

### 4. ทดสอบ Subscription

1. เปิด `http://localhost:3001/pricing`
2. เลือกแผน (เช่น Pro) → กด **Upgrade**
3. ชำระเงินผ่านช่องทางที่เปิดไว้ → ระบบจะเปิดใช้งาน subscription ให้อัตโนมัติ
4. เปิดหน้า **Billing** (`/billing`) เพื่อตรวจสอบสถานะ subscription
5. ตรวจสอบ **Usage** เพื่อดูการใช้งาน (วันนี้ / 30 วัน)
6. ทดสอบ cancel subscription → สถานะเปลี่ยนเป็น canceled

### 5. ทดสอบ Agentic Tools

เปิดแชทกับ Agent แล้วลองใช้คำสั่ง:


```
# รันงานยาวแบบ background
run_async_task command="nmap -sV -p- 10.10.10.10" task_type="nmap_scan"

# ตรวจสอบความคืบหน้า
get_task_status task_id=<task_id>

# ค้นหา CVE จาก Knowledge Base
query_knowledge query="Apache Log4j RCE"

# ดู audit trail
audit_log action="command_executed"

# จัดการ secrets
vault_manage action="store" key="API_KEY" value="sk-xxx"
```

---

## 🐳 Docker Compose ไฟล์

| ไฟล์ | ใช้เมื่อ |
|------|---------|
| `docker-compose.yml` | Normal mode (backend + frontend + mongo + redis) |
| `docker-compose.kali.yml` | Normal mode + Kali container |
| `docker-compose.dev.yml` | Developer mode — mongo + redis + backend + frontend, hot reload (project `vektorsec-dev` รันจาก repo root) |

---

## ❓ ปัญหาที่พบบ่อย (Troubleshooting)

### Q: `pnpm` ไม่พบคำสั่ง
```bash
corepack enable
corepack prepare pnpm@latest --activate
```

### Q: Docker daemon ไม่ทำงาน
- เปิด Docker Desktop แล้วรอจน status เป็น Running

### Q: Sandbox ไม่ทำงาน (Docker ไม่มี)
- ระบบจะ fallback รันคำสั่งตรงๆ พร้อม warning
- แนะนำให้ติดตั้ง Docker เพื่อความปลอดภัย

### Q: หน้า Payment ไม่แสดงช่องทางชำระเงิน
- ไปที่ `/admin/payment` แล้วกด **Enable** บน gateway ที่ต้องการ

### Q: ต้องการ rebuild หลังแก้โค้ด
```bash
./run.sh start   # แล้วเลือก rebuild backend/frontend
```

### Q: เปิด `http://localhost:3001` ไม่ได้ (connection refused)

ตามลำดับที่เจอบ่อย:

1. **Docker Desktop ไม่ได้เปิด** — container ถูก stop ทั้งหมด จึงไม่มีอะไร listen ที่พอร์ต 3001
   ตรวจด้วย `docker ps` (ถ้าขึ้น `cannot find the file specified` แปลว่า engine ยังไม่ทำงาน)
2. **ยังไม่เคย `up` stack** — รัน `docker compose -f docker-compose.dev.yml up -d --build`
3. **เปิด container ไม่ขึ้นเพราะไม่มี `.env` ที่ root** — `docker-compose.yml` รัน MongoDB
   ด้วย `--auth` ถ้า `MONGO_PASSWORD` ว่าง container mongo จะ exit ทันที และ backend จะค้าง
   ที่ `depends_on: service_healthy`
4. **production compose ยังไม่ build frontend** — `image vektorsec-frontend:0.1.1: not found`
   → `docker compose -f docker-compose.yml build` (ใช้เวลา ~15-30 นาที)

ทางลัดบน Windows (เปิด Docker + เตรียม `.env` + `up` + รอจนพร้อม):

```powershell
powershell -ExecutionPolicy Bypass -File scripts\docker-stack.ps1 up
powershell -ExecutionPolicy Bypass -File scripts\docker-stack.ps1 doctor   # ตรวจทุกจุดทีเดียว
```

หมายเหตุ: compose publish พอร์ตไว้ที่ `127.0.0.1` (IPv4) เท่านั้น — เปิด
`http://127.0.0.1:3001` ถ้าเบราว์เซอร์ resolve `localhost` เป็น `::1` แล้วต่อไม่ติด
และเครื่องอื่นในวงเดียวกันจะเข้าด้วย `localhost` ไม่ได้ตามการตั้งค่านี้

### Q: ใช้แอป desktop (`release\`) กับ Docker stack พร้อมกันได้ไหม

**ไม่ได้** — ทั้งสองฝั่งใช้พอร์ตชุดเดียวกัน: `3001` (gateway), `8081` (backend),
`27017` (MongoDB), `6379` (Redis) จึงต้องเลือกทีละโหมด

อาการที่เจอเมื่อเปิดแอปขณะ Docker รันอยู่ (ดูได้ใน `%APPDATA%\VektorSec\logs\`):

```
frontend.log  Error: listen EADDRINUSE: address already in use 127.0.0.1:3001
backend.log   mongodb connected  {"host":"mongodb://127.0.0.1:27017/vektorsec"}   ← คือ Mongo ของ Docker
audit log     auth.login_failed  reason=invalid_password  UA=…Electron…            ← 401 ทั้งที่รหัสถูก
```

เพราะ gateway ของแอปสตาร์ทไม่ได้ และ backend ของแอปไปต่อ **ฐานข้อมูลของ Docker**
ทำให้รหัส admin ของแอป (`MyStrongPass!2026` — ดู `release\note.txt`) ไม่ตรงกับ hash ใน DB นั้น

สลับโหมดด้วยสคริปต์ (ปิดฝั่งหนึ่งให้อัตโนมัติ):

```powershell
powershell -ExecutionPolicy Bypass -File scripts\app-stack.ps1 up      # ปิด Docker -> เปิด MongoDB/Redis ของแอป -> เปิด VektorSec.exe
powershell -ExecutionPolicy Bypass -File scripts\app-stack.ps1 status  # ดู process/พอร์ต/container
powershell -ExecutionPolicy Bypass -File scripts\app-stack.ps1 down    # ปิดแอป + DB ของแอป -> คืนพอร์ตให้ Docker
powershell -ExecutionPolicy Bypass -File scripts\docker-stack.ps1 up   # กลับไปโหมด Docker
```

> บิลด์ที่สร้างจากซอร์สชุดปัจจุบันจะมี **port guard** ในตัว (`electron/port-guard.js`):
> ถ้า 3001/8081 ถูกใช้อยู่ แอปจะขึ้นกล่องข้อความอธิบายแล้วปิดตัวเอง แทนที่จะเปิด UI
> ของ stack อื่นแบบเงียบ ๆ — และจะเตือนด้วยถ้า MongoDB/Redis บนเครื่องไม่ใช่ตัวของแอป

### Q: บริการ (เช่น redis) ไม่ start หรือ exit ทันที (พอร์ตชนกัน)

การรันสอง stack พร้อมกัน (`vektorsec` และ `vektorsec-community`) ใช้พอร์ตเดียวกัน
(3001, 8081, 27017, 6379) หลัง Docker Desktop รีสตาร์ท container ที่ตั้งค่า
`restart: always` จะกลับมาขึ้นเองและแย่งพอร์ตของอีก stack ได้ ทำให้บริการตัวใดตัวหนึ่ง
start ไม่ขึ้นหรือถูก terminate ทันที

วิธีแก้:

1. ตรวจว่า container ไหนกำลังรันและใครครอบครองพอร์ต:
   docker ps
   docker ps -a
2. หยุด stack ที่ไม่ได้ใช้ (รันคำสั่งในโฟลเดอร์ของ stack นั้น):
   docker compose down
3. เริ่ม stack ที่ต้องการใหม่:
   docker compose up -d
4. ตรวจสอบว่า container กลับมา healthy:
   docker ps
   docker logs <ชื่อ-container>

เคล็ดลับ: ใช้ `restart: unless-stopped` ใน docker-compose.yml เพื่อให้ container
ที่หยุดไปแล้วไม่กลับมาขึ้นเองหลัง Docker Desktop รีสตาร์ท


---

## 📚 ดูเพิ่มเติม

- [คู่มือการใช้งาน (User Guide)](./USER_GUIDE.md)
- [README.md](../README.md)
