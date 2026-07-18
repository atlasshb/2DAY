# 2DAY — Scalability

> Elaborates how the fixed stack ([`00-design-decisions.md §3`](./00-design-decisions.md)) scales
> from launch to 100k active reps while holding the cost envelope of brief §11 (**infra <€0.90/active
> rep/month at 1k reps**). Nothing here re-decides the stack; it sizes it. All numbers are estimates
> labeled `(est.)` unless drawn from the brief.

Scale points we design against: **1k**, **10k**, **100k** *active reps* (a rep working a canvassing
day). Active ≠ registered; peak concurrency is what sizes the system.

---

## 1. Load model

A working day is bursty: most reps compile a plan in the **07:00–09:00** morning window, then generate
steady field writes through the day, then taper. This shapes everything — the planner must absorb a
morning spike, the write path must absorb all-day event volume.

**Per-rep-day unit costs (est.):**

| Action | Per rep-day | Notes |
|---|---|---|
| Plan compiles (L1) | ~1.5 | morning compile + occasional recompute |
| L2/L3 re-plans | ~15 | live re-optimization through the day (doc 11 §6) |
| Valhalla matrix calls | ~1.5 compiles × (cached) + re-plans | mostly cache hits after warmup (§3) |
| OTP2 queries | ~3 | reverse reachability + return-itinerary checks |
| GTFS-RT fanout msgs | ~200 | per-rep-relevant trip updates over the day (not the firehose) |
| Visit event writes | **150–400** | 1-tap door logs; the dominant write volume |
| GPS breadcrumb writes | ~1 every 10–30 s while tracking → ~1–2k/day | batched, append-only |
| Tile serves (PMTiles) | ~1 Day Pack fetch + incidental | CDN, near-zero origin cost |

**Aggregate at each scale (est., assuming morning peak ≈ 40% of active reps compiling within a
30-min window):**

| Metric | 1k reps | 10k reps | 100k reps |
|---|---|---|---|
| Plan compiles/day | ~1.5k | ~15k | ~150k |
| **Peak compile rate** | ~0.2/s | ~2/s | **~20/s** |
| Re-plans/day | ~15k | ~150k | ~1.5M |
| Matrix calls/day (pre-cache) | ~25k | ~250k | ~2.5M |
| Matrix calls/day (post-cache, ~85% hit est.) | ~4k | ~40k | ~400k |
| GTFS-RT fanout msgs/day | ~200k | ~2M | ~20M |
| **Visit writes/day** | ~250k | ~2.5M | **~25M** |
| GPS breadcrumbs/day | ~1.5M | ~15M | ~150M |
| Day Pack tile fetches/day | ~1k | ~10k | ~100k |

The two things that actually get big: **visit/GPS write throughput** (append-only, easy to shard) and
**GTFS-RT fanout** (broadcast, mitigated by per-rep-relevant subscriptions). Compute (planner) is
spiky but bounded and horizontally scalable.

---

## 2. Scaling each component

### 2.1 Planner service (Fastify, Fly.io)

- **Stateless** → scales horizontally; add instances to absorb the morning spike, scale to near-zero
  overnight (Fly.io autoscale).
- Long compiles (L1 enumeration, ILS) run as **queue-backed jobs**, not in the request path: the API
  enqueues, the rep's app subscribes for the result (Supabase Realtime). This decouples the 07:00
  spike from instance count — a queue absorbs burst; workers drain at their rate; p95 stays bounded
  because a compile is ~1–2 s (doc 11) and reps tolerate the "Plan (30 s)" window (brief §2).
- Worker pool sized to **peak compile rate × mean compile time × headroom**: at 100k reps, ~20
  compiles/s × ~2 s ≈ **~40 concurrent compiles** + re-plan load → a few dozen worker cores `(est.)`.

### 2.2 Valhalla (walking engine)

- **Read-only** graph (NL OSM). Immutable at serve time → **replicate freely** behind a load balancer;
  each replica loads the same tiles. No sharding needed for one country (NL walking graph is a few GB
  `(est.)`).
- Matrix endpoint is the hot path; protected by the H3 matrix cache (§3). Replicas scale with
  post-cache matrix rate (~400k/day at 100k reps → trivially served by a handful of replicas).
- Multi-country: one Valhalla deployment **per country** (different OSM extract), routed by the rep's
  country (§4).

