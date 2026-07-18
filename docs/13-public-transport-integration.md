# 2DAY — Public Transport Integration

> Elaborates the transit stack fixed in [`00-design-decisions.md`](./00-design-decisions.md): OTP2
> over OVapi GTFS + GTFS-RT, NS API as disruption enrichment, and the on-device Field Brain that
> issues "time until train" / "leave now" nudges. Transit is decided; this document specifies the
> ingestion, deployment, data flow, and re-planning behavior. Estimates labeled `(est.)`.

Reps in the Netherlands commute by train and canvass on foot; the train home is a **hard deadline**
in L2 (see [doc 11 §3.4](./11-routing-algorithms.md)). Getting transit data right is therefore a
correctness requirement, not a nicety.

---

## 1. Why one national feed covers everyone

The Netherlands publishes **all** scheduled public transport through a single national pipeline
(OVapi / the NDOV loket). One GTFS static feed and one set of GTFS-RT feeds carry every operator:

| Operator | Modes | Regions (examples) |
|---|---|---|
| **NS** | heavy rail (Sprinter/Intercity) | national |
| **Arriva** | train, bus | Noord/Oost NL, Limburg |
| **Breng** | bus | Arnhem–Nijmegen |
| **GVB** | metro, tram, bus, ferry | Amsterdam |
| **HTM** | tram, bus | Den Haag |
| **RET** | metro, tram, bus | Rotterdam |
| **Connexxion** | bus | Randstad, Noord-Holland |
| **Qbuzz** | bus, train (MerwedeLingelijn), U-OV | Groningen/Drenthe, Utrecht |

Because they all arrive via one feed keyed by GTFS `agency_id`, 2DAY does **not** integrate operators
one-by-one. We ingest OVapi once; new operators appear automatically. NS is the only one we *also* hit
directly, purely to enrich disruption text (§2.4) — journey planning still goes through OTP2/OVapi.

---

## 2. OVapi ingestion

### 2.1 GTFS static

- **Source:** OVapi GTFS bundle (national), refreshed by the publisher on a roughly daily/weekly
  cadence; a new service calendar typically lands nightly.
- **Fetch cadence:** poll for a new bundle **nightly at ~02:00** (Europe/Amsterdam). Compare the
  published ETag/checksum; only rebuild when it changes.
- **Storage footprint:** the NL GTFS bundle is on the order of **hundreds of MB uncompressed**
  (`stop_times.txt` dominates — tens of millions of rows) `(est.)`. We keep the raw bundle in object
  storage (Supabase Storage) and the parsed graph inside OTP2 (§3). We do **not** load raw
  `stop_times` into Postgres; OTP2 owns timetable truth.
- What we *do* land in Postgres: a slim `stop` table (id, name, lat/lon, operator, parent station,
  `H3` cell) and a `route`/`agency` lookup, for fast station shortlisting in L1 without querying OTP2.

### 2.2 GTFS-RT feeds

Three realtime feeds, each a protobuf `FeedMessage`:

| Feed | Contents | Fetch cadence (est.) |
|---|---|---|
| **TripUpdates** | per-trip delays, skipped stops, added/cancelled trips | every **20–30 s** |
| **VehiclePositions** | live vehicle lat/lon, bearing, occupancy | every **15–30 s** |
| **ServiceAlerts** | disruptions, engineering works, stop closures | every **60 s** |

- **Deduplication:** GTFS-RT is a full snapshot each poll, not a delta. We diff against the last
  snapshot per `(trip_id, stop_sequence)` and only persist/emit *changes* in delay or status. A
  content hash of each `TripUpdate.trip` guards against reprocessing identical messages.
- **Storage footprint:** we keep realtime state in a **hot in-memory store (Redis)** keyed by
  `trip_id` with a short TTL (e.g. 90 s), plus an append-only `disruption_event` stream in Postgres
  (canonical entity, brief §6) for alerts only — not for every per-second delay tick. Positions are
  ephemeral (Redis only); persisting them is not worth the write volume (§[doc 16 load model](./16-scalability.md)).
- **Clock discipline:** all realtime timestamps normalized to UTC on ingest; display converts to
  Europe/Amsterdam. GTFS-RT `header.timestamp` staleness > 120 s marks the feed degraded.

