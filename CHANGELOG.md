# Changelog

## Unreleased (branch: claude/sales-route-planner-mobile-lx6w3m)

### Design package
- 20-document venture spec, interactive prototype, and hero banner with Mermaid diagrams
- Mobile wireframes (doc 06) — 23 annotated box-drawing screens with touch targets and sunlight mode

### Application
- Full Next.js 15 progressive web application port of prototype with five tabs and Fieldkit tokens
- Live log flow with undo, PWA manifest, and offline Dexie outbox binding
- Plan tab wired to planner API with on-device fallback pill
- Nudge banner driven by the core field-brain arbitration

### Planner service
- Fastify service implementing doc 09 routes (compile/replan/discover/health) over three-level engine
- L1 day compiler, L2 sequencing with gym bag-drop and train deadlines, L3 street-edge EV selection
- 10 vitest tests verifying end-to-end compilation against deterministic mock adapters

### Core engines
- Field brain — 15-rule catalog with priority arbitration for safety and deadline bypasses
- Storage-agnostic sync engine with ordered batching, at-least-once push, LWW-per-field pull, tombstones
- 20 vitest tests; canonical wire contracts (PlanRequest/Plan/PlanLeg/VisitEvent) as TypeScript + zod
- Database migration with 10 enums, 24 tables, 39 indexes, and RLS policies

### Conversation intelligence
- Canonical contracts for doorstep conversation recording with consent states and transcript segments
- Analysis shape including outcome/confidence, evidence-grounded coaching tips, objection taxonomy, talk ratio
- Structural privacy: audioRetained false on wire; audio deleted on-device after transcription
- DE/TR/PL language packs (5-language detection, 7 fixtures)

### Testing & CI
- Playwright E2E journey suite scaffolding with 13 canonical user stories (US-01..US-13)
- GitHub Actions CI runs typecheck/test/build on Node 22; e2e tests run against production build

### Fixes
- Corrected app tsconfig extends path and committed next-env.d.ts
