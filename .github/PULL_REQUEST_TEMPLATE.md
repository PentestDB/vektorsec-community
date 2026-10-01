# Pull Request

## What does this PR change?

<!-- One or two sentences. Link the issue if there is one: "Closes #123" -->

## Type of change

- [ ] Bug fix
- [ ] New feature / new agent tool
- [ ] Refactor (no behaviour change)
- [ ] Documentation only
- [ ] Infrastructure (CI, Docker, deploy scripts)

## Affected areas

- [ ] `backend/` (API, agent runtime, tools, models)
- [ ] `frontend/` (UI, black-box gateway)
- [ ] `docs/` (Thai manuals) and/or `docs/en/` (English manuals)
- [ ] Docker / deploy scripts / `run.sh`

## Checklist

- [ ] Added or updated tests for the change (backend: `backend/tests/*.test.ts`, frontend: `frontend/tests/*.test.mjs`)
- [ ] `cd backend && npx tsc --noEmit -p tsconfig.json && pnpm test` passes
- [ ] `cd frontend && pnpm test && pnpm run build` passes (plus `node scripts/test-gateway.mjs` if the gateway changed)
- [ ] Docs updated in **both** languages when behaviour or configuration changed (`docs/` + `docs/en/`)
- [ ] No secrets, `.env` files, customer data or `kali-data/` artefacts included (`git status` is clean apart from intended files)

## New agent tool checklist (skip if not applicable)

- [ ] Handler lives in `backend/src/tools/handlers/` and is registered in `backend/src/tools/registry.ts`
- [ ] Network access goes through `handlers/scan-guard.ts` (SSRF + workspace scope) and dangerous commands are consent-gated
- [ ] Pure parsing/scoring logic lives in `backend/src/utils/` with unit tests
- [ ] Label added to `frontend/src/utils/agentTools.js` so the tool appears in the Agent Tools panel
- [ ] Exposed over MCP if operators are expected to use it from Claude Code / Codex

## How was this tested?

<!-- Commands you ran, what you observed, screenshots for UI changes -->

## Notes for reviewers

<!-- Known limitations, follow-up work, migration steps -->