### 2.3 VROOM (optimizer)

- Runs as a **per-request process pool** — VROOM is a CPU-bound solve per plan, so we fork/pool
  worker processes and hand each a job + Valhalla matrix. Co-located with the planner workers or a
  sidecar pool.
- Scales with compile+L2-replan rate. Bounded solve time (we cap VROOM at ~1.5 s then fall back to
  greedy insertion, doc 11 §7), so pool sizing is predictable.

### 2.4 OTP2 (transit)

- **Memory-heavy** (whole graph in JVM heap, doc 13 §3.4). Scale in two stages:
  - **Replicate** for throughput while the graph fits one instance (through ~10k reps): read-only
    serving behind a LB, each replica holds the full NL graph (16–24 GB heap).
  - **Shard by region** at 100k scale: separate graphs (e.g. Randstad / Zuid / Noord / Oost), route a
    query to the shard containing its origin. Cross-region journeys (rare for commute-to-canvass) hit a
    full-graph fallback instance. Sharding caps per-instance heap and lets regions scale independently.
- Nightly graph build (doc 13 §3.2) is unaffected by rep count — it is data-sized, not load-sized.

### 2.5 Supabase / Postgres

- **Partitioning (per doc 08):** `visit` and GPS breadcrumb tables are append-only and time-heavy →
  **range-partition by month**, sub-partition/`org_id` as needed. Old partitions detach to cold
  storage. This keeps the hot write partition small and indexes tight — essential at 25M visit
  writes/day (100k reps).
- **Read replicas:** dashboards, Stats tab, heatmaps, and the nightly EV batch read from replicas;
  the primary handles writes + sync only.
- **Write path:** field writes are append-only idempotent upserts (brief §7) → no row contention, no
  update-in-place hot rows; batched breadcrumb inserts. This is the design that makes 25M writes/day
  survivable on Postgres.
- **When to move off Supabase:** Supabase (managed Postgres) is right through ~10k reps. Signals to
  graduate: (a) write throughput saturates a single primary despite partitioning, (b) we need
  multi-region write locality, (c) connection/Realtime fanout limits bite. Path: move to **managed
  Postgres with the primary/replica topology we control** (or Citus/Postgres sharding by `org_id`) and
  keep PostGIS. The schema is standard Postgres + PostGIS, so this is an operational move, not a
  rewrite. GTFS-RT hot state already lives in Redis, not Postgres (doc 13 §2.2), which removes the
  spikiest load from the DB early.

### 2.6 PMTiles on CDN

- Basemap and Day Pack tile packs are **static files on a CDN** (brief §3: self-hosted Protomaps,
  no per-load billing). Tile serving scales with the CDN, effectively free at the origin regardless of
  rep count — the reason MapLibre+PMTiles was chosen over Mapbox (brief §3, §11).
- Day Pack assembly (per-plan tile extract + door/score slice) is a planner job; the packs themselves
  are cached and CDN-served.

---

## 3. Caching strategy

Caching is what keeps the routing engines (the expensive components) small.

- **Matrix cache** — keyed by unordered **`H3(r=9)` cell pair** → Valhalla pedestrian time (doc 11 §8).
  Reps re-work the same neighborhoods daily, so hit rates climb fast (~85% steady-state est.). Stored
  in Redis with a long TTL (walking times are stable; invalidate on OSM graph rebuild). This turns
  ~2.5M raw matrix calls/day into ~400k at 100k reps.
- **OTP2 arrival cache** — per `(origin H3, station, 5-min departure bucket)`; morning compiles cluster
  in space and time so hit rates are high. Invalidated by GTFS-RT disruptions (doc 13 §5).
- **`score_cell` prebake** — the nightly batch (brief §9.5) computes EV features per H3 cell; L1/L2/L3
  read, never compute (doc 11). This moves the heaviest analytics off the request path entirely.
- **Plan template reuse** — a rep's recurring plans ("Tuesday: Tilburg") seed L1 enumeration and Day
  Pack assembly, cutting cold-compile cost.
- Cache tiers: **Redis** (matrix, RT trip state, OTP arrivals) + **CDN** (tiles, Day Packs) +
  **Postgres materialized** (`score_cell`, area aggregates).

---

## 4. Multi-country growth path

