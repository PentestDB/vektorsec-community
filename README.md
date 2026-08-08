<p align="center">
  <img src="./assets/banner.png" alt="VektorSec Banner" />
</p>

# VektorSec

![GitHub License](https://img.shields.io/github/license/PentestDB/vektorsec-community)
![GitHub Repo stars](https://img.shields.io/github/stars/PentestDB/vektorsec-community)
![GitHub forks](https://img.shields.io/github/forks/PentestDB/vektorsec-community)

An open-source, AI-driven penetration testing agent. Connects to a Kali attack box, runs tools autonomously, analyzes results, and iterates. You describe the target. It does the rest.

Built for real-world engagements, boot2root boxes, and CTFs.

<p align="center">
<img src="./assets/dashboard_with_backdrop.png">
</p>

<p align="center">
<img src="./assets/operationa_dashboard_with_backdrop.png">
</p>

## In Action

VektorSec performing an auth bypass in [OWASP Juice Shop](https://owasp.org/www-project-juice-shop/):

<video src="https://github.com/user-attachments/assets/bbb2cab2-6db7-4578-a3b7-f45a1619a987" poster="./assets/video-thumbnail.jpg" controls></video>

Watch it on [YouTube](https://www.youtube.com/watch?v=L0bjYzuICWo)

## Star History

<a href="https://www.star-history.com/?repos=PentestDB%2Fvektorsec-community&type=date&legend=top-left">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/chart?repos=PentestDB/vektorsec-community&type=date&theme=dark&legend=top-left&sealed_token=VYz_mLFzoEYhswAZ0fcw1Y5b4-xwEgiA1-_LLkQulXwvkoEjkkNH-2VMCPTqxhTaVx_bGgAXaukN1XsHmsdq3Ve_fEWnM9_E08ZBHEKTkCiTkovjRa6uTVMBMHtNI1iIFQefuI6GU-sWbWlE9zIMttPUOrv4keBXyWsu_7IuojnGdiDF6sW90fIThJNG" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/chart?repos=PentestDB/vektorsec-community&type=date&legend=top-left&sealed_token=VYz_mLFzoEYhswAZ0fcw1Y5b4-xwEgiA1-_LLkQulXwvkoEjkkNH-2VMCPTqxhTaVx_bGgAXaukN1XsHmsdq3Ve_fEWnM9_E08ZBHEKTkCiTkovjRa6uTVMBMHtNI1iIFQefuI6GU-sWbWlE9zIMttPUOrv4keBXyWsu_7IuojnGdiDF6sW90fIThJNG" />
   <img alt="Star History Chart" src="https://api.star-history.com/chart?repos=PentestDB/vektorsec-community&type=date&legend=top-left&sealed_token=VYz_mLFzoEYhswAZ0fcw1Y5b4-xwEgiA1-_LLkQulXwvkoEjkkNH-2VMCPTqxhTaVx_bGgAXaukN1XsHmsdq3Ve_fEWnM9_E08ZBHEKTkCiTkovjRa6uTVMBMHtNI1iIFQefuI6GU-sWbWlE9zIMttPUOrv4keBXyWsu_7IuojnGdiDF6sW90fIThJNG" />
 </picture>
</a>

## What It Does

- **Agentic execution** - the AI runs commands directly on the attack box, reads output, decides next steps, and loops. Up to 25 iterations per turn, no manual nudging required.
- **16 agent tools** - bash, Python scripts, tool installation, shell management, Google search, subagent spawning, Burp Suite (proxy history, Repeater, Intruder, Collaborator), and browser automation.
- **100+ capabilities** - curated registry of security tools and Python packages across 7 categories (network, rev, pwn, crypto, forensics, stego, core). Select what you need, the agent installs the rest.
- **Burp Suite integration** - proxy history viewer, send requests to Repeater/Intruder, Collaborator for out-of-band testing. All accessible to the agent and through the UI.
- **Browser agent** - real browser automation via [Magnitude](https://github.com/magnitude-dev/magnitude). Test login flows, fill forms, interact with JavaScript-heavy apps. Optionally proxy traffic through Burp. In Docker mode, watch the browser via the built-in VNC stream; in developer mode, the browser opens on your local desktop.
- **VPN management** - upload `.ovpn` profiles and connect/disconnect from the browser. Multiple simultaneous connections supported.
- **Subagent parallelism** - spawn background agents to run tasks concurrently (e.g. directory brute-force + subdomain enum at the same time).
- **Safety checks** - dangerous commands (recursive deletes, device writes, fork bombs) require explicit approval, even in auto-run mode.
- **Bring your own model** - OpenAI, Anthropic (API key or OAuth), Google, Mistral, or any OpenAI-compatible endpoint.
- **Use existing local subscriptions** - VektorSec can use an authenticated Codex CLI in Docker or host mode, and Claude Code in host/developer mode, as normal inference providers while retaining its own tool and consent loop.

## Quick Start

```bash
git clone https://github.com/PentestDB/vektorsec-community.git
cd vektorsec-community
./run.sh start
```

Open `http://localhost:3000`, register, and start a session.

### Codex and Claude subscription inference

Settings -> Models detects authenticated Codex and Claude Code CLIs. Authenticate
once on the machine that runs the CLI:

```bash
codex login
claude auth login
```

Then select **Use Codex** or **Use Claude Code**. The official CLI owns login,
refresh, and subscription entitlement handling; VektorSec does not copy
or replay OAuth tokens. Subscription transports receive the same conversation
history and function schemas as API providers and return the same assistant/tool
call contract, so VektorSec continues to execute tools and consent checks.

The Docker backend includes the Linux Codex CLI and mounts only the host's
file-based `~/.codex/auth.json`, following Codex's documented headless/Docker
login transfer flow. Set `CODEX_AUTH_FILE` before `docker compose up` if your
credential file lives elsewhere. The CLI may refresh that file during normal
use; never commit or share it. Host Keychain-only credentials and Claude Code
remain available only in developer/host mode until a host inference bridge is
configured. Claude subscription use is local CLI control and must comply with
Anthropic's current third-party product and subscription terms.

Current first-class model families include GPT-5.6 Sol/Terra/Luna, Claude
Fable/Opus/Sonnet 5, and Kimi K3 (direct Moonshot API or OpenRouter).

### Session-scoped SSH profiles

In Docker mode, Pentest Copilot mounts the host's `~/.ssh` and `~/keys`
directories read-only. Each session can select a different concrete `Host`
alias from `~/.ssh/config` under **Connection**, so parallel sessions use
independent SSH connections and remote workspaces without copying private keys
into MongoDB. Set `HOST_SSH_DIR` or `HOST_SSH_KEYS_DIR` before starting Docker
when those directories live elsewhere.

Use named aliases rather than wildcard-only entries:

```ssh-config
Host lab-box
  HostName 10.10.10.10
  User root
  IdentityFile ~/.ssh/lab-box.pem
```

`run.sh` handles config file generation, Docker builds, and container orchestration. On first run it prompts for your model provider and API key. Use `./run.sh start -q` to skip prompts on subsequent runs.

```bash
./run.sh stop       # Stop all containers
./run.sh logs       # Tail logs
./run.sh status     # Container status
./run.sh config     # Update configuration
./run.sh dev        # Developer mode (infra only, run frontend/backend locally)
./run.sh help       # Full help
```

### MCP Access

VektorSec can expose its local control plane over MCP for clients such as Claude Code or Codex. Open Settings -> MCP Access to copy the local MCP endpoint and bearer token.

Treat the token as local admin access: it can run commands on the configured exploit box, operate Burp, browser automation, and VPN flows, read artifacts, write findings, and update local VektorSec configuration. MCP actions tied to an engagement are recorded in that session so they remain visible in the VektorSec UI.

After copying the endpoint and token, you can smoke test the MCP connection:

```bash
cd backend
PENTEST_COPILOT_MCP_URL=http://localhost:8080/mcp \
PENTEST_COPILOT_MCP_TOKEN=pc_mcp_... \
corepack pnpm run mcp:smoke
```

### System Requirements

|         | Minimum                                           |
| ------- | ------------------------------------------------- |
| RAM     | 8 GB (+2 GB if using the built-in Kali container) |
| Disk    | 20 GB                                             |
| Docker  | v20+ with Compose v2+                             |
| Node.js | v22+ (dev mode only)                              |
| pnpm    | v9+ (dev mode only)                               |

## Documentation

Full documentation lives in the **[Wiki](https://github.com/PentestDB/vektorsec-community/wiki)**:

- [Getting Started](https://github.com/PentestDB/vektorsec-community/wiki/Home) - setup, configuration, environment variables
- [Architecture](https://github.com/PentestDB/vektorsec-community/wiki/Architecture) - system design, agent loop, subagents
- [Usage](https://github.com/PentestDB/vektorsec-community/wiki/Usage) - workflow, consent model, chat interface
- [Features](https://github.com/PentestDB/vektorsec-community/wiki/Features) - full feature overview
- [Settings](https://github.com/PentestDB/vektorsec-community/wiki/Settings) - models, SSH, VNC, Burp, Magnitude
- [Capabilities](https://github.com/PentestDB/vektorsec-community/wiki/Capabilities) - tool registry and buckets
- [Agent Tools](https://github.com/PentestDB/vektorsec-community/wiki/Agent-Tools) - all 16 tools and consent behavior
- [Burp Suite Integration](https://github.com/PentestDB/vektorsec-community/wiki/Burp-Suite-Integration) - setup and usage
- [Browser Agent](https://github.com/PentestDB/vektorsec-community/wiki/Browser-Agent) - Magnitude configuration
- [VPN Management](https://github.com/PentestDB/vektorsec-community/wiki/VPN-Management) - profile management
- [Slash Commands](https://github.com/PentestDB/vektorsec-community/wiki/Slash-Commands) - session utilities
- [Changelog](https://github.com/PentestDB/vektorsec-community/wiki/Changelog) - what's new

## Local Development

```bash
./run.sh dev    # Starts MongoDB + Redis in Docker
```

Then in separate terminals:

```bash
cd backend && pnpm install && pnpm run watch   # TypeScript compiler
cd backend && pnpm run dev                     # Backend server (port 8080)
cd frontend && pnpm install && pnpm run dev    # Frontend (port 3000)
```

See the [Wiki](https://github.com/PentestDB/vektorsec-community/wiki/Home) for detailed setup instructions.

## Authors

- Dhruva Goyal - [dhruva@vektorsec.ai](mailto:dhruva@vektorsec.ai) | [LinkedIn](https://www.linkedin.com/in/dhruva-goyal/) | [GitHub](https://github.com/shero4) | [X](https://x.com/dhruvagoyal)
- Aditya Peela - [aditya@vektorsec.ai](mailto:aditya@vektorsec.ai) | [LinkedIn](https://www.linkedin.com/in/aditya-peela/) | [GitHub](https://github.com/adityamhn) | [X](https://x.com/adityapeela)
- Sitaraman Subramanian - [sitaraman@vektorsec.ai](mailto:sitaraman@vektorsec.ai) | [LinkedIn](https://www.linkedin.com/in/sitaraman-s/) | [GitHub](https://github.com/hackerbone) | [X](https://x.com/situuu_ig)

## Citations

```bibtex
@article{goyal2024hacking,
  title={Hacking, the lazy way: LLM augmented pentesting},
  author={Goyal, Dhruva and Subramanian, Sitaraman and Peela, Aditya},
  journal={arXiv preprint arXiv:2409.09493},
  year={2024}
}
```

## Contributing

Contributions welcome. See the [Contributing Guide](./CONTRIBUTING.md) and [Code of Conduct](./CODE_OF_CONDUCT.md).

## License

[MIT License](./LICENSE)

## Disclaimer

VektorSec is intended for authorized security testing only. Always have explicit permission before testing any system.
