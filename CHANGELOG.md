# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project aims to follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

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

### Changed

- **`backend/src/server.ts` is now only the process lifecycle**: HTTP wiring moved to
  `backend/src/app.ts` (`createApp()`), and the shared Redis client to
  `backend/src/utils/redis/client.ts` — importing the API no longer boots the server, which is
  what makes the HTTP tests possible.
- `verifySess` returns **401 JSON** for API/XHR clients and keeps the login redirect for browser
  navigations (previously every anonymous request was redirected).

### Fixed

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

### Security

- Secrets are redacted in every structured log event (password, token, API key, cookie, …) while
  usage counters such as `tokensIn` stay readable.
- CSV exports are protected against spreadsheet formula injection.
- Follow-up: `pnpm.overrides` should move to `pnpm-workspace.yaml` (pnpm 10 no longer reads the
  `pnpm` field; the project is pinned to pnpm 9.15.4 for now).