Brief §1 requires country-pluggability from day one via the `country_pack` abstraction; brief §10 (V3)
adds BE/DE. Scaling across countries is **replication of the routing stack per country under a shared
control plane**, not a bigger single stack:

- **Per-country routing stacks:** each country gets its own Valhalla (country OSM extract), OTP2
  (country GTFS feed — BE: NMBS/De Lijn/TEC/MIVB; DE: DELFI/GTFS), geocoder, and data pack (BAG-equiv:
  BE CRAB/BeST, DE ALKIS/Hauskoordinaten). The `country_pack` selects data sources and parameters.
- **Shared control plane:** one Supabase/Postgres tenant model, one planner-service codebase, one auth,
  one billing, one telemetry (PostHog EU). The planner routes a request to the correct country's
  Valhalla/OTP2 by the rep's working country. Algorithms (L1/L2/L3, doc 11) are country-agnostic; only
  the data feeding them changes.
- **Data residency:** all EU (brief §11); per-country stacks can be region-pinned within EU without
  changing the control plane.

### 4.1 Cost-scaling narrative (consistent with brief §11)

- The self-hosted routing stack (Valhalla/OTP2/VROOM on Fly.io) is a **mostly fixed** cost —
  replicas + memory — amortized across all reps. At **1k reps**, the honest base case is
  **≈€1.10/active rep/month** (doc 18 §2.10), landing at the brief §11 <€0.90 envelope only with
  explicit levers (chiefly a single-replica OTP2 trade-off); the envelope is decisively met from
  ~10k reps (€0.58). The structural point stands regardless: there is no per-request map/routing
  billing (the Mapbox/Google alternative is ~10× — brief §11).
- As reps grow, the **fixed routing base amortizes further** → cost/rep *falls* through 10k. Marginal
  cost per additional rep is dominated by Postgres storage/writes (append-only, cheap) and CDN egress
  (Day Packs, <25 MB/day capped — brief §7), both small and linear.
- The step costs are: OTP2 memory (add replicas/shards at 100k, §2.4) and Postgres graduation (§2.5).
  Neither is per-request, so unit economics stay well inside the envelope as scale rises.

---

## 5. SLOs

Targets (`(est.)` where not fixed by the brief). "Field-critical" SLOs are the ones a rep feels; they
are stricter because the product promise is real-time.

| SLO | Target | Source / rationale |
|---|---|---|
| **Plan compile p95** | **< 2.5 s** | doc 11 §2.7/§3.5 (L1 <1.5 s + L2 <1.2 s); inside the "Plan (30 s)" loop (brief §2) |
| **Re-plan p95 (server)** | **< 3 s** | brief §5 hard requirement |
| **On-device degraded L3** | **< 500 ms** | brief §5; doc 11 §6.3 |
| **Field Brain nudge decision** | < 50 ms | on-device rules only (doc 11 §6.4) |
| **Sync latency (event → server visible)** | < 5 s online p95; unbounded offline (queued, guaranteed) | append-only, idempotent (brief §7) |
| **"Leave now" nudge freshness (online)** | GTFS-RT age < 120 s | doc 13 §4 |
| **Offline availability (field-critical features)** | **100%** — plan view, logging, L3 re-order, cached timetable | brief §4: "offline is a mode, not a failure" |
| **Day Pack availability before commute** | fetched < 60 s, < 25 MB | brief §7 |
| **Planner service availability** | 99.9% (morning window) | queue-backed absorbs instance failures |
| **Tile / Day Pack serve** | CDN SLA (99.9%+) | static, cached |

The hard constraints (re-plan < 3 s, device < 500 ms, 100% offline for field-critical) are inherited
directly from the brief and are non-negotiable; the rest are engineering targets we tune against
telemetry (PostHog, brief §3).

---

## 6. Cross-references

- Algorithm latency budgets & fallbacks that make the SLOs achievable → [doc 11](./11-routing-algorithms.md) §2.7, §3.5, §4.8, §6.4, §7.
- GTFS-RT fanout, OTP2 memory/sharding detail → [doc 13](./13-public-transport-integration.md) §2, §3.
- Partitioning scheme referenced in §2.5 → doc 08 (data model & storage).
- Cost envelope, country_pack, offline Day Pack → `00-design-decisions.md` §1, §7, §11.
