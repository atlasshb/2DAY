# 2DAY — Offline & Sync

> Elaborates `00-design-decisions.md` §7 and design principle §2.4 ("Offline is a mode, not a
> failure"). Two halves: **reads** ship down as a **Day Pack** before the day starts; **writes** are
> **append-only events** in a Dexie outbox that sync idempotently. Field events are immutable facts,
> so the write path is conflict-free by construction; the tiny mutable set uses last-writer-wins.

## 1. Day Pack — the offline read bundle

Before a plan starts, the app downloads everything the field needs for that plan's bounding box, so
the five tabs (Today · Plan · Route · Log · Stats) all work with zero connectivity. Target
**< 25 MB** (`00` §7).

### 1.1 Manifest format

The Day Pack is a single directory (delivered as one signed-URL tarball, unpacked into Dexie +
Cache Storage) with a `manifest.json` at the root:

```jsonc
{
  "manifestVersion": 3,
  "planId": "01J8XR...ULID",
  "orgId": "01J8...", "repId": "01J8...",
  "builtAt": "2026-07-18T06:12:00+02:00",
  "validUntil": "2026-07-18T20:00:00+02:00",   // transit slice horizon
  "bbox": [5.28, 51.68, 5.36, 51.74],          // Den Bosch Maaspoort area, WGS84
  "h3Res": 9,
  "sizeBytes": 22715084,
  "sha256": "…",
  "contents": [
    { "kind": "pmtiles",   "path": "tiles/maaspoort.pmtiles", "bytes": 14200000,
      "minZoom": 10, "maxZoom": 17, "sha256": "…" },
    { "kind": "addresses", "path": "data/address_units.json", "bytes": 3900000,
      "count": 6120, "schema": "address_unit@2" },
    { "kind": "score_cells","path": "data/score_cells.json",  "bytes": 1350000,
      "count": 2140, "schema": "score_cell@2" },
    { "kind": "timetable",  "path": "data/timetable.json",    "bytes": 2100000,
      "stops": 41, "window": ["06:00","20:30"], "schema": "gtfs_slice@1" },
    { "kind": "pois",       "path": "data/pois.json",         "bytes": 260000,
      "count": 88, "schema": "poi@2" },
    { "kind": "plan",       "path": "data/plan.json",         "bytes": 84000,
      "schema": "plan@1" },
    { "kind": "street_edges","path": "data/street_edges.json","bytes": 720000,
      "count": 1830, "schema": "street_edge@2" },
    { "kind": "rain_frame", "path": "data/rain_last.png",     "bytes": 95000,
      "capturedAt": "2026-07-18T06:10:00+02:00" }
  ],
  "refresh": { "timetableTtlMin": 90, "rainTtlMin": 15, "scoresTtlDay": 1 }
}
```

### 1.2 Size budget (target < 25 MB)

| Content | Source | Est. size | Notes |
|---|---|---|---|
| PMTiles extract | Protomaps basemap, plan bbox z10–17 | ~14 MB | Dominant cost; bbox-clipped, not city-wide |
| Address/door slice | BAG `verblijfsobject` in bbox | ~3.9 MB | id, point, dwelling type, floors, energy label |
| Street edges | OSM residential subgraph | ~0.7 MB | door counts per side, EV weights (for on-device L3) |
| Score cells | H3 res-9 EV features | ~1.35 MB | `α,β` posteriors + density (from doc 10 §6 batch) |
| Timetable slice | OVapi GTFS, planned stops only | ~2.1 MB | departures 06:00–20:30 for the ~40 relevant stops |
| POIs | gyms/coffee/toilet/water in bbox | ~0.26 MB | gym locker/shower attrs, opening hours |
| Plan + legs | `plan`, `plan_leg` | ~0.08 MB | the compiled day |
| Rain frame | KNMI/Buienradar last radar PNG | ~0.1 MB | last-known frame for offline nowcast display |
| **Total** | | **~22.5 MB** | headroom under 25 MB; over-budget bbox ⇒ split day |

### 1.3 Build pipeline & delivery

`POST /v1/daypack/:planId` (doc 09 §3.4) → planner job: (1) compute bbox from `plan` geometry + a
buffer; (2) `pmtiles extract` the basemap to the bbox; (3) SQL-slice `address_unit`, `street_edge`,
`score_cell`, `poi` by bbox via PostGIS (RLS-scoped to org); (4) OTP2/GTFS slice the timetable for
the plan's stops and window; (5) fetch the latest rain frame; (6) assemble `manifest.json`, hash
every part; (7) upload the tarball to **Supabase Storage** under `daypacks/{org_id}/{plan_id}/…`;
(8) return a **15-min signed URL**. The client fetches over the service worker, verifies `sha256`,
and unpacks into Dexie (data) + Cache Storage (PMTiles/rain frame).

### 1.4 Refresh semantics

The Day Pack is a **snapshot**; parts refresh independently on their TTL when connectivity allows:
timetable every 90 min (planned times; realtime deltas come over the wire when online), rain frame
every 15 min, scores daily. Each stale part renders a **visible staleness badge** (§4 UI contract),
never silently-old data. If a refresh can't complete, the field keeps working on the snapshot with
the badge showing how old it is.

## 2. Client store (Dexie) & sync protocol

### 2.1 Dexie schema

```ts
// db.ts — Dexie 4, IndexedDB. Version bumps are additive; migrations never drop event tables.
const db = new Dexie("twoday");
db.version(3).stores({
  // --- append-only event tables (the outbox is the source of truth for writes) ---
  outbox:        "ulid, [synced+ts], entity, synced",        // ULID pk; queue for push
  visit:         "ulid, [planId+seq], addressUnitId, ts",    // materialized from events (read model)
  breadcrumb:    "ulid, ts",                                  // GPS points (append-only)
  session_mark:  "ulid, workSessionId, ts",

  // --- Day Pack read models (replaced wholesale on refresh; not synced up) ---
  address_unit:  "id, buildingId, *h3, dwellingType",
  street_edge:   "id, areaId, *h3",
  score_cell:    "h3, areaId",
  poi:           "id, kind, *h3",
  plan:          "id, planVersion",
  plan_leg:      "id, [planId+seq]",

  // --- mutable, LWW-per-field (small) ---
  settings:      "key, updatedAt",
  plan_tweak:    "planId, updatedAt",

  // --- sync bookkeeping ---
  sync_meta:     "key",                                       // cursors, device id, clock skew
  tombstone:     "ulid, ts"
});
```

Indexes chosen for the field read paths: `visit[planId+seq]` (render the Log tab in order),
`address_unit *h3` and `score_cell h3` (spatial lookups for the map + on-device L3), `outbox
[synced+ts]` (drain unsynced oldest-first).

### 2.2 The append-only outbox

Every field write is an **event** appended to `outbox`, never an in-place mutation. Event ids are
**ULIDs generated from a device clock plus a monotonic counter**, so ids are unique and roughly
time-ordered even across a clock adjustment:

```ts
interface OutboxEvent {
  ulid: string;              // Crockford ULID: 48-bit ts + 80-bit randomness
  seq: number;              // per-device monotonic counter, survives reload (sync_meta.lastSeq)
  deviceId: string;         // per-install UUID
  deviceClockMs: number;    // Date.now() at creation
  entity: "visit" | "breadcrumb" | "session_mark" | "plan_tweak" | "settings";
  op: "append" | "upsert";  // append = immutable fact; upsert = LWW mutable
  payload: unknown;         // e.g. { addressUnitId, outcome, planId, legId, ... }
  synced: 0 | 1;
  ts: number;               // = deviceClockMs, for ordering the queue
}
```

A ULID is minted per event; `seq` is the monotonic counter persisted in `sync_meta.lastSeq` and
bumped atomically inside the same Dexie transaction that appends the event, so two events created in
the same millisecond still order deterministically and a reload never reuses a counter.

### 2.3 Push (client → server): idempotent at-least-once

```ts
// POST (PostgREST rpc) /rpc/sync_push  { events: OutboxEvent[] }  — batches of ≤ 200
// Server upserts on primary key = ulid. Re-sending an already-applied event is a no-op.
interface SyncPushResult {
  applied: string[];        // ulids the server committed (first time)
  duplicates: string[];     // ulids already present — client marks synced, no error
  rejected: { ulid: string; code: string }[]; // schema/tenant failures (rare; quarantined)
  serverCursor: string;     // opaque; advances the pull cursor floor
}
```

Contract: **at-least-once** delivery, **server dedupe on `ulid`**. The client drains `outbox` where
`synced=0` oldest-first, POSTs a batch, and on `applied ∪ duplicates` flips those rows to
`synced=1`. A dropped connection mid-flight is safe: retried events land as `duplicates`. Because
append events are immutable facts, there is no conflict to resolve on push — two devices submitting
the same door outcome (same `addressUnitId`, same rep) simply produce two distinct events; the read
model (§3.1) merges them.

### 2.4 Pull (server → client): per-device cursor over a change-log

```ts
// GET (PostgREST rpc) /rpc/sync_pull?cursor=<opaque>&limit=500
interface SyncPullResult {
  changes: ServerChange[];  // ordered by server change-log sequence
  nextCursor: string;       // persist to sync_meta; monotonic per device
  hasMore: boolean;
}
interface ServerChange {
  changeSeq: number;        // server-assigned, gap-free per consumer
  entity: string; id: string;
  kind: "put" | "tombstone";
  row?: unknown;            // full row for put
  serverTs: string;        // authoritative timestamp (LWW basis)
}
```

The server keeps a **change-log** (a `change_log` table fed by triggers on the synced tables, RLS-
scoped to the rep/org) and a **per-device cursor** in `sync_meta`. Pull is idempotent and resumable:
replaying from an old cursor re-emits the same ordered changes; the client applies them by primary
key. This is how a second device (or a reinstall) reconstructs state, and how org-shared facts
(new `disruption_event`, org `do_not_knock` additions) reach the rep.

### 2.5 LWW-per-field for the mutable few

Only `settings` and `plan_tweak` are mutable. They resolve **last-writer-wins per field** on
**server timestamp** (`00` §7), not per-row, so two devices editing different fields don't clobber
each other:

```ts
function mergeLWW<T extends object>(local: FieldStamped<T>, incoming: FieldStamped<T>): FieldStamped<T> {
  const out = { ...local };
  for (const k of allKeys(local, incoming)) {
    // each field carries its own serverTs; the later serverTs wins that field only
    if (incoming[k].serverTs > (local[k]?.serverTs ?? "")) out[k] = incoming[k];
  }
  return out;
}
```

The server stamps `serverTs` on write (client clocks are untrusted for LWW; they're only used to
*order the outbox*, not to win merges). Ties (identical `serverTs`) break on `deviceId` for
determinism.

### 2.6 Tombstones

Deletes (rare — a mistaken `plan_tweak`, a settings reset) are **tombstone events**, never hard
deletes, so a lagging device learns of the delete on pull instead of resurrecting the row. Append
events (`visit`, `breadcrumb`) are **never** tombstoned by reps — a wrong door outcome is corrected
with a *new* corrective event (an `amends` pointer to the prior ULID), preserving the immutable
audit trail (relevant to doc 17 retention/DSR). Tombstones are GC'd server-side after all device
cursors pass them.

## 3. Conflict walk-throughs

### 3.1 Same visit logged offline on two devices

A rep carries a phone and a backup tablet, both offline, and (by mistake) logs door
`address_unit#6120` as `conversation` on each. Each device appends its own event with a distinct
ULID (`01J8A…` on the phone, `01J8B…` on the tablet). On reconnect both push; the server stores two
distinct rows (no key collision — different ULIDs). The **read model** (§3.2) keys `visit` state by
`(addressUnitId, repId)` and collapses the two events into one logical visit, taking the latest by
`deviceClockMs`, so the Log tab and the Stats counters show **one** conversation, not two. No
conflict dialog, no lost data, and the raw event pair remains for audit. *Why it works:* immutability
+ idempotent keys mean duplicates are a merge concern, never a write conflict.

### 3.2 Read-model collapse rule

```ts
// visit read model: group append events by (addressUnitId, repId); latest wins for "current outcome",
// but ALL events are retained. Corrective events (op amends prior ulid) supersede the amended one.
function currentOutcome(events: VisitEvent[]): Outcome {
  const live = events.filter(e => !isAmended(e, events));
  return live.sort((a, b) => a.deviceClockMs - b.deviceClockMs).at(-1)!.outcome;
}
```

### 3.3 Offline plan tweak vs server re-plan

At 14:30 the rep, offline, drags the Maaspoort loop earlier (`plan_tweak.legOrder`, stamped locally).
At 14:31 the planner, reacting to a GTFS-RT cancellation, publishes a server **re-plan**
(`plan.planVersion` 3→4) with a new leg order. When the device reconnects it pulls both facts. Rule:
**a server re-plan supersedes offline tweaks to the same legs**, because the re-plan incorporates a
hard-constraint change (a cancelled train) the offline tweak couldn't know about. The client detects
that its tweak targeted legs the new `planVersion` reorders, discards the now-moot tweak, and shows a
non-blocking notice: *"Your reorder was replaced — your 15:10 train was cancelled, here's the new
route."* Tweaks that touch legs the re-plan left untouched are re-applied on top (LWW-per-field, §2.5).
*Why it works:* re-plans carry a monotonic `planVersion` and a `reason`, so supersession is a
deterministic comparison, and the rep is told the truth, never silently overridden without a reason.

## 4. Service worker strategy

Precache the **app shell** (HTML/JS/CSS/fonts/icon set) on install for instant, offline-first boot.
Runtime caching per resource class:

| Resource class | Strategy | Rationale |
|---|---|---|
| App shell (versioned build assets) | **Precache**, cache-first, purge old on `activate` | Deterministic offline boot |
| PMTiles / rain frame (Day Pack) | **Cache-first**, keyed by `sha256` | Immutable snapshots; no revalidation |
| PostgREST reads (reference data) | **Stale-while-revalidate** | Show cached instantly, refresh in background |
| Planner compute (`/plans/*`, `/replan`) | **Network-only**, no cache | Compute must be fresh or explicitly offline-degraded |
| `sync_push` / `sync_pull` | **Network-only** + **Background Sync** queue | Retried when connectivity returns |
| Auth / Realtime WS | **Network-only** | Never cache credentials or live sockets |

**Background Sync.** On a failed `sync_push`, the outbox drain is registered with the **Background
Sync API** (`sync` tag `outbox-flush`); the browser retries when connectivity returns even if the tab
is closed. Where Periodic Background Sync is available (Android/Chromium), a `daypack-refresh` task
tops up stale timetable/rain parts.

**iOS PWA limitation + Capacitor V2 answer.** iOS Safari does **not** implement Background Sync or
Periodic Background Sync, and evicts a PWA's IndexedDB/Cache Storage after ~7 days without use. So on
iOS PWA the drain is **best-effort on next foreground** (a `visibilitychange` + online-event flush),
and we surface honest sync state (§5) rather than pretend a background flush happened. The decided
answer (`00` §3, §10) is the **Capacitor shell in V2**: native background execution, reliable
background GPS for breadcrumbs, a real background sync task, and native secure storage (doc 17). MVP
is PWA-first and simply flushes on foreground; V2 removes the iOS ceiling. We never rely on iOS
background sync for correctness — the outbox + idempotent push means "flush later on foreground" is
already safe, just less prompt.

## 5. Sync status UI contract (never lie about sync state)

Design principle: **explicit sync state, never lie** (`00` §7). The client exposes one honest status
derived from real queue + connectivity state, not an optimistic guess:

```ts
type SyncState =
  | { kind: "synced";     lastSyncedAt: string }                       // outbox empty, cursor current
  | { kind: "pending";    queued: number; oldestTs: string }           // events waiting to push
  | { kind: "syncing";    inFlight: number }                           // push/pull in progress
  | { kind: "offline";    queued: number; since: string }              // no connectivity
  | { kind: "error";      queued: number; retryInSec: number; code: string }; // will retry
```

Rules: (a) a door log is confirmed to the rep the instant it's **durably in the Dexie outbox** (that
is the source of truth), with a small "pending sync" dot — we never block the 1-tap log on the
network; (b) the badge shows the **real** queue depth and the age of the oldest unsynced event; (c)
staleness badges on Day Pack parts show **actual** capture age ("timetable 42 min old"), not "live";
(d) `error` states name a concrete retry, never a spinner that lies. The rep always knows exactly
what is and isn't on the server.

**Telemetry (PostHog, self-hosted EU).** We emit `sync_push_batch` (size, applied, duplicates,
rejected, latency), `sync_pull` (changes, cursor lag), `outbox_depth` sampled, `daypack_build`
(bytes, build ms), `daypack_stale_render` (which part, age), and `background_sync_fired` vs
`foreground_flush` (to quantify the iOS gap). Alerting watches p95 outbox age, rejected-event rate
(schema drift), and cursor lag (a device falling behind). No `visit` payloads or GPS go to
telemetry — sync *health* only, not sync *content* (doc 17).
