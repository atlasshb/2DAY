# 2DAY — Roadmap

> Elaborates doc 00 §10 (feature staging). Team ramp figures reference doc 18 (cost estimates);
> market/GTM figures reference doc 19 (monetization). All dates are **estimates** planned from
> **July 2026**; nothing here is a committed delivery date. Calendar quarters use Jan–Mar / Apr–Jun
> / Jul–Sep / Oct–Dec.

**Assumptions this roadmap depends on (stated explicitly, not buried):** the pre-seed round (§6)
closes in time to fund an Aug 2026 sprint-1 start; the MVP team of doc 18 §3.1 is hired and
onboarded before Sprint 1, not during it; the Noord-Brabant beta partner (§3) is secured during
Phase 0 so Sprint 13 doesn't end with a beta plan but no beta partner; and no sprint in §2 assumes
parallel workstreams beyond what a ~5-person team (doc 18 §3.1) can actually run at once. Where
this roadmap's dates slip, the most likely cause is one of these four assumptions, not the
engineering estimates themselves.

## 1. Roadmap overview

| Phase | Window | Workstreams | Exit criteria |
|---|---|---|---|
| **0 — MVP build** | Q3 2026 – Q1 2027 (~6 months) | App, planner/routing, data platform, AI (scaffolding) | Full pilot-area flow works end-to-end on a real device; §2 sprint plan complete |
| **1 — Beta** | Q1 2027 – Q2 2027 | Go-to-market (single agency), app hardening | Primary metric (productive conversations/hour) uplift demonstrated; §3 |
| **2 — V1 GA** | Q3 2027 | Go-to-market (multi-agency + Solo), billing | First paying agencies live; Solo self-serve funnel live |
| **3 — V2** | Q4 2027 – Q1 2028 | App (Capacitor), data platform, AI, GTM | Native app store presence; org features + AI coach live; steady-state team (doc 18 §3.2) reached |
| **4 — V3** | Q2 2028 – Q3 2028 (~24 months from now) | Data platform (country packs), GTM (EU), enterprise | BE/DE country packs live; enterprise API/SSO shipped |

Team ramp: Phase 0 runs the MVP team (doc 18 §3.1, ~€40k/mo burn); by Phase 3 the org has grown to
the steady-state team (doc 18 §3.2, ~€91k/mo, ~12 FTE) with GTM and support roles added as revenue
starts (Phase 2).

### Workstreams across the 24-month arc

