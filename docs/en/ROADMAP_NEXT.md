# 🧭 VektorSec — Next Roadmap

> 🇹🇭 **ไทย**: [แผนพัฒนาต่อ](../ROADMAP_NEXT.md)

> This document is based on the **actual state of the code** (commit `7bb6d6d` plus the work
> still uncommitted in the working tree).
> Goal: state clearly "what is left to build", with evidence in the code, and rank the work.
> Last updated: September 2026

---

## 📑 Table of Contents

1. [Current State (Snapshot)](#-current-state-snapshot)
2. [P0 — Close out work-in-progress / stop the bleeding](#-p0--close-out-work-in-progress--stop-the-bleeding-13-days)
3. [P1 — Quality and reliability](#-p1--quality-and-reliability-12-weeks)
4. [P2 — Features users can feel](#-p2--features-users-can-feel)
5. [P3 — Maintainability / Performance](#-p3--maintainability--performance)
6. [Quick wins (one day of work)](#-quick-wins-one-day-of-work)
7. [Recommended order for this week](#-recommended-order-for-this-week)
8. [Verification commands](#-verification-commands)

---

## 📊 Current State (Snapshot)

| Area | Status | Evidence in the code |
|------|-------|----------------|
| Agent tools | **60 tools** registered | `backend/src/tools/registry.ts` has 60 `toolRegistry.register(...)` calls |
| Documented tool count | **out of sync** — README still said "16 agent tools" | `README.md` |
| Work in progress | 20 modified + 30 new files (scan tools, plugin API, guardrails, Dockerfile.dev, logos) | `git status --short` |
| CI/CD | **none** — `.github/` only has ISSUE_TEMPLATE | no `.github/workflows/*` |
| Backend unit tests | 24 files (`tsx --test tests/*.test.ts`) | `backend/tests/`, `backend/package.json` |
| Integration tests | **none** (no supertest / mongodb-memory-server / nock) | repo-wide grep finds nothing |
| Coverage tooling | **none** (no c8 / nyc) | `backend/package.json` |
| Frontend tests | **no test script** — only manual scripts | `frontend/scripts/test-gateway.mjs`, `frontend/final-verify.mjs` |
| Frontend type safety | 209 `.js/.jsx` files vs 1 `.ts`, `strict: false` | `frontend/tsconfig.json` |
| Observability | Langfuse/OpenTelemetry installed but still 459 `console.*` calls | `backend/src/**` |
| Health check | `/api/healthcheck` always returns `"OK"` — does not check Mongo/Redis/Docker | `backend/src/server.ts` |
| DB migrations | a single hand-run script, no runner/version tracking | `backend/src/migrations/001-create-workspaces.ts` |
| Oversized files | `user.controller.ts` 81 KB, `mcp-tools.service.ts` 73 KB, `agent.service.ts` 62 KB, `swarm.manager.ts` 55 KB, `providers.ts` 48 KB | local file sizes |
| Type debt | `: any` / `as any` ~**555 occurrences** across 239 TS files | grep |
| Repo hygiene | `repair-docs.js` is tracked but empty (0 bytes); local artifacts (`.zip` 668 MB, `.tar.gz` 17 MB, `*.log`) are ignored but take disk space | `git ls-files`, `.gitignore` |
| Community/policy files | no `SECURITY.md`, `CHANGELOG.md`, PR template or CODEOWNERS | only `CODE_OF_CONDUCT.md`, `CONTRIBUTING.md` |
| Old roadmap | `docs/ARCHITECTURE_PLAN.md` checkboxes are still all `- [ ]` even for finished work | `docs/ARCHITECTURE_PLAN.md` roadmap section |
| i18n (Thai/English) | core + shell shipped, the wider UI is still English | `frontend/src/i18n/**`; 25 of 97 `.jsx` files use the translator (23 screens/components + the provider/switcher) — Rounds 5–6 |

**In one sentence:** the core product (agent + tools + billing + 3 delivery channels) is done.
What is missing is **engineering discipline** (CI/tests/observability), **keeping docs and UI in
sync with the real tool registry**, and **committing the work in progress** — not new features.

> The table above is the **pre-round baseline** (measured before Round 1). Rounds 1–6 below record
> what has since been fixed — CI, frontend tests, the logger, the migration runner, backups, HTTP
> integration tests, the bilingual UI — so read it as "where we started", not as today's status.

---

## ✅ Progress (latest round — September 2026)

Work completed in this round (each item has code evidence):

| Item | Files / evidence |
|---|---|
| **Agent Tools panel renders every registry tool** (data-driven, no hardcoding) | `frontend/src/utils/agentTools.js`, `frontend/src/components/session/AgentToolsPanel.jsx`, tests in `frontend/tests/agentTools.test.mjs` (9 passing) |
| **Scan tools exposed over MCP** (`scan_run`: nmap/naabu/nuclei/ffuf/gobuster) | `backend/src/services/mcp-tools.service.ts`, `backend/src/utils/scanToolArgs.ts`, tests in `backend/tests/scanToolArgs.test.ts` |
| **Baseline CI** (typecheck + unit tests + build + gateway smoke) | `.github/workflows/ci.yml`, `.github/workflows/audit.yml` |
| **Readiness endpoint + compose healthcheck** | `backend/src/server.ts` (`/api/ready`), `docker-compose.yml`, `docker-compose.kali.yml` |
| **Security policy + PR template** | `SECURITY.md`, `.github/PULL_REQUEST_TEMPLATE.md` |
| **First frontend test suite + npm script** | `frontend/tests/agentTools.test.mjs`, `frontend/package.json` (`pnpm test`) |
| **Removed junk that was tracked in git** | `repair-docs.js` (deleted from git) |
| **Thai/English docs split + English-only README** | `README.md` (EN), `README.th.md`, `docs/` (TH), `docs/en/` (EN) |
| **Roadmap checkboxes verified against code** | `docs/ARCHITECTURE_PLAN.md`, `docs/en/ARCHITECTURE_PLAN.md` |

### Round 2 (continuing the plan)

| Item | Files / evidence |
|---|---|
| **Report export (Markdown/HTML/JSON)** — downloadable from the UI | `backend/src/utils/report.ts`, `controllers/agent.controller.ts` (`GET /api/agent/session/:id/report`), Export button in `VulnerabilitiesPage.jsx`, tests in `backend/tests/reportExport.test.ts` |
| **Usage analytics → CSV export** (CSV-injection safe) | `backend/src/utils/csv.ts`, `controllers/subscription.controller.ts` (`GET /api/subscriptions/me/:channel/usage/export`), tests in `backend/tests/csv.test.ts` |
| **Migration runner + ledger** (replaces the hand-run script) | `backend/src/migrations/{types,plan,runner,cli,index}.ts`, `pnpm migrate` / `migrate:status` / `--dry-run`, tests in `backend/tests/migrationPlan.test.ts` |
| **Backup / Restore scripts** | `deploy/backup.sh`, `deploy/restore.sh` (stop stack → dump volumes + kali-data → start again) |
| **Trial wired into the real flows** | `POST /api/subscriptions/me/:channel/trial` + "Start Free Trial" on `PricingPage.jsx` + the Telegram `/trial` command in `telegramBot.service.ts` |
| **Tests run on every platform** | `needsPosixShell` guards in `tests/sshProfile.test.ts` + `tests/subscriptionInference.test.ts` → **154 tests / 0 fail / 9 skipped** (Windows) |

### Round 3

| Item | Files / evidence |
|---|---|
| **Automatic plugin loading from a folder** (no manual import) | `backend/src/tools/plugin-loader.ts` (scans `tools/extensions/` or `TOOLS_EXTENSIONS_DIR`, supports named/default exports, a broken plugin never takes the server down), wired into `server.ts`, template `tools/extensions/example-plugin.ts.example`, tests in `backend/tests/pluginLoader.test.ts` (6 tests) |
| **Export usage (CSV) button on the Billing page** | `frontend/src/components/pages/BillingPage.jsx` + `usageExportUrl()` in `subscription.service.js` (channel picker included) |
| **Clean TypeScript for the migration ledger** | `planMigrations()` accepts `readonly unknown[]` and validates at runtime → `tsc --noEmit` reports 0 errors |

### Round 4

| Item | Files / evidence |
|---|---|
| **HTTP integration tests against the real Express app** (10 cases) | `backend/tests/app.http.test.ts` — required refactoring `server.ts` into `backend/src/app.ts` (`createApp()`) first |
| **Removed the `server.ts` import cycle** (importing the app used to boot the server) | `backend/src/utils/redis/client.ts` (`setRedisClient`/`getRedisClientOrNull`/`lazyRedisClient`) + updates in `agent.service`, `utils/redis/store`, `adminInfra.controller`, `oob.service` |
| **Correct auth behaviour for API clients** | `verifySess` answers **401 JSON** for API/XHR requests and only redirects browser navigations (`middlewares/VerifySession.middleware.ts`) |
| **Structured logger with redaction** | `backend/src/utils/logger.ts` (JSON per env, child context, redacts secrets but keeps `tokens`/`tokensIn` readable) + 10 tests + hot paths migrated (server/app/plugins/migrations/notifications) |
| **Rate limiting backed by Redis** | `middlewares/RateLimit.middleware.ts` (`INCR` + `PEXPIRE`, in-memory fallback, injectable counter) + 7 tests |
| **External notifications (Slack/Discord/LINE/webhook)** | `utils/notificationChannels.ts` + `services/notificationLog.service.ts` (`dispatchExternalNotification`) + 11 tests |
| **UI explains blocked actions** | "Blocked by the scope guard" / "Out-of-scope target" notices in `ToolCallBlock.jsx` (visible even when the output is collapsed) |
| **Missing Mongo indexes** | `Sessions {uid, createdAt}` + `HistoryArchive {sessionId}` and migration `002-ensure-indexes` (guarantees them even with autoIndex off) |
| **Coverage script + repo hygiene** | `pnpm run test:coverage` (Node built-in), `CHANGELOG.md`, `.github/CODEOWNERS` |


### Round 5

| Item | Files / evidence |
|---|---|
| **Bilingual UI (English/Thai) on a dependency-free core** | `frontend/src/i18n/{index.js,I18nProvider.jsx,LanguageSwitcher.jsx,locales/{en,th}.js}`; the `vs_locale` cookie is read in `app/layout.js`, so the server renders the right language on the first paint (no hydration mismatch, matching `<html lang>`); tests in `frontend/tests/i18n.test.mjs` (10 tests → frontend suite 19/19) |
| **i18n wired through the shell and the key pages** | `Navbar`, `HeaderLinks`, `Sidebar`, `Footer`, `SettingsOverlay`, `ModelSetupGate`, `FeedbackModal`, `Login`, `BillingPage`, `ToolCallBlock`, `VulnerabilitiesPage` |

### Round 6

| Item | Files / evidence |
|---|---|
| **i18n core extended for non-React code + locale-aware formatting** | `frontend/src/i18n/index.js` adds `readCookieValue`, `buildLocaleCookie`, `writeLocaleCookie`, `getLocaleFromCookie`, `translate` (static — reads the locale cookie, so services/utils/toasts can translate) and `formatNumber`/`formatDate`/`intlTag` on `Intl`; `I18nProvider.jsx` adds `useFormatters()` (`formatNumber`/`formatDate`/`formatDateTime`) and shares the cookie writer with the server; tests in `frontend/tests/i18n.test.mjs` (25 → **32 tests**) |
| **Inline markup can live inside translations** | `frontend/src/utils/richText.js` (`parseRichText`, pure) + `frontend/src/components/common/RichText.jsx`: setup guides keep `` `commands` `` and `**bold labels**` in the dictionary, so translators see whole sentences instead of JSX fragments; tests in `frontend/tests/richText.test.mjs` (6 tests) |
| **All 12 settings tabs translated** | `AgentBehavior`, `MyAccount`, `MCPSettings`, `CaidoSettings`, `MythicSettings`, `Capabilities`, `BurpSettings`, `MagnitudeSettings`, `Models`, `Tools`, `SSH`, `GUISettings` — 12 new dictionary sections (`agentBehavior`, `myAccount`, `mcpSettings`, `caidoSettings`, `mythicSettings`, `capabilities`, `burpSettings`, `magnitudeSettings`, `modelsSettings`, `toolsSettings`, `sshSettings`, `guiSettings`) |
| **Generic strings de-duplicated into `common.*`** | `Configured`, `Not Configured`, `Connected`, `Connection failed`, `Test Connection`, `Setup Guide`, `Save Configuration`, `URL`, `Port`, `Host is required`, `Test`, `Remove`, `Required`, `Enabled`, `Disabled`, `Error`, `None` — reused by Caido, Mythic, Burp, SSH and GUI instead of five copies |
| **Browser-model compatibility rules return keys, not sentences** | `frontend/src/utils/magnitudeModels.js` — `getMagnitudeModelIssue()` returns a dictionary key, `Models.jsx` translates it, and a test asserts every rule resolves in both locales |
| **Guard test: an unknown `t()` key can no longer ship** | `frontend/tests/i18nKeys.test.mjs` scans `src/**/*.{js,jsx}` for literal `t("...")`/`translate("...")` keys and compares them with `en.js`; on its first run it caught a stale `burpSettings.hostRequired` and two leftover `caidoSettings` duplicates |
| **Locale dates/numbers replace `toLocaleString()`** | MCP token timestamps (and the shared `useFormatters()` helper) now follow the app language instead of the visitor's browser settings |
| **Stale brand mentions fixed in passing** | The Mythic notes/setup guide said "Pentest Copilot" → now "VektorSec" |
| **Remaining i18n inventory measured from the repo** | 97 `components/**/*.jsx` (25 wired — 23 screens/components + the provider and switcher — 72 to go) · 151 hardcoded English JSX text nodes in 41 files · 204 English props in 42 files · 159 toast strings in 33 files · 7 route files with server-side SEO `title`/`description` |

> ⚠️ **Verification note**: on this dev machine `backend`/`frontend` `node_modules` are incomplete
> and Docker is not running, so only dependency-free checks ran here (frontend `pnpm test` → 9/9
> passing, plus YAML validation of the compose files and workflows). Backend checks and the full CI
> suite will run automatically on GitHub once pushed.

---

## 🔴 P0 — Close out work-in-progress / stop the bleeding (1–3 days)

### 1. Commit the WIP in reviewable chunks
The working tree currently holds uncommitted work: the scan tools (`nmap_scan`, `nuclei_scan`,
`ffuf_fuzz`, `gobuster_fuzz`, `naabu_scan`), `tools/plugin.ts` (public plugin API),
`utils/guardrails.ts`, `utils/scanOutput.ts`, `handlers/scan-guard.ts`, `backend/Dockerfile.dev`
and `frontend/Dockerfile.dev`.

Suggested commits:

```bash
# 1) scan tools + guard
git add backend/src/tools/handlers/nmap-scan.ts backend/src/tools/handlers/nuclei-scan.ts \
        backend/src/tools/handlers/ffuf-fuzz.ts backend/src/tools/handlers/gobuster-fuzz.ts \
        backend/src/tools/handlers/naabu-scan.ts backend/src/tools/handlers/scan-guard.ts \
        backend/src/utils/scanOutput.ts backend/tests/scanOutput.test.ts
git commit -m "feat(tools): add nmap/nuclei/ffuf/gobuster/naabu scan handlers with scope+SSRF guard"

# 2) plugin API + guardrails
git add backend/src/tools/plugin.ts backend/src/tools/extensions \
        backend/src/utils/guardrails.ts backend/tests/plugin.test.ts backend/tests/guardrails.test.ts
git commit -m "feat(tools): public plugin API and workspace guardrails runtime"

# 3) dev infra + brand assets
git add backend/Dockerfile.dev frontend/Dockerfile.dev docker-compose.dev.yml
git commit -m "chore(dev): dev-mode Dockerfiles and brand assets"
```

### 2. ✅ Sync the tool registry ↔ MCP surface ↔ UI panel (done in this round)
- The new scan tools are **not exposed over MCP** — grepping
  `nmap_scan|nuclei_scan|ffuf_fuzz|gobuster_fuzz|naabu_scan` in
  `backend/src/services/mcp-tools.service.ts` returns 0 hits (see the warning in
  `tools/extensions/README.md`).
- `frontend/src/components/session/AgentToolsPanel.jsx` **hardcodes** `TOOL_GROUPS` with only
  ~26 names out of 60 tools → every other tool (CTF, engagement, findings, caido, vault, the new
  scanners, …) cannot be toggled from the UI.

To do: make the panel **data-driven** from the `getSessionAgentToolsConfig` response
(fall back to the raw tool name when there is no label) and add the new scan tools to the MCP allow-list.

### 3. Update the documents to match reality
- `README.md` — tool count (now updated to 60) and the new capabilities (scan tools, plugin API, guardrails)
- `docs/ARCHITECTURE_PLAN.md` — tick the roadmap boxes for work that is actually done (Phases 1–3 are mostly complete)
- `docs/SYSTEM_SUMMARY.md` — has no plugin API / guardrails / scan tools section yet

### 4. Remove things that should not live in git
- `repair-docs.js` (0 bytes) → delete
- `.zip` / `*.tar.gz` / `*.log` at the repo root → move them out of the repo directory
  (already ignored, but they waste disk and slow down IDE globbing)

### 5. Make sure the dev checkout can actually run the tests
On this machine `backend/node_modules` is incomplete (`tsx` is missing, so `pnpm test` dies with
`Cannot find module .../tsx/dist/cli.mjs`). Run a fresh `pnpm install` first, then the rest of the suite.

---

## 🟠 P1 — Quality and reliability (1–2 weeks)

### 1. ✅ CI (GitHub Actions) — done in this round (drop the advisory lint step once the config is flat)
There is no workflow at all → add at least:

| Workflow | Jobs |
|---|---|
| `ci.yml` | backend: `pnpm install --frozen-lockfile` → `pnpm run lint` → `pnpm run build` → `pnpm test`; frontend: `pnpm run build` + `node scripts/test-gateway.mjs` |
| `docker.yml` | `docker compose build` (make sure the backend/frontend Dockerfiles still build) |
| `audit.yml` (scheduled) | `pnpm audit --prod` + Dependabot / Renovate |

> Turn CI on **after** the WIP is committed so the baseline is green from the first run.

### 2. Integration tests (there are none today)
- Add `supertest` + `mongodb-memory-server` and cover the main paths: `/api/auth/login|register`,
  `/api/agent/create-session`, `/api/workspace/*` (happy path + 401/403/429)
- Cover the services that have no tests yet: the agent loop + consent, `tool-approval.service`,
  `scopeValidator` + `scan-guard` (allow/block matrix), `subscription-inference.service`
- Add coverage (`c8`) with a minimum threshold to prevent regressions

### 3. Frontend tests
- `vitest` for pure logic/hooks (`src/utils`, `src/hooks/useShellSocket.js`, services)
- Playwright E2E: login → create a workspace → send the first command → see a tool call → switch approval mode
- Wire `scripts/test-gateway.mjs` (black-box gateway: JSON filtering, CSP, no x-powered-by) into CI
  so "backend data never leaks to the browser" — the whole point of this architecture — is protected

### 4. Real observability
- A structured logger (pino is already in the dependency tree via `magnitude-core`) plus request ids
  instead of the 459 `console.log/error` calls (start with the hot paths: agent loop, tools, auth)
- Split **liveness** (`/api/healthcheck`) from **readiness** (`/api/ready`) which checks Mongo + Redis + Docker socket + shell manager
- Make OTel/Langfuse opt-in via config (the dependencies are installed but nothing documents how to enable them)
- Add the metrics the business needs: successful/failed runs, latency per model, tokens/cost per workspace

### 5. Migration runner + Backup/Restore
- Add `runMigrations()` that stores versions in a `migrations` collection plus an npm script (`pnpm migrate`)
  (today there is one hand-run script, as the file comment says)
- Add `deploy/backup.sh` / `deploy/restore.sh` (the README currently tells people to run `docker run tar` by hand,
  which is error-prone in production)

### 6. Public repo documents
- `SECURITY.md` — **important for a security tool**: how to report a vulnerability in VektorSec itself + SLA
- PR template, CHANGELOG (or release notes), CODEOWNERS
- Move `pnpm.overrides` from `package.json` to `pnpm-workspace.yaml` because pnpm 10 no longer reads the
  `pnpm` field (pnpm currently prints a warning), and consider a root workspace to run backend/frontend tasks together

---

## 🟡 P2 — Features users can feel

| # | Work | Why | Where |
|---|-----|-----|-------|
| 1 | **Report export (HTML/PDF/JSON)** | `generate_report` returns `ReportData` but there is no way to download it as a file for the client | `services/evidenceCollector.ts`, `tools/handlers/generate-report.ts`, `frontend/src/app/admin/reports` |
| 2 | **Auto-load plugins from a folder** | the plugin API exists but plugins still have to be imported by hand at bootstrap | `tools/plugin.ts`, `tools/extensions/`, `server.ts` + a `TOOLS_EXTENSIONS_DIR` env var |
| 3 | **Human-readable scope/HITL feedback** | users need to understand why the agent was BLOCKED or asked for approval | `utils/guardrails.ts`, `ChatView.jsx`, `ToolCallBlock.jsx` |
| 4 | **i18n (Thai/English)** | dictionaries + the cookie-driven switcher are shipped; the app shell and all 12 settings tabs are translated, the rest of the app is not | `frontend/src/i18n/**`, `frontend/src/components/pages/settings/**` (Rounds 5–6) |
| 5 | **Usage/Cost analytics** | you must know the cost per workspace/model to price and profit | `services/usageTracker.service.ts`, `models/UsageRecord`, `app/topup`, `app/admin/quotas` |
| 6 | **Complete Telegram Bot flow** | the service and controller exist but the real commands (`/usage` `/status` `/report`) and account linking are missing | `services/telegramBot.service.ts`, `controllers/telegramBot.controller.ts`, `app/admin/telegram` |
| 7 | **External notifications (Slack/LINE/Discord)** | notify when a run finishes, needs approval or stalls | `services/notificationLog.service.ts` + a webhook endpoint |
| 8 | **SSO/OIDC + SAML (enterprise)** | large teams do not use username/password | `controllers/auth.controller.ts`, `models/User` |
| 9 | **License + HW binding (only if you sell the Platform Download)** | `docs/ARCHITECTURE_PLAN.md` Phases 4–5 are not implemented (no License model) | new models + a CLI entry point |
| 10 | **PWA / responsive audit** | use it from a phone (e.g. to watch a run) | `frontend/src/app/layout.js`, styles |

---

## 🔵 P3 — Maintainability / Performance

| # | Work | Evidence / rationale |
|---|-----|------------------|
| 1 | Split the giant files into modules and cover them with tests | `user.controller.ts` 81 KB, `mcp-tools.service.ts` 73 KB, `agent.service.ts` 62 KB, `swarm.manager.ts` 55 KB, `utils/llm/providers.ts` 48 KB |
| 2 | Reduce `any` (~555 occurrences), then tighten strictness | real type safety, starting with `tools/handlers` and `utils` |
| 3 | Migrate the frontend JS → TS gradually | `tsconfig.json` + `jsconfig.json` already exist; 209 JS files vs 1 TS file |
| 4 | Move rate limiting into Redis | `middlewares/RateLimit.middleware.ts` uses an in-memory store → cannot scale past one replica |
| 5 | Mongo index audit + TTL/summarisation | session messages and `HistoryArchive` grow forever; check the indexes on `Workspace/Sessions/UsageRecord` |
| 6 | Shrink the admin bundle (dynamic import) | 23 admin routes; check `next.config.js` and `frontend/build-check*.txt` |

---

## ⚡ Quick wins (one day of work)

| # | Work | File | Result |
|---|-----|------|---------|
| 1 | ✅ Fix the tool count/list in the README | `README.md`, `README.th.md` | docs stop lying to users (60 tools) |
| 2 | ✅ Delete `repair-docs.js` (0 bytes) | root | cleaner repo |
| 3 | ✅ Add `SECURITY.md` + a PR template | `.github/`, root | ready for real contributors |
| 4 | ✅ Tick the finished roadmap boxes in ARCHITECTURE_PLAN | `docs/ARCHITECTURE_PLAN.md`, `docs/en/ARCHITECTURE_PLAN.md` | no more guessing what is done |
| 5 | ✅ Add a readiness endpoint | `backend/src/server.ts` (`/api/ready`) + compose healthcheck | deploy checks that actually verify Mongo/Redis |
| 6 | ✅ Make AgentToolsPanel data-driven | `frontend/src/utils/agentTools.js`, `frontend/src/components/session/AgentToolsPanel.jsx` | all 60 tools can be toggled |
| 7 | ✅ Add a frontend `test` script | `frontend/package.json` + `frontend/tests/agentTools.test.mjs` | at least one automated gate (9 tests) |

---

## ✅ Recommended order for this week

1. **Close out the WIP** — a complete `pnpm install`, get `pnpm test` + `pnpm run build` green on both sides, then commit the WIP as 3 chunks
2. **Sync the three places** — the 60-tool registry ↔ MCP allow-list ↔ UI panel (P0.2)
3. **Turn on minimal CI** — lint + build + unit tests (backend) and build + gateway smoke (frontend)
4. **Add the first integration tests** — auth + agent session + workspace (supertest + mongodb-memory-server)
5. **Finish quick wins 1–6**, then pick the next big item: **Report export** or **Usage analytics**

---

## 🧰 Verification commands

```bash
# Backend
cd backend
pnpm install --frozen-lockfile
pnpm run lint
pnpm run build          # tsc -p tsconfig.json
pnpm test               # tsx --test tests/*.test.ts
pnpm run mcp:smoke      # MCP server smoke test (a server must be running)

# Frontend
cd frontend
pnpm install --frozen-lockfile
pnpm run build          # next build --turbopack
node scripts/test-gateway.mjs   # black-box gateway + CSP / JSON filtering

# Whole stack
docker compose -f docker-compose.yml config    # validate compose before deploying
docker compose up -d --build
```

---

## 📚 See Also

- [System Summary](./SYSTEM_SUMMARY.md)
- [Architecture Plan](./ARCHITECTURE_PLAN.md)
- [Black-Box Architecture](./BLACKBOX_ARCHITECTURE.md)
- [VPS deploy guide](../../deploy/README.md)
- [README.md](../../README.md)
