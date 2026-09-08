# 🚀 Deploy VektorSec ขึ้น VPS

ชุดนี้เตรียมไว้ให้ **อัปโค้ด + ติดตั้ง + รัน** บน VPS (Linux / Ubuntu-Debian)
แบบไม่ต้องไปกด interactive ทีละขั้นเหมือน `run.sh`

## 📦 สิ่งที่ต้องมี

| ของ | รายละเอียด |
|-----|-----------|
| VPS | Ubuntu/Debian, RAM **≥ 4GB** (แนะนำ 8GB), ถ้าใช้ Kali ในตัวให้ **≥ 8GB + swap 4GB** |
| พอร์ต | เปิด `80`, `443` (HTTP/HTTPS) และ `3001`; **ห้ามเปิด** `8081`, `27017`, `6379` ออกอินเทอร์เน็ต |
| เครื่องเรา | ใช้ **Git Bash หรือ WSL** (ต้องมี `rsync` + `ssh`) — ใช้ `make-package.sh` แทนได้ถ้าไม่มี rsync |
| Domain (แนะนำ) | ชี้ DNS A record ไปที่ IP ของ VPS เพื่อใช้ HTTPS ผ่าน Caddy |

> ถ้า RAM น้อย ขอแนะนำให้สร้าง **swap** ก่อน build:
> ```bash
> sudo fallocate -l 4G /swapfile && sudo chmod 600 /swapfile
> sudo mkswap /swapfile && sudo swapon /swapfile
> echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
> ```

---

## วิธีที่ 1 — rsync (แนะนำ สำหรับ deploy ซ้ำๆ)

### Deploy ครั้งแรก

```bash
# 0) (ครั้งแรก) สร้าง secrets สำหรับ DB passwords — vps-setup.sh จะอ่านไฟล์นี้
#    เพื่อ interpolate ค่าใน docker-compose (MONGO_USER/MONGO_PASSWORD/REDIS_PASSWORD)
cp deploy/secrets.env.example deploy/secrets.env
# แล้วแก้ deploy/secrets.env เป็นรหัสที่แข็งแรง (openssl rand -hex 24)

# 1) จากเครื่องเรา (Git Bash / WSL)
cd pentest-copilot

# 2) เตรียม SSH key ไปยัง VPS ก่อน (ssh-copy-id)
ssh-copy-id root@VPS_IP

# 3) รัน deploy (core mode — ไม่มี Kali)
bash deploy/deploy-to-vps.sh root@VPS_IP

# หรือแบบมี Kali ในตัว
bash deploy/deploy-to-vps.sh root@VPS_IP --kali

# หรือแบบมี public URL (ใส่ PUBLIC_URL ถ้ามี domain)
PUBLIC_URL=https://vektor.example.com bash deploy/deploy-to-vps.sh root@VPS_IP
```

สคริปต์จะ:
1. `rsync` โค้ดไปที่ `/opt/vektorsec` (ตัด build junk / git history ออก; `deploy/secrets.env` จะถูกส่งไปให้ VPS ใช้ตั้ง DB passwords ด้วย)
2. SSH เข้า VPS แล้วรัน `deploy/vps-setup.sh` ซึ่งจะติดตั้ง Docker (ถ้ายังไม่มี), สร้าง `config.toml` + `backend/.env` + `frontend/.env` จากไฟล์ `.example`, generate session secret, build images และ `docker compose up -d`

### อัปเดตเวอร์ชันใหม่

```bash
bash deploy/deploy-to-vps.sh root@VPS_IP --update
# หรือ
bash deploy/deploy-to-vps.sh root@VPS_IP --kali --update
```

> `--update` จะ rebuild backend + frontend และ restart เท่านั้น — **ข้อมูล Mongo/Redis และ config บน VPS ไม่ถูกแตะ**

---

## วิธีที่ 2 — สร้างแพ็กเกจอัปโหลดเอง (ถ้าไม่มี rsync)

```bash
# เครื่องเรา: สร้างไฟล์ vektorsec-vps.tar.gz
bash deploy/make-package.sh

# อัปโหลดไฟล์ขึ้น VPS (scp / sftp / file manager)
scp vektorsec-vps.tar.gz root@VPS_IP:/tmp/

# บน VPS
ssh root@VPS_IP
cd /tmp && tar xzf vektorsec-vps.tar.gz
cd vektorsec && bash deploy/vps-setup.sh
```