- **App:** PWA-first (doc 00 §3) through Phase 0–2, Capacitor native shell added in Phase 3 once
  the beta has surfaced whether iOS background-GPS limits actually force it (risk #2, §5).
- **Planner/routing:** Phase 0 stands up the full L1/L2/L3 stack against one pilot area; Phase 2
  generalizes it to full-NL load; Phase 3 adds org-level features (heatmaps, do-not-knock
  sharing); Phase 4 adds competitor-layer and predictive-staffing features on top of a second and
  third country graph.
- **Data platform:** Phase 0 builds the NL ingestion pipeline once (BAG/CBS/OSM/EP-Online/OVapi);
  Phase 4 repeats a lighter version of that same build per country pack (doc 19 §5) — the
  `country_pack` abstraction (doc 00 §3) exists specifically so this is a repeatable playbook by
  Phase 4, not a from-scratch project.
- **AI:** Phase 0 wires the three LLM call sites named in doc 00 §9 (plan-compiler, plan-explainer,
  daily coach); Phase 3 adds the weekly coach and any gamification-adjacent copy; every addition
  after Phase 0 is cost-gated against doc 18 §5's Claude-cost sensitivity, not shipped by default.
- **Go-to-market:** silent through Phase 0 (product-only), single-agency through Phase 1 (beta),
  opens to multi-agency + Solo self-serve at Phase 2, and adds a dedicated Head of GTM once
  revenue justifies the role (Phase 3, doc 18 §3.2).

### Team ramp by phase (FTE, aligned to doc 18)

| Phase | Approx. headcount | Notable additions | Monthly burn (est., doc 18) |
|---|---|---|---|
| 0 — MVP build | ~4.8 FTE | Lead Engineer, Backend Engineer, Frontend Engineer, 0.5 Designer, Founder/CEO, 0.3 DevOps | ~€40,000/mo (§3.1) |
| 1 — Beta | ~4.8 FTE (unchanged) | Same core team runs the beta; no new hires until GA | ~€40,000/mo |
| 2 — V1 GA | ~6–7 FTE | First GTM hire (agency BD), first Customer Success hire | Ramping toward §3.2 |
| 3 — V2 | ~12 FTE | Second Backend + Frontend Engineer, Data/ML Engineer, full-time Designer, Head of GTM, GDPR retainer | ~€91,000/mo (§3.2) |
| 4 — V3 | ~12–14 FTE | Country-pack engineering capacity added per new market (contractor or hire, doc 19 §5) | ~€91,000/mo + per-country-pack cost |

## 2. MVP phase — 2-week sprint plan (Aug 2026 – Feb 2027, ~13 sprints)

All sprints target a single pilot area first (Den Bosch/Maaspoort is the natural choice — doc 00
§12 names it explicitly) before generalizing to the Noord-Brabant beta footprint.

| Sprint | Window (est.) | Goal |
|---|---|---|
| 1 | Aug 3–14, 2026 | Repo/CI scaffolding, Next.js 15 + Supabase (EU) project; BAG ingestion via PDOK for pilot area; `address_unit` populated; basic MapLibre + placeholder PMTiles render |
| 2 | Aug 17–28 | CBS Wijken & Buurten + kerncijfers ingestion; `area` entity + H3 `score_cell` scaffolding; Geofabrik NL OSM extract downloaded; local Valhalla graph-build pipeline running in Docker |
| 3 | Aug 31–Sep 11 | Valhalla deployed to Fly.io for the pilot region; pedestrian costing + matrix API smoke-tested; `street_edge` entity with door-count-per-side |
| 4 | Sep 14–25 | VROOM deployed to Fly.io, wired to Valhalla's duration matrix; L2 meso solver prototype sequences a single test area correctly |
| 5 | Sep 28–Oct 9 | OTP2 graph built from OVapi GTFS + OSM street network; OTP2 deployed to Fly.io; transit itineraries working for pilot-region train/bus connections; **load-test OTP2 memory ceiling** (informs doc 18 §5's sharding risk) |
| 6 | Oct 12–23 | L1 Day Compiler: candidate generation + expected-value scoring live in the planner (Fastify) service; goal presets (max sales/easy day/highest income/shortest walking/explore) wired |
| 7 | Oct 26–Nov 6 | L3 micro-routing heuristic (edge selection by score threshold, serpentine sweep, greedy near-Eulerian matching, 2-opt cleanup) implemented and validated against the pilot street graph |
| 8 | Nov 9–20 | PWA shell: Fieldkit tokens, 5-tab bottom nav (Today/Plan/Route/Log/Stats), Supabase Auth, `org`/`rep`/`campaign` data model wired end-to-end with RLS |
| 9 | Nov 23–Dec 4 | Plan tab + Route tab: compiled-plan map rendering, live GPS position; Log tab: 1-tap door outcome logging to Dexie as append-only `visit` events |
| 10 | Dec 7–18 | Day Pack bundling (PMTiles extract, address/door data, score cells, transit slice, POIs, target <25MB); service-worker background sync with per-device change cursor |
| 11 | Jan 4–15, 2027 | Re-optimization triggers wired: rain nowcast (Buienradar/KNMI), GTFS-RT disruptions, pace-vs-plan tracking → incremental L2/L3 re-plan; Claude Haiku plan-compiler + Sonnet plan-explainer integrated |
| 12 | Jan 18–29 | Daily review (Sonnet coach) + personal history heatmap (Stats tab); gym POI seed dataset (Basic-Fit et al.) + membership filter; full-flow hardening/bug bash |
| 13 | Feb 1–12 | Beta readiness: iOS/Android PWA install-flow testing, battery-drain measurement against the <8%/hour target (doc 00 §2), GDPR consent flows, beta-agency onboarding materials, rep recruitment (§3); go/no-go review |

### Critical path and sequencing dependencies

The sprint order above is not arbitrary — each routing-stack sprint blocks the one after it, and
the whole plan is sequenced so that the riskiest, hardest-to-fake milestones (routing quality,
transit integration) land early enough to still have runway for rework if they miss:

- **Sprints 1–2 (data) block Sprint 3 (Valhalla)** — Valhalla needs a built OSM graph and knows
  nothing about BAG/CBS; the reverse ordering (routing before data) was considered and rejected
  because it would mean validating routing quality against synthetic, not real, address density.
- **Sprints 3–5 (routing stack bring-up) block Sprints 6–7 (planner L1/L2/L3)** — L1/L2/L3 consume
  Valhalla's matrix, VROOM's solver, and OTP2's itineraries as inputs; none of the planning-layer
  work is meaningfully testable before the engines it calls exist.
- **Sprint 5's OTP2 memory load-test is deliberately not deferred to Sprint 13.** If the "~10–16GB"
  assumption in doc 18 §2.3 is wrong in the expensive direction, that needs to surface with 8
  sprints of runway left to adjust the machine-sizing plan, not during beta hardening.
- **Sprint 7 (L3 quality) is the single highest-impact sprint to protect from scope-creep**, since
  risk register item #3 (§5) identifies routing quality as the risk most likely to undermine the
  entire value proposition if it slips silently into a rushed final check during Sprint 12 instead
  of getting its own dedicated validation window.
- **Sprints 8–10 (PWA shell, tabs, offline/sync) can run partly in parallel with 6–7** once the
  planner API contract is stable, since frontend and planning-layer work touch mostly disjoint
  code — the plan above sequences them after for a single-team, non-parallel MVP build, but a
  slightly larger team (see doc 18 §3.1's headcount) could compress the calendar by 3–4 weeks by
  running them concurrently.

### Definition of MVP done (Sprint 13 go/no-go checklist)

- A rep can complete the full core loop (doc 00 §2) — plan, commute, drop bag, walk a compiled
  loop, log doors in ≤1 tap, receive a live re-optimization nudge, catch a suggested train home —
  on a real device in the pilot area, offline-capable per doc 00 §7.
- Battery drain with tracking on measured under real field conditions, against the <8%/hour target.
- No known defect that would make a beta rep distrust the plan (ties directly to the beta's
  trust-focused interview questions in §3).

## 3. Beta program design

**Partner:** a mid-size D2D sales agency operating in Noord-Brabant (campaigns spanning Den Bosch,
Tilburg, Eindhoven) — referred to generically here since no specific agency is under contract as
of this writing; doc 19 §4's worked example uses a comparable, illustrative agency profile.

**Recruitment:** 20–30 reps from the partner agency's existing workforce, spanning a mix of tenure
(new hires through experienced reps) so the primary-metric comparison isn't confounded by
experience level alone.

**Duration:** estimated 8–12 weeks (Feb/Mar 2027 through Q2 2027), long enough to span normal
week-to-week variance in a seasonal workforce (doc 19 §4).

**Success criteria (tied to doc 00 §1's primary metric):**

| Metric | Target (estimate) | How measured |
|---|---|---|
| **Productive conversations/hour** (primary) | +15–25% uplift vs. agency baseline | Compare beta-cohort rate to the agency's own pre-existing tracking or a concurrent non-app control group within the same campaign |
| €/hour, €/km, doors/hour, conversion % (secondary) | Directionally positive | App-native tracking (`visit`, `sale` entities) |
| Battery drain with tracking on | <8%/hour | Device instrumentation during beta |
| Daily active usage | >70% of recruited reps active on a given working day | PostHog |
| Qualitative signal | Net-positive rep feedback on trust in the plan ("the app decides, rep can override" — doc 00 §2) | Structured interviews at beta midpoint and close |

A beta that hits the primary-metric target with a real agency is the single most important proof
point for the seed round (§6) — it is direct evidence for the core product claim, not a vanity
metric.

**Structured interview prompts (midpoint and close, estimate — to be refined with the agency):**
"Do you trust the plan enough to follow it without checking alternatives yourself?"; "When did the
app get it wrong, and what did you do instead?"; "Would you keep using this if your agency stopped
paying for it?" (a direct signal on the rep-pays wedge from doc 19 §6); "What's the one feature
that would make you knock more doors in a day?" These are designed to surface trust and override
behavior specifically, since doc 00 §2's design principle #3 ("the app decides, the rep can
override") is only validated if reps actually follow the plan most of the time.

## 4. Post-MVP phases

### Phase 2 — V1 GA (Q3 2027)

- **App:** billing integration (Solo self-serve checkout, Team seat management), production
  hardening from beta learnings.
- **Planner/routing:** re-optimization latency tuned to the <3s server-side target (doc 00 §5) at
  real concurrent load, not just pilot-area load.
- **Data platform:** full-NL BAG/CBS/OSM/EP-Online coverage (beta was pilot-region-scoped).
- **AI:** plan-compiler/explainer/coach prompts tuned against real beta usage data; cost monitoring
  dashboards live (doc 18 §5).
- **GTM:** multi-agency outreach begins using the beta as a reference case; Solo self-serve funnel
  (content/SEO, gym-community partnerships per doc 19 §4) opens.
- **Exit criteria:** first paying Team agencies live; Solo funnel converting at a measurable rate;
  infra cost/rep tracking against doc 18's model at real (not projected) usage.

### Phase 3 — V2 (Q4 2027 – Q1 2028)

- **App:** Capacitor native shell (doc 00 §3) for background GPS + app store presence — the
  PWA-first bet gets its first real test against iOS background-location limits.
- **Planner/routing:** org/team-level features — org-wide heatmaps, do-not-knock sharing (with the
  GDPR-safe on-device precision reduction posture from doc 00 §11), predictive scheduling inputs.
- **Data platform:** Basic-Fit locker-availability estimates (crowdsourced), follow-up scheduling.
- **AI:** weekly coach narrative added alongside daily; gamification (streaks/records/leaderboard)
  — note in doc 18 §5 that this is exactly the kind of feature growth that risks Claude-cost
  creep, so cost monitoring from Phase 2 carries forward as a gate, not a one-time check.
- **GTM:** steady-state team (doc 18 §3.2) reached; dedicated Head of GTM and Customer
  Success roles come online as multi-agency revenue justifies them.
- **Exit criteria:** native apps in both app stores; org features live for Team/Enterprise
  customers; team ramp complete.

### Phase 4 — V3 (Q2 2028 – Q3 2028, ~24 months out)

- **Data platform:** BE and DE country packs (doc 19 §3/§5 — each estimated €80,000–150,000
  engineering cost, reusing the `country_pack` abstraction from doc 00 §3).
- **Planner/routing:** competitor-layer features, predictive staffing for agencies.
- **AI:** any V3 marketplace features (doc 19 §5) get their own cost model before shipping, given
  the sensitivity already flagged in doc 18.
- **GTM:** enterprise API/SSO, white-label option, first EU-market sales motion.
- **Exit criteria:** first BE or DE revenue; enterprise contract(s) using SSO/API; white-label
  pilot signed.

### Milestones and exit criteria at a glance

| Phase | Key milestone | Exit criteria |
|---|---|---|
| 0 — MVP build | Full pilot-area L1/L2/L3 flow working on-device | Sprint 13 go/no-go review passed |
| 1 — Beta | 20–30 reps live with a real agency for 8–12 weeks | Primary-metric uplift demonstrated (§3) |
| 2 — V1 GA | First paying agencies + Solo funnel live | Infra cost/rep tracking against doc 18's model at real usage |
| 3 — V2 | Native apps live; org features + AI coach shipped | Steady-state team (doc 18 §3.2) reached |
| 4 — V3 | BE/DE country packs + enterprise API/SSO live | First non-NL revenue booked |

## 5. Risk register — top 10

| # | Risk | Likelihood | Impact | Early warning signal | Mitigation | Owner role |
|---|---|---|---|---|---|---|
| 1 | Data licensing (Buienradar commercial terms, or any open-data source changing terms) | Medium | High | Buienradar rate-limits or throttles the ingestion feed during Sprint 11 testing | Legal review pre-GA; KNMI/Open-Meteo fallback already architected (doc 00 §3); budget contingency (doc 18 §2.7) | COO / legal counsel |
| 2 | iOS PWA limits (background GPS, notifications) force early Capacitor pull-in | High | Medium | Beta reps (§3) report the app stops tracking mid-route when backgrounded | Capacitor already staged for V2 (doc 00 §3); beta (Phase 1) explicitly tests for blockers that would force pulling it into Phase 0/1 | Lead Engineer / CTO |
| 3 | Routing/planning quality — L3 heuristic produces poor door-order, undermining the core value prop | Medium | High | Sprint 7 validation shows loops that double back or skip high-EV streets | Sprint 7's pilot-area validation is a dedicated milestone, not folded into a larger sprint; beta rep feedback loop (§3); simpler heuristic fallback kept available | Lead Engineer |
| 4 | Seasonal usage/churn hurts revenue predictability | High | Medium | Monthly churn tracking (post-GA) exceeds the modeled peak-season rate (doc 19 §4) outside the expected low-season months | Annual-plan push (doc 19 §4), seasonality built into cash planning from the start, not discovered later; multi-vertical targeting offsets some seasonal correlation | CEO / Finance |
| 5 | GDPR complaint or compliance failure (location data, do-not-knock, org-level sharing) | Low–Medium | High | A rep or agency raises a data-access or deletion request the app can't yet serve cleanly | Consent-first design and on-device precision reduction already in doc 00 §11; DPA/RoPA work is a named one-time cost (doc 18 §4); ongoing compliance retainer (doc 18 §3.2) | COO / DPO |
| 6 | Single-country (NL) dependence — one market's regulatory/economic risk caps the business | Medium | Medium | Seed-stage investor diligence explicitly flags NL-only revenue as a ceiling | `country_pack` abstraction built in from day one (doc 00 §3) specifically to make this a scheduling problem, not an architecture problem; V3 BE/DE roadmapped | CTO / CEO |
| 7 | Routing-stack ops burden (Valhalla/OTP2/VROOM self-hosting) exceeds a small team's capacity | Medium | Medium | On-call pages for the routing stack recur weekly rather than rarely | DevOps/SRE role funded from Phase 0 (doc 18 §3.1); runbooks before Phase 2 scale-up; single-replica-until-justified approach (doc 18 §2.3) reduces surface area early | DevOps/SRE |
| 8 | Agency channel concentration — losing one or two large agencies materially hurts MRR | Medium | Medium | Any single agency exceeds ~20% of Team-tier seat count | Deliberate portfolio diversification across many small/mid agencies (doc 19 §6); Solo kept alive as an uncorrelated channel, not shut down once Team scales | Head of GTM |
| 9 | Claude API cost or quality drift | Low | Medium | `cache_read_input_tokens` drops toward zero, or per-rep Claude spend exceeds doc 18 §2.6's modeled range | Cost dashboards from Phase 2 on (doc 18 §5/§6); deterministic-optimizer-first architecture (doc 00 §9 — "AI never solves routes") bounds the blast radius of any LLM regression to explanation/coaching quality, never route correctness | Lead Engineer |
| 10 | Competitive response from an incumbent CRM/routing vendor entering D2D-specific optimization | Low–Medium | Medium | A Mapbox/Google-stack or CRM incumbent announces a D2D-specific routing feature | Execution speed, NL-specific data-integration depth (BAG/CBS at the address level — doc 00 §4), design bar (doc 00 §1), and direct agency relationships are the defensible moat, not a patent or exclusivity claim | CEO |

## 6. Funding narrative

### Pre-seed — sized to fund Phase 0 + Phase 1

| Line | Estimate | Source |
|---|---|---|
| MVP team, 6 months | €240,000 | Doc 18 §3.1 |
| One-time costs | €40,000–65,000 | Doc 18 §4 |
| Infra during build/beta (~100 reps or fewer) | ~€2,000 (6 months × ~€317/mo) | Doc 18 §2.10 |
| Runway extension into beta (additional 3–4 months of team burn) | ~€160,000 | Doc 18 §3.1 |
| **Total pre-seed target** | **≈ €450,000–500,000** | |

**What it proves:** a working MVP that clears the Sprint 13 go/no-go bar, and a completed beta with
a real agency showing a measurable uplift on the primary metric (§3) — plus early unit-economics
signal (validated CAC channels, even pre-revenue; agency interest or LOIs beyond the beta partner).

### Seed — sized to fund Phase 2 + Phase 3

| Line | Estimate | Source |
|---|---|---|
| Steady-state team burn, ~18 months | ~€1,640,000 (€91k/mo × 18) | Doc 18 §3.2 |
| Scaling infra (100 → ~1,000–2,000 reps) | Growing along doc 18 §2.10's curve, roughly €300–900/mo → cumulative low six figures over 18 months | Doc 18 §2.10 |
| GTM spend (agency BD, marketing, trade events) | €200,000–400,000 | Doc 19 §4 CAC channels |
| **Total seed target** | **≈ €2.5M–3.5M** | |

**What it proves:** a repeatable agency-acquisition motion with the LTV:CAC ratios modeled in doc
19 §4 holding at real (not projected) scale; per-rep infra cost bending from doc 18 §2.10's
€1.10 base case toward the €0.90 discipline bar at ~1,000 reps with the cost levers actually
exercised, not just modeled; and initial ARR traction (estimated target €300,000–500,000
ARR by the end of seed runway) as the evidence base for a Series A conversation.

### Series A signal (forward-looking, not sized here)

A Series A conversation at the end of Phase 3 would need to show what seed money cannot buy on its
own: multi-country revenue (Phase 4's BE/DE launch), an enterprise logo or two using SSO/API, and —
critically — that the doc 18 cost curve keeps declining with scale as modeled (€0.53/rep/month at
10,000 reps) rather than the sensitivity risks in doc 18 §5 having materialized. Sizing that round
is out of scope for this document; it depends on real Phase 2/3 metrics this roadmap does not yet
have.
