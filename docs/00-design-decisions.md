# 2DAY — Canonical Design Decisions

> **This document is the single source of truth.** Every other document in `/docs` must be
> consistent with the decisions below. If a document needs to deviate, it must say so explicitly
> and explain why. Authored by the lead architect; downstream docs elaborate, they do not re-decide.

---

## 1. Product identity

- **Name:** **2DAY** (pronounced "today").
- **One-liner:** *The field operating system for door-to-door sales.*
- **Positioning:** Not a CRM, not a navigation app. A **real-time field optimization platform**
  that turns a rep's constraints (location, hours, transport, equipment, preferences, history)
  into the most efficient possible sales day — and keeps re-optimizing as the day unfolds.
- **Initial market:** the Netherlands (best-in-Europe open data + transit). Architecture must be
  country-pluggable from day one (`country_pack` abstraction, see §6).
- **Design bar:** Apple Maps polish, Google Maps data density, Linear/Notion workflow focus.
- **Primary metric:** **productive conversations per working hour**. Secondary: €/hour, €/km,
  doors/hour, conversion %.

## 2. Target user & core loop

Professional D2D reps (energy, telecom, solar, charity, internet, insurance, home services).
Often commuting by train, often carrying a bag, often gym members (Basic-Fit) who use gyms as
lockers/showers between commute and canvassing.

**Core loop:** `Plan (30 s) → Commute → Drop bag (gym) → Walk optimized loops → Log doors
(1 tap) → Live re-optimization → Catch the right train home → Review + learn`.

**Design principles (non-negotiable):**
1. One thumb, walking, in sunlight. Minimum touch target 48 px; primary actions in bottom 40% of screen.
2. Logging a door outcome ≤ 1 tap, ≤ 1 second, without looking.
3. The app decides; the rep can override. Never present >3 choices in the field.
4. Offline is a mode, not a failure. Everything field-critical works with zero connectivity.
5. Battery is a resource we budget like tokens: target <8%/hour drain with tracking on.

## 3. Technical stack (decided)

| Layer | Choice | Rationale |
|---|---|---|
| Web app | **Next.js 15 (App Router) + React 19 + TypeScript** | PWA-capable, RSC for dashboard/review pages, huge ecosystem |
| Styling | **Tailwind CSS 4** + design tokens (§8) | Speed, consistency, dark mode via tokens |
| Map | **MapLibre GL JS + PMTiles (Protomaps basemap, self-hosted)** | Open-source, no per-load billing, **offline tile packs** possible; Mapbox rejected for cost + offline licensing |
| Geocoding (NL) | **PDOK Locatieserver** | Free, authoritative Dutch geocoder (BAG-backed) |
| Local data / offline | **Dexie.js (IndexedDB)** + append-only event log + custom sync (§7) | Field events are immutable facts → conflict-free by construction |
| Native shell | **PWA first; Capacitor shell in V2** for background GPS + store presence | PWA background geolocation is limited on iOS |
| Backend platform | **Supabase** (Postgres 16 + **PostGIS 3.4**, Auth, Realtime, Storage, Edge Functions) | Fastest credible path; RLS for multi-tenancy |
| Planner service | **Dedicated TypeScript service (Fastify) on Fly.io**, stateless, horizontally scalable | Optimization is CPU-bound and long-running; do not run it in Edge Functions |
| Walking engine | **Valhalla (self-hosted)** | Pedestrian costing, matrices, **isochrones**, elevation |
| Route optimizer | **VROOM** (meso level) + custom heuristics (micro level, §5) | VROOM solves TSP/VRP-TW well; micro loop needs a custom arc-routing heuristic |
| Transit planning | **OpenTripPlanner 2 (self-hosted)** over **OVapi GTFS + GTFS-RT** | Covers ALL Dutch operators (NS, Arriva, Breng, GVB, HTM, RET…) in one feed |
| Weather | **KNMI open data + Buienradar nowcast** (rain radar, 5-min resolution, 2 h horizon) | Dutch rain nowcasting is uniquely good; Open-Meteo as fallback/abroad |
| AI | **Claude API** — Sonnet for plan explanation/coaching/daily review; Haiku for cheap classification. **AI never solves routes** (§9) | Deterministic optimizer + LLM as compiler/explainer is cheaper, faster, auditable |
| Spatial index | **H3 (resolution 9–10)** for density/scoring; PostGIS geometries for truth | Fast aggregation, prebaked scoring tiles, tiny offline payloads |
| Analytics/telemetry | PostHog (self-hosted EU) | GDPR posture |
| Hosting | Vercel (web), Fly.io (planner, Valhalla, OTP2, VROOM), Supabase (EU region) | All data in EU |

## 4. Data sources (Netherlands country pack)