---

## หลังติดตั้งเสร็จ

1. เปิดเว็บ `http://VPS_IP:3001` (หรือ domain)
2. หน้าแรกจะบังคับตั้งค่า admin / ตั้ง 2FA (ตาม flow ปกติ)
3. ไป **Settings → Models** → เพิ่ม Model Preset + API key ของคุณ แล้วตั้งเป็น Orchestrator
4. (ถ้าต้องการ) ตั้ง SSH/Exploit box ผ่าน **Settings → SSH** หรือหน้า Connection ของ workspace

### ตั้งค่า HTTPS ด้วย Caddy (แนะนำ)

```bash
# บน VPS: ติดตั้ง Caddy แล้ววาง Caddyfile.example
sudo apt-get install -y caddy
sudo cp deploy/Caddyfile.example /etc/caddy/Caddyfile
sudo nano /etc/caddy/Caddyfile   # แก้ domain
sudo systemctl enable --now caddy
```

> ใช้ **Nginx + certbot** แทนก็ได้ — มี config ตัวอย่างที่ `deploy/nginx.example.conf`
> และวิธีทำเต็มอยู่ใน README.md หลัก (หัวข้อ "Deploy ขึ้น Production ด้วย Docker + Nginx + SSL")

แล้วเปิดเฉพาะพอร์ต 80/443 ใน firewall:

```bash
sudo ufw allow 80/tcp && sudo ufw allow 443/tcp && sudo ufw enable
```

---

## 🔧 แก้ปัญหา SSH / Exploit Box ไม่ connect (เว็บเปิดได้ แต่ SSH ไม่ได้)

สถานการณ์นี้เจอบ่อยตอนย้ายจาก local ขึ้น VPS เพราะ **host/port ที่ใช้ตอน local ใช้บน VPS ไม่ได้**:

| | Local (dev) | บน VPS (Docker) |
|---|---|---|
| backend อยู่ที่ไหน | รันบนเครื่องเรา | รันใน container บน network `vektorsec_default` |
| host ที่ถูกต้อง | `localhost:4242` | `kali:22` (ชื่อ service ของ Kali ใน compose) |
| `localhost` แปลว่า | เครื่องเรา → ไปถึง Kali ได้ | **ตัว backend container เอง → connect ไม่ได้** |

### ตรวจสอบอย่างรวดเร็ว (บน VPS)

```bash
cd /opt/vektorsec
grep -E '^(SSH_HOST|SSH_PORT|SSH_USERNAME)=' backend/.env
# ทดสอบจากใน backend container ตรงๆ ว่าไปถึง Kali ได้ไหม
docker compose -f docker-compose.kali.yml exec backend \
  ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null root@kali -p 22 whoami
```

### แก้ให้ถูกต้อง

1. **ถ้าใช้ Kali ในตัว** → ไป **Settings → SSH** (หรือแก้ `backend/.env`) ตั้ง:
   `SSH_HOST=kali`, `SSH_PORT=22`, `SSH_USERNAME=root`, ไม่ต้องใส่รหัส
   (Kali image ตั้ง root login แบบ empty password ไว้แล้ว) แล้ว restart backend:
   `docker compose -f docker-compose.kali.yml restart backend`
   - ตอน deploy ครั้งต่อไป `vps-setup.sh` จะตั้งค่า `SSH_HOST=kali` ให้อัตโนมัติ
   - ถ้าใช้ไฟล์ compose ใหม่ ให้รัน `docker compose -f docker-compose.kali.yml up -d` เพื่อ rebuild
2. **ถ้าใช้ SSH key / `~/.ssh/config`** → สคริปต์ deploy **ไม่ส่ง** `ssh-keys/` ขึ้น VPS ให้
   (กัน key หลุด) ต้อง copy ไปเอง เช่น
   `scp -r ~/.ssh/config ~/.ssh/id_ed25519 root@VPS_IP:/root/.ssh/`
   แล้วเช็ค permission: `chmod 600 /root/.ssh/id_ed25519`
   - compose รองรับ mount จาก `/root/.ssh` และ `/root/keys` บน VPS แล้ว
