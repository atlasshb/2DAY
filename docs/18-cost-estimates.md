# 2DAY — Cost Estimates

> Elaborates doc 00 §3 (stack), §10 (staging), §11 (business posture). All figures in this
> document are **estimates**, dated **July 2026**, and are labeled as such throughout — there are
> no signed vendor contracts or production bills behind any number here. Where a range is given,
> the midpoint is used in roll-up tables unless stated otherwise.

## 1. Method & assumptions

- **Currency:** All vendor pricing (Vercel, Supabase, Fly.io, Anthropic) is USD-denominated. This
  document assumes **€1 ≈ $1.08** (mid-2026 estimate) and reports everything in EUR to match the
  brief's €0.90/rep target. A ±10% FX move changes every USD-sourced line by the same amount.
- **"Active rep"** = a rep with a live subscription who opens the app in a given month, consistent
  with brief §11's `<€0.90/active rep/month at 1k reps` framing. At **10,000 reps** the NL-only
  addressable market (doc 19: NL TAM ≈ 10,000 reps) is already exhausted, so this tier implicitly
  assumes multi-country operation (V3, docs 19–20) — flagged where relevant below.
- **Working days:** this document assumes **20 active working days/month per rep**, matching the
  canonical assumption in doc 10 §7 so AI call-volume math lines up across documents. D2D activity
  is seasonal and part-time-heavy (doc 19 models that in churn, not here); 20 days is therefore a
  deliberately conservative (cost-maximizing) basis — an estimate, not a contractual cadence.
- **Fixed vs. variable cost:** the routing stack (Valhalla, OTP2, VROOM) is priced by the country
  graph, not by rep count — the NL OSM/GTFS graph is the same size whether 100 or 10,000 reps use
  it. Replica count (added for throughput/HA) scales with load, not linearly with reps. This is
  the mechanism behind the brief's claim that self-hosting beats a per-call vendor API at scale —
  see §5 for the reverse case.

## 2. Infrastructure cost model

### 2.1 Vercel (web/PWA hosting)

Next.js 15 App Router, PWA delivery, RSC dashboard pages. Estimate: Pro plan base + team seats at
small scale, moving to Enterprise (custom, negotiated) once function-invocation and bandwidth
volume grows with concurrent morning-plan traffic.

| Scale | Estimate | Basis |
|---|---|---|
| 100 reps | €25/mo | Pro plan, usage well within included quota |
| 1,000 reps | €90/mo | Pro + overage on function invocations/bandwidth from peak-hour plan compiles |
| 10,000 reps | €500/mo | Enterprise tier (custom-negotiated, estimate) |

### 2.2 Supabase (EU region — Postgres 16 + PostGIS 3.4, Auth, Realtime, Storage, Edge Functions)

Multi-tenant Postgres with RLS (doc 00 §6), PostGIS geometries for `area`/`street_edge`/`building`,
append-only `visit` event stream, Realtime for live re-optimization pushes.

| Scale | Estimate | Basis |
|---|---|---|
| 100 reps | €35/mo | Pro plan base + small compute add-on |
| 1,000 reps | €140/mo | Pro + Medium compute add-on, extra storage/bandwidth for event-log growth |
| 10,000 reps | €900/mo | Team/Enterprise tier, larger compute, read replica for analytics load |

### 2.3 Fly.io — planner, Valhalla, VROOM, OTP2

**Planner** (Fastify TS, stateless, autoscaled) is genuinely rep-count-driven — more concurrent
plan/re-plan requests need more machine-seconds.

| Scale | Estimate | Sizing assumption |
|---|---|---|
| 100 reps | €10/mo | 1 machine, shared-cpu, ~512MB |
| 1,000 reps | €35/mo | 3–4 autoscaled machines at peak (morning commute window) |
| 10,000 reps | €150/mo | 10–15 autoscaled machines |

**Valhalla** (pedestrian costing, matrices, isochrones, elevation). Assumption: the Geofabrik NL
OSM extract is roughly 0.7–1GB compressed; the built Valhalla tile hierarchy for a country this
size is estimated at **3–6GB on disk**. Valhalla mmaps tiles rather than requiring full in-RAM
residency, but matrix/isochrone latency under concurrent load benefits from enough RAM to keep the
working tile set cached — this document assumes an **8GB RAM / 2–4 vCPU machine per replica** as
baseline. Replica count is added for throughput and HA, not because the graph grows with reps.