### 2.3 Ingestion topology

```
OVapi GTFS-RT (protobuf)
      │ poll (20–60 s)
      ▼
[rt-ingestor]  ──diff/dedupe──▶  Redis (hot trip state, TTL)
      │                          │
      │ alerts only              │ realtime delays
      ▼                          ▼
Postgres disruption_event   Planner service / GTFS-RT fanout (doc 16)
      │
      ▼
Realtime channel ──▶ subscribed devices (Supabase Realtime)
```

The `rt-ingestor` is a small stateless worker; multiple replicas poll but a single leader writes (or
each writes idempotently keyed by content hash). It feeds OTP2's realtime updater (§3.3) *and* the
device fanout (§4).

### 2.4 NS API enrichment

OVapi carries NS trips and NS ServiceAlerts, but NS's own API has **richer disruption semantics**
(cause, expected duration, alternative-transport advice, station-level maintenance windows). We call
the NS **Disruptions** and **Travel Information** endpoints to enrich `disruption_event` records that
reference NS trips/stations:

- Match NS disruption → our `disruption_event` by station code + affected route.
- Enrich with human cause ("defect spoor tussen Utrecht en Den Bosch"), expected end time, and NS's
  advised alternative. This text feeds the rep-communication nudges (§4, §5) verbatim where possible —
  reps trust NS's own wording.
- NS is **enrichment only**. If the NS API is down, we still have OVapi ServiceAlerts and journey
  planning is unaffected.

---

## 3. OTP2 deployment

### 3.1 Role

OpenTripPlanner 2 is the **transit journey planner**. The 2DAY planner service (Fastify, Fly.io) calls
OTP2 for:

- **`plan` queries** — origin→destination itineraries with departure/arrival time, used by L1 to price
  commute legs and by re-planning when the return itinerary changes.
- **Reverse reachability** — "which stations can the rep reach from home within commute budget `C`,
  and when do they arrive?" (L1 §2.2). OTP2 does the timetable-aware part.

Walking-only distance/isochrone work is **Valhalla's** job, not OTP2's (brief §3). L1's area
reachability is the *combination*: OTP2 gets the rep to a station; Valhalla isochrones fan out on foot
from that station to areas.

### 3.2 Graph build pipeline (nightly)

```
02:00  fetch OVapi GTFS bundle (if changed)  +  Geofabrik NL OSM extract (weekly)
02:15  OTP2 graph build:  OSM street layer + GTFS timetables → Graph.obj
02:40  validate: smoke-test canned itineraries (Den Bosch→Eindhoven, A'dam Zuid→Utrecht CS)
02:45  publish Graph.obj to object storage; rolling-restart OTP2 replicas onto new graph
```

- **Cadence:** nightly, gated on a GTFS change (OSM changes weekly). A failed build keeps yesterday's
  graph and pages on-call — never serve a half-built graph.
- **Blue/green:** new graph loaded into a standby replica set; traffic cut over only after smoke tests
  pass, so a bad build never takes the planner down.

### 3.3 Realtime updater

OTP2 consumes the **GTFS-RT TripUpdates** feed via its built-in updater so `plan` queries reflect live
delays (a delayed Intercity changes the best return itinerary). Poll interval aligned to §2.2
(~30 s). ServiceAlerts also loaded so OTP2 can route around cancelled trips.

### 3.4 Memory sizing

OTP2 is memory-heavy — the whole NL graph lives in the JVM heap.

| Scale | Heap (est.) | Notes |
|---|---|---|
| NL national graph, MVP | **8–16 GB** heap | one graph, few replicas behind a LB |
| With realtime + headroom | 16–24 GB per instance | GC headroom for RT updates |
| At 100k reps (doc 16) | **shard by region** | e.g. Randstad / Zuid / Noord graphs, route by origin region; avoids one giant heap |

Instances are **read-only** at serve time (graph is immutable except RT updates), so they scale
horizontally by replication behind a load balancer. See [doc 16 §2](./16-scalability.md) for the
sharding plan.

### 3.5 API usage patterns from the planner

- L1 issues **one reverse-reachability query per compile** (batched to candidate stations) — cached per
  `(origin H3, 5-min departure bucket)` since morning compiles cluster in time.