3. **Managed SSH profiles (Settings → SSH Servers)** → เก็บที่ `/srv/data/ssh-profiles.json`
   (volume `backend-data`) — ตรวจสอบว่าค่า host/port ที่บันทึกเป็นค่าที่ใช้บน VPS ได้จริง
   (เช่น `kali:22`) ไม่ใช่ `localhost:4242` จากเครื่องเรา
4. **Firewall** → ถ้าจะเข้าถึง Kali จากข้างนอกจริงๆ ใช้ `VPS_IP:4242` และเปิดพอร์ตนั้นใน
   ufw/security group; แต่ถ้าปล่อยให้ backend เข้าถึงภายใน compose อย่างเดียว ไม่ต้องเปิด

### อยาก SSH ได้ทั้ง "Kali ในตัว" และ "server ข้างนอก" (external SSH)

SSH ในแอพไม่ได้จำกัดแค่ Kali ในตัว — backend รองรับ **หลาย host พร้อมกัน** ผ่าน
**Settings → SSH → SSH Servers** (managed profiles) แต่ละ workspace/session เลือกได้คนละตัว:

1. **เพิ่ม server ข้างนอก** → Settings → SSH → ส่วน "SSH Servers" → Add Server:
   - Name (alias), Username, Host (IP/domain จริง), Port (ปกติ 22), Password
     หรือถ้าใช้ key → Private key path **ต้องเป็น path ใน container** เช่น `/root/.ssh/id_rsa`
   - กด **Test** ก่อน เพื่อเช็คว่า connect ได้จริง แล้วค่อย Add Server
2. **วาง private key ไว้บน VPS** (compose mount `/root/.ssh` และ `/root/keys` เข้า backend):
   ```bash
   mkdir -p /root/.ssh /root/keys
   scp ~/.ssh/id_rsa root@VPS_IP:/root/.ssh/
   chmod 600 /root/.ssh/id_rsa
   ```
3. **ใช้ใน session** → เปิด workspace → แท็บ **Connection** → เลือก kind = SSH → เลือก profile ที่เพิ่มไว้ → Save
4. **อยู่พร้อมกันทั้งนอกและใน**:
   - Kali ตัวใน → ใช้ legacy form (Settings → SSH ด้านบน) ตั้ง `host=kali, port=22, user=root, password ว่าง`
     → โผล่ใน Connection tab เป็น "Legacy environment default"
   - Server ข้างนอก → แต่ละเครื่องเป็น managed profile 1 ตัว → เลือกได้ต่อ session
5. **เช็ค network ก่อนด่าว่า app ผิด** (backend container ออกอินเทอร์เน็ตได้ตามปกติผ่าน NAT ของ VPS):
   ```bash
   docker compose -f docker-compose.kali.yml exec backend \
     bash -c 'timeout 5 bash -c "</dev/tcp/<SERVER_IP>/22" && echo TCP-OPEN || echo TCP-CLOSED'
   docker compose -f docker-compose.kali.yml exec backend \
     ssh -o StrictHostKeyChecking=no -o ConnectTimeout=5 user@<SERVER_IP> -p 22 whoami
   ```
   - ถ้า TCP-CLOSED → เน็ตเวิร์กของ VPS ไปไม่ถึง (firewall VPS/ผู้ให้บริการ หรือ server ปลายทางบล็อก IP VPS)
   - ถ้า TCP-OPEN แต่ login ไม่ได้ → ผิดที่ auth (password/key/path)

### เจอ `Permission denied (publickey,password,keyboard-interactive)` ตอนทดสอบ SSH

- **Password ของ Kali ที่ built จาก repo นี้คือ ว่าง (empty)** — กด Enter โล่งๆ เพราะ
  `kali/Dockerfile` รัน `passwd -d root` + `PermitEmptyPasswords yes`