| Scale | Estimate | Sizing assumption |
|---|---|---|
| 100 reps | €35/mo | 1 replica, 8GB/2vCPU |
| 1,000 reps | €45/mo | 1 replica, slightly larger machine for safety margin (no HA duplication yet — see below) |
| 10,000 reps | €160/mo | 4 replicas, 8GB/2–4vCPU each, HA justified at this revenue scale |

**VROOM** (meso orienteering-problem solver). No persistent large graph — it consumes a duration
matrix from Valhalla per solve, so its footprint is CPU-burst-driven and genuinely scales with
concurrent solve requests rather than data size.

| Scale | Estimate | Sizing assumption |
|---|---|---|
| 100 reps | €10/mo | 1 machine, 1–2GB/2vCPU |
| 1,000 reps | €25/mo | 2–3 machines |
| 10,000 reps | €90/mo | 6–8 machines |

**OTP2** (transit planning over OVapi GTFS + GTFS-RT, all NL operators in one feed). This is the
single most memory-heavy service in the stack. Sizing follows doc 13 §3.4 (the authority): the NL
national graph runs at **16–24GB of heap per instance once the GTFS-RT overlay and headroom are
included** — and 2DAY always runs with realtime. This document uses a **16GB baseline per
replica**, growing toward 24GB as RT depth increases. Replica count also follows doc 13/16: a
minimum of **2 replicas from day one**, because the nightly blue/green graph swap (doc 13 §3.2)
needs a second instance to take traffic during reload — the LB pair is an architectural
requirement, not optional HA padding.

| Scale | Estimate | Sizing assumption |
|---|---|---|
| 100 reps | €260/mo | 2 replicas, 16GB/4vCPU each (blue/green pair) |
| 1,000 reps | €320/mo | 2 replicas, ~20GB each — RT depth + safety margin |
| 10,000 reps | €760/mo | 4 replicas, ~24GB each (doc 16 §2.4: replicate through ~10k) |