| Data | Source | Notes |
|---|---|---|
| Every address + building | **BAG** (Kadaster, open) via PDOK | `verblijfsobject` = door unit; building year, use, surface |
| Neighborhood demographics | **CBS Wijken & Buurten** + CBS kerncijfers | Income level, ownership %, rental %, age, household composition, density |
| Admin/statistical geometries | CBS/PDOK (gemeente/wijk/buurt) | Our `area` entity maps 1:1 to CBS buurt |
| Energy labels | **EP-Online (RVO)** open data | Per-address label distribution |
| Solar panels | CBS solar statistics + optional roof-detection later | Per-buurt % in MVP |
| Street network | **OpenStreetMap** (Geofabrik NL extract) | Valhalla graph + our residential subgraph |
| Transit static + realtime | **OVapi** (GTFS + GTFS-RT: trip updates, positions, alerts) | Single national feed; NS API as enrichment for disruptions |
| Rain nowcast | KNMI radar / Buienradar | "Rain starts in 22 min" feature |
| Gyms | Curated seed dataset (Basic-Fit, Anytime Fitness, GymOne, SportCity site scrapes/OSM) + community corrections | Locker/shower attributes crowd-maintained |
| Roadworks | Overheid/NDW open data | Walking-layer avoidance |

## 5. The planning engine — three-level architecture (decided)

This is the heart of the product. Three levels, each with its own algorithm class:

**L1 — Macro (where to work today): "Day Compiler".**
Candidate generation + scoring. Enumerate feasible (city, station, area-set) combinations given
current location, end destination, work hours, and transit timetables (OTP2). Score each
candidate: `expected_value = Σ_area (expected_conversations/h × h_available_in_area) − travel_cost
− carry_penalty(bag, gym_availability)`. Deterministic scoring function, weights tunable per goal
preset (max sales / easy day / highest income / shortest walking / explore). Output: top plan +
2 alternatives.

**L2 — Meso (in what order): Orienteering Problem.**
Given selected areas + anchors (arrival station, gym for bag drop, lunch/coffee candidates,
departure station + train time as hard deadline), sequence them as an **Orienteering Problem with
time windows** (prize = expected conversations, cost = walking time from Valhalla matrix).
Solver: VROOM first pass, custom ILS (iterated local search) refinement. Hard constraints:
end-station deadline, gym opening hours, daylight. Soft: lunch window, rain windows (§9).

**L3 — Micro (which streets, which side): arc routing.**
Within a neighborhood, the walking loop is a **Rural Postman Problem** on the "productive
subgraph" (residential street edges weighted by door count × expected value, both sides
modeled). NP-hard → heuristic: (1) select required edges by score threshold vs time budget,
(2) serpentine sweep ordering within street clusters, (3) greedy edge-matching to make the
required subgraph near-Eulerian, (4) shortcut/2-opt cleanup. Output is a **loop** (start ≈ end
at neighborhood entry/exit points chosen by L2), never an out-and-back.

**Re-optimization:** any signal (rain nowcast, transit disruption, pace ahead/behind, doors
closed street) triggers incremental re-plan: L3 always, L2 if >15 min deviation, L1 only on
user request. Re-plans must complete <3 s server-side, and a degraded on-device L3 re-order
must exist offline.

**Expected-value model (used by all levels):**
`EV(door) = P(answer | time-of-day, dwelling type, history) × P(conversation | answer, campaign fit)
× P(sale | conversation, demographics fit) × commission(campaign)`.
Priors from CBS/BAG features; posteriors updated from org-wide + personal visit history
(Bayesian shrinkage toward priors; recency decay half-life 90 days). Doors/hour predicted from
door spacing (BAG geometry), rep walking speed, and per-outcome dwell-time distributions.

## 6. Core data model (canonical entity names)

Use exactly these names everywhere: `org`, `team`, `rep` (user profile), `campaign` (what is
being sold + commission model), `area` (CBS buurt + computed scores), `address_unit` (BAG
verblijfsobject), `building`, `street_edge` (routable arc with door counts per side), `poi`
(gym/coffee/lunch/water/toilet; `poi_kind` enum), `gym_membership`, `plan` (a compiled day),
`plan_leg` (ordered step: transit/walk/gym/canvass/break), `work_session`, `visit` (**append-only
door event**: outcome enum `no_answer / conversation / sale / not_interested / follow_up /
do_not_knock / inaccessible`), `sale`, `disruption_event`, `score_cell` (H3 cell with density +
EV features), `achievement`, `streak`.
Multi-tenant: every row carries `org_id`; RLS enforces it. Reps own their `visit` stream;
org-level aggregates are anonymized per §security doc.

## 7. Offline & sync (decided approach)

- **Reads:** before a plan starts, the app downloads a **Day Pack**: map tile pack (PMTiles
  extract for plan bounding box), address/door data for planned areas, score cells, transit
  timetable slice, POIs. Target <25 MB per day.
