# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project aims to follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- **Scope Guard can no longer be disabled in this distribution**: the target allowlist is
  verified before any security tool runs and stays enforced regardless of `SCOPE_ENABLED`
  (Admin → Scope writes are refused, a stale `SCOPE_ENABLED=0` is self-healed). Policy lives in
  `backend/src/utils/securityPolicy.ts`; operators can still *tighten* the guard (allowlist
  entries, strict mode), an enabled-but-empty workspace allowlist now falls back to the global
  guard instead of allowing everything, and the API/UI report `locked` for anyone who needs
  another build.

### Added

- **Scope Guard notice with a contact channel**: a blocked tool call explains why it was blocked
  and, in this locked build, where to ask for one without the guard; Admin → Security and
  Admin → Scope show the same policy and link (`frontend/src/constants/security.js`, i18n
  `guardrails.guardLocked` / `guardrails.guardContact`).
- **Unlocked (vendor) builds via an explicit flag**: `SCOPE_GUARD_LOCK=0` (backend runtime),
  `NEXT_PUBLIC_SCOPE_GUARD_LOCK=0` / `npm run build:unlocked` (frontend build) or
  `SCOPE_GUARD_LOCKED_IN_CODE = false` (fork) unlock the guard, so a customer build needs no code
  edit. Only `0`/`false`/`off`/`no` unlocks — anything else, including a typo, stays locked — and,
  since the unlock-token change below, a *licensed* build additionally needs a valid
  `SCOPE_GUARD_UNLOCK_TOKEN`. An unlocked instance warns at boot plus reports `locked: false` /
  a dedicated notice from `GET /api/admin/scope` (see `backend/src/utils/securityPolicy.ts`).
- **Scope Guard unlock tokens (third unlock condition)**: the flags alone no longer unlock a build —
  `SCOPE_GUARD_UNLOCK_TOKEN` must hold a token signed by the maintainers: `VEK1.<payload>.<sig>`
  (HMAC-SHA256, verified with `MASTER_SECRET_KEY`) or `VEK2.<payload>.<sig>` (Ed25519, verified with
  `MASTER_UNLOCK_PUBLIC_KEY`), bound to a client name (`sub`/`c`) plus `iat`/`exp`
  (`backend/src/utils/unlockToken.ts`). A missing, malformed, forged, wrong-key or expired token —
  or a missing verification key, or a UI built while still locked — keeps the guard ON and logs
  `WARN: Scope Guard unlock attempt failed — Invalid or missing UNLOCK_TOKEN`;
  `GET /api/admin/scope` now also returns a `scope.unlock` block (`attempted`, `lockFlagOff`,
  `uiBuildUnlocked`, `tokenPresent`, `tokenValid`, `tokenMode`, `tokenReason`, `tokenClient`,
  `tokenExpiresAt`, `reason`, `detail`, `message`) so the admin UI can explain *why* an instance is
  still locked: **Admin → Security** and **Admin → Scope** show a red *Scope Guard unlock attempt
  failed* card naming the missing condition (`scopeUnlockWarning()` in
  `frontend/src/constants/security.js`, covered by `frontend/tests/scopeUnlock.test.mjs`).
- **Tool plugins are auto-loaded** from `backend/src/tools/extensions/` (or `TOOLS_EXTENSIONS_DIR`):
  no manual import needed, broken plugins are skipped instead of crashing the server
  (`backend/src/tools/plugin-loader.ts`, template `example-plugin.ts.example`).
- **Report export**: `GET /api/agent/session/:id/report?format=markdown|html|json`, with an
  **Export report** button on the session Vulnerabilities page.
- **Usage CSV export**: `GET /api/subscriptions/me/:channel/usage/export?days=30` plus an
  **Export usage (CSV)** button (channel picker) on the Billing page.
- **Migrations**: runner with a `migrations` ledger, CLI (`pnpm migrate`,
  `pnpm migrate:status`, `--dry-run`) and a registry that refuses duplicate/out-of-order ids.
- **Backup / restore scripts**: `deploy/backup.sh`, `deploy/restore.sh` (volumes + `kali-data`).
- **External notifications**: Slack / Discord / LINE / generic webhook fan-out
  (`NOTIFY_WEBHOOK_URL`, `NOTIFY_WEBHOOK_KIND`, `NOTIFY_MIN_SEVERITY`, `NOTIFY_TYPES`).
