<p align="center">
  <img src="./assets/banner.png" alt="Pentest Copilot Banner" />
</p>

# Pentest Copilot

![GitHub License](https://img.shields.io/github/license/bugbasesecurity/pentest-copilot)
![GitHub Repo stars](https://img.shields.io/github/stars/bugbasesecurity/pentest-copilot)
![GitHub forks](https://img.shields.io/github/forks/bugbasesecurity/pentest-copilot)

Pentest Copilot is an AI-powered browser based ethical hacking assistant tool designed to streamline pentesting workflows.

Explore the [Github Wiki](https://github.com/bugbasesecurity/pentest-copilot/wiki) for detailed documentation on the tool's features, installation, and usage.

---

<p align="center">
<img src="./assets/dashboard.jpeg">
</p>

<p align="center">
<img src="./assets/todo-list.jpeg">
</p>

## Pentest Copilot in action 🚀

Here is a quick walkthrough of Pentest Copilot in action trying to PWN a TryHackMe machine [RootMe](https://tryhackme.com/room/rrootme) a boot2root challenge.

https://github.com/user-attachments/assets/5e50b14b-a64f-4ba1-9449-52d5ad61ead6

## Table of Contents

- [Introduction](#introduction)
- [Installation](#installation)
- [Configuration](#configuration)
- [Architecture](#architecture)
- [Features](#features)
- [System Requirements](#system-requirements)
- [Local Development](#local-development)
- [Contributing](#contributing)
- [License](#license)
- [Disclaimer](#disclaimer)
- [Authors](#authors)
- [Citations](#citations)

<h2 id="introduction">Introduction</h2>

Pentest Copilot is an open-source tool built to assist ethical hackers and penetration testers. By integrating LLMs, it automates and enhances various pentesting tasks. The tool is deployable locally with Docker and includes an optional Kali Linux container for simulating a pentest environment.

### Why Pentest Copilot?

Pentest Copilot is a browser-based, AI-powered assistant that seamlessly integrates into any security professional's workflow. It is a significantly more advanced and evolved penetration testing tool compared to other open-source alternatives like [PentestGPT](https://github.com/greydgl/pentestgpt), Pentest Copilot is tightly coupled with the pentest environment, offering a unified interface where automation and manual control coexist.

Key differentiators that make Pentest Copilot stand out include:

- **Browser-Based AI Assistant**: Fully accessible via the browser, eliminating the need for local cli setup.
- **Agentic AI Architecture**: Enables the AI to run commands directly in the pentest environment, reducing manual overhead.
- **Context Preservation**: Maintains session context and provides intelligent summarization at every phase of the engagement.
- **Dynamic Pentest Checklist**: Continuously updated task lists guide the user through a comprehensive and structured assessment.
- **Integrated Terminal Access**: A browser-embedded terminal allows seamless interaction with the Kali container or other test environments.
- **VPN Integration**: Supports secure remote access by connecting to private test networks via OpenVPN.
- **Workspace Management**: Organizes and manages multiple concurrent pentest sessions with isolated contexts.
- **Custom Tool Selection**: Offers configurable toolchains to align with individual preferences and organizational standards.

This integrated, automation-first design enables more effective, streamlined, and scalable penetration testing workflows.

<h2 id="installation">Installation</h2>

To get started with Pentest Copilot, follow these steps:

### Clone the repository:

```bash
git clone https://github.com/bugbasesecurity/pentest-copilot.git pentest-copilot
cd pentest-copilot
```

### One-command setup & launch (Recommended):

Run the all-in-one launcher to configure, build, and start Pentest Copilot:

```bash
bash run.sh
```

On **first run** the script will:
- Let you choose a deployment mode — **Full Stack with Kali**, **Core Services Only**, or **Developer Mode**
- Prompt for frontend URL, CORS origins, and database URIs (with sensible defaults)
- Auto-generate a secure session secret
- Configure SSH to the exploit box (Kali defaults, or your external box with password / private-key auth)
- Prompt for LLM model provider, model name, and API key (supports OpenAI, Anthropic, and OpenAI-compatible providers)
- Set up frontend environment variables
- Build and start all Docker containers

On **subsequent runs** the script detects the existing configuration and asks whether to:
1. Start with the existing config (fast restart)
2. Rebuild images with the existing config
3. Update configuration only
4. Reconfigure everything from scratch
5. Developer mode

Additional commands:

```bash
bash run.sh dev       # Developer mode — run frontend/backend locally, infra in Docker
bash run.sh config    # Update configuration only (no rebuild)
bash run.sh stop      # Stop all containers
bash run.sh logs      # Tail container logs (e.g. run.sh logs backend)
bash run.sh status    # Show running containers
bash run.sh --help    # Show help
```

> [!NOTE]
> If you prefer manual setup, see the [Manual Environment Setup](#manual-environment-setup) section below.

### Access the application:

Once the containers are running, access the frontend at `http://localhost:3000`.

---

### <a id="run-sh"></a>About `run.sh`

`run.sh` is an all-in-one interactive launcher that handles setup, configuration, building, and running Pentest Copilot.

Configuration is split into two files:

| File | Purpose | When read |
|------|---------|-----------|
| `config.toml` | Static infrastructure: server port, deployment mode, frontend URL, CORS origins, database URIs, session secret | Read once at startup (bind-mounted into the container at `/srv/data/config.toml`) |
| `.env` | Dynamic config: LLM provider & API keys, SSH credentials, Anthropic OAuth tokens | Read at startup and on-the-fly; editable via the Settings UI |

The script:
- Creates `config.toml` from `config.toml.template` and `.env` from `backend/.env.template`
- Prompts for model provider, model name, API key, and optional base URL override
- Configures SSH credentials (password or private-key auth) — stored in `.env` only
- Copies SSH private keys into a Docker-mounted volume (`./ssh-keys/`) when needed
- Generates a `docker-compose.override.yml` when SSH key mounts are needed
- Detects WSL and adjusts hostnames for compatibility
- Saves your deployment preference to `.run.conf` for fast re-runs
- Builds and starts all containers via Docker Compose

Run it again at any time — it will detect existing config and let you restart, rebuild, or reconfigure.

> [!IMPORTANT]
> `config.toml`, `backend/.env`, and `frontend/.env` contain secrets and are **gitignored**. Only the `.template` files are committed. Never commit these files.

---

### <a id="manual-environment-setup"></a>Manual Environment Setup (Advanced)

If you prefer to set up environment variables manually:

1. Copy `./config.toml.template` to `./config.toml` and edit it (server, DB, CORS, session settings).
2. Copy `./backend/.env.template` to `./backend/.env` and add your model API keys and SSH credentials.
3. Copy `./frontend/.env.template` to `./frontend/.env` and set the backend URL.

Then start the stack:

```bash
docker compose up -d --build
```

---

<h2 id="configuration">Configuration ⚙️</h2>

Pentest Copilot uses two configuration files. All sensitive files are **gitignored** — only the `.template` files are committed.

### Static Configuration (`config.toml`)

Generated from `config.toml.template` by `run.sh`. Read once at startup. Bind-mounted into the backend container so changes take effect on `docker compose down && docker compose up`.

| Key | Section | Description | Default |
|-----|---------|-------------|---------|
| `port` | `[server]` | Backend server port | `8080` |
| `deployment` | `[server]` | Deployment environment (`LOCAL` or `PROD`) | `LOCAL` |
| `base_url_frontend` | `[server]` | Frontend URL for CORS & redirects | `http://localhost:3000` |
| `cors_origins` | `[server]` | Additional CORS origins (comma-separated) | _(none)_ |
| `mongo_uri` | `[database]` | MongoDB connection string | `mongodb://mongodb:27017/pentestcopilot` |
| `mongo_database` | `[database]` | MongoDB database name | `pentestcopilot` |
| `redis_url` | `[database]` | Redis connection string | `redis://redis:6379` |
| `secret` | `[session]` | Session cookie signing secret (auto-generated by `run.sh`) | _(random)_ |
| `lifetime` | `[session]` | Session lifetime (ms) | `1000` |
| `backend_uri` | `[frontend]` | Backend URL used by the frontend | `http://localhost:8080` |
| `deployment` | `[frontend]` | Frontend deployment mode | `LOCAL` |

### Dynamic Configuration (`.env`)

Generated from `backend/.env.template` by `run.sh`. Located at `backend/.env` in dev mode or `/srv/data/.env` inside the Docker container. Editable at runtime via the Settings UI.

| Variable | Description | Default |
|----------|-------------|---------|
| `MODEL_PROVIDER` | LLM provider (`openai`, `anthropic`, `openai-compatible`) | `openai` |
| `MODEL` | Model identifier | `gpt-4o` |
| `MODEL_API_KEY` | API key for the model provider | |
| `MODEL_BASE_PATH` | Base URL override for OpenAI-compatible providers | |
| `SSH_HOST` | Hostname for the exploit box | |
| `SSH_PORT` | SSH port | `22` |
| `SSH_USERNAME` | SSH username | `root` |
| `SSH_PASSWORD` | SSH password | |
| `SSH_PRIVATE_KEY` | Path to SSH private key file | |
| `SSH_PRIVATE_KEY_PASSPHRASE` | Passphrase for the private key | |
| `ANTHROPIC_OAUTH_ACCESS_TOKEN` | Anthropic OAuth token (auto-populated) | |
| `ANTHROPIC_OAUTH_REFRESH_TOKEN` | Anthropic OAuth refresh token (auto-populated) | |
| `ANTHROPIC_OAUTH_EXPIRES_AT` | Anthropic OAuth token expiry (auto-populated) | |

### Frontend Configuration (`frontend/.env`)

Generated from `frontend/.env.template` by `run.sh`.

| Variable | Description | Default |
|----------|-------------|---------|
| `NEXT_PUBLIC_BACKEND_URI` | URL of the backend server | `http://localhost:8080` |
| `NEXT_PUBLIC_DEPLOYMENT` | Deployment environment | `LOCAL` |

<h2 id="system-components">Architecture 🏗️</h2>

Pentest Copilot follows a microservices architecture using Docker containers:

| Service  | Port(s)              | Description                                                                                                                   |
| -------- | -------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| MongoDB  | 27017                | Stores application data like user data, sessions and workspace information                                                    |
| Redis    | 6379                 | Handles authentication and workspace data for fast querying                                                                   |
| Backend  | 8080                 | Node.js application that runs the API and socket connections for real-time communication with the frontend and Kali container |
| Frontend | 3000                 | Hosts the user interface built with Next.js                                                                                   |
| Kali     | 4200, 1194/udp, 9020 | Kali Linux container with pre-installed pentesting tools, accessible via SSH, OpenVPN, and noVNC                              |

### Data directories

| Path | Purpose |
|------|---------|
| `config.toml` | Static config — bind-mounted into the backend container (read-only) |
| `backend/.env` | Dynamic config (dev mode) — model keys, SSH credentials |
| `/srv/data/.env` | Dynamic config (Docker) — provisioned into the container volume |
| `kali-data/` | Shared host directory mounted into both the backend and Kali containers. Used for VPN profiles and other data that needs to be accessible from both services. |
| `ssh-keys/` | SSH private keys copied here by `run.sh` and mounted into the backend container |

> [!NOTE]
> You can see the list of tools being installed in the Kali container by checking `./kali/tools.sh`. This file installs all tools, tool names, and the download commands.

<h2 id="system-requirements">System Requirements 💻</h2>

To run Pentest Copilot effectively, your host machine should meet the following minimum requirements:

- **RAM**: 8GB (to accommodate the frontend, backend, databases, and the resource-intensive Kali container)
- **Processor**: Multi-core processor (for smooth operation of multiple containers)
- **Disk Space**: 20GB (for the Kali container and other components)
- **Node.js**: Version 22+ (required for both frontend and backend)
- **pnpm**: Version 9+ (package manager for both frontend and backend)

> [!IMPORTANT]
> The Kali container, which runs a full Kali Linux desktop with pentesting tools, requires significant resources. Allocating at least 2GB RAM to the Kali container is recommended for optimal performance.

> [!NOTE]
> The environment variables are configured for Docker Compose setup by default. If you're using a custom container setup or running services outside of Docker, you may need to modify variables such as:
> - `mongo_uri` in `config.toml` (change from `mongodb://mongodb:27017/pentestcopilot` to your MongoDB host)
> - `redis_url` in `config.toml` (change from `redis://redis:6379` to your Redis host)
> - `SSH_HOST` and `SSH_PORT` in `.env` (change from `kali:22` to your Kali/exploit box host and port)

<h2 id="features">Features</h2>

Below is a rundown of what Pentest Copilot brings to the table:

| **Feature**                         | **Description**                                                                                                                    | **Feature**                  | **Description**                                                                                                                      |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| **🤖 AI-Powered Guidance**          | Leverages LLMs to assist users through all stages of penetration testing.                                                | **⚙️ Workflow Support**      | Facilitates reconnaissance, enumeration, vulnerability identification, privilege escalation, data extraction, and footprint cleanup. |
| **📝 Todo List Management**         | Maintains a per-session todo list, helping organize prospective attack vectors for structured planning.                        | **🔧 Custom Tool Selection** | Enables users to choose preferred tools by visiting `/settings/tools`, which the copilot uses to generate commands.                  |
| **🏴‍☠️ Exploit Box (Kali Container)** | Offers a Kali Linux container with pre-installed tools (modifiable via `./kali/tools.sh`), accessible via SSH, OpenVPN, and noVNC. | **💻 Integrated Terminal**   | Provides direct terminal access to the Kali container from the workspace page for command execution.                                 |
| **🔒 VPN Integration**              | Allows users to upload custom OpenVPN config files and connect the Kali container to a VPN via the UI.                             | **🏠 Workspace Management**  | Supports creating and managing multiple workspaces, each with isolated sessions.                                                     |

## Frontend Technology

The frontend is built on **Next.js** with the app router, utilizing **server-side rendering** and **static site generation** for performance. It integrates with the backend via **REST APIs** and **WebSockets** for real-time functionality.

#### Key Technologies:

- **Ant Design**: Reusable UI components for a consistent, responsive interface.
- **Redux Toolkit**: Manages application state for complex interactions.
- **Xterm**: Provides in-browser terminal emulation for Kali container access.
- **Sass**: Enables advanced SCSS styling.
- **React Query**: Handles data fetching, caching, and synchronization with backend APIs.

#### Core Routes:

- **`/login`, `/register`**: User authentication endpoints.
- **`/dashboard`**: Workspace creation and management hub.
- **`/session/[session_id]`**: Primary interface for AI interaction and pentesting tasks.
- **`/session/[session_id]/gui`**: VNC-based graphical access to the Kali container.
- **`/session/[session_id]/vpn`**: UI for uploading and connecting custom OpenVPN configs.

---

## Backend Technology

The backend is powered by **Node.js (TypeScript)** and **Express.js**, serving APIs and orchestrating pentesting logic. It integrates with LLM providers (OpenAI, Anthropic, OpenAI-compatible), manages databases, and facilitates real-time communication.

#### Key Components:

- **Socket.IO**: Enables real-time, bidirectional communication between the frontend and Kali container for live terminal interactions.
- **LLM Integration**: Supports OpenAI, Anthropic (including OAuth), and OpenAI-compatible providers via configurable model settings.
- **MongoDB**: Persistent storage for user data, sessions, and application state (default port: `27017`).
- **Redis**: Fast key-value store for session management and authentication tokens (default port: `6379`).
- **Express.js**: Used to build APIs.

The backend routes all logic through a **central service** (default port: `8080`), connecting user inputs to AI outputs and Kali container execution.

<h2 id="local-development">Local Development</h2>

### Using Developer Mode (Recommended)

The easiest way to develop locally is using the built-in developer mode in `run.sh`:

```bash
bash run.sh dev
```

This starts only the infrastructure services (MongoDB, Redis) in Docker while you run the frontend and backend manually on your host machine. It automatically:
- Sets `mongo_uri` and `redis_url` to `localhost` in `config.toml`
- Creates `backend/.env` and `frontend/.env` from their templates

Then start the backend and frontend in separate terminals:

```bash
# Terminal 1 — Backend TypeScript compiler (watch mode)
cd backend
pnpm run watch

# Terminal 2 — Backend dev server
cd backend
pnpm run dev

# Terminal 3 — Frontend dev server
cd frontend
pnpm run dev
```

The backend server will start at `http://localhost:8080` and the frontend at `http://localhost:3000`.

### Manual Setup

If you prefer to set things up manually:

#### Prerequisites

- **Node.js 22+**
- **pnpm 9+** — install via `corepack enable` (bundled with Node.js 22)

#### Configuration

```bash
cp config.toml.template config.toml        # Edit: set mongo_uri/redis_url to localhost
cp backend/.env.template backend/.env       # Edit: add model API key, SSH details
cp frontend/.env.template frontend/.env     # Edit: set backend URL if needed
```

#### Backend

```bash
cd backend
pnpm install
pnpm run watch   # Terminal 1: TypeScript compiler in watch mode
pnpm run dev     # Terminal 2: Start dev server (after initial compilation)
```

#### Frontend

```bash
cd frontend
pnpm install
pnpm run dev     # Starts Next.js dev server with Turbopack
```

## Meet the Authors

- Dhruva Goyal - [dhruva@bugbase.ai](mailto:dhruva@bugbase.ai) | [LinkedIn](https://www.linkedin.com/in/dhruva-goyal/) | [Github](https://github.com/shero4) | [X/Twitter](https://x.com/dhruvagoyal)
- Aditya Peela - [aditya@bugbase.ai](mailto:aditya@bugbase.ai) | [LinkedIn](https://www.linkedin.com/in/aditya-peela/) | [Github](https://github.com/adityamhn)  | [Twitter](https://x.com/adityapeela)
- Sitaraman Subramanian - [sitaraman@bugbase.ai](mailto:sitaraman@bugbase.ai) | [LinkedIn](https://www.linkedin.com/in/sitaraman-s/) | [Github](https://github.com/hackerbone)  | [Twitter](https://x.com/situuu_ig)

## Citations

If you use Pentest Copilot in your research, please cite:

```bibtex
@article{goyal2024hacking,
  title={Hacking, the lazy way: LLM augmented pentesting},
  author={Goyal, Dhruva and Subramanian, Sitaraman and Peela, Aditya},
  journal={arXiv preprint arXiv:2409.09493},
  year={2024}
}
```

## Contributing

We welcome contributions to Pentest Copilot! Please review our [Contributing Guide](./CONTRIBUTING.md) to get started. Also, ensure you adhere to our [Code of Conduct](./CODE_OF_CONDUCT.md).

## License

This project is licensed under the [MIT License](./LICENSE).

## Disclaimer

Pentest Copilot is intended solely for ethical hacking and penetration testing. Always ensure you have explicit permission to test any systems you target.