- Re-planning issues a **`plan` query only when the return itinerary is in doubt** (train disrupted),
  not on every tick.
- We keep OTP2 request rates modest by caching aggressively (transit timetables are stable intra-day)
  and by pushing all *walking* distance work to Valhalla.

---

## 4. "Time until train" & "leave now" nudges

### 4.1 Data flow (online)

```
GTFS-RT TripUpdates ─▶ rt-ingestor ─▶ Redis(trip state) ─▶ Supabase Realtime channel
                                                               │  (device subscribes to its planned trips)
                                                               ▼
                                                   On-device Field Brain (rules, brief §9.3)
                                                               │
                            Valhalla-derived walk-time to platform (baked into Day Pack)
                                                               ▼
                              nudge: "Train in 11 min · 8 min walk · leave now"
```

- The device **subscribes only to the trips in its plan** (the planned return train + any transfer
  legs), not the national firehose — fanout is per-rep-relevant (doc 16 §1).
- The Field Brain holds two numbers: `T_train` = realtime departure of the planned train (from
  GTFS-RT), and `T_walk` = Valhalla pedestrian time from current GPS to the departure platform (baked
  as a small local time-to-station function in the Day Pack, refreshed as the rep moves).
- **Nudge logic (deterministic, brief §9.3):**
  ```
  slack = (T_train − now) − T_walk − platform_buffer
  if slack ≤ 0:            "Leave now — train in {T_train−now} min, {T_walk} min walk"
  elif slack ≤ 5 min:      "Wrap up — leave in {slack} min for the {T_train} train"
  else:                    show quietly in Route tab, no interruption
  ```
- Every nudge is a **template** (brief §9.3); the LLM only rewrites tone when online, and offline uses
  the raw template. This nudge is the field-critical one — it must work offline.

### 4.2 Offline / staleness handling

The rep is frequently in a stairwell or a rural buurt with no signal. Field-critical timing must not
depend on connectivity (brief §4).

- The **Day Pack** (brief §7) includes a **cached timetable slice**: the scheduled departures of the
  planned return train and its realistic alternatives (e.g. the next 2–3 trains on that line) for the
  planned window, plus the walk-time-to-station function.
- **Offline behavior:** the Field Brain falls back to the **scheduled** `T_train` from the cached
  slice and shows a **staleness badge** ("timetable — not live"). It still computes `slack` and still
  fires "leave now," just against the schedule rather than realtime.
- When connectivity returns, the last-known GTFS-RT delay for that trip (also cached with its
  timestamp) is applied and the badge clears once fresh (< 120 s old). We **never lie about staleness**
  (brief §7): the badge always reflects the age of the data driving the nudge.
- **Conservative bias offline:** when only schedule is available and the train line has a known delay
  distribution, the Field Brain nudges slightly *early* (subtract a safety margin) — better to catch
  an earlier train than miss the last one home.

---

## 5. Disruption-driven re-planning

### 5.1 Alert classification

Incoming ServiceAlerts / NS disruptions are classified on ingest into a small enum that drives
routing behavior:

| Class | Example | Effect |
|---|---|---|
| `INFO` | crowded train, minor works overnight | display only, no re-plan |
| `DELAY_MINOR` | planned train +5–10 min | update `T_train`; Field Brain adjusts slack; **no** L2 re-plan |
| `DELAY_MAJOR` | planned train +20 min or missed connection | **L2 re-plan**: deadline `T_max` moves → resequence remaining areas / pull earlier train |
| `TRIP_CANCELLED` | the planned return train cancelled | **L2 re-plan** onto next feasible itinerary (OTP2 `plan`); if none before `t_end`, **L1** re-plan (different station / mode) |
| `LINE_SUSPENDED` | section closed (e.g. Den Bosch–Eindhoven `defect spoor`) | **L1 re-plan** if it breaks the whole return; offer bus-replacement itinerary from OTP2 |
| `STATION_CLOSED` | departure station shut | **L1 re-plan**: new anchor/exit station |

### 5.2 Which level re-plans

Consistent with [doc 11 §6](./11-routing-algorithms.md):