- **Writes:** all field writes are **append-only events** (visits, GPS breadcrumbs, session
  marks) with client-generated ULIDs + device clock + monotonic counter → idempotent upsert on
  sync; no conflicts by construction. Mutable state (plan tweaks, settings) uses
  last-writer-wins per field with server timestamp.
- **Sync:** background sync via service worker when online; explicit sync state UI (never lie
  about sync status). Server keeps a per-device change cursor.
- **Offline intelligence:** L3 re-ordering, EV scores, rain-radar last-known frame, and cached
  timetable run on-device; anything needing live data degrades gracefully with visible staleness
  badges.

## 8. Design system (tokens, decided)

- **Name:** `Fieldkit`. Dark-first ("Night"), high-contrast light ("Sun") for direct sunlight —
  auto-switch by ambient light sensor where available, manual toggle always.
- **Type:** Inter (UI) / SF-adjacent metrics; numerals tabular for stats. Base 17 px, dashboard
  stats up to 34 px. Large-type mode.
- **Color tokens:** `bg` #0B0F14 (night) / #FFFFFF (sun); `surface` #151B23 / #F5F6F8; `ink`
  #E8EDF2 / #0B0F14; `accent` **#3B82F6** (route blue); success #22C55E; warn #F59E0B; danger
  #EF4444; outcome palette: sale #22C55E, conversation #3B82F6, no-answer #64748B,
  not-interested #F59E0B, do-not-knock #EF4444, follow-up #A855F7.
- **Layout:** bottom tab bar, 5 tabs: **Today · Plan · Route · Log · Stats**. Primary action =
  floating bottom sheet. All modals are sheets; no top-corner actions.
- Motion: 200 ms ease-out standard; map camera transitions 600 ms; reduced-motion respected.

## 9. AI architecture (pattern, decided)

**"Compiler, not oracle."** The LLM never computes routes or scores. Roles:
1. **Plan compiler input:** parse free-form rep intent ("easy day, end in Tilburg by 6") into
   the typed `PlanRequest` (function calling, Haiku).
2. **Plan explainer:** turn the optimizer's chosen plan + rejected alternatives into 3 human
   sentences (Sonnet).
3. **Field brain (NOT an LLM):** on-device deterministic rules engine evaluating streams
   (location, pace, rain nowcast, GTFS-RT, remaining EV) → nudges like "Rain in 22 min — Zuid
   loop first", "Train in 11 min, 8 min walk — leave now", "Skip Beethovenlaan: 78% apartments,
   door access locked". Every nudge template is auditable; LLM only rewrites tone, offline uses
   raw templates.
4. **Daily/weekly coach:** Sonnet over session aggregates → review narrative + 3 concrete
   improvements.
5. **Learning loop:** nightly batch recomputes EV posteriors (SQL + small Python job) — classic
   stats, not LLM.

## 10. Feature staging (scope decided; details in doc 04)

- **MVP (V1):** NL only. Manual+assisted planning (L1 scoring list, L2/L3 full auto), Day Pack
  offline, 1-tap logging, live train times + rain nowcast, gym POIs w/ membership filter, home
  dashboard, daily review, personal history heatmap, PWA.
- **V2:** Capacitor apps, background GPS, org/team features, org-wide heatmaps + do-not-knock
  sharing, gamification (streaks/records/leaderboard), weekly analytics, AI coach, Basic-Fit
  locker-availability estimates (crowdsourced), follow-up scheduling.
- **V3:** country packs (BE/DE first), competitor-layer, predictive staffing for agencies,
  enterprise API/SSO, white-label, marketplace of campaign data.

## 11. Business posture (frame; details in docs 18–20)

- **Model:** B2C-prosumer subscription (€19/mo rep) + B2B seats for agencies (€39/seat/mo with
  team analytics + territory management) + enterprise (custom). 14-day free trial, no free tier
  (data costs real money); annual −20%.
- **Cost envelope target:** infra <€0.90/active rep/month at 1k reps (self-hosted routing stack
  is what makes this possible — the Mapbox/Google-stack alternative is ~10× that).
- **GDPR:** consent-first GPS, on-device precision reduction for org sharing, "do-not-knock" list
  treated as compliance feature (respects AVG + local ordinances), EU-only data residency.

## 12. Writing conventions for all docs

US English. Product name "2DAY". Refer to reps as "reps" (they/them). Refer to the five tabs and
entity names exactly as in §6/§8. Markdown, `##` top sections, tables where they beat prose.
Be concrete: real Dutch examples (Den Bosch Maaspoort, Eindhoven, Tilburg, stations, Basic-Fit).
No marketing fluff in technical docs; no invented benchmarks presented as facts — label estimates.
