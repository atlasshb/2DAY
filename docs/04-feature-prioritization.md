# 2DAY — Feature Prioritization (MVP → V2 → V3)

> Expands `00-design-decisions.md` §10. Every feature named in the product requirements is placed
> in exactly one stage below, with a rationale. MVP candidates are additionally scored with RICE
> (Reach/Impact/Confidence/Effort) — all inputs are **labeled estimates**, not measured data;
> real numbers only exist after pilot usage. Feature areas map to the entities in §6 and the
> planning architecture in §5 wherever relevant.

---

## 1. Full feature matrix

### A. Home dashboard (Today tab)

| Feature | Stage | Rationale |
|---|---|---|
| Current plan progress ring, next leg countdown | MVP | Core loop cannot function without "what do I do right now" |
| Live weather/rain nowcast strip | MVP | Feeds the rain re-plan trigger (§5); must be visible, not buried |
| Battery-safe mode indicator | MVP | §2 principle 5 makes battery a first-class, visible budget |
| Sync status badge (synced / N pending / offline) | MVP | §7 — never lie about sync status |
| Field-brain nudge banner (train, rain, pace) | MVP | The nudge *is* the dashboard's primary job |
| Org-wide team activity feed | V2 | Requires `team`/org features not built until V2 |
| Streak/achievement widget | V2 | Depends on gamification (§10) |

### B. Planning inputs

| Feature | Stage | Rationale |
|---|---|---|
| Free-text intent parsing → `PlanRequest` (Haiku) | MVP | §9.1 — the 30-second wizard's minimal-typing promise depends on it |
| Manual input chips (start, end, window, transport, bag, membership, pace, goal preset) | MVP | Fallback and confirmation path when free text is skipped or wrong |
| Goal presets (max sales / easy day / highest income / shortest walking / explore) | MVP | Named explicitly in §5's scoring function as tunable weights |
| Org-assigned territory constraint on the candidate set | V2 | Depends on team/territory features (Journey 4) |
| Multi-day / recurring plan templates | V2 | Convenience layer, not core-loop-critical; needs usage data to design well |

### C. AI planning outputs

| Feature | Stage | Rationale |
|---|---|---|
| Plan compiler (intent → `PlanRequest`) | MVP | §9.1, required for the wizard |
| Plan explainer (3-sentence Sonnet summary + alternatives) | MVP | §9.2, explicitly named in the core loop's "plan presented" moment |
| Field brain (deterministic nudges: rain, train, pace, do-not-knock) | MVP | §9.3 — must work offline, so it is rules, not an LLM, from day one |
| Daily review — stats + one lightweight highlight sentence (reuses the plan-explainer capability) | MVP | Closes "review + learn" (§2); intentionally not the full weekly coach |
| Full weekly/daily AI coach narrative ("3 concrete improvements") | V2 | §9.4 — needs a mature volume of session aggregates per rep to say anything non-generic |
| Coaching that references cross-org peer comparison | V3 | Needs enterprise-scale aggregate data and the analytics substrate from V2 |

### D. Route, walking & gym optimization

| Feature | Stage | Rationale |
|---|---|---|
| L1 Day Compiler (macro: where to work) | MVP | Foundational — nothing else in the planning engine functions without it |
| L2 Orienteering sequencing (meso: what order, incl. gym/lunch/station anchors) | MVP | Same — hard deadline handling (train, gym hours) is core-loop-critical |
| L3 arc-routing walking loops (micro: which streets, which side) | MVP | The actual walking experience Journey 1 depends on |
| Gym POI + membership filter (locker/shower as bag-drop anchor) | MVP | Named explicitly in §2's core loop ("drop bag, gym") |
| Re-optimization on rain/transit/pace signals | MVP | §5's re-plan triggers are core-loop, not optional |
| On-device degraded L3 re-order (offline fallback) | MVP | §7 requires *some* re-optimization to survive connectivity loss |
| Crowdsourced Basic-Fit locker-availability estimates | V2 | Needs a critical mass of reporting reps to be trustworthy — a cold-start problem MVP volume can't solve |
| Car/trolley-aware parking-relocation minimization (Persona B) | V2 | Valuable, but a refinement on top of a working L2/L3, not a blocker for launch |
| Roadworks avoidance layer | V2 | Data source (NDW/Overheid) is available in MVP-country-pack scope, but the UX for surfacing it is a refinement, not core-loop-critical |

### E. Door density & sales intelligence