- **L2** when the *deadline moves but the itinerary still exists* — resequence the day's remaining
  areas to hit the new train, or free up an earlier departure.
- **L1** when the *return itinerary breaks* — the choice of station or even working city is no longer
  valid; re-enumerate anchors (bus replacement, neighboring station, or bike/car fallback).
- **Never** re-plan on `INFO`/`DELAY_MINOR` — that would be alert spam; the Field Brain just adjusts
  the displayed slack.

### 5.3 Rep communication pattern

Disruptions are surfaced through the same "app decides, rep overrides" pattern (brief §2, principle 3):

1. **Single-line alert** at the top of the **Route** tab with NS's own wording where available (§2.4):
   *"Intercity 3541 cancelled — defect spoor Utrecht–Den Bosch."*
2. **One recommended action**, already computed: *"New plan: leave from Vught at 17:22, still home by
   18:40. Tap to accept."* Never present the raw re-plan search; present the answer.
3. **Override affordance:** "Other options" reveals at most 2 alternatives (brief §2: never >3 total).
4. If offline when the alert would have arrived, the cached-timetable Field Brain still enforces the
   *scheduled* deadline and warns on reconnect that a disruption was missed while offline.

Alerts are also written to the `disruption_event` stream so the daily review (brief §9.4) can explain
"you switched trains because of X," and so org analytics can see disruption impact on productive hours.

---

## 6. Bike & car as secondary transport

Transit is primary, but many reps drive or bike to a canvassing city, especially outside the Randstad.
These are **park-and-walk** modes: the vehicle gets the rep to an anchor, then canvassing is on foot.

### 6.1 Parameter differences

| Aspect | Transit | Bike | Car |
|---|---|---|---|
| Reach engine | OTP2 (timetable) | Valhalla (bike costing) | Valhalla (auto costing) |
| Anchor type | station | bike rack / any area edge | P+R, free-parking POI, garage |
| "Deadline" | train departure (hard) | none (leave anytime) | parking time limit / paid-parking window |
| Cost term | fare (OVapi/NS pricing) | ~0 | fuel + parking + (EV charge, brief EV model) |
| Re-plan on disruption | yes (GTFS-RT) | roadworks (NDW) only | roadworks + parking availability |
| Weather sensitivity | low | **high** (rain strongly deters biking) | low |

- **Bike** removes the hard train deadline, which simplifies L2 (the deadline becomes only `t_end`),
  but adds strong weather coupling — the "easy day" and rain-risk terms (doc 11 §2.4) weigh heavier.
- **Car** reintroduces a soft deadline via **parking constraints**: a 2-hour `blauwe zone` or a paid
  P+R window becomes a time window on the anchor (like the gym window), and the EV model (brief §3)
  budgets charge/range so the return trip is feasible.

### 6.2 Park-and-walk anchor selection

For bike/car, L1's "station reachability" (doc 11 §2.2) is replaced by **anchor reachability** via
Valhalla:

```
anchors = valhalla_reachable_anchors(O, cost=mode, max_time=C)
   candidates =  P+R sites, public garages, free-parking POIs (car)
               | bike racks, any area-adjacent node (bike)
score_anchor(a) =  day_potential_near(a)                 # same area shortlist as transit
                 − parking_cost(a) − parking_risk(a)      # car: paid? full? time-limited?
                 − access_walk(a, area_set)               # walk from parking to first door
```

- Prefer anchors that minimize *paid* time and are central to the chosen area-set (park once, canvass a
  loop, return) — the L3 loop should ideally return near the vehicle so it is not an out-and-back to
  the car.
- Car anchors carry the parking window into L2 as a constraint; if the plan would overrun the parking
  limit, L2 either drops an area or the Field Brain nudges "move the car / feed the meter."

---

## 7. Cross-references

- L1 station/anchor reachability, L2 train deadline as hard constraint, re-opt levels →
  [doc 11](./11-routing-algorithms.md) §2, §3.4, §6.
- GTFS-RT fanout volume, OTP2 sharding, caching → [doc 16](./16-scalability.md).
- Day Pack contents, offline staleness policy, entity `disruption_event` → `00-design-decisions.md` §6–7.
- Field Brain nudge templates & AI role → `00-design-decisions.md` §9.
