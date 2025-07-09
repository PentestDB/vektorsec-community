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
- [Usage](#usage)
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

### Automated environment setup (Recommended):

Run the provided setup script to automatically configure your environment variables and perform initial setup:

```bash
bash setup.sh
```

The script will:
- Create `.env` files for both backend and frontend from their templates
- Prompt you to enter OpenAI API keys for both large and small models (optional, but required for AI features)
- Offer to configure SSH settings for the exploit box (optional)
- Offer to set up Google Tag Manager for the frontend (optional)
- Detect if you are running on WSL and adjust hostnames for compatibility

You can always edit the generated `.env` files later if needed.

> [!NOTE]
> If you prefer manual setup, see the [Manual Environment Setup](#manual-environment-setup) section below.

### Launch the tool using Docker Compose:

```bash
docker compose up --build -d
```

### Access the application:

Once the containers are running, access the frontend at `http://localhost:3000`.

---

### <a id="setup-sh"></a>About `setup.sh`

The `setup.sh` script is an interactive setup utility that streamlines the initial configuration process. It:
- Copies environment variable templates to `.env` files for both backend and frontend
- Prompts for OpenAI API keys (for both large and small models)
- Optionally configures SSH settings for the exploit box (Kali container or custom host)
- Optionally configures Google Tag Manager for the frontend
- Detects WSL and adjusts hostnames for compatibility
- Provides clear instructions and warnings for each step

You can rerun the script at any time to update your configuration, or manually edit the `.env` files as needed.

---

### <a id="manual-environment-setup"></a>Manual Environment Setup (Advanced)

If you prefer to set up environment variables manually:

1. Copy `./backend/.env.template` to `./backend/.env`.
2. Copy `./frontend/.env.template` to `./frontend/.env`.
3. Edit the `.env` files to add your API keys and adjust settings as needed.

---

<h2 id="configuration">Environment Variable Configuration ⚙️</h2>

Pentest Copilot requires configuration through environment variables. Below are the key variables for both the frontend and backend.

### Frontend (`./frontend/.env`)

| Variable                | Description                                 | Default                  |
| ----------------------- | ------------------------------------------- | ------------------------ |
| NEXT_PUBLIC_BACKEND_URI | URL of the backend server                   | `http://localhost:8080`  |
| NEXT_PUBLIC_DEPLOYMENT  | Deployment environment                      | `LOCAL`                  |
| NEXT_PUBLIC_GTM_ID      | Google Tag Manager ID (optional)            |                          |

### Backend (`./backend/.env`)

| Variable                   | Description                                                    | Default                                 |
| -------------------------- | -------------------------------------------------------------- | --------------------------------------- |
| BASE_URL_FRONTEND          | URL of the frontend server                                     | `http://localhost:3000`                 |
| DEPLOYMENT                 | Deployment environment                                         | `LOCAL`                                 |
| MONGO_DATABASE             | Name of the MongoDB database                                   | `pentestcopilot`                        |
| MONGO_URI                  | MongoDB connection string                                      | `mongodb://mongodb:27017/pentestcopilot`|
| REDIS_URL                  | Redis connection string                                        | `redis://redis:6379`                    |
| SESS_LIFETIME              | Session lifetime in milliseconds                              | `1000`                                  |
| SESS_NAME                  | Session cookie name                                            | `sid`                                   |
| SESS_SECRET                | Secret key for signing session cookies                         | `thisismysessionsecret!123`             |
| PORT                       | Port for the backend server                                    | `8080`                                  |
| MODEL_LARGE                | Identifier for the large OpenAI model                          | `gpt-4-1106-preview`                    |
| MODEL_API_KEY_LARGE        | API key for the large OpenAI model                             |                                         |
| MODEL_BASE_PATH_LARGE      | Base URL/path for the large model's API (optional override)    |                                         |
| MODEL_SMALL                | Identifier for the small OpenAI model                          | `gpt-3.5-turbo-1106`                    |
| MODEL_API_KEY_SMALL        | API key for the small OpenAI model                             |                                         |
| MODEL_BASE_PATH_SMALL      | Base URL/path for the small model's API (optional override)    |                                         |
| SSH_HOST                   | Hostname for the exploit box (Kali or custom host)             | `kali`                                  |
| SSH_PORT                   | Port for the exploit box (Kali or custom host)                 | `22`                                    |
| SSH_USERNAME               | Username for the exploit box                                   | `root`                                  |
| SSH_PASSWORD               | Password for the exploit box                                   | `''`                                    |
| SSH_PRIVATE_KEY            | Path to the private key for SSH                                | `'/path/to/private/key'`                |
| SSH_PRIVATE_KEY_PASSPHRASE | Passphrase for the private key                                 | `''`                                    |

<h2 id="system-components">Architecture 🏗️</h2>

Pentest Copilot follows a microservices architecture using Docker containers:

| Service  | Port(s)              | Description                                                                                                                   |
| -------- | -------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| MongoDB  | 27017                | Stores application data like user data, sessions and workspace information                                                    |
| Redis    | 6379                 | Handles authentication and workspace data for fast querying                                                                   |
| Backend  | 8080                 | Node.js application that runs the API and socket connections for real-time communication with the frontend and Kali container |
| Frontend | 3000                 | Hosts the user interface built with Next.js                                                                                   |
| Kali     | 4200, 1194/udp, 9020 | Kali Linux container with pre-installed pentesting tools, accessible via SSH, OpenVPN, and noVNC                              |

> [!NOTE]
> You can see the list of tools being installed in the Kali container by checking `./kali/tools.sh`. This file installs all tools, tool names, and the download commands.

<h2 id="system-requirements">System Requirements 💻</h2>

To run Pentest Copilot effectively, your host machine should meet the following minimum requirements:

- **RAM**: 8GB (to accommodate the frontend, backend, databases, and the resource-intensive Kali container)
- **Processor**: Multi-core processor (for smooth operation of multiple containers)
- **Disk Space**: 20GB (for the Kali container and other components)
- **Node.js**: Version 22 (required for both frontend and backend)

> [!IMPORTANT]
> The Kali container, which runs a full Kali Linux desktop with pentesting tools, requires significant resources. Allocating at least 2GB RAM to the Kali container is recommended for optimal performance.

> [!NOTE]
> The environment variables are configured for Docker Compose setup by default. If you're using a custom container setup or running services outside of Docker, you may need to modify variables such as:
> - `MONGO_URI` (change from `mongodb://mongodb:27017/pentestcopilot` to your MongoDB host)
> - `REDIS_URL` (change from `redis://redis:6379` to your Redis host)
> - `SSH_HOST` and `SSH_PORT` (change from `kali:22` to your Kali/exploit box host and port)

<h2 id="features">Features</h2>

Below is a rundown of what Pentest Copilot brings to the table:

| **Feature**                         | **Description**                                                                                                                    | **Feature**                  | **Description**                                                                                                                      |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| **🤖 AI-Powered Guidance**          | Leverages LLMs to assist users through all stages of penetration testing.                                                | **⚙️ Workflow Support**      | Facilitates reconnaissance, enumeration, vulnerability identification, privilege escalation, data extraction, and footprint cleanup. |
| **📝 Todo List Management**         | Maintains a per-session todo list, helping organize prospective attack vectors for structured planning.                        | **🔧 Custom Tool Selection** | Enables users to choose preferred tools by visiting `/settings/tools`, which the copilot uses to generate commands.                  |
| **🏴‍☠️ Exploit Box (Kali Container)** | Offers a Kali Linux container with pre-installed tools (modifiable via `./kali/tools.sh`), accessible via SSH, OpenVPN, and noVNC. | **💻 Integrated Terminal**   | Provides direct terminal access to the Kali container from the workspace page for command execution.                                 |
| **🔒 VPN Integration**              | Allows users to upload custom OpenVPN config files and connect the Kali container to a VPN via the UI.                             | **🏠 Workspace Management**  | Supports creating and managing multiple workspaces, each with isolated sessions.                                                     |

## Frontend Technology

The frontend is built on **Next.js 13** with the app router, utilizing **server-side rendering** and **static site generation** for performance. It integrates with the backend via **REST APIs** and **WebSockets** for real-time functionality.

#### Few Key Technologies:

- **Ant Design**: Reusable UI components for a consistent, responsive interface.
- **Redux Toolkit**: Manages application state for complex interactions.
- **Xterm**: Provides in-browser terminal emulation for Kali container access.
- **Sass**: Enables advanced SCSS styling.
- **React Query**: Handles data fetching, caching, and synchronization with backend APIs.

#### Core Routes:

- **`/login`, `/register`**: User authentication endpoints.
- **`/dashboard`**: Workspace creation and management hub.
- **`/session/[workspace_id]`**: Primary interface for AI interaction and pentesting tasks.
- **`/session/[workspace_id]/gui`**: VNC-based graphical access to the Kali container.
- **`/session/[workspace_id]/vpn`**: UI for uploading and connecting custom OpenVPN configs.

---

## Backend Technology

The backend is powered by **Node.js (Typescript)** and **Express.js**, serving APIs and orchestrating pentesting logic. It integrates with **OpenAI models**, manages databases, and facilitates real-time communication.

#### Few Key Components:

- **Socket.IO**: Enables real-time, bidirectional communication between the frontend and Kali container for live terminal interactions.
- **OpenAI API**: Powers AI-driven command generation and analysis using configurable models (e.g., `gpt-4-1106-preview`, `gpt-3.5-turbo-1106`).
- **MongoDB**: Persistent storage for user data, sessions, and application state (default port: `27017`).
- **Redis**: Fast key-value store for session management and authentication tokens (default port: `6379`).
- **Express.js** - Used to build APIs.

The backend routes all logic through a **central service** (default port: `8080`), connecting user inputs to AI outputs and Kali container execution.

## Local Development

To run Pentest Copilot locally for development, follow these steps:

### Backend

1. Navigate to the `backend` directory:

```bash
cd backend
```

2. Install dependencies:

```bash
npm install
```

3. Start the backend server:

- Start the TS Server in watch mode for compilation in first terminal:

```bash
npm run watch
```

Once the inital compilation is done, start the server in the second terminal:

- Start the server in the second terminal:

```bash
npm run dev
```

Now, on subsequent changes, the server will automatically restart.

The backend server will start at `http://localhost:8080`.

### Frontend

1. Navigate to the `frontend` directory:

```bash
cd frontend
```

2. Install dependencies:

```bash
npm install
```

3. Start the frontend server:

```bash
npm run dev
```

The frontend server will start at `http://localhost:3000`.

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
