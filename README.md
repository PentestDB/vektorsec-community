<p align="center">
  <img src="./msedge_l0NcpZRSXr.png" alt="VektorSec Banner" width="820" />
</p>

<h1 align="center">🛡️ VektorSec — AI Penetration Testing Agent</h1>

<p align="center">
  Open-source AI agent สำหรับงาน <b>penetration testing / CTF / boot2root</b> —
  ต่อเข้า Kali attack box, รันเครื่องมือ, วิเคราะห์ผล และวนลูปเองจนจบงาน<br />
  คุณแค่บอกเป้าหมาย ที่เหลือ agent จัดการ
</p>

<p align="center">
  <img alt="License" src="https://img.shields.io/badge/License-MIT-blue.svg" />
  <img alt="Deploy" src="https://img.shields.io/badge/deploy-Docker%20Compose-2496ED.svg" />
  <img alt="Platform" src="https://img.shields.io/badge/platform-Linux%20%2F%20Docker-9cf.svg" />
</p>

> ⚠️ **Disclaimer**: VektorSec มีไว้สำหรับ **งานทดสอบความปลอดภัยที่ได้รับอนุญาตเท่านั้น**
> ต้องได้รับ permission ชัดเจนจากเจ้าของระบบก่อนทดสอบทุกครั้ง ผู้ใช้งานต้องรับผิดชอบต่อการใช้งานเอง

---

## 📑 สารบัญ

