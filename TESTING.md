# Testing Strategy

## Test Layers

| Layer | Scope | Coverage |
|---|---|---|
| Unit: Core | Sync (batch/dedup/merge), Fieldbrain nudges (15 rules + cooldowns), Coach analysis (fixtures/determinism/language) | Event deduplication and idempotency; nudge priority arbitration and per-rule/per-street cooldowns; conversation outcome classification; objection handling; language detection and fallback |
| Unit: Planner | Plan compilation (6 scenarios), replan (rain re-order), L3 routing, area discovery, validation | Monotonic leg sequencing; gym drop/pickup ordering; rain exposure re-ranking; street selection under budget; error taxonomy |
| E2E: Playwright | 13 user journeys on production build (390×844 phone viewport, headless, fake microphone) | Today/alerts (US-01,05), Plan/Route (US-02,03), Log (US-04), Sun mode (US-06), Stats (US-07), Record/Analyze (US-08,09,10), Shell/PWA/a11y (US-11,12,13) |

## Commands

**Root workspace:**
- `npm run test` — Run all unit tests (core, planner) via vitest
- `npm run test:e2e` — Run Playwright journey suite against `next start :3100`
- `npm run typecheck` — Type-check all workspaces
- `npm run build` — Build all workspaces

**Per-workspace unit tests:**
- `npm run test -w @2day/core` — Sync/Fieldbrain/Coach suites
- `npm run test -w @2day/planner` — Compile/Replan/Routing/Analysis suites

## User-Story Model

Every E2E test maps to a user story (US-01 to US-13) documented in `e2e/user-stories.md`. Story IDs appear in test titles (`today.spec.ts`, `plan.spec.ts`, `log.spec.ts`, etc.) so CI output reads as a user-journey checklist. Each story exercises the production build on a phone viewport (390×844), the way a rep uses the app on the doorstep. The suite is deterministic — no arbitrary sleeps, all waits are UI-state based — and uses `data-testid` hooks: `record-toggle`, `consent-chip`, `stop-record`, `sample-transcript-btn`, `analysis-card`, `analysis-outcome`, `analysis-language`, `log-outcome-btn`.

## CI Pipeline

Every push to main or claude/** branches runs (see `.github/workflows/ci.yml`):
1. Typecheck (`npm run typecheck`)
2. Unit tests (`npm run test`) — Sync/Fieldbrain/Coach/Planner suites
3. Build production (`npm run build`)
4. Install Playwright browsers
5. E2E suite (`npm run test:e2e`) — 13 stories, 30s timeout, 1 retry in CI

## Conventions

**Determinism:** No `Math.random()` or `Date.now()` in engine logic. Sync, Fieldbrain, Coach, and Planner all inject `clock()` for reproducible test runs. Fixtures use fixed ULID seeds.

**E2E:** No arbitrary `sleep()` calls — all waits are event-driven (`waitForSelector`, polling on UI state). Tests are independent; each runs against a fresh page.

**Validation & Errors:** Invalid requests reject with 400 and error taxonomy envelope (`code`, `message`, optional `details`).