| Feature | Stage | Rationale |
|---|---|---|
| H3 score cells (density + EV features) from CBS/BAG priors | MVP | Directly required by L1/L3 scoring — without it there's no plan to compile |
| Personal EV posterior updates (Bayesian shrinkage from own visit history) | MVP | Part of the same expected-value model (§5); a rep's own history is theirs from day one |
| Personal history heatmap (Stats tab) | MVP | Explicitly named MVP in §10 |
| Org-wide heat maps (aggregated, anonymized across reps) | V2 | Requires org/team data sharing and the GDPR-compliant anonymization layer |
| Do-not-knock sharing across a team | V2 | Same — meaningful only once more than one rep's data exists to share |
| Competitor-density layer (who else is likely canvassing here) | V3 | Needs licensed or inferred third-party data — a country-pack-scale enterprise feature |

### F. Transit integration

| Feature | Stage | Rationale |
|---|---|---|
| Live departure times + disruption banner for the current trip (OTP2 + OVapi GTFS-RT) | MVP | Directly required by "catch the right train home" (§2) |
| Cached static timetable fallback offline | MVP | §7 offline requirement |
| Multi-modal what-if replanning across an entire week | V3 | Beyond single-day field optimization; edges toward a general trip planner |

### G. Session tracking & logging

| Feature | Stage | Rationale |
|---|---|---|
| 1-tap door outcome logging | MVP | §2 principle 2, the single most load-bearing interaction in the product |
| `work_session` start/stop tracking | MVP | Required for every derived stat (doors/hour, €/hour) |
| Append-only sync with client ULIDs | MVP | §7 — the entire offline story depends on this being conflict-free by construction |
| Background GPS breadcrumb tracking (app closed) | V2 | Requires the Capacitor native shell (§3) — PWA background geolocation is too limited on iOS |
| Manual "undo last N logs" correction tool | MVP | Cheap safety net that materially reduces fear of mis-taps given the ≤1-tap design |

### H. Daily & weekly review / analytics

| Feature | Stage | Rationale |
|---|---|---|
| Daily review (stats + one highlight sentence) | MVP | See row in section C |
| Weekly analytics (team & individual trend lines) | V2 | §10 explicit; also depends on enough sessions accruing to show a trend |
| Org-level weekly analytics dashboard (Journey 4) | V2 | Depends on team/territory features existing at all |
| Exportable client-facing coverage reports | V2 | Built directly on the weekly analytics substrate |
| Enterprise API access to analytics | V3 | §10 explicit — enterprise integration surface |

### I. Gamification & social

| Feature | Stage | Rationale |
|---|---|---|
| Streaks, personal records, leaderboards | V2 | §10 explicit; also needs a social/team graph that doesn't exist pre-org-features |
| Achievements (`achievement`, `streak` entities) | V2 | Same — entity exists in the data model (§6) but is inert without org context to compare against |

### J. Offline mode

| Feature | Stage | Rationale |
|---|---|---|
| Day Pack (map, address/door data, score cells, timetable slice, POIs) | MVP | §7, explicitly named MVP in §10 |
| Append-only write queue with idempotent sync | MVP | Same |
| Visible staleness badges (rain frame, timetable, sync state) | MVP | Non-negotiable per §7 — never lie about state |
| Background sync via service worker | MVP | Required for the offline→online transition in Journey 3 |
| Continuous offline location capture while the app is backgrounded | V2 | Needs the Capacitor shell for reliable background GPS |

### K. Team, territory & org (B2B)

| Feature | Stage | Rationale |
|---|---|---|
| Org/team roster, roles | V2 | §10 explicit — B2B seat model launches in V2 |
| Territory assignment with conflict detection | V2 | Journey 4; depends on org-wide heatmaps existing |
| Follow-up scheduling across a team | V2 | §10 explicit; builds on the existing `visit.outcome = follow_up` value, but the scheduling workflow itself is new V2 surface |

### L. Platform, country & enterprise (V3)

| Feature | Stage | Rationale |
|---|---|---|
| Additional country packs (BE, DE first) | V3 | §10 explicit; architecture is country-pluggable from day one (§6), but only NL data pipelines are built for MVP |
| Predictive staffing for agencies | V3 | Needs mature org-level historical data (a V2 dependency) plus a forecasting model not yet designed |
| Enterprise API / SSO | V3 | §10 explicit |
| White-label | V3 | §10 explicit |
| Marketplace of campaign data | V3 | §10 explicit — a two-sided marketplace needs an established base of orgs first |

---

## 2. RICE scoring — MVP candidates, with the cut line

Reach is estimated at the cost-envelope reference scale used elsewhere in the brief: **1,000
active reps** (§11). Impact uses the standard RICE scale (3 = massive, 2 = high, 1 = medium,
0.5 = low, 0.25 = minimal). Confidence is a percentage. Effort is person-months (engineering
judgment, not a committed estimate). `Score = (Reach × Impact × Confidence) / Effort`.

The table below scores every MVP feature **and** the strongest V2 candidates that were seriously
considered for MVP, sorted by score, so the cut line is visible rather than asserted.

