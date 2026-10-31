# VektorSec — Standalone Desktop App (Electron)

Shell ที่แพ็กแอป VektorSec เป็น `.exe` แบบติดตั้งได้ โดยฝัง **Electron/Node.js
runtime** ไว้ในตัว และรัน Backend service แบบ native บน OS โดยตรง — **ไม่ต้องใช้
Docker Desktop**

## โครงสร้าง

| ไฟล์ | หน้าที่ |
| --- | --- |
| `main.js` | Electron main process: เปิดหน้าต่าง, สตาร์ท backend, จัดการ IPC สำหรับ license |
| `preload.js` | `contextBridge` → `window.vektorsec` (context-isolated, ไม่ leak Node API) |
| `backend-runner.js` | รัน `backend/dist/server.js` ผ่าน `ELECTRON_RUN_AS_NODE=1` (Node ที่ฝังใน Electron) |
| `drm-ipc.js` | คำนวณ HWID + ตรวจ license key ฝั่ง shell (แสดงผล/ความสะดวก) |
| `../electron-builder.yml` | config ของ electron-builder → NSIS installer |

## วิธี Install / Build

### 0) ติดตั้ง dependency ของ shell (ครั้งเดียว)

```bash
cd d:\Project\vektorsec
npm install          # ติดตั้ง electron + electron-builder ที่ root (~435 packages)
```

> `backend/node_modules` และ `frontend/node_modules` แยกกันอยู่แล้ว ไม่ต้องติดตั้งซ้ำ

### 1) Build

```bash
npm run build:backend    # backend/src/**/*.ts → backend/dist/server.js
npm run build:frontend   # frontend/.next (Next.js production build)
npm run build:native     # (optional) C++ anti-tamper addon — ต้องมี MSVC Build Tools
```

### 1.5) Stage dependencies สำหรับตัวติดตั้ง (`stage:deps`)

`npm run package:win*` และ `npm run dist` จะรัน `npm run stage:deps` ให้อัตโนมัติก่อนเสมอ
(`scripts/stage-deps.mjs` → `pnpm install --prod --frozen-lockfile --node-linker=hoisted`
ลงใน `.stage\backend` และ `.stage\frontend`) เหตุผล:

- pnpm ปกติเก็บ `node_modules/<pkg>` เป็น **junction ที่ชี้ path สัมบูรณ์ของเครื่อง build**
  (`D:\Project\vektorsec\backend\node_modules\.pnpm\...`) — electron-builder คัดลอก
  reparse point ไปทั้งดุ้น ทำให้แอปที่ติดตั้งบนเครื่องลูกค้า resolve module ไม่ได้เลย
  (`MODULE_NOT_FOUND` ทุกตัว) ส่วน junction แบบ relative ก็ใช้ไม่ได้ เพราะ Windows
  resolve target ของ junction เทียบกับ CWD ของโปรเซส ไม่ใช่โฟลเดอร์ที่ link อยู่
- `--node-linker=hoisted` ได้โฟลเดอร์จริง (ไม่มี link เลย) และ `--prod` ตัด
  typescript/eslint/tsx ออก → ตัวติดตั้งเล็กลงมาก
- `--prefer-offline` ใช้ pnpm store ในเครื่อง (rebuild ไม่ต้องโหลดจากเน็ตใหม่)

ต้องมี `pnpm` ในเครื่อง (ตอนนี้ใช้ pnpm 11) — ถ้าต้องการ stage ใหม่เองโดยไม่ package:
`npm run stage:deps`