- เจอ `All configured authentication methods failed` → แปลว่า **ติดต่อ server ได้แล้ว แต่ทุก
  วิธี auth โดนปฏิเสธ** มักเป็น 1 ใน 3 อย่าง:
  1. `SSH_PASSWORD` ว่าง (หรือส่งไม่ตรงกับที่ server ตั้ง) → ตั้ง password จริงให้ Kali แล้วใส่ในแอพ:
     ```bash
     docker exec kali bash -c "echo 'root:MyP@ss123' | chpasswd"
     # แล้วไป Settings → SSH พิมพ์รหัสนั้นลงช่อง Password → Save (UI reload env ให้ ไม่ต้อง restart)
     ```
  2. `SSH_PRIVATE_KEY` ค้าง path ที่ไม่มีไฟล์ใน container → ตรวจ `docker exec vektorsec-backend-1 env | grep SSH_`
     แล้วล้างให้ว่าง หรือวาง key ไว้ที่ `/root/.ssh/` (`chmod 600`)
  3. ใช้ managed profile ที่ password/key ไม่ถูกต้อง → แก้ที่ฟอร์ม SSH Servers นั้นๆ

- ถ้ากด Enter แล้วยังโดนปฏิเสธ → **Kali container ที่รันอยู่เป็น image เก่า** ที่ build
  ก่อน Dockerfile ตัวนี้ ตรวจและแก้:
  ```bash
  docker ps --format '{{.Names}}\t{{.Image}}\t{{.Status}}'
  docker exec kali sh -c 'passwd -S root'
  docker exec kali sh -c 'grep -E "PermitRootLogin|PermitEmptyPasswords|PasswordAuthentication|UsePAM" /etc/ssh/sshd_config'
  # image เก่า → rebuild
  docker compose -f docker-compose.kali.yml build kali
  docker compose -f docker-compose.kali.yml up -d kali
  ```
- ทางลัด (ไม่ถาวร): ตั้ง password ให้ root ใน container แล้วใช้ในแอพแทน
  `docker exec kali bash -c "echo 'root:MyP@ss123' | chpasswd"`

---

## ไฟล์ทั้งหมดใน `deploy/`

| ไฟล์ | ใช้เมื่อ |
|------|---------|
| `deploy-to-vps.sh` | (เครื่องเรา) rsync + SSH + setup/update |
| `vps-setup.sh` | (บน VPS) ติดตั้ง Docker + config + build + start ครั้งแรก |
| `vps-update.sh` | (บน VPS) rebuild + restart แบบเร็ว |
| `make-package.sh` | (เครื่องเรา) สร้าง `vektorsec-vps.tar.gz` |
| `secrets.env.example` | template สำหรับ `secrets.env` (MONGO/REDIS passwords) — copy + กรอกค่า |
| `Caddyfile.example` | reverse proxy + HTTPS อัตโนมัติ (Caddy) |
| `nginx.example.conf` | reverse proxy + วิธี SSL (Nginx + certbot) |
| `deploy.ps1` | (Windows) deploy ขึ้น VPS ผ่าน PowerShell + scp |
| `README.md` | เอกสารนี้ |

## 🔒 หมายเหตุความปลอดภัย

- `config.toml`, `backend/.env`, `backend/model-registry.json` เป็นไฟล์ลับ — deploy script จะ **ไม่ส่งจากเครื่องเรา** และสร้างใหม่บน VPS (อย่า commit ลง git)
- ห้ามเปิดพอร์ต `8081` (backend), `27017` (MongoDB), `6379` (Redis) สู่สาธารณะ
- ถ้าใช้ Kali ในตัว ควรจำกัดพอร์ต `4242`/`4200`/`5901`/`9020` ให้เฉพาะ internal
- หลังติดตั้งครั้งแรก จะมี admin `admin@vektorsec.local` (ถ้าไม่ตั้ง `ADMIN_EMAIL`/`ADMIN_PASSWORD` ไว้) โดย backend จะ**สุ่มรหัสผ่านชั่วคราวแล้วพิมพ์ใน logs** (`docker logs vektorsec-backend-1`) — เข้า login ครั้งแรกแล้วเปลี่ยนทันที
- บน VPS ที่เปิด 2FA หน้า login จะโชว์ QR + TOTP secret ทุกครั้ง (ตาม feature ที่แก้ล่าสุด) — ระวังเรื่อง shoulder-surfing