| Feature | Reach (est.) | Impact | Confidence | Effort (person-months, est.) | RICE score | Verdict |
|---|---:|---:|---:|---:|---:|---|
| 1-tap door logging | 1,000 | 3 | 100% | 2 | **1,500** | MVP |
| Home dashboard (Today tab) | 1,000 | 2 | 100% | 2 | **1,000** | MVP |
| Manual override / ≤3 alternate plans | 1,000 | 1 | 100% | 1 | **1,000** | MVP |
| Daily review (stats + highlight) | 1,000 | 1 | 100% | 2 | **500** | MVP |
| PWA install/shell | 1,000 | 1 | 100% | 2 | **500** | MVP |
| Day Pack offline download | 1,000 | 2 | 80% | 4 | **400** | MVP |
| Plan explainer (Sonnet) | 1,000 | 1 | 80% | 2 | **400** | MVP |
| Field brain nudge engine | 1,000 | 3 | 80% | 6 | **400** | MVP |
| Offline sync engine (append-only) | 1,000 | 2 | 100% | 6 | **333** | MVP |
| Plan wizard + L1/L2 auto-plan | 1,000 | 3 | 80% | 8 | **300** | MVP |
| Gym POI + membership filter | 600 | 1 | 100% | 2 | **300** | MVP |
| Rain nowcast re-plan nudge | 900 | 1 | 80% | 3 | **240** | MVP |
| Live transit integration (current trip) | 700 | 2 | 80% | 5 | **224** | MVP |
| Personal history heatmap | 800 | 1 | 80% | 3 | **213** | MVP |
| L3 walking-loop optimization | 1,000 | 3 | 50% | 8 | **188** | MVP |
| — — — — — — — — — — **cut line** — — — — — — — — — — |||||||
| Gamification (streaks/leaderboard) | 1,000 | 1 | 50% | 4 | 125 | V2 |
| Full weekly/daily AI coach narrative | 1,000 | 1 | 50% | 5 | 100 | V2 |
| Follow-up scheduling across a team | 500 | 1 | 50% | 4 | 63 | V2 |
| Background GPS / Capacitor shell | 1,000 | 1 | 50% | 10 | 50 | V2 |
| Org-wide heat maps + do-not-knock sharing | 300 | 2 | 50% | 7 | 43 | V2 |
| Crowdsourced Basic-Fit locker availability | 400 | 0.5 | 50% | 3 | 33 | V2 |
| Weekly analytics dashboard | 150 | 2 | 50% | 6 | 25 | V2 |

**Reading the table:** the natural gap between 188 (the lowest MVP feature, L3 walking-loop
optimization) and 125 (the highest-scoring cut candidate, gamification) is the cut line. It falls
where confidence drops — every feature below the line scores 50% confidence largely *because* it
depends on org-scale data (team overlap, cross-rep trends, crowdsourced reporting) that simply
doesn't exist until reps have been using 2DAY for a while. That is the same reasoning §10 uses to
stage them into V2 directly; RICE corroborates rather than overrides that call.

**Why low-scoring items stayed in MVP anyway:** L3 walking-loop optimization scores lowest among
MVP features (188, driven by 50% confidence in the NP-hard heuristic converging well in early
production) but is not discretionary — it is the mechanism that produces the walking loop itself
(§5); without it there is no route to walk. RICE here sequences *build order and hardening effort
within MVP*, not membership in it. The MVP boundary is fixed by the core loop (§2), not
re-litigated by score.

---

## 3. MVP definition of done

- **Functional:** the full core loop (§2) works end to end for one NL rep, unassisted, across a
  full working day: plan → commute → gym bag drop → walking loops → 1-tap logging → live
  re-optimization on rain/transit/pace signals → catch the planned train → daily review.
- **Performance SLAs met:** re-plans complete in <3 s server-side; Day Pack downloads average
  <25 MB; battery drain averages <8%/hour with tracking on, measured across a device test matrix
  including a representative mid-range Android device (estimate — validate against real device
  telemetry before calling this "met").
- **Offline guarantee:** every item in the "what never degrades" list from Journey 3 (map, current
  loop, 1-tap logging, on-device L3 reordering, local stats) verifiably works with connectivity
  disabled, not just simulated.
- **Design system compliance:** Fieldkit tokens applied throughout; 48 px minimum touch targets;
  Sun/Night themes both shipped and auto-switching where ambient light sensing is available.
- **Data residency & consent:** all data in EU region (Supabase EU, Fly.io EU); consent-first GPS
  flow live (Journey 2); on-device precision reduction ready even though org-sharing itself is V2
  (build the primitive now, gate the feature later).