ขนาดตัวติดตั้งหลังใช้ stage deps ≈ **330 MB** (Electron runtime ~250 MB + production deps
ของ backend/frontend) — ถ้าเปลี่ยน dependency เวอร์ชันให้รัน `npm run stage:deps` ใหม่
(หรือลบ `.stage\` ทิ้ง) ก่อน package เสมอ; `package:win*` ทำให้อัตโนมัติอยู่แล้ว

`electron/after-pack.js` จะ **fail build** ถ้าเจอ symlink/junction ใน
`resources\app\{backend,frontend}\node_modules` หรือมี module ตัวใด resolve ออกนอก package
(กันปัญหาเดิมกลับมาแบบเงียบ ๆ)


### 2) ใช้งานทันทีโดยไม่ต้องติดตั้ง (portable)

```bash
npm run package:win
# แล้วรัน:
release\win-unpacked\VektorSec.exe
```

### 3) สร้างตัวติดตั้ง (.exe)

```bash
npm run package:win
# → release\VektorSec Setup 1.0.0.exe
```

ถ้าเจอ error `Cannot create symbolic link : A required privilege is not held by the client`
(ตอนแตก `winCodeSign`) ให้เลือกทางใดทางหนึ่ง:

| ทางเลือก | วิธี |
| --- | --- |
| **A. เปิด Developer Mode** (แนะนำ) | Settings → System → For developers → Developer Mode = On แล้วรัน `npm run package:win` ใหม่ |
| **B. รัน terminal แบบ Administrator** | คลิกขวา → Run as administrator แล้วรัน `npm run package:win` |
| **C. ข้ามขั้นตอนแก้ icon/version ใน .exe** | `npm run package:win:nosign` (ใช้ `signAndEditExecutable=false`) |

### 4) Path ทั้งหมด (สรุป)

| อะไร | Path |
| --- | --- |
| ตัวติดตั้งที่ build ได้ | `d:\Project\vektorsec\release\VektorSec Setup 1.0.0.exe` |
| โฟลเดอร์แอปแบบ portable | `d:\Project\vektorsec\release\win-unpacked\VektorSec.exe` |
| **ที่ติดตั้งจริงบนเครื่องลูกค้า** (per-user) | `C:\Users\<user>\AppData\Local\Programs\VektorSec\VektorSec.exe` |
| ทางลัด | Desktop + Start Menu → `VektorSec` |
| ไฟล์ license ที่ผู้ใช้กรอก | `C:\Users\<user>\AppData\Roaming\VektorSec\license.key` |
| public key ที่ฝังไปกับแอป | `<install>\resources\license-public-key.pem` |
| backend / frontend (ไฟล์จริง ไม่ได้อยู่ใน asar) | `<install>\resources\app\backend\`, `<install>\resources\app\frontend\` |
| log ของ backend / gateway | `%APPDATA%\VektorSec\logs\backend.log`, `%APPDATA%\VektorSec\logs\frontend.log` (เขียนทับต่อท้ายทุกครั้งที่เปิดแอป) |
| **config.toml ที่แอปใช้จริง** | `%APPDATA%\VektorSec\data\config.toml` (สร้างให้อัตโนมัติครั้งแรกที่เปิดแอป) |
| runtime env (`.env`) | `%APPDATA%\VektorSec\data\.env` (ไม่บังคับ — ใช้ override ค่าจาก `config.toml`) |
| MongoDB / Redis แบบ portable | `%APPDATA%\VektorSec\runtime\mongodb\bin\mongod.exe`, `%APPDATA%\VektorSec\runtime\redis\redis-server.exe` |
| ข้อมูลของ MongoDB / Redis | `%APPDATA%\VektorSec\data\mongo`, `%APPDATA%\VektorSec\data\redis` |

> ⚠️ `perMachine: false` → **ไม่ต้องสิทธิ์ Admin ในการติดตั้ง** และติดตั้งลง user profile เท่านั้น
> ถ้าต้องการติดตั้งแบบ all-users ให้เพิ่ม `perMachine: true` ใน `electron-builder.yml`

### 5) รันแบบ dev (ไม่ต้อง build package)

```bash
npm run build:backend && npm run build:frontend
npm run electron:dev
```

Electron จะสตาร์ท 2 process ให้อัตโนมัติ:

- **backend** (`backend/dist/server.js`) → `http://127.0.0.1:8081`
- **frontend gateway** (`frontend/server.js`) → `http://127.0.0.1:3001` (หน้าต่างโหลด URL นี้)

### 6) สิ่งที่ต้องเตรียมก่อนแจกให้ลูกค้า

- `electron/license-public-key.pem` → สร้างด้วย `node scripts/gen-unlock-token.js --init-keys`
  (ถ้าไม่มีไฟล์นี้ ขั้นตอน `extraResources` จะ fail)
- `assets/icon.ico` → มีให้แล้ว (สร้างใหม่ได้ด้วย `node scripts/make-icon.mjs`)
- **`backend/.env` ไม่ถูกแพ็กเข้าแอป** (กัน secret รั่ว) → ถ้าต้องตั้งค่า dynamic (SSH, Telegram,
  OAuth, SSRF ฯลฯ) ให้วางที่ `%APPDATA%\VektorSec\data\.env` ซึ่งเป็นไฟล์ที่ backend ใช้จริง
  (`DATA_DIR` ที่ `electron/backend-runner.js` ตั้งให้) หรือ export เป็น environment variable
- **`config.toml` ไม่ต้องเตรียมเองแล้ว** — `electron/backend-runner.js` เขียนให้อัตโนมัติที่
  `%APPDATA%\VektorSec\data\config.toml` ตอนเปิดแอปครั้งแรก (สุ่ม `SESS_SECRET` 64 hex,
  ชี้ `mongo_uri`/`redis_url` ไปที่ `127.0.0.1`, ตั้ง `[admin] email = "admin@vektorsec.local"`)
  และส่ง path นี้ให้ backend ทาง env `DATA_DIR` → ไม่ต้องเขียนลง `Program Files`
  ซึ่งอ่าน/เขียนไม่ได้สำหรับผู้ใช้ทั่วไป
  > ลำดับที่ backend หา `config.toml` (`backend/src/utils/loadConfig.ts`):
  > `$DATA_DIR/config.toml` → `<install>\resources\app\backend\config.toml` → `<install>\resources\app\config.toml`
- **MongoDB + Redis ต้องมีให้ backend ต่อ** — ไม่ต้องใช้ Docker: ติดตั้ง runtime แบบ portable ครั้งเดียวด้วย

  ```powershell
  powershell -ExecutionPolicy Bypass -File scripts\local-db.ps1 install
  ```

  สคริปต์จะโหลด MongoDB 7.0.45 (mongod) + Redis 5.0.14.1 (Windows) ไว้ที่
  `%APPDATA%\VektorSec\runtime` (~130 MB หลังแตกไฟล์) แล้วสตาร์ทให้เลย
  หลังจากนั้น `electron/local-db.js` จะสตาร์ททั้งสองตัวให้เองทุกครั้งที่เปิดแอป
  (ข้ามถ้า port 27017/6379 ถูกใช้อยู่แล้ว หรือถ้าตั้ง `VEKTORSEC_LOCAL_DB=0`)
  ถ้าไม่มีทั้งคู่ backend จะขึ้น `Secret MONGO_URI not found` / `REDIS_URL not found`
  แล้ว retry ทุก 5 วิ → หน้าเว็บเปิดได้ที่ :3001 แต่ login ขึ้น **Gateway upstream error**


### 7) บัญชี admin ครั้งแรก (login เข้า Admin Panel)

แอปนี้ **ไม่มีรหัส admin ตายตัว** (ตั้งใจ — กัน hardcoded credential ในไบนารีที่แจก)
บัญชี admin ถูก seed ตอน backend start ตามลำดับนี้:

| เงื่อนไข | ผลลัพธ์ |
| --- | --- |
| ตั้ง `[admin] password` ใน `config.toml` / env `ADMIN_PASSWORD` | ใช้รหัสนั้น |
| ไม่ตั้ง (หรือปล่อยว่าง) | สุ่มรหัส hex 32 ตัว แล้วเขียนลง log **ครั้งเดียว** |
| ใน DB มี user role `admin` อยู่แล้ว | ไม่แตะบัญชีเดิม |

- email เริ่มต้น: `admin@vektorsec.local` (เปลี่ยนด้วย `[admin] email` / `ADMIN_EMAIL`)
- **รหัสชั่วคราวหาได้จาก log** (ไม่ใช่ console — แอป Windows GUI ไม่มี console):

  ```powershell
  Select-String -Path "$env:APPDATA\VektorSec\logs\backend.log" -Pattern 'Temporary password'
  ```

- เข้าที่ `http://127.0.0.1:3001/admin` (หรือเมนู **Admin** บน navbar) แล้วเปลี่ยนรหัสทันที
- ตั้งรหัสเองล่วงหน้าได้ใน `%APPDATA%\VektorSec\data\config.toml`:

  ```toml
  [admin]
  email = "admin@vektorsec.local"
  password = "MyStrongPass!2026"
  ```

- **2FA:** ค่าเริ่มต้นของ backend คือบังคับ enroll TOTP (ยิง QR มาให้สแกน) — สำหรับเครื่องเดสก์ท็อป
  ที่ใช้คนเดียว ใส่ `AUTH_REQUIRE_2FA_SETUP=0` ใน `%APPDATA%\VektorSec\data\.env` แล้วเปิดแอปใหม่
  จะ login ด้วย email + password อย่างเดียว (ลบบรรทัดนั้นออก = กลับไปบังคับ 2FA)

> ลำดับความสำคัญ: environment variable → `.env` → `config.toml` (ค่าที่มีอยู่แล้วจะไม่ถูกทับ)
> **ลืมรหัส admin?** ถ้า seed ยังไม่เคยรัน ให้ใส่ `[admin] password` แล้วเปิดแอป
> ถ้ามี admin อยู่แล้ว: ลบ document ของ user role `admin` ออกจาก MongoDB
> (`vektorsec.users`) แล้วเปิดแอปใหม่ → ระบบจะ seed ใหม่ตาม config

### 8) Troubleshooting

| อาการ | สาเหตุ / วิธีแก้ |
| --- | --- |
| ดับเบิลคลิก `VektorSec.exe` แล้วหน้าต่างไม่ขึ้น (หายเงียบ) | `ELECTRON_RUN_AS_NODE` ค้างใน environment → PowerShell: `Remove-Item Env:ELECTRON_RUN_AS_NODE` / cmd: `set ELECTRON_RUN_AS_NODE=` แล้วเปิดใหม่ (main.js มี guard พิมพ์เตือนแล้ว) |
| หน้าต่างขึ้นแต่ค้าง/ขาว | gateway ยังไม่พร้อม → รอ ~5–15 วิ (main.js poll port 3001 สูงสุด 60 วิ) หรือดูว่า port 3001 ถูกโปรแกรมอื่นใช้อยู่ |
| `port 3001 already in use` | ตั้ง `FRONTEND_PORT=3002` แล้วเปิดใหม่ (main.js จะโหลด URL ตาม port นั้น) |
| หน้าเว็บขึ้นแต่ API error | backend (8081) ยังไม่เชื่อม MongoDB/Redis → วาง `backend/.env` หรือเปิด service ให้พร้อม |
| login ขึ้น **Gateway upstream error** | gateway (3001) ยังมีชีวิต แต่ backend (8081) ตาย/ยังไม่ขึ้น → ดู `Get-Content "$env:APPDATA\VektorSec\logs\backend.log" -Tail 20` ถ้าเจอ `Secret MONGO_URI not found` = ยังไม่ได้ติดตั้ง/สตาร์ท MongoDB+Redis: `powershell -ExecutionPolicy Bypass -File scripts\local-db.ps1 start` (หรือ `install` ครั้งแรก) |
| login แล้วขึ้น QR ให้ enroll 2FA | ใส่ `AUTH_REQUIRE_2FA_SETUP=0` ใน `%APPDATA%\VektorSec\data\.env` แล้วเปิดแอปใหม่ (ดูข้อ 7) |
| เข้า Admin Panel ไม่ได้ / ไม่รู้รหัส | ดูข้อ 7 → รหัสชั่วคราวอยู่ใน `%APPDATA%\VektorSec\logs\backend.log` (ค้น `Temporary password`) หรือตั้ง `[admin] password` ใน `config.toml` ก่อนเปิดแอปครั้งแรก |
| ไม่มีโฟลเดอร์ `logs` | backend/gateway ยังไม่เคยสตาร์ทสำเร็จ → เปิดแอปทิ้งไว้ ~20 วิ แล้วดูใหม่ (`logs\<name>.log` ถูกสร้างตอน spawn child) |
| build fail `Cannot create symbolic link` | เปิด Developer Mode / Run as Administrator หรือใช้ `npm run package:win:nosign` |
| build fail `[after-pack] packaged dependencies are not self-contained` | `.stage\` ไม่ใช่ tree แบบ hoisted / มี junction หลุดเข้ามา → `npm run stage:deps` แล้ว package ใหม่ (ห้าม copy `backend/node_modules` ตรง ๆ เข้า installer) |
| ติดตั้งบนเครื่องลูกค้าแล้วแอปเปิดไม่ขึ้น / `MODULE_NOT_FOUND` | รุ่นเก่าห่อ pnpm junction (path สัมบูรณ์ของเครื่อง build) ไปกับ installer → build ใหม่ด้วย `npm run package:win*` (มี stage deps + guard แล้ว) |
| `could not find assets/icon.ico` | รัน `node scripts/make-icon.mjs` |
| `extraResources ... license-public-key.pem` fail | รัน `node scripts/gen-unlock-token.js --init-keys` (เขียน `scripts/.unlock-master-key`) |

## DRM License Workflow (Ray ↔ ลูกค้า)

1. ลูกค้าเปิดแอป → เห็น **HWID** ของเครื่องตัวเอง (ส่งให้ Ray)
2. Ray รัน (เครื่อง local ของ Ray):

   ```bash
   node scripts/gen-unlock-token.js --init-keys                 # ครั้งแรก: สร้าง Ed25519 key
   node scripts/gen-unlock-token.js --license --client "Acme" \
       --type 1y --hwid HWID-XXXX-XXXX-XXXX-XXXX
   # --type: trial | 60d | 1y | unlimited
   # ระบุวันหมดอายุเอง: --expires 2026-12-31
   ```

3. Ray นำ **public key** ไปวางที่ `electron/license-public-key.pem` (gitignored)
   แล้ว build `.exe` — ลูกค้าไม่ได้รับ private key จึง mint key เองไม่ได้
4. ลูกค้าวาง license key ในแอป → backend ตรวจ signature + HWID + วันหมดอายุ
   แบบ **fail-closed**: key ผิด/หมดอายุ/คนละเครื่อง → Scope Guard กลับมาล็อกทันที
5. ถ้าไม่ใส่ key เลย → **Trial 30 วัน** เริ่มอัตโนมัติบนเครื่อง (HWID) ใหม่

## Anti-tamper

- Secret (public key + การรวม HWID) แยกไว้ใน native addon `backend/native/`
  (C++/N-API) และมี fallback เป็น JS สำหรับ dev/test ผ่าน
  `backend/src/utils/drm/nativeBinding.ts`
- ตัวตรวจ license จริง (`backend/src/utils/drm/license.ts`) เป็น Ed25519
  asymmetric — ลูกค้ามีแค่ public key
- ตรวจซ้ำได้ที่ `backend/src/utils/drm/` + `backend/tests/license.test.ts`

## ข้อจำกัด (ต้องเตรียมเอง)

Backend ยังต้องใช้ **MongoDB + Redis** เป็น dependency ภายนอก (แอปจะเริ่มเอง
โดยไม่ต้อง Docker แต่ DB/Redis ต้องติดตั้งหรือชี้ URL ผ่าน env) — ส่วน DRM license
เป็น self-contained ไม่พึ่ง service ภายนอก

