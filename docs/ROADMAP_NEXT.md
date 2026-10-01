# 🧭 VektorSec — แผนพัฒนาต่อ (Next Roadmap)

> 🇬🇧 **English**: [Next Roadmap](./en/ROADMAP_NEXT.md)

> เอกสารนี้วิเคราะห์จาก **สถานะโค้ดจริง** (commit `7bb6d6d` + งานที่ยังไม่ commit ใน working tree)
> จุดประสงค์: บอกว่า "เหลืออะไรต้องพัฒนา" พร้อมหลักฐานอ้างอิงในโค้ด และลำดับความสำคัญ
> อัปเดตล่าสุด: กันยายน 2026

---

## 📑 สารบัญ

1. [สรุปสถานะปัจจุบัน (Snapshot)](#-สรุปสถานะปัจจุบัน-snapshot)
2. [P0 — ปิดงานค้าง / กันพัง](#-p0--ปิดงานค้าง--กันพัง-1-3-วัน)
3. [P1 — คุณภาพและความน่าเชื่อถือ](#-p1--คุณภาพและความน่าเชื่อถือ-1-2-สัปดาห์)
4. [P2 — ฟีเจอร์ที่ผู้ใช้เห็นผล](#-p2--ฟีเจอร์ที่ผู้ใช้เห็นผล)
5. [P3 — Maintainability / Performance](#-p3--maintainability--performance)
6. [Quick wins (ทำได้ใน 1 วัน)](#-quick-wins-ทำได้ใน-1-วัน)
7. [ลำดับที่แนะนำสำหรับสัปดาห์นี้](#-ลำดับที่แนะนำสำหรับสัปดาห์นี้)
8. [คำสั่งที่ใช้ตรวจสอบ (Verify)](#-คำสั่งที่ใช้ตรวจสอบ-verify)

---

## 📊 สรุปสถานะปัจจุบัน (Snapshot)

| ด้าน | สถานะ | หลักฐานในโค้ด |
|------|-------|----------------|
| Agent tools | **60 tools** ลงทะเบียนใน registry | `backend/src/tools/registry.ts` มี `toolRegistry.register(...)` 60 จุด |
| เอกสาร tool count | **ไม่ตรงกับจริง** — README ยังเขียน "16 agent tools" | `README.md` บรรทัด "16 agent tools" |
| งานค้าง (uncommitted) | 20 ไฟล์แก้ + 30 ไฟล์ใหม่ (scan tools, plugin API, guardrails, Dockerfile.dev, โลโก้) | `git status --short` |
| CI/CD | **ยังไม่มี** — `.github/` มีแค่ ISSUE_TEMPLATE | ไม่มี `.github/workflows/*` |
| Unit test (backend) | 24 ไฟล์ (`tsx --test tests/*.test.ts`) | `backend/tests/`, `backend/package.json` |
| Integration test | **ไม่มี** (ไม่มี supertest / mongodb-memory-server / nock) | grep ทั้งโปรเจกต์ไม่พบ |
| Coverage tooling | **ไม่มี** (ไม่มี c8 / nyc) | `backend/package.json` |
| Test (frontend) | **ไม่มี test script** — มีแค่สคริปต์รันมือ | `frontend/scripts/test-gateway.mjs`, `frontend/final-verify.mjs` |
| Type safety (frontend) | 209 ไฟล์ `.js/.jsx` vs 1 ไฟล์ `.ts`, `strict: false` | `frontend/tsconfig.json` |
| Observability | มี dep Langfuse/OpenTelemetry แต่ยังพึ่ง `console.*` 459 จุด | `backend/src/**` |
| Health check | `/api/healthcheck` ตอบ `"OK"` คงที่ ไม่เช็ค Mongo/Redis/Docker | `backend/src/server.ts` |
| DB migration | มีสคริปต์เดียว รันมือ ไม่มี runner/version tracking | `backend/src/migrations/001-create-workspaces.ts` |
| ไฟล์ขนาดใหญ่ | `user.controller.ts` 81 KB, `mcp-tools.service.ts` 73 KB, `agent.service.ts` 62 KB, `swarm.manager.ts` 55 KB, `providers.ts` 48 KB | ขนาดไฟล์ในเครื่อง |
| Type debt | `: any` / `as any` ~**555 จุด** ใน 239 ไฟล์ TS | grep |
| Repo hygiene | `repair-docs.js` ถูก track แต่ไฟล์ว่าง 0 byte; มี artifact ในเครื่อง (`.zip` 668 MB, `.tar.gz` 17 MB, `*.log`) ที่ถูก ignore แล้ว | `git ls-files`, `.gitignore` |
| ไฟล์ชุมชน/นโยบาย | ไม่มี `SECURITY.md`, `CHANGELOG.md`, PR template, CODEOWNERS | มีแค่ `CODE_OF_CONDUCT.md`, `CONTRIBUTING.md` |
| Roadmap เดิม | `docs/ARCHITECTURE_PLAN.md` checkbox ยัง `- [ ]` ทั้งหมดแม้ทำไปแล้ว | `docs/ARCHITECTURE_PLAN.md` หัวข้อ Roadmap |
| i18n ไทย/อังกฤษ | core + shell เสร็จแล้ว แต่ UI ส่วนที่เหลือยังเป็นอังกฤษ | `frontend/src/i18n/**`; มี 25 จาก 97 ไฟล์ `.jsx` ที่เรียกใช้ตัวแปล (23 หน้าจอ/คอมโพเนนต์ + provider/switcher) — รอบ 5–6 |

**อ่านสรุปสั้น ๆ:** ตัวระบบหลัก (agent + tools + billing + 3 ช่องทาง) ทำเสร็จแล้ว
สิ่งที่ขาดคือ **วินัยวิศวกรรม** (CI/test/observability), **การซิงก์เอกสาร-UI กับ registry ของจริง**,
และ **การปิดงานค้างที่ยังไม่ commit** — ไม่ใช่การสร้างฟีเจอร์ใหม่

> ตารางด้านบนคือ **ภาพก่อนเริ่มรอบงาน** (วัดก่อนรอบที่ 1) ส่วนรอบที่ 1–6 ด้านล่างบันทึกสิ่งที่แก้ไปแล้ว
> — CI, เทสต์ฝั่ง frontend, logger, migration runner, backup, HTTP integration test และ UI สองภาษา —
> จึงควรอ่านเป็น "จุดเริ่มต้น" ไม่ใช่สถานะปัจจุบัน

---

## ✅ ความคืบหน้า (รอบล่าสุด — กันยายน 2026)

งานที่ทำเสร็จแล้วในรอบนี้ (มีหลักฐานในโค้ด):

| งาน | ไฟล์ / หลักฐาน |
|---|---|
| **Agent Tools panel แสดงทุก tool จาก registry** (data-driven ไม่ hardcode) | `frontend/src/utils/agentTools.js`, `frontend/src/components/session/AgentToolsPanel.jsx`, เทสต์ `frontend/tests/agentTools.test.mjs` (9 tests ผ่าน) |
| **เปิดเครื่องมือสแกนให้ MCP ใช้ได้** (`scan_run`: nmap/naabu/nuclei/ffuf/gobuster) | `backend/src/services/mcp-tools.service.ts`, `backend/src/utils/scanToolArgs.ts`, เทสต์ `backend/tests/scanToolArgs.test.ts` |
| **CI พื้นฐาน** (typecheck + unit test + build + gateway smoke) | `.github/workflows/ci.yml`, `.github/workflows/audit.yml` |
| **Readiness endpoint + compose healthcheck** | `backend/src/server.ts` (`/api/ready`), `docker-compose.yml`, `docker-compose.kali.yml` |
| **นโยบายความปลอดภัย + PR template** | `SECURITY.md`, `.github/PULL_REQUEST_TEMPLATE.md` |
| **เทสต์ฝั่ง frontend ชุดแรก + npm script** | `frontend/tests/agentTools.test.mjs`, `frontend/package.json` (`pnpm test`) |
| **ลบไฟล์ขยะที่ track ไว้** | `repair-docs.js` (ลบออกจาก git แล้ว) |
| **เอกสารแยกไทย/อังกฤษ + README อังกฤษทั้งหมด** | `README.md` (EN), `README.th.md`, `docs/` (TH), `docs/en/` (EN) |
| **ติ๊กสถานะ roadmap ตามโค้ดจริง** | `docs/ARCHITECTURE_PLAN.md`, `docs/en/ARCHITECTURE_PLAN.md` |

### รอบที่ 2 (ลุยต่อตามแผน)

| งาน | ไฟล์ / หลักฐาน |
|---|---|
| **Report export (Markdown/HTML/JSON)** — ดาวน์โหลดได้จริงจาก UI | `backend/src/utils/report.ts`, `controllers/agent.controller.ts` (`GET /api/agent/session/:id/report`), ปุ่ม Export ใน `VulnerabilitiesPage.jsx`, เทสต์ `backend/tests/reportExport.test.ts` |
| **Usage analytics → CSV export** (กัน CSV injection) | `backend/src/utils/csv.ts`, `controllers/subscription.controller.ts` (`GET /api/subscriptions/me/:channel/usage/export`), เทสต์ `backend/tests/csv.test.ts` |
| **Migration runner + ledger** (แทนสคริปต์รันมือ) | `backend/src/migrations/{types,plan,runner,cli,index}.ts`, `pnpm migrate` / `migrate:status` / `--dry-run`, เทสต์ `backend/tests/migrationPlan.test.ts` |
| **สคริปต์ Backup / Restore** | `deploy/backup.sh`, `deploy/restore.sh` (หยุด stack → dump volumes + kali-data → start กลับ) |
| **ต่อ trial เข้า flow จริง** | `POST /api/subscriptions/me/:channel/trial` + ปุ่ม "Start Free Trial" ใน `PricingPage.jsx` + คำสั่ง `/trial` ใน `telegramBot.service.ts` |
| **เทสต์รันได้จริงทุก platform** | ใส่ `needsPosixShell` guard ใน `tests/sshProfile.test.ts` + `tests/subscriptionInference.test.ts` → **154 tests / 0 fail / 9 skipped** (Windows) |

### รอบที่ 3

| งาน | ไฟล์ / หลักฐาน |
|---|---|
| **โหลด plugin อัตโนมัติจากโฟลเดอร์** (เลิก import มือ) | `backend/src/tools/plugin-loader.ts` (สแกน `tools/extensions/` หรือ `TOOLS_EXTENSIONS_DIR`, รองรับ named/default export, plugin พังไม่ล้ม server), เรียกใช้ใน `server.ts`, template `tools/extensions/example-plugin.ts.example`, เทสต์ `backend/tests/pluginLoader.test.ts` (6 tests) |
| **ปุ่ม Export usage (CSV) ในหน้า Billing** | `frontend/src/components/pages/BillingPage.jsx` + `usageExportUrl()` ใน `subscription.service.js` (เลือก channel ได้) |
| **TS type ของ migration ledger สะอาด** | `planMigrations()` รับ `readonly unknown[]` + ตรวจรูปทรงตอน runtime → `tsc --noEmit` ผ่าน 0 errors |

### รอบที่ 4

| งาน | ไฟล์ / หลักฐาน |
|---|---|
| **HTTP integration test กับ Express จริง** (10 เคส) | `backend/tests/app.http.test.ts` — ต้อง refactor `server.ts` → `backend/src/app.ts` (`createApp()`) ก่อน |
| **ตัด import วงจร `server.ts`** (import app = boot server เดิม) | `backend/src/utils/redis/client.ts` (`setRedisClient`/`getRedisClientOrNull`/`lazyRedisClient`) + อัปเดต `agent.service`, `utils/redis/store`, `adminInfra.controller`, `oob.service` |
| **แก้พฤติกรรม auth ให้ถูกต้อง** | `verifySess` ตอบ **401 JSON** ให้ API/XHR และ redirect เฉพาะ browser navigation (`middlewares/VerifySession.middleware.ts`) |
| **Structured logger + redaction** | `backend/src/utils/logger.ts` (JSON ตาม env, child context, redact secret แต่ไม่ปิด `tokens`/`tokensIn`) + เทสต์ 10 เคส + ย้าย hot path (server/app/plugins/migrations/notifications) |
| **Rate limit ใช้ Redis ได้** | `middlewares/RateLimit.middleware.ts` (`INCR`+`PEXPIRE`, fallback in-memory, injectable counter) + เทสต์ 7 เคส |
| **แจ้งเตือนภายนอก Slack/Discord/LINE/webhook** | `utils/notificationChannels.ts` + `services/notificationLog.service.ts` (`dispatchExternalNotification`) + เทสต์ 11 เคส |
| **UI อธิบายการถูกบล็อก** | ป้าย "Blocked by the scope guard" / "Out-of-scope target" ใน `ToolCallBlock.jsx` (มองเห็นได้แม้พับ output) |
| **Mongo index ที่ขาด** | `Sessions {uid, createdAt}` + `HistoryArchive {sessionId}` + migration `002-ensure-indexes` (การันตี index แม้ปิด autoIndex) |
| **Coverage script + repo hygiene** | `pnpm run test:coverage` (Node built-in), `CHANGELOG.md`, `.github/CODEOWNERS` |


### รอบที่ 5

| งาน | ไฟล์ / หลักฐาน |
|---|---|
| **UI สองภาษา (อังกฤษ/ไทย) บน core ที่ไม่พึ่ง dependency** | `frontend/src/i18n/{index.js,I18nProvider.jsx,LanguageSwitcher.jsx,locales/{en,th}.js}` + อ่านคุกกี้ `vs_locale` ใน `app/layout.js` (server เรนเดอร์ภาษาที่ถูกตั้งแต่ paint แรก ไม่มี hydration mismatch และ `<html lang>` ตรงกัน) + เทสต์ `frontend/tests/i18n.test.mjs` (10 tests → รวมชุด frontend 19/19 ผ่าน) |
| **ต่อ i18n เข้า shell และหน้าหลัก** | `Navbar`, `HeaderLinks`, `Sidebar`, `Footer`, `SettingsOverlay`, `ModelSetupGate`, `FeedbackModal`, `Login`, `BillingPage`, `ToolCallBlock`, `VulnerabilitiesPage` |

### รอบที่ 6

| งาน | ไฟล์ / หลักฐาน |
|---|---|
| **ขยาย core ของ i18n ให้ใช้ได้นอก React + จัดรูปแบบตาม locale** | `frontend/src/i18n/index.js` เพิ่ม `readCookieValue`, `buildLocaleCookie`, `writeLocaleCookie`, `getLocaleFromCookie`, `translate` (อ่านคุกกี้ locale จึงใช้แปลใน service/utils/toast ได้) และ `formatNumber`/`formatDate`/`intlTag` บน `Intl`; `I18nProvider.jsx` เพิ่ม `useFormatters()` (`formatNumber`/`formatDate`/`formatDateTime`) และใช้ตัวเขียนคุกกี้ร่วมกับฝั่ง server; เทสต์ `frontend/tests/i18n.test.mjs` (25 → **32 tests**) |
| **ใส่ markup ไว้ในคำแปลได้** | `frontend/src/utils/richText.js` (`parseRichText` แบบ pure) + `frontend/src/components/common/RichText.jsx`: คู่มือ setup เก็บ `` `คำสั่ง` `` และ `**ข้อความตัวหนา**` ไว้ใน dictionary ทำให้นักแปลเห็นประโยคครบทั้งประโยค ไม่ต้องแยกเป็น JSX; เทสต์ `frontend/tests/richText.test.mjs` (6 tests) |
| **แปลครบทั้ง 12 แท็บของ Settings** | `AgentBehavior`, `MyAccount`, `MCPSettings`, `CaidoSettings`, `MythicSettings`, `Capabilities`, `BurpSettings`, `MagnitudeSettings`, `Models`, `Tools`, `SSH`, `GUISettings` — เพิ่ม section ใหม่ 12 ชุด (`agentBehavior`, `myAccount`, `mcpSettings`, `caidoSettings`, `mythicSettings`, `capabilities`, `burpSettings`, `magnitudeSettings`, `modelsSettings`, `toolsSettings`, `sshSettings`, `guiSettings`) |
| **รวมคำซ้ำไปที่ `common.*`** | `Configured`, `Not Configured`, `Connected`, `Connection failed`, `Test Connection`, `Setup Guide`, `Save Configuration`, `URL`, `Port`, `Host is required`, `Test`, `Remove`, `Required`, `Enabled`, `Disabled`, `Error`, `None` — ใช้ร่วมกันใน Caido, Mythic, Burp, SSH และ GUI แทนที่จะมี 5 ชุด |
| **กฎความเข้ากันได้ของโมเดลบราวเซอร์คืนค่าเป็น key ไม่ใช่ประโยค** | `frontend/src/utils/magnitudeModels.js` — `getMagnitudeModelIssue()` คืนค่าเป็น key ของ dictionary, `Models.jsx` เป็นตัวแปล และมีเทสต์ยืนยันว่าทุกกฎมีคำแปลครบทั้งสองภาษา |
| **Guard test: คีย์ `t()` ที่ไม่มีในพจนานุกรมหลุดไปไม่ได้อีก** | `frontend/tests/i18nKeys.test.mjs` สแกน `src/**/*.{js,jsx}` หาคีย์ `t("...")`/`translate("...")` แบบ literal แล้วเทียบกับ `en.js` — รันครั้งแรกก็เจอ `burpSettings.hostRequired` ที่ตกค้าง และคีย์ `caidoSettings` ซ้ำ 2 ตัว |
| **วันที่/ตัวเลขตาม locale แทน `toLocaleString()`** | เวลาสร้าง/ใช้ล่าสุดของโทเคน MCP (และตัวช่วย `useFormatters()`) ใช้ภาษาของแอป ไม่ใช่ค่าที่ตั้งในบราวเซอร์ของผู้เข้าชม |
| **แก้ชื่อแบรนด์ตกค้างที่เจอระหว่างทาง** | ข้อความ notes/คู่มือ Mythic เขียนว่า "Pentest Copilot" → เปลี่ยนเป็น "VektorSec" |
| **สรุปงาน i18n ที่เหลือจากข้อมูลจริงใน repo** | `components/**/*.jsx` 97 ไฟล์ (ต่อแล้ว 25 — 23 หน้าจอ/คอมโพเนนต์ + provider และ switcher — เหลือ 72) · ข้อความอังกฤษ hardcode 151 จุดใน 41 ไฟล์ · prop อังกฤษ 204 จุดใน 42 ไฟล์ · ข้อความ toast 159 จุดใน 33 ไฟล์ · 7 route ที่มี SEO `title`/`description` ฝั่ง server |

### รอบที่ 7

| งาน | ไฟล์ / หลักฐาน |
|---|---|
| **แปล session chat ครบทั้งชุด** | `ChatView`, `ChatMessage`, `ChatInput`, `ConsentBanner`, `IterationLimitBanner`, `InstallSuggestionBanner` — เพิ่ม section `chat.*` (~60 คีย์ ซ้อนเป็น `chat.slash.*`, `chat.consent.*`, `chat.iteration.*`, `chat.install.*`); ค่าที่เปลี่ยนตาม runtime ใช้ placeholder (`{limit}`, `{count}`, `{label}`, `{value}`, `{duration}`) |
| **ตัวเลขในแชทใช้ภาษาของแอป** | ใช้ `useFormatters().formatNumber` กับความยาว reasoning และคะแนนโจทย์ CTF/`to flag`; ใช้ `common.somethingWentWrong`, `common.retry`, `common.unknown` ร่วมกันแทนการเพิ่มคีย์ซ้ำ |
| **Guard test ตรวจคีย์ที่ซ่อนอยู่ในพร็อพด้วย** | `frontend/tests/i18nKeys.test.mjs` สแกนพร็อพแบบ `titleKey: "chat.consent.x"` เพิ่ม (คีย์ที่ถูกเรียกผ่าน `t()` ทีหลัง) และกฎสรุปของ ConsentBanner เรียก `t()` ตรง ๆ จึงครอบคลุมด้วยการสแกนเดิม |
| **commit งานรอบ 1–5 เป็นชุดที่รีวิวได้** | 9 commit: แบรนด์ + แพตช์ Ant Design v5 → Agent Tools panel + ชุดเทสต์ frontend ชุดแรก → หน้า workspace/chat/session → CI/community/compose/deploy → เครื่องมือสแกน → plugin loader → runtime hardening (logger, แยก redis, rate limit, notification, migration) → report/CSV/trial/workspace → auth bootstrap |
| **ผลตรวจสอบบนเครื่องนี้เขียวอีกครั้ง** | backend `pnpm test` → **211 tests / 188 pass / 0 fail / 23 skipped**; frontend `pnpm test` → **33/33**; frontend `next build` → "Compiled successfully" |
| **`pnpm test` ไม่ค้างอีกแล้ว** | `backend/package.json` รัน suite ด้วย `--test-timeout=60000 --test-force-exit`: เดิมตัวรันค้างรอ open handle หลังเทสต์ตัวสุดท้ายจบ |
| **ความสะอาดของ repo** | ลบ `repair-docs.js` (0 ไบต์); ignore ไฟล์ภาพ JPEG ต้นฉบับ ~1.6 MB ใน `.gitignore` แต่ยัง commit ไฟล์เวกเตอร์ (`vektorsec-logo.svg`, `logo/gemini-svg.svg`) |
| **ข้อจำกัดของรอบนี้** | ข้อความคำขอ Burp/Caido ที่แชทส่งให้ agent ยังเป็นภาษาอังกฤษโดยตั้งใจ: `ChatMessage.detectBurpMeta()` อ่าน `Analyze and pentest …` / `Target:` กลับจากบทสนทนา ถ้าแปลจะทำให้พรีวิวไฟล์แนบพัง |
| **สถานะ i18n หลังรอบนี้** | `frontend/src` มี `.jsx` 97 ไฟล์ (ต่อ i18n แล้ว 31 — 25 + คอมโพเนนต์แชท 6 ตัว — เหลือ 66) · ข้อความ hardcode 151 จุดใน 41 ไฟล์ · prop อังกฤษ 204 จุดใน 42 ไฟล์ · ข้อความ toast 159 จุดใน 33 ไฟล์ (ปลดล็อกแล้วด้วย `translate()` ที่ใช้นอก React ได้) · 7 route ที่มี SEO title/description ฝั่ง server |

> ✅ **ผลตรวจสอบบนเครื่องนี้ (กันยายน 2026)**: backend `pnpm test` → 211 tests / 188 pass / 0 fail /
> 23 skipped (ที่ skip ต้องมี `MONGO_TEST_URI` หรือ POSIX shell); frontend `pnpm test` → 33/33;
> frontend `next build --turbopack` → "Compiled successfully" และ `Generating static pages (40/40)`
> ส่วนการตรวจด้วย Docker (compose build) ยังต้องรันใน CI

---

## 🔴 P0 — ปิดงานค้าง / กันพัง (1–3 วัน)

### 1. ✅ Commit งาน WIP ให้เป็นชุดที่รีวิวได้ — ทำเสร็จในรอบนี้
working tree ตอนนี้มีงานใหม่ที่ยังไม่เข้า git: เครื่องมือสแกน (`nmap_scan`, `nuclei_scan`, `ffuf_fuzz`,
`gobuster_fuzz`, `naabu_scan`), `tools/plugin.ts` (public plugin API), `utils/guardrails.ts`,
`utils/scanOutput.ts`, `handlers/scan-guard.ts`, `backend/Dockerfile.dev`, `frontend/Dockerfile.dev`

**สถานะ (รอบที่ 7): ทำเสร็จแล้ว** — commit 9 ชุด (ดูรอบที่ 7) ส่วนการแบ่ง commit ด้านล่างเป็นแผนเดิม
เก็บไว้เป็นข้อมูลอ้างอิง

แนะนำแบ่ง commit:

```bash
# 1) เครื่องมือสแกน + guard
git add backend/src/tools/handlers/nmap-scan.ts backend/src/tools/handlers/nuclei-scan.ts \
        backend/src/tools/handlers/ffuf-fuzz.ts backend/src/tools/handlers/gobuster-fuzz.ts \
        backend/src/tools/handlers/naabu-scan.ts backend/src/tools/handlers/scan-guard.ts \
        backend/src/utils/scanOutput.ts backend/tests/scanOutput.test.ts
git commit -m "feat(tools): add nmap/nuclei/ffuf/gobuster/naabu scan handlers with scope+SSRF guard"

# 2) Plugin API + guardrails
git add backend/src/tools/plugin.ts backend/src/tools/extensions \
        backend/src/utils/guardrails.ts backend/tests/plugin.test.ts backend/tests/guardrails.test.ts
git commit -m "feat(tools): public plugin API and workspace guardrails runtime"

# 3) infra dev + brand assets
git add backend/Dockerfile.dev frontend/Dockerfile.dev docker-compose.dev.yml
git commit -m "chore(dev): dev-mode Dockerfiles and brand assets"
```

### 2. ✅ ซิงก์ tool registry ↔ MCP surface ↔ UI panel (ทำเสร็จในรอบนี้)
- เครื่องมือสแกนใหม่ **ไม่ถูก expose ผ่าน MCP** — grep `nmap_scan|nuclei_scan|ffuf_fuzz|gobuster_fuzz|naabu_scan`
  ใน `backend/src/services/mcp-tools.service.ts` = 0 ผลลัพธ์ (เอกสาร `tools/extensions/README.md` เตือนไว้แล้ว)
- `frontend/src/components/session/AgentToolsPanel.jsx` **hardcode** `TOOL_GROUPS` แค่ ~26 ชื่อจาก 60 tools
  → tool ที่เหลือ (CTF, engagement, findings, caido, vault, scan ใหม่ ฯลฯ) ผู้ใช้เปิด/ปิดผ่าน UI ไม่ได้

งานที่ต้องทำ: ทำ panel ให้ **data-driven** จาก response ของ `getSessionAgentToolsConfig`
(ชื่อไหนไม่มี label ให้ fallback เป็นชื่อ tool) + เพิ่ม tool สแกนใหม่ใน MCP allow-list

### 3. อัปเดตเอกสารให้ตรงกับของจริง
- `README.md` — tool count (16 → 60) และ capability ใหม่ (scan tools, plugin API, guardrails)
- `docs/ARCHITECTURE_PLAN.md` — roadmap checkbox ติ๊กตามงานที่ทำจริง (Phase 1–3 เสร็จส่วนใหญ่)
- `docs/SYSTEM_SUMMARY.md` — ยังไม่มีส่วน plugin API / guardrails / scan tools

### 4. ลบ/ย้ายของที่ไม่ควรอยู่ใน git
- `repair-docs.js` (0 byte) → ลบ
- `.zip` / `*.tar.gz` / `*.log` ที่ root → ย้ายออกจาก repo dir (ถูก ignore แล้วแต่กินดิสก์ + ทำให้ IDE ช้า)
- **สถานะ (รอบที่ 7): ✅** ลบ `repair-docs.js` ออกจาก git แล้ว และ ignore ไฟล์ภาพ JPEG ต้นฉบับ
  ~1.6 MB ใต้ `logo/` และ `frontend/public/logo/` — commit เฉพาะไฟล์เวกเตอร์ ส่วนไฟล์ archive ที่ราก
  repo ยังควรเก็บกวาดอีกรอบ

### 5. ✅ ตรวจว่าเครื่อง dev รัน test ได้จริง — รันได้แล้ว
เครื่องปัจจุบัน `backend/node_modules` ไม่ครบ (`tsx` หาย → `pnpm test` ล้มด้วย
`Cannot find module .../tsx/dist/cli.mjs`) ต้อง `pnpm install` ใหม่ก่อนแล้วจึงรันชุดที่เหลือ — ตอนนี้รันผ่านครบ:
`backend` → 211 tests / 188 pass / 0 fail / 23 skipped, `frontend` → 33/33

ตัวรันยังค้าง *หลัง* เทสต์ตัวสุดท้ายจบด้วย (open handle ทำให้โปรเซสไม่ยอมจบ) สคริปต์เทสต์จึงส่ง
`--test-timeout=60000 --test-force-exit` ให้ `pnpm test` ออกเองได้

---

## 🟠 P1 — คุณภาพและความน่าเชื่อถือ (1–2 สัปดาห์)

### 1. ✅ CI (GitHub Actions) — ทำเสร็จในรอบนี้ (ลบขั้นตอน lint ออกเมื่อย้ายเป็น flat config แล้ว)
ยังไม่มี workflow เลย → เพิ่มอย่างน้อย:

| Workflow | งาน |
|---|---|
| `ci.yml` | backend: `pnpm install --frozen-lockfile` → `pnpm run lint` → `pnpm run build` → `pnpm test`; frontend: `pnpm run build` + `node scripts/test-gateway.mjs` |
| `docker.yml` | `docker compose build` (ตรวจ Dockerfile backend/frontend ไม่พัง) |
| `audit.yml` (ตามเวลา) | `pnpm audit --prod` + Dependabot / Renovate |

> เปิด CI **หลัง**ปิดงาน WIP เพื่อให้ baseline เป็นสีเขียวตั้งแต่ commit แรก

### 2. Integration test (ตอนนี้ไม่มีเลย)
- เพิ่ม `supertest` + `mongodb-memory-server` เทสต์เส้นทางหลัก: `/api/auth/login|register`,
  `/api/agent/create-session`, `/api/workspace/*` (happy path + 401/403/429)
- เพิ่มเทสต์ service ที่ยังไม่มี: agent loop + consent, `tool-approval.service`,
  `scopeValidator` + `scan-guard` (ชุด block/allow), `subscription-inference.service`
- เพิ่ม coverage (`c8`) + threshold ขั้นต่ำ เพื่อกันการถอยหลัง

### 3. Frontend test
- `vitest` สำหรับ pure logic/hooks (`src/utils`, `src/hooks/useShellSocket.js`, services)
- Playwright E2E: login → สร้าง workspace → ส่งคำสั่งแรก → เห็น tool call → สลับโหมด approval
- ผูก `scripts/test-gateway.mjs` (black-box gateway: JSON filtering, CSP, ไม่มี x-powered-by) เข้า CI
  เพื่อกัน "ข้อมูลหลุดจาก backend ไปเบราว์เซอร์" ซึ่งเป็นจุดขายของสถาปัตยกรรมนี้

### 4. Observability จริงจัง
- structured logger (pino มีใน dependency tree ผ่าน `magnitude-core`) + request id
  แทน `console.log/error` 459 จุด (เริ่มจาก hot path: agent loop, tools, auth)
- แยก **liveness** (`/api/healthcheck`) กับ **readiness** (`/api/ready`) ที่เช็ค Mongo + Redis + Docker socket + shell manager
- เสียบ OTel/Langfuse เป็นสวิตช์ใน config (dependency ติดตั้งไว้แล้วแต่ยังไม่มีเอกสารวิธีเปิดใช้)
- เพิ่ม metric ที่ธุรกิจใช้: run สำเร็จ/ล้มเหลว, latency ต่อ model, token/ค่าใช้จ่ายต่อ workspace

### 5. Migration runner + Backup/Restore
- `runMigrations()` เก็บ version ใน collection `migrations` + npm script (`pnpm migrate`)
  (ปัจจุบันมีสคริปต์เดียวรันมือ ตามคอมเมนต์ในไฟล์)
- สคริปต์ `deploy/backup.sh` / `deploy/restore.sh` (ตอนนี้ README ให้รัน `docker run tar` มือ ๆ ซึ่งเสี่ยงตอน production)

### 6. เอกสารสาธารณะของ repo
- `SECURITY.md` — **สำคัญสำหรับเครื่องมือ security**: ช่องทางแจ้งช่องโหว่ของตัว VektorSec เอง + SLA
- PR template, CHANGELOG (หรือ release notes), CODEOWNERS
- ย้าย `pnpm.overrides` จาก `package.json` → `pnpm-workspace.yaml` เพราะ pnpm 10 ไม่อ่าน field `pnpm` แล้ว
  (มี warning ตอนรัน pnpm) และพิจารณาทำ root workspace เพื่อสั่งงาน backend/frontend พร้อมกัน

---

## 🟡 P2 — ฟีเจอร์ที่ผู้ใช้เห็นผล

| # | งาน | ทำไมต้องมี | จุดที่ต้องแตะ |
|---|-----|-----------|----------------|
| 1 | **Report export (HTML/PDF/JSON)** | `generate_report` คืน `ReportData` แต่ยังไม่มีทางดาวน์โหลดเป็นไฟล์ให้ลูกค้า | `services/evidenceCollector.ts`, `tools/handlers/generate-report.ts`, `frontend/src/app/admin/reports` |
| 2 | **โหลด plugin อัตโนมัติจากโฟลเดอร์** | plugin API พร้อมแล้ว แต่ยังต้อง import มือใน bootstrap | `tools/plugin.ts`, `tools/extensions/`, `server.ts` + env `TOOLS_EXTENSIONS_DIR` |
| 3 | **Scope/HITL feedback ที่อ่านรู้เรื่อง** | ผู้ใช้ต้องเข้าใจว่าทำไม agent ถูก BLOCK หรือถูกขออนุมัติ | `utils/guardrails.ts`, `ChatView.jsx`, `ToolCallBlock.jsx` |
| 4 | **i18n ไทย/อังกฤษ** | dictionary + ตัวสลับภาษาผ่านคุกกี้เสร็จแล้ว; shell ของแอปและ Settings ทั้ง 12 แท็บแปลแล้ว ส่วนที่เหลือยังเป็นอังกฤษ | `frontend/src/i18n/**`, `frontend/src/components/pages/settings/**` (รอบ 5–6) |
| 5 | **Usage/Cost analytics** | ต้องรู้ต้นทุนต่อ workspace/model เพื่อตั้งราคาและทำกำไร | `services/usageTracker.service.ts`, `models/UsageRecord`, `app/topup`, `app/admin/quotas` |
| 6 | **Telegram Bot ครบ flow** | มี service + controller แล้ว แต่ขาดคำสั่งใช้งานจริง (`/usage` `/status` `/report`) และการผูกบัญชีผู้ใช้ | `services/telegramBot.service.ts`, `controllers/telegramBot.controller.ts`, `app/admin/telegram` |
| 7 | **Notification ภายนอก (Slack/LINE/Discord)** | แจ้งเมื่อ run จบ / ต้องอนุมัติ / งานค้างเกินเวลา | `services/notificationLog.service.ts` + webhook endpoint |
| 8 | **SSO/OIDC + SAML (enterprise)** | ทีมใหญ่ไม่ใช้ username/password | `controllers/auth.controller.ts`, `models/User` |
| 9 | **License + HW binding (ถ้าจะขาย Platform Download)** | ตาม `docs/ARCHITECTURE_PLAN.md` Phase 4–5 ยังไม่ทำ (ไม่มีโมเดล License) | models ใหม่ + CLI entry point |
| 10 | **PWA / responsive audit** | ใช้งานบนมือถือ (เช่นดูสถานะ run) | `frontend/src/app/layout.js`, styles |

---

## 🔵 P3 — Maintainability / Performance

| # | งาน | หลักฐาน / เหตุผล |
|---|-----|------------------|
| 1 | แยกไฟล์ยักษ์เป็นโมดูลย่อย + เขียนเทสต์ครอบ | `user.controller.ts` 81 KB, `mcp-tools.service.ts` 73 KB, `agent.service.ts` 62 KB, `swarm.manager.ts` 55 KB, `utils/llm/providers.ts` 48 KB |
| 2 | ลด `any` (~555 จุด) แล้วค่อยเพิ่ม strict | type safety จริงจัง โดยเฉพาะ `tools/handlers` และ `utils` |
| 3 | ค่อย ๆ ย้าย frontend JS → TS | มี `tsconfig.json` + `jsconfig.json` แล้ว, 209 ไฟล์ JS vs 1 ไฟล์ TS |
| 4 | Rate limit ไปเก็บใน Redis | `middlewares/RateLimit.middleware.ts` เป็น in-memory store → scale หลาย replica ไม่ได้ |
| 5 | Mongo index audit + TTL/summarize | session messages และ `HistoryArchive` โตตลอด; ตรวจ index ของ `Workspace/Sessions/UsageRecord` |
| 6 | ลด bundle หน้า admin (dynamic import) | หน้า admin มี 23 route; ตรวจ `next.config.js` และไฟล์ `frontend/build-check*.txt` |

---

## ⚡ Quick wins (ทำได้ใน 1 วัน)

| # | งาน | ไฟล์ | ผลลัพธ์ |
|---|-----|------|---------|
| 1 | ✅ อัปเดตตัวเลข/รายการ tool ใน README | `README.md`, `README.th.md` | เอกสารไม่หลอกผู้ใช้ (60 tools) |
| 2 | ✅ ลบ `repair-docs.js` (0 byte) | root | repo สะอาด |
| 3 | ✅ เพิ่ม `SECURITY.md` + PR template | `.github/`, root | พร้อมรับ contributor จริงจัง |
| 4 | ✅ ติ๊ก roadmap ที่ทำแล้วใน ARCHITECTURE_PLAN | `docs/ARCHITECTURE_PLAN.md`, `docs/en/ARCHITECTURE_PLAN.md` | ไม่ต้องอ่านซ้ำว่างานเสร็จหรือยัง |
| 5 | ✅ เพิ่ม readiness endpoint | `backend/src/server.ts` (`/api/ready`) + healthcheck ใน compose | ตรวจ deploy ได้จริง (Mongo/Redis) |
| 6 | ✅ ทำ AgentToolsPanel ให้ data-driven | `frontend/src/utils/agentTools.js`, `frontend/src/components/session/AgentToolsPanel.jsx` | tool ครบ 60 ตัวเปิด/ปิดได้ |
| 7 | ✅ เพิ่ม `test` script ฝั่ง frontend | `frontend/package.json` + `frontend/tests/agentTools.test.mjs` | มีด่านตรวจอย่างน้อย 1 ชุด (9 tests) |

---

## ✅ ลำดับที่แนะนำสำหรับสัปดาห์นี้

1. **ปิดงานค้าง** — `pnpm install` ให้ครบ, รัน `pnpm test` + `pnpm run build` ให้ผ่านทั้งสองฝั่ง แล้ว commit WIP เป็น 3 ชุด
2. **ซิงก์ข้อมูล 3 จุด** — registry 60 tools ↔ MCP allow-list ↔ UI panel (ข้อ P0.2)
3. **เปิด CI ขั้นต่ำ** — lint + build + unit test (backend) และ build + gateway smoke (frontend)
4. **เพิ่ม integration test ชุดแรก** — auth + agent session + workspace (supertest + mongodb-memory-server)
5. **Quick wins 1–6** ให้เสร็จ แล้วเลือกงานใหญ่ถัดไประหว่าง **Report export** กับ **Usage analytics**

---

## 🧰 คำสั่งที่ใช้ตรวจสอบ (Verify)

```bash
# Backend
cd backend
pnpm install --frozen-lockfile
pnpm run lint
pnpm run build          # tsc -p tsconfig.json
pnpm test               # tsx --test tests/*.test.ts
pnpm run mcp:smoke      # smoke MCP server (ต้องมี server รันอยู่)

# Frontend
cd frontend
pnpm install --frozen-lockfile
pnpm run build          # next build --turbopack
node scripts/test-gateway.mjs   # black-box gateway + CSP / JSON filtering

# ทั้งระบบ
docker compose -f docker-compose.yml config    # ตรวจ compose ก่อน deploy
docker compose up -d --build
```

---

## 📚 ดูเพิ่มเติม

- [สถาปัตยกรรมระบบ (SYSTEM_SUMMARY.md)](./SYSTEM_SUMMARY.md)
- [แผนสถาปัตยกรรม 3 ช่องทาง (ARCHITECTURE_PLAN.md)](./ARCHITECTURE_PLAN.md)
- [สถาปัตยกรรม Black-box (BLACKBOX_ARCHITECTURE.md)](./BLACKBOX_ARCHITECTURE.md)
- [คู่มือ deploy ขึ้น VPS](../deploy/README.md)
- [README.md](../README.md)