- **NL country pack production-ready:** BAG, CBS Wijken & Buurten, EP-Online, OSM (Geofabrik NL),
  OVapi GTFS+GTFS-RT, KNMI/Buienradar, curated gym seed data, and NDW roadworks all live and on a
  scheduled refresh cadence, not one-time imports.
- **Billing:** a working subscription checkout (Stripe, or Mollie for iDEAL — a concretely
  Dutch-relevant option worth evaluating) gating the 14-day trial per §11. Not a "feature" in the
  RICE sense above, but required infrastructure for the B2C-prosumer launch.
- **Analytics instrumentation:** PostHog (self-hosted EU) wired to the core loop's key events, so
  the RICE reach/impact estimates above can be replaced with real numbers after launch.
- **Validated with real reps:** a pilot cohort (a specific number TBD by the go-to-market plan,
  not fixed here) completes multiple real working days on real Dutch train lines, including at
  least one genuine rain event and one genuine connectivity dead zone, before general availability.

## 4. Explicit non-goals for V1

- No native iOS/Android apps and no background GPS while the app is closed (PWA-only; Capacitor
  is V2).
- No org/team management, territory assignment, or any multi-rep view (Journey 4 is entirely V2).
- No gamification, streaks, leaderboards, or achievements.
- No weekly analytics or trend dashboards, for individuals or orgs.
- No AI coach beyond the lightweight plan-explainer reuse in daily review — no "3 concrete
  improvements" narrative.
- No crowdsourced gym locker-availability estimates — curated seed data only.
- No follow-up scheduling workflow (the `visit.outcome = follow_up` value is captured, but nothing
  builds a callback queue from it yet).
- No countries beyond the Netherlands.
- No competitor-density layer, no enterprise API/SSO, no white-label, no marketplace.

## 5. Risks per stage, with mitigations

### MVP risks

| Risk | Mitigation |
|---|---|
| Planner service (VROOM/Valhalla) latency or cost under real concurrent load | Load-test before launch; horizontal scaling on Fly.io; cache H3 score cells aggressively |
| Stale or low-quality source data (BAG/CBS/EP-Online refresh lag) | Scheduled nightly ETL; surface staleness badges the same way the rain nowcast does |
| GPS drift misattributing a logged visit to the wrong building in dense blocks | Snap to BAG polygon geometry; keep the manual "correct address" override in the Log tab |
| Offline sync duplicating or losing events | Append-only + client ULID design prevents conflicts by construction; ship the "undo last N" safety net regardless |
| Cold-start EV model for brand-new reps with no personal history | Bayesian shrinkage toward CBS/org priors (§5); always label projected outcomes as estimates in the UI |
| Battery drain exceeding the 8%/hour target on older Android hardware | Adaptive GPS polling interval; explicit low-power toggle; include low-end devices in the test matrix |
| GDPR consent friction reducing signup completion | User-test the consent screens specifically for clarity; ask for only what's needed at each step (progressive disclosure, Journey 2) |
| Stale or wrong gym locker/shower data (curated seed, not yet crowdsourced) | Ship a simple "report incorrect info" action even in MVP, without building the full crowd-correction pipeline until V2 |

### V2 risks

| Risk | Mitigation |
|---|---|
| Native app-store review delays for the Capacitor shell | Submit early; keep the PWA path fully functional as a fallback the whole time |
| Background GPS raising battery or privacy concerns, especially on iOS | Explicit opt-in only; use the least-frequent location API that meets the need; clear, separate consent screen from the MVP "while using" flow |
| Org data sharing (heat maps, do-not-knock lists) creating real privacy exposure | On-device precision reduction; k-anonymity-style thresholds before any cross-rep aggregate renders; opt-in at the org level |
| Gamification incentivizing fake logging for streaks | Outlier detection on logging patterns; tie sale-outcome credibility to downstream campaign confirmation where the integration exists |
| AI coach giving generic or unhelpful advice at low data volumes per rep | Gate the narrative coach behind a minimum session-count threshold; fall back to stats-only below it |

### V3 risks

| Risk | Mitigation |
|---|---|
| BE/DE (or later) country-pack data quality lagging NL's open-data maturity | A country-readiness checklist gating launch per country; phase by data-source availability rather than launching all at once |
| Competitor-density layer raising scraping/ToS legal exposure | Prefer licensed data partnerships over scraping; legal review before building the pipeline |
| Enterprise API/SSO expanding the security attack surface | Dedicated security review; scoped tokens; rate limiting; treat this as a security-first workstream, not a feature bolt-on |
| White-label diluting brand and multiplying support burden | Constrain theming to templates rather than full custom UI; tiered support SLA by contract size |
| Predictive staffing being wrong in a way that costs an agency real money | Present outputs as advisory estimates only, never as automated decisions; keep a human in the loop |
