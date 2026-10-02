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

## Scope Guard enforcement (this distribution)

The Scope Guard — the allowlist check that runs before any security tool is executed
(`backend/src/utils/scopeValidator.ts`, `backend/src/utils/guardrails.ts`) — is part of this
distribution's security baseline and is **locked on**: it cannot be disabled through the admin
UI, the environment variables or `config.toml`. Operators can only tighten it (allowlist
entries, strict mode). The policy itself lives in `backend/src/utils/securityPolicy.ts`.

> **Redistribution / forking:** removing or neutering the Scope Guard is a deliberate weakening
> of the product's security model. If you need a build without it, contact the maintainers
> first: <https://www.facebook.com/Pentestdb/>

**Deliberate unlock (licensed builds).** The lock is a build/deploy-time decision, so an unlocked
build can be produced without touching the enforcement code — but since the unlock-token change it
requires **three conditions simultaneously** (`backend/src/utils/securityPolicy.ts`):

1. `SCOPE_GUARD_LOCK=0` in the backend runtime environment (`/srv/data/.env`);
2. `NEXT_PUBLIC_SCOPE_GUARD_LOCK=0` too, i.e. the deployed bundle was built with
   `npm run build:unlocked` (the backend is told which UI mode is live, so a swapped bundle is caught);
3. a signed **unlock token** in the backend environment: `SCOPE_GUARD_UNLOCK_TOKEN=VEK1.…`
   (HMAC-SHA256, verified against `MASTER_SECRET_KEY`) or `VEK2.…` (Ed25519, verified against the
   `MASTER_UNLOCK_PUBLIC_KEY` shipped with the instance). Tokens are issued offline for a named
   client and a fixed expiry by the maintainers' internal generator
   (`backend/src/utils/unlockToken.ts`), so a copied `.env`, a leaked bundle or an edited flag
   cannot unlock anything by itself.

Anything else — a typo, a missing flag, a UI built while locked, or a missing/forged/wrong-key/
expired token, or no verification key at all — keeps the guard ON (fail-closed) and logs
`WARN: Scope Guard unlock attempt failed — Invalid or missing UNLOCK_TOKEN`. An unlocked instance
warns on boot (`Scope Guard is DISABLED in this UNLOCKED build`) and reports `locked: false` from
`GET /api/admin/scope`, together with a `scope.unlock` block listing which conditions were met, so
it can never be mistaken for a locked one. A refused attempt is flagged in the UI too: **Admin →
Security** and **Admin → Scope** render a red *Scope Guard unlock attempt failed* card that names
the missing condition (flag, UI build mode or token verdict) instead of a generic "locked".

> **Shipping an unlocked build?** Tell the customer: in that instance *every* workspace may target
> hosts the operator never authorised, and only the operator's own allowlist discipline stands
> between the agent and third-party systems. Removing `SCOPE_GUARD_LOCK` re-locks the backend
> without a rebuild.

Any way to bypass or silently disable the guard counts as a vulnerability — please report it
through the private channels described above.

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
