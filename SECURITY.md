# Security Policy

## Scope

This policy covers **vulnerabilities in VektorSec itself** (the platform): the backend API,
the agent/tool runtime, the frontend, the black-box gateway and the deployment files in this
repository.

VektorSec is an offensive-security tool. Findings that only exist because *you* pointed the
agent at a target you were authorised to test are **not** in scope here — this document is
about the security of the platform.

> ⚠️ **Authorised use only.** Testing systems without written permission is illegal in most
> jurisdictions and is explicitly against our [Code of Conduct](./CODE_OF_CONDUCT.md).
> Never report or demonstrate a finding against a system you do not own or have permission
> to test.

---

## Supported versions

| Version | Supported |
|---|---|
| `main` (latest commit) | ✅ |
| Tagged releases | ✅ for the latest minor release |
| Older releases | ❌ — please retest on `main` |

---

## How to report a vulnerability

**Please do not open a public issue for security problems.**

Use GitHub's private reporting flow:

1. Go to the **Security** tab of this repository.
2. Click **Report a vulnerability** (Private vulnerability reporting).
3. Describe the issue using the checklist below.

If private reporting is unavailable, email the maintainers at the address published in the
repository profile and include `SECURITY` in the subject line.

### What to include

- Affected component and version/commit (e.g. `backend` @ `7bb6d6d`)
- A clear reproduction: setup, request/command, expected vs actual behaviour
- Impact assessment — what an attacker gains (RCE, auth bypass, secret disclosure, SSRF, …)
- Proof of concept, logs or screenshots (redact real credentials, tokens and customer data)
- Whether the issue needs authentication, an admin role, or a specific configuration

### What to expect

| Stage | Target |
|---|---|
| Acknowledgement of your report | within 3 business days |
| Initial triage + severity assessment | within 7 business days |
| Fix or mitigation plan for high/critical findings | within 30 days |
| Public disclosure | coordinated with you, after a fix ships (default 90 days) |

We credit reporters in the release notes unless you ask us not to.

---

## High-value areas to look at

If you are hunting for issues, these are the parts that matter most:

- **Agent tool runtime** — scope enforcement (`backend/src/utils/scopeValidator.ts`,
  `backend/src/utils/guardrails.ts`), SSRF protection (`backend/src/utils/ssrfGuard.ts`),
  scan guards (`backend/src/tools/handlers/scan-guard.ts`) and command approval
  (`backend/src/services/tool-approval.service.ts`)
- **Auth & sessions** — session handling, 2FA, RBAC middleware, password reset
- **Black-box gateway** — response filtering (`frontend/gateway/filter.js`) and proxying
  (`frontend/server.js`): anything that leaks backend internals or secrets to the browser
- **Payment / subscription** — order confirmation, quota/usage enforcement, privilege escalation
- **MCP surface** — access tokens, tool allow-listing and consent gating
- **Secrets handling** — vault, env writer, model registry and log output

---

## Hardening checklist for self-hosters

Before exposing an instance to the internet:

- [ ] `[session] secret` in `config.toml` is a fresh random value (≥ 32 chars)
- [ ] `deployment = "PROD"` and the domain is correct in `base_url_frontend` / `cors_origins`
- [ ] The default admin password was changed and 2FA is enabled
- [ ] Ports `8081` (backend), `27017` (MongoDB) and `6379` (Redis) are **not** publicly reachable
- [ ] The built-in Kali box (if used) is bound to internal interfaces only
- [ ] `config.toml`, `*.env`, `deploy/secrets.env`, `backend/model-registry.json` and `kali-data/`
      are never committed (`.gitignore` covers them — verify with `git status`)

See the [README](./README.md#-security-checklist) for the full deployment checklist.
