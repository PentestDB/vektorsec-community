<p align="center">
  <img src="./assets/banner.png" alt="VektorSec Banner" width="820" />
</p>

<h1 align="center">🛡️ VektorSec — AI Penetration Testing Agent</h1>

<p align="center">
  <b>English</b> · <a href="./README.th.md">ไทย</a>
</p>

<p align="center">
  Open-source AI agent for <b>penetration testing / CTF / boot2root</b> —
  it connects to your Kali attack box, runs the tools, analyses the output and
  keeps looping on its own until the job is done.<br />
  You name the target, the agent handles the rest.
</p>

<p align="center">
  <img alt="License" src="https://img.shields.io/badge/License-MIT-blue.svg" />
  <img alt="Deploy" src="https://img.shields.io/badge/deploy-Docker%20Compose-2496ED.svg" />
  <img alt="Platform" src="https://img.shields.io/badge/platform-Linux%20%2F%20Docker-9cf.svg" />
</p>

> ⚠️ **Disclaimer**: VektorSec is intended for **authorized security testing only**.
> Always obtain explicit permission from the system owner before testing. You are
> responsible for how you use it.

---

## 📑 Table of Contents

- [What is VektorSec](#-what-is-vektorsec)
- [Key Capabilities](#-key-capabilities)
- [Architecture](#-architecture)
- [Requirements](#-requirements)
- [Project Structure](#-project-structure)
- [Configuration Files](#-configuration-files)
- [Quick Start (Docker)](#-quick-start-docker)
- [Production Deploy with Docker + Nginx + SSL](#-production-deploy-with-docker--nginx--ssl)
- [Automated Deploy Scripts / Caddy](#-automated-deploy-scripts--caddy)
- [Updating and Backup](#-updating-and-backup)
- [Security Checklist](#-security-checklist)
- [Development (Developer mode)](#-development-developer-mode)
- [More Documentation](#-more-documentation)
- [Support & Donations](#-support--donations)
- [Credits and License](#-credits-and-license)

---

## 🧠 What is VektorSec

VektorSec is an agentic AI penetration-testing agent: it executes real commands on an
attack box (SSH/Kali, or the built-in Kali container), reads the output, analyses it and
decides the next step by itself — no hand-holding. It is built for real engagements,
boot2root boxes and CTFs.

Real-world example: the agent exploits an auth bypass in [OWASP Juice Shop](https://owasp.org/www-project-juice-shop/)

<p align="center">
  <img src="./assets/dashboard_with_backdrop.png" alt="VektorSec Dashboard" width="800" />
</p>

<p align="center">
  <img src="./assets/operationa_dashboard_with_backdrop.png" alt="VektorSec Operational Dashboard" width="800" />
</p>

## ✨ Key Capabilities

- **Agentic execution** — the agent runs commands on the attack box, reads the results and keeps looping for up to 25 iterations per turn
- **60 agent tools** — bash, Python scripts, tool installation, shell management, Google search, subagents, Burp Suite (proxy history/Repeater/Intruder/Collaborator), Caido, Mythic C2, nmap/nuclei/ffuf/gobuster/naabu scans, browser automation and more
- **100+ capabilities** — a registry of tools/packages for network, rev, pwn, crypto, forensics, stego and core work
- **Burp Suite integration** — read proxy history, send requests to Repeater/Intruder, use Collaborator for OOB testing
- **Browser agent (Magnitude)** — real browser automation, streamed into the UI over VNC in Docker mode
- **VPN management** — upload `.ovpn` files and connect/disconnect from the web UI (multiple at once)
- **Subagent parallelism** — run sub-tasks concurrently, e.g. directory brute-force plus subdomain enumeration at the same time
- **Safety checks** — dangerous commands (recursive delete, writing to devices, fork bombs) always require approval first
- **Bring your own model** — OpenAI, Anthropic (API key or OAuth), Google, Mistral or any OpenAI-compatible endpoint; Codex CLI / Claude Code already logged in on the host also work
- **MCP access** — expose the control plane over MCP so Claude Code / Codex can drive it

---

## 🏗️ Architecture

```
                        ┌───────────────────────────────┐
  User / Browser ─────▶ │  Nginx / Caddy (Reverse Proxy)│  :80 / :443 (SSL)
                        └──────────────┬────────────────┘
                                       │ http://127.0.0.1:3001
                        ┌──────────────▼────────────────┐
                        │  frontend (Next.js gateway)    │  (never public)
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
  (kali-data/ bind mount is the workspace, plus the built-in Kali container
   when you enable docker-compose.kali.yml)
```

| Service  | Role | Data |
|----------|------|------|
| `frontend` | Next.js + API gateway (server.js) | host port `127.0.0.1:3001` |
| `backend`  | Express API + AI agent loop + SSH/exploit box | host ports `127.0.0.1:8081`, `6080`, `9020` |
| `mongodb`  | stores users/sessions/workspaces/results (runs with `--auth`) | volume `mongodb-data` |
| `redis`    | session store (password required) | volume `redis-data` |
| `kali` *(optional)* | built-in Kali attack box (docker-compose.kali.yml) | volume `kali-data` + `./kali-data/` |

Persisted data (Mongo/Redis/backend workspace) lives in **Docker named volumes** and the
`kali-data/` folder, which are already covered by `.gitignore` — **they never leak into Git**.

---
## 📦 Requirements

| | Minimum |
|---|---------|
| RAM | 8 GB (+2 GB if you run the built-in Kali container) |
| Disk | 20 GB+ |
| OS | Linux (Ubuntu/Debian recommended), macOS for development |
| Docker | v20+ with Compose v2+ |
| Node.js / pnpm | v22+ / v9+ (only when running outside Docker in dev mode) |
| Domain (recommended) | Point a DNS A record at your VPS IP to use HTTPS |

> The first build is RAM-hungry (compiling the backend + Chromium) — on a small VPS create swap first:
> `sudo fallocate -l 4G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile`

## 📁 Project Structure

```
.
├── backend/                 # Express + AI agent (TypeScript)
│   ├── .env.example         # ← copy to backend/.env and fill in your values
│   ├── src/                 # controllers / services / tools / routes
│   ├── tests/
│   └── Dockerfile
├── frontend/                # Next.js UI + black-box gateway (server.js)
│   ├── .env.example         # ← copy to frontend/.env and fill in your values
│   └── Dockerfile
├── kali/                    # Dockerfile for the built-in Kali attack box (optional)
├── deploy/                  # helpers for deploying to a VPS
│   ├── secrets.env.example  # ← copy to deploy/secrets.env (DB passwords)
│   ├── nginx.example.conf   # reverse proxy + how to set up SSL (Nginx/certbot)
│   ├── Caddyfile.example    # alternative: automatic HTTPS with Caddy
│   ├── deploy-to-vps.sh     # rsync + setup/update to a VPS
│   ├── vps-setup.sh         # install Docker + generate config + build (runs on the VPS)
│   └── vps-update.sh        # fast rebuild + restart
├── config.example.toml      # ← copy to config.toml and fill in your values
├── docker-compose.yml       # main stack (production-ready)
├── docker-compose.kali.yml  # stack with the built-in Kali container
├── docker-compose.dev.yml   # dev infra (mongo/redis/kali)
├── run.sh                   # all-in-one launcher (config/build/start/stop)
└── docs/                    # manuals (Thai in docs/, English in docs/en/)
```

## ⚙️ Configuration Files

The system uses four groups of configuration files (every `.example` file is a template —
copy it to the real name and fill in your own values):

| Template (safe to commit) | Copy to | What it holds |
|---|---|---|
| `config.example.toml` | `config.toml` | static config: port, deployment, mongo/redis URI, **session secret** |
| `backend/.env.example` | `backend/.env` | dynamic config: admin, SSH box, Telegram, OAuth, VNC/Burp/Caido/Mythic, reCAPTCHA |
| `frontend/.env.example` | `frontend/.env` | gateway URL, deployment mode, site URL, reCAPTCHA site key |
| `deploy/secrets.env.example` | `deploy/secrets.env` *(or root `.env`)* | `MONGO_USER`, `MONGO_PASSWORD`, `REDIS_PASSWORD` — used by `docker compose` |

> 🔒 Never commit `config.toml`, `*.env`, `deploy/secrets.env`, `backend/model-registry.json`
> or `kali-data/` — `.gitignore` already handles them, so anyone who clones the repo only gets the `.example` files.

---

## 🚀 Quick Start (Docker)

Run the whole stack with Docker Compose (this works on both a dev machine and a VPS):

### 1. Clone + create configuration files from the templates

```bash
git clone https://<YOUR_GIT_REPO_URL>.git vektorsec
cd vektorsec

# DB passwords — docker compose reads the .env at the repo root automatically
cp deploy/secrets.env.example .env
# then edit .env: set MONGO_PASSWORD / REDIS_PASSWORD to random values, e.g.
#   openssl rand -hex 24

# static config
cp config.example.toml config.toml

# backend / frontend env
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

### 2. Fill in the important values (edit the real files)

```bash
# (a) session secret in config.toml — generate a fresh one every time
openssl rand -hex 32
#     put it in [session] secret of config.toml
#     (run.sh / deploy/vps-setup.sh generate one automatically if they see a CHANGE_ME... placeholder)

# (b) backend/.env — optional but recommended: define the admin up front
#   ADMIN_EMAIL=you@example.com
#   ADMIN_PASSWORD=<strong password>
#   (if left empty the backend creates admin@vektorsec.local with a random
#    password and prints it in the logs)
# (c) frontend/.env — in Docker the backend is reached through the service name
#   BACKEND_URI=http://backend:8081
#   VNC_ORIGIN_URI=http://backend:6080
#   (for a split dev setup use http://localhost:8081 instead)
```

### 3. Build + start

```bash
docker compose up -d --build
```

The first build takes a while (the backend installs Chromium/Codex CLI and compiles). Wait until every container is healthy:

```bash
docker compose ps          # every container should be running / healthy
docker compose logs -f backend
```

### 4. First login

1. Open `http://localhost:3001` (on a VPS use an SSH tunnel or set up Nginx as described below)
2. Log in as admin — grab the temporary password from the backend log:
   ```bash
   docker compose logs backend | grep -i -A1 "temporary password"
   ```
   (or use the `ADMIN_EMAIL` / `ADMIN_PASSWORD` you set in `backend/.env`)
3. Change the admin password immediately and turn on 2FA
4. Go to **Settings → Models**, add a Model Preset + your API key, then pick the Orchestrator

### Shortcut: use `run.sh`

`run.sh` creates config/env from the templates, generates a session secret and drives Docker for you:

```bash
./run.sh start      # guided start (asks for provider/API key the first time)
./run.sh start -q   # quick start reusing the existing config
./run.sh status     # container status
./run.sh logs       # tail logs
./run.sh stop       # stop every container
```

---
## 🌐 Production Deploy with Docker + Nginx + SSL

> Overview: the code (frontend + backend) runs in Docker Compose and every port is bound to
> `127.0.0.1` on the VPS — Nginx on the same machine receives traffic from the internet
> (`80/443`) and reverse-proxies it to `http://127.0.0.1:3001` with automatic SSL.
> → You never expose `8081/27017/6379` publicly.

### Step 0 — Prepare the VPS + domain

```bash
# VPS: Ubuntu 22.04/24.04, RAM ≥ 8GB (see the swap note above)
# Install Docker + Compose plugin:
curl -fsSL https://get.docker.com | sudo sh
sudo systemctl enable --now docker

# DNS: point the A record of <YOUR_DOMAIN> → <YOUR_VPS_IP>

# Firewall: open only HTTP/HTTPS/SSH
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

### Step 1 — Get the code onto the VPS

```bash
# Option 1: clone directly on the VPS
cd /opt && sudo git clone https://<YOUR_GIT_REPO_URL>.git vektorsec
sudo chown -R $USER:$USER /opt/vektorsec && cd /opt/vektorsec

# Option 2: upload from your machine (see deploy/README.md for rsync/package helpers)
```

### Step 2 — Create the configuration files (on the VPS)

```bash
# DB passwords for docker compose
cp deploy/secrets.env.example .env
# edit .env → MONGO_PASSWORD / REDIS_PASSWORD = random values (openssl rand -hex 24)

# config
cp config.example.toml config.toml

# env
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

Edit `config.toml` with production values:

```toml
[server]
port = 8081
deployment = "PROD"                          # important: PROD enforces a strong secret
base_url_frontend = "https://<YOUR_DOMAIN>"   # replace <YOUR_DOMAIN>
cors_origins = "https://<YOUR_DOMAIN>"

[session]
secret = "<output of openssl rand -hex 32>"  # never keep CHANGE_ME...
lifetime = 1000
```

Edit `backend/.env` (optional but recommended):

```bash
ADMIN_EMAIL=admin@<YOUR_DOMAIN>
ADMIN_PASSWORD=<strong password>       # if empty → random value printed in the log
FRONTEND_URL=https://<YOUR_DOMAIN>
OOB_BASE_URL=https://<YOUR_DOMAIN>/api   # for OOB/Collaborator payloads
```

Edit `frontend/.env` so the site is indexed correctly and URLs are right:

```bash
BACKEND_URI=http://backend:8081
VNC_ORIGIN_URI=http://backend:6080
DEPLOYMENT=PRODUCTION
NEXT_PUBLIC_DEPLOYMENT=PRODUCTION
NEXT_PUBLIC_SITE_URL=https://<YOUR_DOMAIN>
```

### Step 3 — Build and start the stack

```bash
docker compose up -d --build
docker compose ps
docker compose logs -f backend
```

### Step 4 — Set up Nginx + SSL (Let's Encrypt)

```bash
sudo apt-get install -y nginx certbot python3-certbot-nginx

# use the example config, then replace <YOUR_DOMAIN> with your real domain (5 occurrences)
sudo cp deploy/nginx.example.conf /etc/nginx/sites-available/vektorsec
sudo nano /etc/nginx/sites-available/vektorsec
sudo ln -s /etc/nginx/sites-available/vektorsec /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

# issue SSL automatically (choose the HTTP→HTTPS redirect when asked)
sudo certbot --nginx -d <YOUR_DOMAIN>
```

Verify: open `https://<YOUR_DOMAIN>` and log in.

> Alternative: use **Caddy** instead — see `deploy/Caddyfile.example` (it issues Let's Encrypt
> certificates automatically, so you never touch nginx/certbot).

### Step 5 — After installation

1. Find the admin account + temporary password: `docker compose logs backend | grep -i -A1 "temporary password"`
2. Log in, change the password right away and enable 2FA
3. **Settings → Models** → add the API key of the model you will use → set the Orchestrator
4. Test a real workspace (create a new session → pick SSH/Kali/scope)

---

## 🤖 Automated Deploy Scripts / Caddy

For fast, repeatable deploys (rsync + automatic rebuild) see the full guide in **`deploy/README.md`**:

```bash
# from your machine (needs ssh/rsync)
bash deploy/deploy-to-vps.sh root@<YOUR_VPS_IP>            # first time
bash deploy/deploy-to-vps.sh root@<YOUR_VPS_IP> --update  # subsequent updates
# Windows PowerShell:  powershell -File deploy\deploy.ps1
```

Or, if you have no rsync, build a package and upload it yourself:

```bash
bash deploy/make-package.sh        # produces vektorsec-vps.tar.gz (secrets/logs stripped)
# upload it to the VPS and run: tar xzf vektorsec-vps.tar.gz && cd vektorsec && bash deploy/vps-setup.sh
```

---

## 🔄 Updating and Backup

**Update to a newer version** (data/config on the VPS is untouched):

```bash
git pull
# if the .example files changed and you want the new keys → merge key by key (never overwrite a filled .env)
docker compose up -d --build
```

**Where the data lives** — all of it is outside Git:

```bash
docker volume ls | grep vektorsec
# vektorsec_mongodb-data, vektorsec_redis-data, vektorsec_backend-data
ls ./kali-data          # workspace / files created by the agent (bind mount)
```

**Backup** (stop the containers first, or accept a dirty snapshot):

```bash
# example: back up the mongodb-data volume to ~/backup/
mkdir -p ~/backup
sudo docker run --rm -v vektorsec_mongodb-data:/data -v ~/backup:/backup \
  alpine tar czf /backup/mongodb-data-$(date +%F).tgz -C /data .
# do the same for redis-data and backend-data, and copy ./kali-data as well
```

**Restore**: bring the tgz back with `tar xzf`, then `docker compose up -d` (the volume must be empty/new).

---

## 🔒 Security Checklist

- [x] `config.toml`, `*.env`, `deploy/secrets.env`, `kali-data/` are covered by `.gitignore` — double-check with `git status` before pushing
- [ ] `[session] secret` in `config.toml` is a random value ≥ 32 characters (not `CHANGE_ME`)
- [ ] The default admin password has been changed and 2FA is enabled
- [ ] `deployment = "PROD"` and the domain is correct in `base_url_frontend` / `cors_origins`
- [ ] Never expose ports `8081` (backend), `27017` (MongoDB) or `6379` (Redis) to the public internet
- [ ] If you use the built-in Kali box, restrict ports `4242/4200/5901/9020` to internal traffic
- [ ] SSH/exploit box: use SSH keys instead of passwords and restrict the source IP
- [ ] LLM API keys are stored through the UI (Settings → Models) in `model-registry.json` (local only)

---

## 💻 Development (Developer mode)

Run only the infrastructure (MongoDB/Redis/Kali) in Docker and the frontend/backend on your machine:

```bash
./run.sh dev
# terminal 2
cd backend && pnpm install && pnpm run watch
# terminal 3
cd backend && pnpm run dev        # port 8081
# terminal 4
cd frontend && pnpm install && pnpm run dev   # port 3001
```

**Alternative — run the whole stack in Docker (hot reload, no VPS needed):**

```bash
cp backend/.env.example backend/.env        # first time only
docker compose -f docker-compose.dev.yml up -d --build
```

- run it from the repo root: the services bind-mount `.` to `/app`, so the compose
  project lives under its own name (`vektorsec-dev`) instead of the folder name —
  renaming or moving the checkout no longer spawns an empty stack
- backend: `tsx watch` → restarts automatically when a `.ts` file changes
- frontend: Next.js dev (Fast Refresh) through the gateway at `http://localhost:3001`
- Start the built-in Kali box: `docker compose -f docker-compose.dev.yml --profile kali up -d`

---

## 📚 More Documentation

| File | Contents |
|---|---|
| `docs/en/INSTALL_GUIDE.md` / `docs/INSTALL_GUIDE.md` | Full installation guide (English / Thai) |
| `docs/en/USER_GUIDE.md` / `docs/USER_GUIDE.md` | User guide (English / Thai) |
| `docs/en/QUICK_REFERENCE.md` / `docs/QUICK_REFERENCE.md` | Common commands and config values |
| `docs/en/SYSTEM_SUMMARY.md`, `docs/ARCHITECTURE_PLAN.md` | System architecture |
| `docs/en/ROADMAP_NEXT.md` / `docs/ROADMAP_NEXT.md` | Next roadmap — remaining work / gap analysis (CI, tests, observability, next features) |
| `docs/en/BLACKBOX_ARCHITECTURE.md` / `docs/BLACKBOX_ARCHITECTURE.md` | Black-box gateway architecture (BFF) |
| `docs/README.md` and `docs/en/README.md` | Index of the Thai and English manuals |
| `docs/en/user-guide/` | Task-oriented guides: online web, platform, Telegram bot |
| `deploy/README.md` | Full VPS deploy guide (rsync/Caddy/troubleshooting) |

> 📖 **Language split**: Thai manuals live in `docs/`, English manuals live in `docs/en/`.
> This README is English-only; the Thai version is [`README.th.md`](./README.th.md).

---

## 💖 Support & Donations

VektorSec is free and open-source software (MIT). If it saves you time on real
engagements, CTFs or boot2root boxes, a donation helps keep the project
maintained and improves the tooling.

**Donate with USDT (ERC-20 — Ethereum network):**

```
0x156C91fB88eb83C31ABf0eAFed239Fd867e1ddeB
```

> ⚠️ **Important**: This is an **ERC-20 (Ethereum)** address. Send **USDT** on the
> **Ethereum (ERC-20)** network only. Tokens sent over other networks
> (TRC-20, BEP-20, etc.) or other asset types may be permanently lost.

Thank you for your support! ❤️

---

## 📜 Credits and License

This project builds on the research/open-source work behind VektorSec and is released under the
[**MIT License**](./LICENSE) — see the LICENSE file, plus [CONTRIBUTING.md](./CONTRIBUTING.md)
and [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md).

```bibtex
@article{goyal2024hacking,
  title={Hacking, the lazy way: LLM augmented pentesting},
  author={Goyal, Dhruva and Subramanian, Sitaraman and Peela, Aditya},
  journal={arXiv preprint arXiv:2409.09493},
  year={2024}
}
```
