# VektorSec — Standalone Desktop App (Electron)

The shell that packages VektorSec as an installable `.exe`. It embeds the
**Electron/Node.js runtime** and runs the backend service natively on the OS —
**no Docker Desktop required**.

> Thai version: [`README.th.md`](README.th.md)

## Structure

| File | Purpose |
| --- | --- |
| `main.js` | Electron main process: opens the window, starts the backend, handles the license IPC |
| `preload.js` | `contextBridge` → `window.vektorsec` (context-isolated, no Node API leaks) |
| `backend-runner.js` | Runs `backend/dist/server.js` through `ELECTRON_RUN_AS_NODE=1` (the Node runtime embedded in Electron) |
| `drm-ipc.js` | Computes the HWID + checks the license key on the shell side (display/convenience only) |
| `../electron-builder.yml` | electron-builder config → NSIS installer |

## Install / Build

### 0) Install the shell dependencies (once)

```bash
cd d:\Project\vektorsec
npm install          # installs electron + electron-builder at the repo root (~435 packages)
```

> `backend/node_modules` and `frontend/node_modules` are separate — no need to install them again.

### 1) Build

```bash
npm run build:backend    # backend/src/**/*.ts → backend/dist/server.js
npm run build:frontend   # frontend/.next (Next.js production build)
npm run build:native     # (optional) C++ anti-tamper addon — needs MSVC Build Tools
```

### 1.5) Stage the dependencies for the installer (`stage:deps`)

`npm run package:win*` and `npm run dist` always run `npm run stage:deps` first
(`scripts/stage-deps.mjs` → `pnpm install --prod --frozen-lockfile --node-linker=hoisted`
into `.stage\backend` and `.stage\frontend`). Why:

- By default pnpm stores `node_modules/<pkg>` as a **junction pointing at an absolute
  path on the build machine** (`D:\Project\vektorsec\backend\node_modules\.pnpm\...`).
  electron-builder copies the reparse point as-is, so the installed app cannot resolve
  a single module (`MODULE_NOT_FOUND` everywhere). Relative junctions do not help
  either, because Windows resolves a junction target against the process CWD, not the
  folder holding the link.
- `--node-linker=hoisted` produces real directories (no links at all), and `--prod`
  drops typescript/eslint/tsx → a much smaller installer.
- `--prefer-offline` reuses the local pnpm store (a rebuild needs no network).

`pnpm` must be available on the machine (pnpm 11 is what the build box currently has).
To re-stage without packaging: `npm run stage:deps`.