- **Structured logging** with secret redaction (`backend/src/utils/logger.ts`) — startup, HTTP
  plumbing, plugins, migrations and notifications use it.
- **Rate limiting** now uses Redis (`INCR`/`PEXPIRE`) when available and falls back to the
  in-process counter, so limits are shared across replicas.
- **Rate limits are tunable**: `RATE_LIMIT_API_MAX`, `RATE_LIMIT_AUTH_MAX` and
  `RATE_LIMIT_AGENT_MAX` override the defaults (120 req/min, 20 per 15 min, 30/min) without a code
  change — invalid values keep the default, so a typo cannot disable a limiter
  (`backend/.env.example`, `docker-compose.dev.yml`).
- **Readiness probe** `GET /api/ready` (Mongo + Redis) — separate from the liveness check — and a
  matching compose healthcheck on the backend service.
- **CI** (`.github/workflows/ci.yml`): backend typecheck + unit tests (with a MongoDB service for
  the database/HTTP integration tests) and frontend unit tests + production build + black-box
  gateway smoke test; plus a scheduled dependency audit workflow.
- **Tests**: HTTP integration tests over the real Express app, database integration tests,
  plugin loader, logger, CSV, report export, migration planning and rate limiting.
- **Security policy** (`SECURITY.md`) and a pull-request template.
- **Docs**: manuals are split into Thai (`docs/`) and English (`docs/en/`); the root `README.md`
  is English-only with the Thai version in `README.th.md`.