**Operational judgment call (flagged explicitly):** at 100–1,000 reps this model runs **Valhalla**
(and VROOM, and the planner) as single replicas rather than duplicated for HA — a deliberate
cost/risk trade-off for a pre-revenue-to-early-revenue business: an outage takes down live
re-optimization until the machine restarts (Fly.io's fast-restart supervisor, not full failover).
OTP2 is the exception for the blue/green reason above. §5 prices the fully HA-hardened
alternative — and the reverse lever (accepting a single OTP2 replica with a brief nightly
maintenance window) is priced there too, since it is the single biggest cost lever at 1k reps.

### 2.4 PMTiles on CDN/R2

Self-hosted Protomaps basemap (doc 00 §3) — chosen specifically to avoid Mapbox's per-load
billing. Assumption: the NL basemap PMTiles archive (streets, buildings, address labels at
multiple zooms) is **8–15GB** total. Storage on Cloudflare R2 (~$0.015/GB-month) is negligible;
the more relevant driver is **Day Pack download bandwidth** — doc 00 §7 targets <25MB/rep/day.
R2's headline feature for this architecture is **zero egress fees**, which is what keeps this line
flat even as Day Pack volume scales linearly with reps.

| Scale | Day Pack bandwidth/mo (estimate) | Cost estimate | Basis |
|---|---|---|---|
| 100 reps | ~50GB (100 × 25MB × 20 days) | €7/mo | Storage + R2 Class B ops; egress free |
| 1,000 reps | ~500GB | €28/mo | Same, plus a thin CDN caching layer |
| 10,000 reps | ~5TB | €110/mo | Storage + ops at volume; egress still free |

### 2.5 PostHog (self-hosted, EU)

Self-hosted for GDPR posture (doc 00 §11) rather than PostHog Cloud. Assumption: each active rep
generates an estimated 50–150 telemetry events/day (taps, visit logs, nudges shown, screen views),
run on a lean self-hosted deployment (Postgres + ClickHouse + Redis) rather than the full
CDP-scale stack.

| Scale | Estimate | Basis |
|---|---|---|
| 100 reps | €35/mo | Small single-node deployment |
| 1,000 reps | €75/mo | Larger node, more retention for event volume |
| 10,000 reps | €400/mo | Multi-node ClickHouse cluster |

### 2.6 Claude API — usage pattern and cost (doc 00 §9)

Per brief §9, the LLM is a **compiler/explainer**, never a solver — the two high-volume AI roles
are non-LLM (field brain is a deterministic on-device rules engine; the learning loop is a
nightly SQL/Python batch). Four call sites cost anything (call volumes per doc 10 §7, the
authority for this table):

| Call site | Model | Est. calls/rep/working-day |
|---|---|---|
| Plan compiler input (parse free-form intent → `PlanRequest`, function calling) | Haiku | 1.5 |
| Plan explainer (chosen plan + rejected alternatives → 3 sentences) | Sonnet | 1.0 compiled, ~0.6 **billed** (doc 10 §3 plan-hash cache, ~40% hit) |
| Daily coach (session aggregates → review narrative + 3 improvements) | Sonnet | 1.0 |
| Weekly coach (week aggregates → narrative + rankings) | Sonnet | 0.2 (~4/month) |

**Pricing used (current public rates, July 2026 — estimates for planning, not a rate lock):**
`claude-haiku-4-5` at $1.00 / $5.00 per MTok (input/output); Sonnet-tier at $3.00 / $15.00 per MTok
standard rate. Claude Sonnet 5 carries an introductory $2.00/$10.00 rate through 2026-08-31 — this
model deliberately uses the **standard, post-introductory rate** throughout for conservatism,
since the MVP build and beta (docs 20) mostly land after that window. Prompt-cache economics:
cache write ≈1.25× base input price (5-min TTL), cache read ≈0.1× base input price.

**Per-call token assumptions (estimates):**

| Call | Cacheable system/tool tokens | Variable tokens | Output tokens |
|---|---|---|---|
| Haiku plan-compiler | 1,200 | 60 | 100 |
| Sonnet plan-explainer | 400 | 900 (condensed plan summary, not full plan JSON) | 100 |
| Sonnet daily coach | 400 | 700 (day aggregate) | 300 |
| Sonnet weekly coach | 400 | 900 (week aggregate) | 400 |

**Cache hit-rate assumption — scales with fleet size, not per-user frequency.** A single rep's
own calls are too sparse to keep a 5-minute cache warm across a workday. But the *system prompt
and tool schema are identical across all reps*, so at higher concurrent request density (more reps
compiling plans in the same morning window), other reps' requests keep the shared prefix warm.
Estimate: 30% hit rate at 100 reps, 70% at 1,000, 85% at 10,000.

| Metric | 100 reps | 1,000 reps | 10,000 reps |
|---|---|---|---|
| Claude cost / rep / working-day | ~$0.0153 | ~$0.0134 | ~$0.0127 |
| Claude cost / rep / month (×20 days) | ~$0.305 → €0.283 | ~$0.268 → €0.248 | ~$0.254 → €0.235 |
| **Claude monthly total** | **€28/mo** | **€248/mo** | **€2,352/mo** |

(The weekly-coach line item and the plan-hash cache on the explainer roughly offset each other
versus a naive three-call model — the total is stable, but the composition now matches doc 10.)

Cost per rep declines slightly with scale (caching), but Claude is genuinely usage-linear, unlike
the routing stack — it does not enjoy the same fixed-cost amortization. See §5 for how quickly
this line can blow past budget if call volume or context size creep upward.

### 2.7 Weather APIs

KNMI open data (radar, observations) is free open government data — no direct fee, only ingestion
engineering effort. Buienradar's 5-min nowcast (doc 00 §3, the "rain in 22 min" feature) has terms
that plausibly require a commercial agreement at meaningful traffic volume, not just an
attribution-based free tier — **this is flagged as an open legal/licensing question, not a solved
one** (see doc 20 risk register item 1). This line is a commercial-contingency buffer, not a quoted
price.

| Scale | Estimate | Basis |
|---|---|---|
| 100 reps | €15/mo | Within likely free/attribution tier |
| 1,000 reps | €35/mo | Contingency buffer toward a commercial tier |
| 10,000 reps | €120/mo | Assumes a commercial nowcast contract is needed by this scale |

Open-Meteo remains the documented fallback/abroad option (doc 00 §3) and is free.

### 2.8 OVapi (GTFS + GTFS-RT)

Free, open national feed (single source for NS, Arriva, Breng, GVB, HTM, RET, etc. — doc 00 §4).
**€0/mo** direct fee at every scale; bandwidth to poll/ingest is negligible and folded into the
Fly.io/Supabase lines above.

### 2.9 Monitoring & misc

Sentry-class error tracking + uptime checks + a small self-hosted Prometheus/Grafana instance for
routing-stack health (Valhalla/OTP2/VROOM don't self-report to a SaaS APM out of the box).

| Scale | Monitoring estimate | Misc estimate (domain, transactional email, backups) |
|---|---|---|
| 100 reps | €20/mo | €8/mo |
| 1,000 reps | €45/mo | €12/mo |
| 10,000 reps | €180/mo | €55/mo |

### 2.10 Consolidated infra cost vs. the €0.90/rep target

| Component | 100 reps | 1,000 reps | 10,000 reps |
|---|---:|---:|---:|
| Vercel | €25 | €90 | €500 |
| Supabase (EU) | €35 | €140 | €900 |
| Fly.io — planner | €10 | €35 | €150 |
| Fly.io — Valhalla | €35 | €45 | €160 |
| Fly.io — VROOM | €10 | €25 | €90 |
| Fly.io — OTP2 | €260 | €320 | €760 |
| PMTiles/R2 + CDN | €7 | €28 | €110 |
| PostHog (self-hosted) | €35 | €75 | €400 |
| Weather (Buienradar buffer) | €15 | €35 | €120 |
| OVapi | €0 | €0 | €0 |
| Monitoring | €20 | €45 | €180 |
| Misc | €8 | €12 | €55 |
| **Fixed infra subtotal** | **€460** | **€850** | **€3,425** |
| Claude API | €28 | €248 | €2,352 |
| **Total monthly infra** | **€488** | **€1,098** | **€5,777** |
| Active reps | 100 | 1,000 | 10,000 |
| **€ / active rep / month** | **€4.88** | **€1.10** | **€0.58** |

**Reading this honestly:** at 100 reps, the target is missed by ~5× — the fixed routing stack
(Valhalla + VROOM + OTP2 + planner ≈ €315/mo) dominates a small denominator, which is simply how
infra-heavy SaaS economics work pre-scale. At **1,000 reps the base case lands at
€1.10/rep/month — the brief's <€0.90 target is missed by ~22% under doc-13/16-consistent OTP2
sizing** (2×20GB replicas; an earlier draft of this document under-sized OTP2 and appeared to hit
€0.89 — that number was an artifact of the under-sizing, not real headroom). The gap has named,
priced levers: accepting a single OTP2 replica with a nightly maintenance window (−€0.16/rep, the
reverse of §2.3's judgment call), Buienradar resolving to the free attribution tier (−€0.035),
Claude context/caching discipline beyond the base assumptions (−€0.03–0.05), and Supabase
right-sizing (−€0.02–0.04). Pulling the first two levers brings 1k reps to **≈€0.90–0.92** —
the target is *reachable but requires an explicit availability trade-off*, and this document
declines to present it as already banked. At 10,000 reps (implicitly multi-country, §1) the same
fixed stack amortizes to €0.58/rep/month, comfortably validating the self-hosted-stack thesis
(doc 00 §11's "~10× cheaper than Mapbox/Google" claim is examined directly in §5).

## 3. Team cost

### 3.1 MVP build team (6 months, Aug 2026 – Jan/Feb 2027 — aligned to doc 20's sprint plan)

NL fully-loaded salary estimates include employer social contributions, 8% holiday allowance, and
pension — commonly 25–30% above gross. All figures below are **monthly, fully loaded, estimates**.

| Role | FTE | €/month (loaded) | Notes |
|---|---|---|---|
| Lead/Founding Engineer (architecture, planner service, full-stack) | 1.0 | €11,500 | Often below-market cash + equity in practice; figure shown is market-rate for later-round planning |
| Backend/Data Engineer (Supabase, routing stack ops, BAG/CBS/OSM pipeline) | 1.0 | €8,500 | |
| Frontend/PWA Engineer (Next.js, Fieldkit, offline/sync) | 1.0 | €8,000 | |
| Product/UX Designer | 0.5 | €3,800 | Fieldkit design system, core flows |
| Founder/CEO (GTM, agency relationship, fundraising) | 1.0 | €5,500 | Deliberately below market during MVP phase |
| DevOps/SRE (fractional contractor — routing-stack ops, CI/CD) | 0.3 | €2,700 | |
| **Total monthly team burn** | | **≈ €40,000** | |
| **6-month MVP team cost** | | **≈ €240,000** | |

### 3.2 Steady-state team (~12–18 months out, aligned to doc 20 V2/V3 phases)

| Role | FTE | €/month (loaded) |
|---|---|---|
| Lead Engineer/CTO | 1.0 | €12,000 |
| Backend Engineer ×2 | 2.0 | €17,000 |
| Frontend/PWA Engineer ×2 | 2.0 | €16,000 |
| Data/ML Engineer (EV posteriors, routing heuristics tuning) | 1.0 | €9,000 |
| Product/UX Designer | 1.0 | €7,600 |
| DevOps/SRE | 0.75 | €6,750 |
| Founder/CEO | 1.0 | €7,500 |
| Head of GTM/Sales (agency deals) | 1.0 | €8,500 |
| Customer Success / Rep Support | 1.0 | €5,000 |
| GDPR/Compliance advisor (fractional retainer) | 0.15 | €1,500 |
| **Total monthly steady-state burn** | ~11.9 FTE | **≈ €91,000/mo (~€1.09M/yr)** |

## 4. One-time costs

| Item | Estimate | Notes |
|---|---|---|
| Data pipeline build (BAG/CBS/OSM/EP-Online/OVapi ingestion, matching, H3 indexing, graph-build tooling) | €15,000–25,000 | Incremental GIS-specialist contractor time + initial-build cloud/tooling cost, on top of core team labor already in §3.1 |
| App store fees | ~€120/yr | Apple Developer Program (~€92/yr) + Google Play (€25 one-time) |
| Capacitor V2 native-shell buildout | €8,000–15,000 (labor equivalent) | Mostly absorbed into steady-state engineering time; flagged as a discrete V2 milestone (doc 20) |
| Legal/GDPR counsel (initial engagement) | €12,000–20,000 | DPA drafting, privacy policy, Art. 30 RoPA, consent flows, do-not-knock compliance review, B2B DPA template |
| Company formation (BV, notary, KVK, SAFE/cap table docs) | €3,000–6,000 | |
| Brand/design system foundation | €5,000–10,000 | Fieldkit tokens, logo, initial illustration |
| Professional liability / cyber (E&O) insurance | €2,000–4,000/yr | Material given GPS/location data handling |
| **Total one-time (excl. recurring GDPR retainer, already in §3.2)** | **≈ €40,000–65,000** | |

## 5. Sensitivity analysis — what blows the €0.90 target

| Risk factor | Trigger | Estimated impact at 1,000 reps | Mitigation lever |
|---|---|---|---|
| **LLM overuse** | Plan-explainer/coach sent full plan JSON instead of a condensed summary; V2 gamification/AI-coach chat adds call volume; weekly coach (V2) stacks on top of daily | Claude line could grow 3–6×, from €248/mo to €750–1,500/mo — enough alone to blow the whole €0.90 target | Enforce condensed-context discipline in prompt-building code; batch non-latency-sensitive coach narratives via the Message Batches API (50% discount); consider Haiku for daily coach if quality holds; monitor `cache_read_input_tokens` to catch silent cache invalidation |
| **Managed-Mapbox/Google-stack fallback** | Self-hosted Valhalla/OTP2 ops burden exceeds a small team's capacity and forces a managed-routing fallback | Per doc 00 §11, the managed-stack alternative is "~10× that" — Mapbox Directions + Google Routes billed per-request could push routing costs from ~€180/mo (Valhalla+VROOM+OTP2 fixed) to €2,000–5,000+/mo at 1,000 reps' daily replan volume | Invest in ops runbooks and on-call rotation before this becomes forced; budget the DevOps/SRE line (§3) specifically to avoid this; treat any managed fallback as emergency-only, not a steady-state design choice |
| **OTP2 sharding** | A single NL OTP2 graph can't hold required memory/throughput as GTFS-RT integration deepens, forcing regional shards | Could roughly double the OTP2 line (€320/mo → €600–700/mo at 1,000 reps) | Load-test OTP2 memory ceiling in Sprint 5 (doc 20) before committing to single-graph architecture; keep sharding as a documented escape hatch, not a surprise (doc 16 §2.4 places shard-by-region at ~100k, not 1k) |
| Supabase storage/egress overage | Append-only `visit`/breadcrumb event log grows unarchived | Could add €50–150/mo at 1,000 reps | Cold-archive old event data to Storage/R2 on a retention schedule |
| PostHog event-volume growth | V2 gamification (streaks, leaderboards) drives much higher telemetry rate | Could double the PostHog line | Sample non-critical events; keep core funnel events at full fidelity |
| Weather licensing surprise | Buienradar requires a real commercial contract, not an attribution tier, at lower volume than assumed | Fixed cost increase, not scale-dependent — bounded but real | Legal review before GA (doc 20 risk register item 1); KNMI/Open-Meteo as immediate fallback |

**Net read:** the €0.90/rep target at 1,000 reps is **not met in the base case (€1.10)** and is
reachable only by pulling explicit levers — chiefly trading the OTP2 blue/green pair for a
single replica with a nightly maintenance window, plus disciplined LLM context management
(§2.10). Any one of the top two sensitivity rows, left unmanaged, pushes the number further in
the wrong direction on its own. Treat €0.90 as the cost-discipline bar the team manages toward,
€1.10 as the honest planning number, and €0.58 at 10k as the number that actually carries the
unit-economics argument (doc 19).