The installer is ≈ **330 MB** after staging (Electron runtime ~250 MB + the production
deps of backend/frontend). Whenever a dependency changes, re-run `npm run stage:deps`
(or delete `.stage\`) before packaging; `package:win*` already does it automatically.

`electron/after-pack.js` **fails the build** when it finds a symlink/junction under
`resources\app\{backend,frontend}\node_modules`, or any module that resolves outside
the package (so the old problem cannot come back silently).

### 2) Run it without installing (portable)

```bash
npm run package:win
# then run:
release\win-unpacked\VektorSec.exe
```

### 3) Build the installer (.exe)

```bash
npm run package:win
# → release\VektorSec Setup <version>.exe   (1.0.1 for this tree)
```

If you hit `Cannot create symbolic link : A required privilege is not held by the client`
(while extracting `winCodeSign`), pick one:

| Option | How |
| --- | --- |
| **A. Enable Developer Mode** (recommended) | Settings → System → For developers → Developer Mode = On, then run `npm run package:win` again |
| **B. Run the terminal as Administrator** | Right-click → Run as administrator, then `npm run package:win` |
| **C. Skip the icon/version rewriting step** | `npm run package:win:nosign` (uses `signAndEditExecutable=false`) |

### 4) All paths (summary)

| What | Path |
| --- | --- |
| Installer produced by the build | `d:\Project\vektorsec\release\VektorSec Setup <version>.exe` |
| Portable app folder | `d:\Project\vektorsec\release\win-unpacked\VektorSec.exe` |
| **Where it is really installed on the customer machine** (per-user) | `C:\Users\<user>\AppData\Local\Programs\VektorSec\VektorSec.exe` |
| Shortcuts | Desktop + Start Menu → `VektorSec` |
| License file the user fills in | `C:\Users\<user>\AppData\Roaming\VektorSec\license.key` |
| Public key embedded in the app | `<install>\resources\license-public-key.pem` |
| backend / frontend (real files, not inside an asar) | `<install>\resources\app\backend\`, `<install>\resources\app\frontend\` |
| backend / gateway logs | `%APPDATA%\VektorSec\logs\backend.log`, `%APPDATA%\VektorSec\logs\frontend.log` (appended to on every app start) |
| **The `config.toml` the app really uses** | `%APPDATA%\VektorSec\data\config.toml` (created automatically the first time the app starts) |
| Runtime env (`.env`) | `%APPDATA%\VektorSec\data\.env` (optional — overrides values from `config.toml`) |
| Portable MongoDB / Redis | `%APPDATA%\VektorSec\runtime\mongodb\bin\mongod.exe`, `%APPDATA%\VektorSec\runtime\redis\redis-server.exe` |
| MongoDB / Redis data | `%APPDATA%\VektorSec\data\mongo`, `%APPDATA%\VektorSec\data\redis` |

> ⚠️ `perMachine: false` → **no Administrator rights needed** and the app installs into
> the user profile only. For an all-users install add `perMachine: true` to
> `electron-builder.yml`.

### 5) Run in dev mode (no packaging)

```bash
npm run build:backend && npm run build:frontend
npm run electron:dev
```

Electron starts two processes for you:

- **backend** (`backend/dist/server.js`) → `http://127.0.0.1:8081`
- **frontend gateway** (`frontend/server.js`) → `http://127.0.0.1:3001` (the window loads this URL)

### 6) What to prepare before shipping to a customer

- `electron/license-public-key.pem` → generate it with `node scripts/gen-unlock-token.js --init-keys`
  (without this file the `extraResources` step fails)
- `assets/icon.ico` → already present (regenerate with `node scripts/make-icon.mjs`)
- **`backend/.env` is never packaged into the app** (to keep secrets out) → for dynamic
  settings (SSH, Telegram, OAuth, SSRF, …) put them in `%APPDATA%\VektorSec\data\.env`,
  which is the file the backend actually reads (`DATA_DIR` is set by
  `electron/backend-runner.js`), or export them as environment variables
- **`config.toml` no longer has to be prepared by hand** — `electron/backend-runner.js`
  writes it to `%APPDATA%\VektorSec\data\config.toml` the first time the app starts
  (random 64-hex `SESS_SECRET`, `mongo_uri`/`redis_url` pointing at `127.0.0.1`,
  `[admin] email = "admin@vektorsec.local"`) and passes that path to the backend via the
  `DATA_DIR` env var → nothing is ever written into `Program Files`, which a normal user
  cannot write to.
  > The order in which the backend looks for `config.toml` (`backend/src/utils/loadConfig.ts`):
  > `$DATA_DIR/config.toml` → `<install>\resources\app\backend\config.toml` → `<install>\resources\app\config.toml`
- **MongoDB + Redis must be reachable by the backend** — no Docker needed: install the
  portable runtime once with

  ```powershell
  powershell -ExecutionPolicy Bypass -File scripts\local-db.ps1 install
  ```

  The script downloads MongoDB 7.0.45 (`mongod`) + Redis 5.0.14.1 (Windows) into
  `%APPDATA%\VektorSec\runtime` (~130 MB extracted) and starts them right away.
  After that `electron/local-db.js` starts both of them on every app launch
  (it skips them when ports 27017/6379 are already in use, or when
  `VEKTORSEC_LOCAL_DB=0` is set). Without either one the backend logs
  `Secret MONGO_URI not found` / `REDIS_URL not found` and retries every 5 s →
  the UI still loads on :3001 but the login fails with **Gateway upstream error**.

### 7) First admin account (logging into the Admin Panel)

This app **has no fixed admin password** (on purpose — no hard-coded credential inside a
binary that is handed to customers). The admin account is seeded when the backend starts,
in this order:

| Condition | Result |
| --- | --- |
| `[admin] password` set in `config.toml` / env `ADMIN_PASSWORD` | that password is used |
| not set (or left empty) | a random 32-hex password is generated and written to the log **once** |
| the DB already contains a user with role `admin` | the existing account is left untouched |

- Default email: `admin@vektorsec.local` (change it with `[admin] email` / `ADMIN_EMAIL`)
- **The temporary password is in the log** (not the console — a Windows GUI app has none):

  ```powershell
  Select-String -Path "$env:APPDATA\VektorSec\logs\backend.log" -Pattern 'Temporary password'
  ```

- Open `http://127.0.0.1:3001/admin` (or the **Admin** menu in the navbar) and change the
  password immediately
- You can pre-set it in `%APPDATA%\VektorSec\data\config.toml`:

  ```toml
  [admin]
  email = "admin@vektorsec.local"
  password = "MyStrongPass!2026"
  ```

- **2FA:** the backend default is to force TOTP enrolment (it returns a QR to scan). On a
  single-user desktop machine, put `AUTH_REQUIRE_2FA_SETUP=0` in
  `%APPDATA%\VektorSec\data\.env` and restart the app to sign in with email + password
  only (remove that line to force 2FA again).

> Precedence: environment variable → `.env` → `config.toml` (existing values are never overwritten)
> **Forgot the admin password?** If the seed never ran, set `[admin] password` and start
> the app. If an admin already exists, delete the user document with role `admin` from
> MongoDB (`vektorsec.users`) and restart the app → it seeds a new one from the config.

### 8) Troubleshooting

| Symptom | Cause / fix |
| --- | --- |
| Double-clicking `VektorSec.exe` does nothing (it disappears silently) | `ELECTRON_RUN_AS_NODE` is left in the environment → PowerShell: `Remove-Item Env:ELECTRON_RUN_AS_NODE` / cmd: `set ELECTRON_RUN_AS_NODE=` then start it again (`main.js` already prints a guard warning) |
| The window opens but stays blank/hangs | the gateway is not ready yet → wait ~5–15 s (`main.js` polls port 3001 for up to 60 s), or check whether another program owns port 3001 |
| `port 3001 already in use` | set `FRONTEND_PORT=3002` and start again (`main.js` loads the URL for that port) |
| The UI loads but the API errors | backend (8081) is not connected to MongoDB/Redis → provide `backend/.env` or start the services |
| Login shows **Gateway upstream error** | gateway (3001) is alive but backend (8081) is down/not up yet → read `Get-Content "$env:APPDATA\VektorSec\logs\backend.log" -Tail 20`; `Secret MONGO_URI not found` means MongoDB+Redis are not installed/started: `powershell -ExecutionPolicy Bypass -File scripts\local-db.ps1 start` (or `install` the first time) |
| Login shows a QR to enrol 2FA | add `AUTH_REQUIRE_2FA_SETUP=0` to `%APPDATA%\VektorSec\data\.env` and restart the app (see §7) |
| Cannot get into the Admin Panel / unknown password | see §7 → the temporary password is in `%APPDATA%\VektorSec\logs\backend.log` (search for `Temporary password`), or set `[admin] password` in `config.toml` before the first start |
| No `logs` folder | backend/gateway never started successfully → leave the app open for ~20 s and look again (`logs\<name>.log` is created when the child is spawned) |
| Build fails with `Cannot create symbolic link` | enable Developer Mode / Run as Administrator, or use `npm run package:win:nosign` |
| Build fails with `[after-pack] packaged dependencies are not self-contained` | `.stage\` is not a hoisted tree / a junction slipped in → `npm run stage:deps` and package again (never copy `backend/node_modules` into the installer directly) |
| After installing on a customer machine the app does not start / `MODULE_NOT_FOUND` | an old build baked pnpm junctions (absolute build-machine paths) into the installer → rebuild with `npm run package:win*` (stage deps + the guard are in place now) |
| `could not find assets/icon.ico` | run `node scripts/make-icon.mjs` |
| `extraResources ... license-public-key.pem` fails | run `node scripts/gen-unlock-token.js --init-keys` (writes `scripts/.unlock-master-key`) |

## DRM License Workflow (Ray ↔ customer)

1. The customer opens the app → sees the **HWID** of their own machine (and sends it to Ray).
2. Ray runs (on Ray's own machine):

   ```bash
   node scripts/gen-unlock-token.js --init-keys                 # first time: create the Ed25519 key pair
   node scripts/gen-unlock-token.js --license --client "Acme" \
       --type 1y --hwid HWID-XXXX-XXXX-XXXX-XXXX
   # --type: trial | 60d | 1y | unlimited
   # custom expiry date: --expires 2026-12-31
   ```

3. Ray puts the **public key** at `electron/license-public-key.pem` (gitignored) and builds
   the `.exe` — the customer never receives the private key, so they cannot mint keys.
4. The customer enters the license key in the app → the backend verifies the signature, the
   HWID and the expiry date in a **fail-closed** way: a wrong, expired or foreign-machine key
   immediately re-locks the Scope Guard.
5. With no key at all → a **30-day trial** starts automatically on the new machine (HWID).

## Anti-tamper

- The secret (public key + HWID mixing) lives in the native addon `backend/native/`
  (C++/N-API), with a JS fallback for dev/test through
  `backend/src/utils/drm/nativeBinding.ts`
- The real license verifier (`backend/src/utils/drm/license.ts`) is Ed25519 asymmetric — the
  customer only has the public key
- Verify it yourself at `backend/src/utils/drm/` + `backend/tests/license.test.ts`

## Limitations (dependencies you must provide)

The backend still needs **MongoDB + Redis** as external dependencies. The app starts them by
itself without Docker, but the binaries must be installed (see §6) or the URLs pointed at a
running instance through env. The DRM license part is self-contained and depends on no
external service.