- [VektorSec คืออะไร](#-vektorsec-คืออะไร)
- [ความสามารถหลัก](#-ความสามารถหลัก)
- [สถาปัตยกรรม](#-สถาปัตยกรรม)
- [ความต้องการระบบ](#-ความต้องการระบบ)
- [โครงสร้างโปรเจกต์](#-โครงสร้างโปรเจกต์)
- [ไฟล์ตั้งค่า Config](#-ไฟล์ตั้งค่า-config)
- [เริ่มต้นอย่างรวดเร็ว (Docker)](#-เริ่มต้นอย่างรวดเร็ว-docker)
- [Deploy ขึ้น Production ด้วย Docker + Nginx + SSL](#-deploy-ขึ้น-production-docker--nginx--ssl)
- [Deploy อัตโนมัติด้วยสคริปต์ / Caddy](#-deploy-อัตโนมัติด้วยสคริปต์--caddy)
- [อัปเดต และ Backup](#-อัปเดต-และ-backup)
- [Security Checklist](#-security-checklist)
- [การพัฒนา (Developer mode)](#-การพัฒนา-developer-mode)
- [เอกสารเพิ่มเติม](#-เอกสารเพิ่มเติม)
- [เครดิตและ License](#-เครดิตและ-license)

---

## 🧠 VektorSec คืออะไร

VektorSec คือ AI penetration-testing agent แบบ agentic: มันรันคำสั่งจริงบน attack box
(SSH/Kali หรือ Kali container ในตัว) อ่าน output วิเคราะห์ แล้วตัดสินใจขั้นต่อไปเอง
โดยไม่ต้องมีคนคอยจ้ำจี้ — เหมาะกับงาน pentest จริง, boot2root box และ CTF

ตัวอย่างการทำงานจริง: agent บุก auth bypass ใน [OWASP Juice Shop](https://owasp.org/www-project-juice-shop/)

<p align="center">
  <img src="./msedge_7AQUDW4nRB.png" alt="VektorSec Dashboard" width="800" />
</p>

<p align="center">
  <img src="./msedge_X3YWNXLRhx.png" alt="VektorSec Operational Dashboard" width="800" />
</p>

## ✨ ความสามารถหลัก

- **Agentic execution** — agent รันคำสั่งบน attack box อ่านผล แล้วลูปต่อเนื่องได้ถึง 25 iteration/turn
- **16 agent tools** — bash, Python script, ติดตั้งเครื่องมือ, จัดการ shell, Google search, spawn subagent, Burp Suite (proxy history/Repeater/Intruder/Collaborator) และ browser automation
- **100+ capabilities** — registry เครื่องมือ/แพ็กเกจสำหรับ network, rev, pwn, crypto, forensics, stego, core
- **Burp Suite integration** — ดู proxy history, ส่ง request ไป Repeater/Intruder, ใช้ Collaborator สำหรับ OOB testing
- **Browser agent (Magnitude)** — browser automation จริง, ส่องหน้าเว็บผ่าน VNC stream ในโหมด Docker
- **VPN management** — อัปโหลดไฟล์ `.ovpn` แล้ว connect/disconnect ได้จากหน้าเว็บ (ต่อพร้อมกันหลายตัวได้)
- **Subagent parallelism** — รันงานย่อยพร้อมกัน เช่น directory brute-force + subdomain enum ในเวลาเดียว
- **Safety checks** — คำสั่งอันตราย (ลบ recursive, เขียน device, fork bomb) ต้องได้รับการอนุมัติก่อนเสมอ
- **Bring your own model** — OpenAI, Anthropic (API key หรือ OAuth), Google, Mistral, หรือ endpoint แบบ OpenAI-compatible; รองรับ Codex CLI / Claude Code ที่ login บนเครื่อง
- **MCP access** — เปิด control plane ผ่าน MCP ให้ Claude Code / Codex เรียกใช้ได้

---

## 🏗️ สถาปัตยกรรม

```
                        ┌───────────────────────────────┐
  User / Browser ─────▶ │  Nginx / Caddy (Reverse Proxy)│  :80 / :443 (SSL)
                        └──────────────┬────────────────┘
                                       │ http://127.0.0.1:3001
                        ┌──────────────▼────────────────┐
                        │  frontend (Next.js gateway)    │  (ไม่เปิดสู่ public)
                        │  server.js: proxy /api /ws /novnc
                        └──────────────┬────────────────┘
                                       │ http://backend:8081
                        ┌──────────────▼────────────────┐
                        │  backend (Express + agent loop)│  :8081, :6080 (VNC)
                        └──────┬──────────────┬─────────┘
                               │              │
                 ┌─────────────▼─────┐   ┌────▼─────────────┐
                 │  mongodb (data)   │   │ redis (session)  │
                 └───────────────────┘   └──────────────────┘
  (kali-data/ bind mount ใช้เป็น workspace + Kali container ในตัว ถ้าเปิด docker-compose.kali.yml)
```

| Service  | บทบาท | ข้อมูล |
|----------|-------|-------|
| `frontend` | Next.js + API gateway (server.js) | port host `127.0.0.1:3001` |
| `backend`  | Express API + AI agent loop + SSH/exploit box | port host `127.0.0.1:8081`, `6080`, `9020` |
| `mongodb`  | เก็บ user/session/workspace/ผลลัพธ์ (เปิด `--auth`) | volume `mongodb-data` |
| `redis`    | session store (บังคับ password) | volume `redis-data` |
| `kali` *(optional)* | Kali attack box ในตัว (docker-compose.kali.yml) | volume `kali-data` + `./kali-data/` |

ข้อมูลที่เซฟไว้ (Mongo/Redis/backend workspace) อยู่ใน **Docker named volumes** และโฟลเดอร์ `kali-data/`
ซึ่งถูก `.gitignore` ไว้แล้ว — **ไม่มีวันหลุดเข้า Git**

---
## 📦 ความต้องการระบบ

| | ขั้นต่ำ |
|---|---------|
| RAM | 8 GB (+2 GB ถ้าเปิด Kali container ในตัว) |
| Disk | 20 GB+ |
| OS | Linux (Ubuntu/Debian แนะนำ), macOS สำหรับ dev |
| Docker | v20+ พร้อม Compose v2+ |
| Node.js / pnpm | v22+ / v9+ (เฉพาะโหมด dev รันนอก Docker) |
| Domain (แนะนำ) | ชี้ DNS A record ไป IP VPS เพื่อใช้ HTTPS |

> แรก build อาจใช้ RAM เยอะ (compile backend + Chromium) — ถ้า VPS RAM น้อย ให้สร้าง swap ก่อน:
> `sudo fallocate -l 4G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile`

## 📁 โครงสร้างโปรเจกต์

```
.
├── backend/                 # Express + AI agent (TypeScript)
│   ├── .env.example         # ← copy เป็น backend/.env แล้วใส่ค่าของคุณ
│   ├── src/                 # controllers / services / tools / routes
│   ├── tests/
│   └── Dockerfile
├── frontend/                # Next.js UI + black-box gateway (server.js)
│   ├── .env.example         # ← copy เป็น frontend/.env แล้วใส่ค่าของคุณ
│   └── Dockerfile
├── kali/                    # Dockerfile สำหรับ Kali attack box ในตัว (optional)
├── deploy/                  # ตัวช่วย deploy ขึ้น VPS
│   ├── secrets.env.example  # ← copy เป็น deploy/secrets.env (DB passwords)
│   ├── nginx.example.conf   # reverse proxy + วิธีทำ SSL (Nginx/certbot)
│   ├── Caddyfile.example    # อีกทางเลือก: HTTPS อัตโนมัติด้วย Caddy
│   ├── deploy-to-vps.sh     # rsync + setup/update ขึ้น VPS
│   ├── vps-setup.sh         # ติดตั้ง Docker + สร้าง config + build (รันบน VPS)
│   └── vps-update.sh        # rebuild + restart เร็ว
├── config.example.toml      # ← copy เป็น config.toml แล้วใส่ค่าของคุณ
├── docker-compose.yml       # stack หลัก (production-ready)
├── docker-compose.kali.yml  # stack แบบมี Kali container ในตัว
├── docker-compose.dev.yml   # infra สำหรับ dev (mongo/redis/kali)
├── run.sh                   # launcher รวม (config/build/start/stop)
└── docs/                    # คู่มือ (ไทย/อังกฤษ)
```

## ⚙️ ไฟล์ตั้งค่า Config

ระบบใช้ไฟล์ตั้งค่า 4 กลุ่ม (ทุกไฟล์ `.example` คือ template — copy ไปเป็นชื่อจริงแล้วกรอกค่าเอง):

| Template (commit ได้) | copy ไปเป็น | เก็บอะไร |
|---|---|---|
| `config.example.toml` | `config.toml` | static config: port, deployment, mongo/redis URI, **session secret** |
| `backend/.env.example` | `backend/.env` | dynamic config: admin, SSH box, Telegram, OAuth, VNC/Burp/Caido/Mythic, reCAPTCHA |
| `frontend/.env.example` | `frontend/.env` | gateway URL, deployment mode, site URL, reCAPTCHA site key |
| `deploy/secrets.env.example` | `deploy/secrets.env` *(หรือ root `.env`)* | `MONGO_USER`, `MONGO_PASSWORD`, `REDIS_PASSWORD` — ใช้ตอน `docker compose` |

> 🔒 ห้าม commit `config.toml`, `*.env`, `deploy/secrets.env`, `backend/model-registry.json`
> และ `kali-data/` — `.gitignore` จัดการให้แล้ว ใคร clone ไปก็มีแค่ `.example`

---

## 🚀 เริ่มต้นอย่างรวดเร็ว (Docker)

รันทั้ง stack ด้วย Docker Compose (วิธีนี้ใช้ได้ทั้งเครื่อง dev และ VPS):

### 1. Clone + สร้างไฟล์ตั้งค่าจาก template

```bash
git clone https://<YOUR_GIT_REPO_URL>.git vektorsec
cd vektorsec

# DB passwords — docker compose อ่านไฟล์ .env ที่ root อัตโนมัติ
cp deploy/secrets.env.example .env
# แล้วแก้ .env: ตั้ง MONGO_PASSWORD / REDIS_PASSWORD เป็นค่าสุ่ม เช่น
#   openssl rand -hex 24

# static config
cp config.example.toml config.toml

# env ของ backend / frontend
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

### 2. ใส่ค่าสำคัญ (แก้ไฟล์จริง)

```bash
# (ก) session secret ใน config.toml — สุ่มใหม่ทุกครั้ง
openssl rand -hex 32
#     เอาไปใส่ [session] secret ใน config.toml
#     (run.sh / deploy/vps-setup.sh สุ่มให้อัตโนมัติ ถ้าเห็น placeholder CHANGE_ME...)

# (ข) backend/.env — optional แต่แนะนำ: กำหนด admin เองตั้งแต่แรก
#   ADMIN_EMAIL=you@example.com
#   ADMIN_PASSWORD=<รหัสที่แข็งแรง>
#   (ถ้าปล่อยว่าง backend จะสร้าง admin@vektorsec.local + สุ่มรหัสแล้วพิมพ์ใน logs)

# (ค) frontend/.env — ตอนรันใน Docker ตัว backend จะถูก gateway เรียกผ่าน service name
#   BACKEND_URI=http://backend:8081
#   VNC_ORIGIN_URI=http://backend:6080
#   (ถ้ารัน dev แบบแยก process ให้ใช้ http://localhost:8081 แทน)
```

### 3. Build + Start

```bash
docker compose up -d --build
```

ครั้งแรก build ใช้เวลาพอสมควร (backend ลง Chromium/Codex CLI + compile) แล้วรอให้ทุก container healthy:

```bash
docker compose ps          # ทุกตัว status = running / healthy
docker compose logs -f backend
```

### 4. เข้าใช้งานครั้งแรก

1. เปิด `http://localhost:3001` (ถ้ารันบน VPS ให้ใช้ SSH tunnel หรือทำ Nginx ตามหัวข้อถัดไป)
2. login ด้วย admin — หารหัสผ่านชั่วคราวจาก log ของ backend:
   ```bash
   docker compose logs backend | grep -i -A1 "temporary password"
   ```
   (หรือใช้ `ADMIN_EMAIL` / `ADMIN_PASSWORD` ที่ตั้งไว้ใน `backend/.env`)
3. เปลี่ยนรหัสผ่าน admin ทันที + เปิด 2FA
4. ไปที่ **Settings → Models** เพิ่ม Model Preset + API key ของคุณ แล้วตั้ง Orchestrator

### ทางลัด: ใช้ `run.sh`

`run.sh` สร้าง config/env จาก template, สุ่ม session secret และจัดการ Docker ให้อัตโนมัติ:

```bash
./run.sh start      # guided start (ถาม provider/API key ครั้งแรก)
./run.sh start -q   # quick start โดยใช้ config เดิม
./run.sh status     # สถานะ container
./run.sh logs       # ดู log
./run.sh stop       # หยุดทุก container
```

---
## 🌐 Deploy ขึ้น Production ด้วย Docker + Nginx + SSL

> ภาพรวม: โค้ด (frontend+backend) รันใน Docker Compose โดยทุกพอร์ต bind ไว้ที่
> `127.0.0.1` บน VPS — Nginx บนเครื่องเดียวกันเป็นตัวรับ traffic จากอินเทอร์เน็ต
> (`80/443`) แล้ว reverse proxy ไป `http://127.0.0.1:3001` พร้อม SSL อัตโนมัติ
> → ไม่ต้องเปิดพอร์ต `8081/27017/6379` ออก public เลย

### Step 0 — เตรียม VPS + Domain

```bash
# VPS: Ubuntu 22.04/24.04, RAM ≥ 8GB (ดูหัวข้อ swap ด้านบน)
# ติดตั้ง Docker + Compose plugin:
curl -fsSL https://get.docker.com | sudo sh
sudo systemctl enable --now docker

# DNS: ชี้ A record ของ <YOUR_DOMAIN> → <YOUR_VPS_IP>

# Firewall: เปิดแค่ HTTP/HTTPS/SSH
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

### Step 1 — วางโค้ดบน VPS

```bash
# วิธีที่ 1: clone ตรงบน VPS
cd /opt && sudo git clone https://<YOUR_GIT_REPO_URL>.git vektorsec
sudo chown -R $USER:$USER /opt/vektorsec && cd /opt/vektorsec

# วิธีที่ 2: อัปโหลดจากเครื่องเรา (ดู deploy/README.md มี rsync/package ให้)
```

### Step 2 — สร้างไฟล์ตั้งค่า (บน VPS)

```bash
# DB passwords สำหรับ docker compose
cp deploy/secrets.env.example .env
# แก้ .env → MONGO_PASSWORD / REDIS_PASSWORD = ค่าสุ่ม (openssl rand -hex 24)

# config
cp config.example.toml config.toml

# env
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

แก้ `config.toml` ให้เป็นค่า production:

```toml
[server]
port = 8081
deployment = "PROD"                          # สำคัญ: PROD จะบังคับ secret ที่แข็งแรง
base_url_frontend = "https://<YOUR_DOMAIN>"   # เปลี่ยน <YOUR_DOMAIN>
cors_origins = "https://<YOUR_DOMAIN>"

[session]
secret = "<ค่าจาก openssl rand -hex 32>"     # อย่าใช้ค่า CHANGE_ME...
lifetime = 1000
```

แก้ `backend/.env` (optional แต่แนะนำ):

```bash
ADMIN_EMAIL=admin@<YOUR_DOMAIN>
ADMIN_PASSWORD=<รหัสที่แข็งแรง>       # ถ้าปล่อยว่าง → สุ่มแล้วพิมพ์ใน log
FRONTEND_URL=https://<YOUR_DOMAIN>
OOB_BASE_URL=https://<YOUR_DOMAIN>/api   # สำหรับ OOB/Collaborator payload
```

แก้ `frontend/.env` ให้เว็บถูก index + URL ถูกต้อง:

```bash
BACKEND_URI=http://backend:8081
VNC_ORIGIN_URI=http://backend:6080
DEPLOYMENT=PRODUCTION
NEXT_PUBLIC_DEPLOYMENT=PRODUCTION
NEXT_PUBLIC_SITE_URL=https://<YOUR_DOMAIN>
```

### Step 3 — Build และรัน stack

```bash
docker compose up -d --build
docker compose ps
docker compose logs -f backend
```

### Step 4 — ตั้ง Nginx + SSL (Let's Encrypt)

```bash
sudo apt-get install -y nginx certbot python3-certbot-nginx

# ใช้ config ตัวอย่าง แล้วแก้ <YOUR_DOMAIN> → โดเมนจริงของคุณ (มีทั้งหมด 5 จุด)
sudo cp deploy/nginx.example.conf /etc/nginx/sites-available/vektorsec
sudo nano /etc/nginx/sites-available/vektorsec
sudo ln -s /etc/nginx/sites-available/vektorsec /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

# ออก SSL อัตโนมัติ (เลือก redirect HTTP→HTTPS เมื่อถาม)
sudo certbot --nginx -d <YOUR_DOMAIN>
```

ตรวจสอบ: เปิด `https://<YOUR_DOMAIN>` แล้ว login

> ทางเลือก: ใช้ **Caddy** ก็ได้ — ดู `deploy/Caddyfile.example` (ออก Let's Encrypt ให้อัตโนมัติ
> ไม่ต้องแตะ nginx/certbot เลย)

### Step 5 — หลังติดตั้ง

1. หา admin + รหัสผ่านชั่วคราว: `docker compose logs backend | grep -i -A1 "temporary password"`
2. login แล้วเปลี่ยนรหัสทันที + เปิด 2FA
3. **Settings → Models** → เพิ่ม API key ของ model ที่จะใช้ → ตั้ง Orchestrator
4. ทดสอบ workspace จริง (สร้าง session ใหม่ → เลือก SSH/Kali/scope)

---

## 🤖 Deploy อัตโนมัติด้วยสคริปต์ / Caddy

ถ้าอยาก deploy ซ้ำๆ แบบเร็ว (rsync + rebuild อัตโนมัติ) ดูคู่มือเต็มที่ **`deploy/README.md`**

```bash
# จากเครื่องเรา (ต้องมี ssh/rsync)
bash deploy/deploy-to-vps.sh root@<YOUR_VPS_IP>            # ครั้งแรก
bash deploy/deploy-to-vps.sh root@<YOUR_VPS_IP> --update  # อัปเดตรอบถัดไป
# Windows PowerShell:  powershell -File deploy\deploy.ps1
```

หรือถ้าไม่มี rsync ให้สร้าง package อัปโหลดเอง:

```bash
bash deploy/make-package.sh        # ได้ vektorsec-vps.tar.gz (ตัด secrets/log ออก)
# อัปโหลดขึ้น VPS แล้วรัน: tar xzf vektorsec-vps.tar.gz && cd vektorsec && bash deploy/vps-setup.sh
```

---

## 🔄 อัปเดต และ Backup

**อัปเดตเวอร์ชันใหม่** (ข้อมูล/config บน VPS ไม่ถูกแตะ):

```bash
git pull
# ถ้าไฟล์ .example เปลี่ยนและอยากได้ key ใหม่ → merge ทีละ key เอง (ห้ามทับ .env ที่มีค่าแล้ว)
docker compose up -d --build
```

**ข้อมูลอยู่ที่ไหน** — ทั้งหมดอยู่นอก Git:

```bash
docker volume ls | grep vektorsec
# vektorsec_mongodb-data, vektorsec_redis-data, vektorsec_backend-data
ls ./kali-data          # workspace / ไฟล์ที่ agent สร้าง (bind mount)
```

**Backup** (จอด container ก่อน หรือยอมรับ dirty snapshot):

```bash
# ตัวอย่าง backup volume mongodb-data ไปที่ ~/backup/
mkdir -p ~/backup
sudo docker run --rm -v vektorsec_mongodb-data:/data -v ~/backup:/backup \
  alpine tar czf /backup/mongodb-data-$(date +%F).tgz -C /data .
# ทำแบบเดียวกันกับ redis-data และ backend-data แล้วคัดลอก ./kali-data ไปเก็บด้วย
```

**Restore**: เอาไฟล์ tgz กลับด้วย tar xzf แล้ว `docker compose up -d` (volume ต้องว่าง/ใหม่)

---

## 🔒 Security Checklist

- [x] `config.toml`, `*.env`, `deploy/secrets.env`, `kali-data/` ถูก `.gitignore` — ตรวจอีกทีด้วย `git status` ก่อน push
- [ ] `[session] secret` ใน `config.toml` เป็นค่าสุ่ม ≥ 32 ตัวอักษร (ไม่ใช่ `CHANGE_ME`)
- [ ] เปลี่ยนรหัสผ่าน admin เริ่มต้นทันที + เปิด 2FA
- [ ] `deployment = "PROD"` และ domain ถูกใน `base_url_frontend` / `cors_origins`
- [ ] ห้ามเปิดพอร์ต `8081` (backend), `27017` (MongoDB), `6379` (Redis) สู่สาธารณะ
- [ ] ถ้าใช้ Kali ในตัว จำกัดพอร์ต `4242/4200/5901/9020` ให้เฉพาะ internal
- [ ] SSH/exploit box: ใช้ SSH key แทน password และจำกัด source IP
- [ ] API key ของ LLM เก็บผ่าน UI (Settings → Models) ซึ่งอยู่ใน `model-registry.json` (local เท่านั้น)

---

## 💻 การพัฒนา (Developer mode)

รันแค่ infra (MongoDB/Redis/Kali) ใน Docker แล้วรัน frontend/backend บนเครื่อง:

```bash
./run.sh dev
# terminal 2
cd backend && pnpm install && pnpm run watch
# terminal 3
cd backend && pnpm run dev        # port 8081
# terminal 4
cd frontend && pnpm install && pnpm run dev   # port 3001
```

---

## 📚 เอกสารเพิ่มเติม

| ไฟล์ | เนื้อหา |
|---|---|
| `docs/INSTALL_GUIDE.md` / `docs/en/INSTALL_GUIDE.md` | คู่มือติดตั้งฉบับเต็ม (ไทย/อังกฤษ) |
| `docs/USER_GUIDE.md` | คู่มือการใช้งาน |
| `docs/QUICK_REFERENCE.md` | รวมคำสั่ง/ค่า config ที่ใช้บ่อย |
| `docs/SYSTEM_SUMMARY.md`, `docs/ARCHITECTURE_PLAN.md` | สถาปัตยกรรมระบบ |
| `docs/en/user-guide/` | คู่มือผู้ใช้ (อังกฤษ): online web, platform, telegram bot |
| `deploy/README.md` | คู่มือ deploy ขึ้น VPS ฉบับเต็ม (rsync/Caddy/แก้ปัญหา) |

---

## 📜 เครดิตและ License

โปรเจกต์นี้พัฒนาต่อยอดจากงานวิจัย/โอเพนซอร์ส VektorSec และเผยแพร่ภายใต้
[**MIT License**](./LICENSE) — ดูรายละเอียดในไฟล์ LICENSE และคู่มือการร่วมพัฒนา
[CONTRIBUTING.md](./CONTRIBUTING.md) / [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md)

```bibtex
@article{goyal2024hacking,
  title={Hacking, the lazy way: LLM augmented pentesting},
  author={Goyal, Dhruva and Subramanian, Sitaraman and Peela, Aditya},
  journal={arXiv preprint arXiv:2409.09493},
  year={2024}
}
```

---

_⚠️ VektorSec มีไว้สำหรับงานที่ได้รับอนุญาตเท่านั้น — ใช้ผิดกฎหมาย/โดยไม่ได้รับอนุญาต
ผู้ใช้ต้องรับผิดชอบเองทั้งหมด_