- **Startup security posture log**: the backend now reports which `.env` file actually took effect
  (`<DATA_DIR>/.env`, i.e. `/srv/data/.env` in Docker — *not* the repo's `backend/.env`) and whether
  SSRF protection is active, and warns when no runtime env file exists or SSRF is disabled
  (`backend/src/utils/loadConfig.ts`, `backend/src/server.ts`).

### Changed

- **Docker images are versioned**: `docker-compose.yml` / `docker-compose.kali.yml` tag the images
  with the app version (`vektorsec-backend:1.0.1`, `vektorsec-frontend:0.1.1`) and pass it as the
  `APP_VERSION` build arg, which becomes the `org.opencontainers.image.version` label plus an
  `APP_VERSION` env var — so `docker compose images` and `docker exec <container> env | grep
  APP_VERSION` show which build a container is running. Versions bumped: backend `1.0.1`,
  frontend `0.1.1`, desktop `1.0.1`. Both compose files already build from source, so a
  `docker compose up -d --build` picks up every fix below.
- **`backend/src/server.ts` is now only the process lifecycle**: HTTP wiring moved to
  `backend/src/app.ts` (`createApp()`), and the shared Redis client to
  `backend/src/utils/redis/client.ts` — importing the API no longer boots the server, which is
  what makes the HTTP tests possible.
- `verifySess` returns **401 JSON** for API/XHR clients and keeps the login redirect for browser
  navigations (previously every anonymous request was redirected).

### Fixed

- **Output files were validated as scan targets**: `extractTargets()` matched every `name.ext`
  token against the domain regex, so `nmap -oN scan-fast.txt 10.0.0.5` was refused with
  `Target scan-fast.txt is OUT OF SCOPE` — and so were `> out.txt`, `| tee out.log` and a URL path
  such as `http://10.0.0.5/index.php` (matched `index.php`). Output-file flags (`-oN -oX -oG -oA
  -oS -oJ -oH -oM`, `-o`, `--output`, `--outfile`, `--output-dir`, `-w`, `--log`, `--report`, …),
  shell redirections (`>`, `>>`, `2>`, `2>&1`, `&>` — spaced and attached) and `tee` destinations
  are now stripped before extraction, local paths are ignored and URLs are reduced to their host.
  A value after an output flag that is *not* file-shaped is still validated, so a misplaced flag
  cannot hide a real target (`backend/src/utils/scopeValidator.ts`,
  `backend/tests/guardrails.test.ts`).
- **SSRF blocks were reported as scope violations**: `blockedTargetResult()` now returns a second
  line naming the real remedy (`SSRF_ENABLED=0` / Admin → Security) and states that adding the
  target to the scope allowlist does not lift it; the Admin → Scope / Admin → Security hints and
  the `guardrails.ssrfDetail` copy (en/th) say the same, so an allowlisted internal target no
  longer reads as *"my scope entry was not saved"* (`backend/src/utils/ssrfGuard.ts`,
  `frontend/src/components/pages/AdminSettingsPage.jsx`, `frontend/src/i18n/locales/*.js`).
- **Connecting a VPN profile returned an opaque `400` with no cause**: `POST /copilot/vpn/connect`
  resolved the session work host inside its outer `try`, so a session with no workspace (or an
  unresolvable workspace / SSH profile) fell through to the generic *"Failed to connect VPN"* and the
  UI only surfaced *"Request failed with status code 400"*. The host is now resolved explicitly, its
  failure is reported as `Work host unavailable - <reason>`, every failure is logged through the
  shared logger, and the outer catch includes the underlying reason instead of the generic message
  (`backend/src/controllers/vpn.controller.ts`).
- **Editing `backend/.env` had no effect in the developer stack**: `docker-compose.dev.yml` kept
  `/srv/data` on a named volume only, so the running backend read a *different* file
  (`/srv/data/.env` inside `backend-dev-data`) and the repo's `backend/.env` — the file
  Settings → SSH and the Admin UI rewrite in every other deployment — was silently ignored, which
  made a wrong/unreachable `SSH_HOST` look like "my change did nothing". The dev backend now
  bind-mounts `./backend/.env` onto `/srv/data/.env` exactly like `docker-compose.yml`
  (see also `wiki/TH-Troubleshooting.md` / `wiki/EN-Troubleshooting.md` for the
  `connect ECONNREFUSED` work-host case and WSL Kali guidance).
- **The agent looped on authorization questions instead of doing the work**: `ask_user` ended the
  run every time it was called, so a refusal-flavoured question ("is this target yours? do you have
  written authorization?") simply came back on the next turn — the operator answered and the agent
  asked again. Authorization is now treated as a platform setting rather than a chat negotiation:
  the system prompt gained an `<authorization>` section that forbids asking the user to prove
  ownership or to re-confirm scope and forbids repeating a question
  (`backend/src/utils/copilot/prompts.ts`), the injected `<authorized_scope>` block states that the
  allowlist *is* the operator's authorization (`backend/src/utils/guardrails.ts`), `ask_user`
  refuses an identical repeat (exit code 1) and caps questions per 30-minute session window
  (`backend/src/tools/handlers/generic-response.ts`), and such a refused repeat no longer ends the
  run so the agent keeps working (`backend/src/services/agent.service.ts`). Out-of-scope targets
  stay hard-blocked — the agent now reports the block instead of interrogating the operator.
- **The agent asked the operator to prove ownership when no allowlist existed**: the guardrail block
  was only emitted when a scope was enforced, so a run with no configured scope received *no*
  scope/authorization statement while the prompt still said "the scope list is your authorization".
  `buildGuardrailPromptBlock` now always emits something: with a scope it still emits
  `<authorized_scope>`, and with no allowlist it emits `<authorization_state>` stating that the
  operator's in-session request is the authorization, that the agent must not invent a permission
  gate, and that it may decline at most once with a concrete technical reason before continuing
  (`backend/src/utils/guardrails.ts`); the `<authorization>` prompt section distinguishes "scope list
  exists" from "no allowlist configured" and explicitly forbids asking for declarations such as
  "I own this site" or "I have a pentest contract" (`backend/src/utils/copilot/prompts.ts`).
- **Racer/swarm agents were outside the guardrail prompt and the workspace scope**: racer system
  prompts were assembled as `buildSystemPrompt + <racer_mode>` and their `ExecutionContext` omitted
  `guardrails`, so a racer neither saw the authorization/scope statement nor enforced a workspace
  allowlist (tool handlers fell back to the global default — a strict workspace scope could be
  silently skipped). Racer prompts now append the same guardrail block and their execution context
  carries the guardrails resolved for the session, threaded from `spawn_swarm`
  (`backend/src/services/swarm.manager.ts`, `backend/src/services/agent.tools.ts`).
- **SSRF blocks were mislabelled as scope-guard violations** in the session transcript: a target
  stopped by SSRF protection now gets its own notice with the correct remediation (turn SSRF
  protection off under Admin → Security) instead of "Blocked by the scope guard"
  (`frontend/src/components/pages/session/sessionId/ToolCallBlock.jsx`, new i18n keys
  `guardrails.ssrfTitle` / `guardrails.ssrfDetail`).
- **Free trial could be claimed repeatedly**: cancelling the trial (or letting a paid plan expire)
  allowed a new trial. A persisted `trialUsed` flag now makes the trial one-off per channel.
- **Agent Tools panel hid 34 of 60 tools**: it is now data-driven, so every registered tool appears
  (unknown tools fall back to an "Other tools" group).
- Rate-limit keys no longer grow without bound, and a failing Redis no longer breaks requests.
- **Redis rate limiting never actually used Redis**: the counter called `pexpire`/`pttl`, which
  node-redis v4 does not expose (the client has `PEXPIRE`/`PTTL`, like `utils/redis/store.ts`), so
  every request threw and silently fell back to the per-process counter — the limits were not
  shared between replicas and the log filled with warnings. The counter now uses the commands the
  installed client really has, with a regression test that checks them against `redis` itself
  (`backend/src/middlewares/RateLimit.middleware.ts`, `backend/tests/rateLimit.test.ts`).
  Buckets left behind by that bug without an expiry are repaired on the next request, so a stale
  counter cannot keep answering 429 for longer than one window.
- **Opening a deleted or archived session no longer floods the API**: the session layout treated a
  400/404 as a live session and kept polling — session info, vulnerabilities and the shell
  WebSocket — so the console filled with `Session not found`. It now stops polling and shows a
  translated "Session not available" screen with a link back to the workspaces
  (`frontend/src/app/session/[session_id]/layout.js`, `frontend/src/hooks/useShellSocket.js`).
- Notification/cron-style log lines no longer print credentials (`[REDACTED]` plus structured fields).
- **"SSH Connect" opened a shell inside the backend container**: a workspace that never picked a
  work host defaulted to `local`, so terminals and agent commands ran in the Pentest Copilot
  container even though Settings → SSH was configured and reachable — the Connection tab only
  showed a host after the default was saved by hand. A workspace with no stored `workHost` now
  inherits the legacy `SSH_*` box when it is configured and usable (files under
  `~/pentest-workspaces/<workspaceId>` on the remote), the Connection tab reports that effective
  host, and an unusable/unreadable SSH profile still degrades to the local host instead of
  breaking every command in the workspace (`backend/src/services/work-host.service.ts`,
  `backend/src/controllers/workspace.controller.ts`).
- **The shell panel now says where a terminal actually runs**: it shows the resolved host
  (`SSH · <profile>` vs `Local · container`), the button is labelled **Local Shell** and warns once
  when the session is local, with a shortcut to the Connection tab to pick an SSH host
  (`frontend/src/components/shells/ShellPanel.jsx`, `backend/src/services/shell.manager.ts`,
  `backend/src/services/shell.socket.ts`).
- **`Failed to spawn shell: (SSH) Channel open failure: open failed`**: aborting an agent command
  used to only settle the local call, so the remote process kept running and its SSH channel stayed
  open. sshd counts every shell *and* every command channel of a connection against `MaxSessions`
  (10 by default), so a few aborted long-running scans were enough for the work host to refuse the
  next terminal — and the UI/console showed ssh2's opaque error. Aborts, timeouts and `destroy()`
  now tear the remote channel down, channels are tracked per connection, a channel refused while
  another one is closing is retried once, a shell spawn that would exceed the per-session budget
  fails with an actionable message before sshd decides (`SSH_MAX_SHELLS_PER_SESSION`, default 8,
  `0` disables), and sshd's refusal is rewritten into a MaxSessions hint
  (`backend/src/services/shell.manager.ts`, `backend/tests/shellChannels.test.ts`).
- **A work host could still run out of SSH slots inside the box, not just in the app**: one
  connection competes for sshd's `MaxSessions` (10 by default) with *every* terminal and command
  channel, so a busy session used to reach the point where no new terminal could be opened at all
  (Connection tab, `SSH Connect` and agent commands all fail, and the legacy `POST
  /api/shell/test-ssh` probe times out at its 10s budget). The bundled Kali image now ships
  `MaxSessions 30`, so shells *and* commands have room; raise the same directive in
  `/etc/ssh/sshd_config` (or a `sshd_config.d` drop-in) of an external box (`kali/Dockerfile`).

### Security

- Secrets are redacted in every structured log event (password, token, API key, cookie, …) while
  usage counters such as `tokensIn` stay readable.
- CSV exports are protected against spreadsheet formula injection.
- Follow-up: `pnpm.overrides` should move to `pnpm-workspace.yaml` (pnpm 10 no longer reads the
  `pnpm` field; the project is pinned to pnpm 9.15.4 for now).
