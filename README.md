<p align="center">
  <img src="./assets/banner.png" alt="Pentest Copilot Banner" />
</p>

# Pentest Copilot

![GitHub License](https://img.shields.io/github/license/bugbasesecurity/pentest-copilot)
![GitHub Repo stars](https://img.shields.io/github/stars/bugbasesecurity/pentest-copilot)
![GitHub forks](https://img.shields.io/github/forks/bugbasesecurity/pentest-copilot)

An open-source, AI-driven penetration testing agent. Connects to a Kali attack box, runs tools autonomously, analyzes results, and iterates. You describe the target. It does the rest.

Built for real-world engagements, boot2root boxes, and CTFs.

<p align="center">
<img src="./assets/dashboard_with_backdrop.png">
</p>

<p align="center">
<img src="./assets/operationa_dashboard_with_backdrop.png">
</p>

## In Action

Pentest Copilot performing an auth bypass in [OWASP Juice Shop](https://owasp.org/www-project-juice-shop/):


<video src="https://github.com/user-attachments/assets/bbb2cab2-6db7-4578-a3b7-f45a1619a987" poster="./assets/video-thumbnail.jpg" controls></video>

Watch it on [YouTube](https://www.youtube.com/watch?v=L0bjYzuICWo)

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

## Quick Start

```bash
git clone https://github.com/bugbasesecurity/pentest-copilot.git
cd pentest-copilot
./run.sh start
```

Open `http://localhost:3000`, register, and start a session.

`run.sh` handles config file generation, Docker builds, and container orchestration. On first run it prompts for your model provider and API key. Use `./run.sh start -q` to skip prompts on subsequent runs.

```bash
./run.sh stop       # Stop all containers
./run.sh logs       # Tail logs
./run.sh status     # Container status
./run.sh config     # Update configuration
./run.sh dev        # Developer mode (infra only, run frontend/backend locally)
./run.sh help       # Full help
```

### System Requirements

| | Minimum |
|---|---|
| RAM | 8 GB (+2 GB if using the built-in Kali container) |
| Disk | 20 GB |
| Docker | v20+ with Compose v2+ |
| Node.js | v22+ (dev mode only) |
| pnpm | v9+ (dev mode only) |

## Documentation

Full documentation lives in the **[Wiki](https://github.com/bugbasesecurity/pentest-copilot/wiki)**:

- [Getting Started](https://github.com/bugbasesecurity/pentest-copilot/wiki/Home) - setup, configuration, environment variables
- [Architecture](https://github.com/bugbasesecurity/pentest-copilot/wiki/Architecture) - system design, agent loop, subagents
- [Usage](https://github.com/bugbasesecurity/pentest-copilot/wiki/Usage) - workflow, consent model, chat interface
- [Features](https://github.com/bugbasesecurity/pentest-copilot/wiki/Features) - full feature overview
- [Settings](https://github.com/bugbasesecurity/pentest-copilot/wiki/Settings) - models, SSH, VNC, Burp, Magnitude
- [Capabilities](https://github.com/bugbasesecurity/pentest-copilot/wiki/Capabilities) - tool registry and buckets
- [Agent Tools](https://github.com/bugbasesecurity/pentest-copilot/wiki/Agent-Tools) - all 16 tools and consent behavior
- [Burp Suite Integration](https://github.com/bugbasesecurity/pentest-copilot/wiki/Burp-Suite-Integration) - setup and usage
- [Browser Agent](https://github.com/bugbasesecurity/pentest-copilot/wiki/Browser-Agent) - Magnitude configuration
- [VPN Management](https://github.com/bugbasesecurity/pentest-copilot/wiki/VPN-Management) - profile management
- [Slash Commands](https://github.com/bugbasesecurity/pentest-copilot/wiki/Slash-Commands) - session utilities
- [Changelog](https://github.com/bugbasesecurity/pentest-copilot/wiki/Changelog) - what's new

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

See the [Wiki](https://github.com/bugbasesecurity/pentest-copilot/wiki/Home) for detailed setup instructions.

## Authors

- Dhruva Goyal - [dhruva@bugbase.ai](mailto:dhruva@bugbase.ai) | [LinkedIn](https://www.linkedin.com/in/dhruva-goyal/) | [GitHub](https://github.com/shero4) | [X](https://x.com/dhruvagoyal)
- Aditya Peela - [aditya@bugbase.ai](mailto:aditya@bugbase.ai) | [LinkedIn](https://www.linkedin.com/in/aditya-peela/) | [GitHub](https://github.com/adityamhn) | [X](https://x.com/adityapeela)
- Sitaraman Subramanian - [sitaraman@bugbase.ai](mailto:sitaraman@bugbase.ai) | [LinkedIn](https://www.linkedin.com/in/sitaraman-s/) | [GitHub](https://github.com/hackerbone) | [X](https://x.com/situuu_ig)

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

Pentest Copilot is intended for authorized security testing only. Always have explicit permission before testing any system.
