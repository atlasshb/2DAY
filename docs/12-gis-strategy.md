# 2DAY — GIS Strategy

> Elaborates `00-design-decisions.md` §3–§7. Covers open-data ingestion, door-side modeling for L3
> arc-routing, H3 scoring tiles, offline map serving, and CRS/geometry hygiene. Entity names and the
> schema come from doc 08; scoring math from doc 14.

## 1. CRS baseline (recap, authoritative for GIS jobs)

- **Serve/store in EPSG:4326.** MapLibre, PMTiles, H3, and every client geometry are WGS84.
- **Compute metric ops in EPSG:28992 (RD New).** Door-side projection, door spacing, edge length,
  buffers, and nearest-edge search run on the `geom_rd` columns. RD New is planar meters over NL with
  ~mm fidelity; doing these in 4326 degrees would distort by ~cos(52°) ≈ 0.62 in the x-axis.
- Every ingest job reprojects the source (BAG/CBS/OSM are natively 28992 or 4326) into **both**
  representations at load time. Never reproject in the request path for hot ops.

## 2. Ingestion pipelines

All pipelines write only via the Postgres `service_role` (doc 08 §10), are **idempotent** (re-running
a snapshot converges to the same rows), and stamp every row with a `snapshot_version` so historical
stats survive open-data churn (doc 14 §data-quality). Orchestrated by a small scheduler (GitHub
Actions cron for MVP → Temporal in V2); each job is a container running `ogr2ogr`/`osmium`/a TS or
Python worker.

| Source | Entity | Tool | Cadence | Idempotency key |
|---|---|---|---|---|
| **BAG** (LVBAG extract, Kadaster/PDOK) | `building`, `address_unit` | GDAL **LVBAG driver** via `ogr2ogr` | full **monthly**, mutations daily (V2) | `(pand_id\|vbo_id, snapshot_version)` |
| **CBS Wijken & Buurten** + kerncijfers | `area` | `ogr2ogr` (GeoPackage) + CSV join | **annual** (+ ad-hoc corrections) | `(buurt_code, snapshot_version)` |
| **OSM** (Geofabrik `netherlands-latest.osm.pbf`) | `street_edge` + Valhalla graph | `osmium` + custom TS builder; `valhalla_build_tiles` | **weekly** | `(osm_way_id, snapshot_version)` |
| **EP-Online** energy labels (RVO) | `address_unit.energy_label` | Python worker (bulk CSV) | **monthly** | `(postcode, huisnummer, toevoeging)` |
| **POI seed** (Basic-Fit et al., OSM `brand=*` + scrapes) | `poi` | TS worker + community corrections queue | ad-hoc / **weekly** refresh | natural key on `(brand, geom)` |
| **NDW roadworks / OVapi / KNMI** | `disruption_event` | streaming workers | live (minutes) | `(source, external_id)` |

### 2.1 BAG → building / address_unit

GDAL ships a native **LVBAG** driver, so the XML extract loads directly:

```bash
# Reproject 28992 → 4326 for the served column; keep a parallel 28992 load for geom_rd.
ogr2ogr -f PostgreSQL "$PG" 9999VBO08012026.xml \
  -nln stg_bag_vbo -lco GEOMETRY_NAME=geom -t_srs EPSG:4326 \
  -oo AUTOCORRECT_INVALID_DATA=YES
```

An upsert MERGE from the staging tables into `address_unit`/`building` sets `snapshot_version`
(the extract date), recomputes `geom_rd = st_transform(geom,28992)`, and runs door-side attribution
(§3) and H3 tagging (§4). Only rows whose `vbo_id`/`pand_id` payload changed are rewritten; the merge
is content-hashed so a re-run of the same extract is a no-op. BAG lifecycle (`voorkomen`, split/merge)
is handled in doc 14 §5 — surrogate `id` is stable, `vbo_id` may churn.

### 2.2 CBS → area

CBS publishes the buurt geometry (GeoPackage, EPSG:28992) plus a kerncijfers table. Load geometry,
join demographics by `buurt_code`, populate the `area` feature columns and `energy_label_mix`
(rolled up from EP-Online). `snapshot_version = 'cbs-2025'`. Because `area.id` is a stable surrogate,
a new CBS year inserts a new versioned row; visits and `score_cell` keep pointing at the surrogate,
so year-over-year boundary shifts never orphan history.

### 2.3 OSM → street_edge + Valhalla

```bash
# 1. Tag-filter to the routable + productive network.
osmium tags-filter netherlands-latest.osm.pbf \
  w/highway=residential,living_street,pedestrian,footway,service,unclassified,tertiary \
  -o nl-walk.osm.pbf
# 2. Valhalla pedestrian graph (matrices + isochrones for L1/L2, brief §5).
valhalla_build_tiles -c valhalla.json nl-walk.osm.pbf
# 3. Our productive subgraph: split ways at intersections into street_edge arcs.
node build-street-edges.ts nl-walk.osm.pbf   # emits LineStrings, length_m in 28992
```

`build-street-edges.ts` splits each OSM way at shared nodes so a `street_edge` is a single
intersection-to-intersection arc (the unit L3 routes over), computes `length_m`/`from_node`/`to_node`,
and leaves `doors_left/right` and `ev_*` to be filled by §3/§4. Valhalla graph and `street_edge` are
rebuilt from the **same** weekly pbf so routing and door attribution never drift.

### 2.4 POI & gym seeding (crowd-maintained attributes)

Gyms are the app's bag-drop pivot (brief §2), so `poi` where `kind = 'gym'` needs locker/shower
truth that no single open source carries. Pipeline:

1. **Seed** from OSM (`leisure=fitness_centre` + `brand=Basic-Fit|Anytime Fitness|SportCity|GymOne`)
   joined with brand store-locator scrapes for the authoritative location list → `poi` with
   `source = 'osm+scrape'`.
2. **Enrich** `attributes` (`has_shower`, `has_locker`, `day_pass`, `24h`) from brand data where
   published; unknown fields left null (never guessed).
3. **Correct** via an in-app community queue: a rep reporting "no lockers at Basic-Fit Maaspoort"
   writes a correction row that a moderation job folds into `attributes` with `verified_at`. This is
   the crowd-maintenance the brief §4 calls for and the substrate for V2 locker-availability
   estimates. Other POI kinds (coffee/lunch/water/toilet) seed straight from OSM tags.

### 2.5 Transit timetable slice (for the Day Pack)

Transit itself is served live by OTP2 over the OVapi feed (brief §3); the ingestion side we own is a
**per-Day-Pack GTFS slice** so the rep keeps a usable timetable offline (brief §7). At Day Pack build
we filter the national GTFS to (a) stops within the plan bbox + the arrival/departure stations, and
(b) trips on the plan's service date, emitting a compact stop_times subset (~tens of KB). GTFS-RT
(trip updates / alerts) is live-only and degrades to a visible staleness badge offline.

### 2.6 Idempotency & failure handling

Every job is: **stage → validate → merge → swap**. Stage into `stg_*`; validate row counts and
geometry validity against the prior snapshot (reject if >X% of rows vanish — guards a truncated
download); merge; then flip the `snapshot_version` pointer. A failed job leaves the live tables
untouched. Snapshots are retained (doc 14) so any version is reproducible.

## 3. Door-side modeling (address → edge + side)

L3 is a **Rural Postman Problem** where each street is serviced per-side (brief §5): a rep walks the
left kerb then the right. So every `address_unit` must resolve to **(street_edge, side, measure)**.
Algorithm, run in EPSG:28992 for metric correctness:

1. **Candidate edges.** kNN search: the 5 nearest `street_edge.geom_rd` within 40 m of the door
   point (`ORDER BY geom_rd <-> :door LIMIT 5`), restricted to `highway in (residential, living_street,
   pedestrian, service, unclassified)`.
2. **Nearest edge.** For each candidate, `ST_Distance(edge, door)`; pick the minimum. Reject if the
   nearest is > 35 m (likely a courtyard/back address → left `edge_side = NULL`, still visitable via
   geom, just not arc-routed).
3. **Measure.** `edge_measure = ST_LineLocatePoint(edge, door)` ∈ [0,1] — position along the arc,
   used to order doors within a side during the serpentine sweep.
4. **Side test (signed cross product).** Take the edge tangent at the projection point
   `P = ST_LineInterpolatePoint(edge, measure)` using a small Δ, giving direction `d = (P₊ − P₋)`.
   Let `r = door − P`. The sign of the 2D cross product `d.x*r.y − d.y*r.x` gives the side relative to
   the way's digitization direction: **> 0 → left, < 0 → right**.

```sql
-- Side of a door relative to its snapped edge (all in 28992). Returns 'left'/'right'.
with p as (
  select st_lineinterpolatepoint(e.geom_rd, least(0.999, m.frac + 0.001)) as p_plus,
         st_lineinterpolatepoint(e.geom_rd, greatest(0.0, m.frac - 0.001)) as p_minus,
         a.geom_rd as door
  from address_unit a
  join street_edge e on e.id = a.street_edge_id
  cross join lateral (select st_linelocatepoint(e.geom_rd, a.geom_rd) frac) m
  where a.id = :id)
select case when (st_x(p_plus)-st_x(p_minus))*(st_y(door)-st_y(p_minus))
               -(st_y(p_plus)-st_y(p_minus))*(st_x(door)-st_x(p_minus)) > 0
            then 'left' else 'right' end from p;
```

**Why per-side counts matter.** `street_edge.doors_left/right` and `ev_left/right` are prebaked by
aggregating attributed doors. A street with 40 doors left, 2 right is near-worthless to service
right-side; the arc-router treats each side as an independent *required arc* with its own prize
(Σ EV) and cost (length). This is what lets L3 choose "sweep the even side of Beethovenlaan, skip the
odd side" and build a near-Eulerian loop rather than an out-and-back.

Edge cases: dual-carriageway ways (side ambiguous → attribute to the physically nearer carriageway
edge), addresses on corners (measure near 0/1 → assign to the edge with smaller perpendicular
distance), and apartment blocks (many `vbo` share one entrance geom → collapse to one *knock point*
per `building` for door-count, expand for unit-level EV).

## 4. H3 scoring tiles

- **Resolution.** **Res 10** (edge ~65 m, ~15,000 m²) is the scoring grain — fine enough that a cell
  is roughly one street-block face, so per-cell EV is actionable for L3. **Res 9** (edge ~174 m,
  ~105,000 m²) is the heat/aggregation grain for the map overlay and Day Pack payload (fewer cells =
  smaller offline slice). Both live in `score_cell.resolution`; res-9 cells are the H3 parents of the
  res-10 set (`h3_cell_to_parent`).
- **Features per cell** (base, shared): `address_count`, `dwelling_mix`, `ownership_pct`,
  `income_band`, `label_mix`, `ev_prior`. Per-tenant posteriors (`ev_posterior`, Beta α/β, visit
  counts, decay clock) live in `score_cell_org` (doc 08 §6). The EV feature vector and its Bayesian
  update are specified in doc 14 §EV.
- **Prebake cadence.** The nightly learning loop (brief §9.5) recomputes `ev_prior` from the latest
  CBS/BAG/EP snapshot and `ev_posterior` from org-wide + personal visit history with 90-day half-life
  decay. Personal posteriors also update **incrementally on session close** so a rep's own heatmap
  reflects today before the batch runs.
- **Geometry.** `score_cell.geom` is the precomputed `h3_cell_to_boundary` polygon (4326) so overlay
  tiles render without live H3 calls; kept in sync when `resolution`/`h3` set changes.
- **Day Pack slicing.** Given the plan bounding box, `h3_polygon_to_cells(:bbox, 9)` yields the cell
  set; export the joined base+overlay rows as MessagePack (compact, ~40 B/cell). A city day is a few
  thousand cells → well under the 25 MB Day Pack budget (brief §7).

## 5. Map serving (PMTiles, offline-first)

### 5.1 Basemap build

The Protomaps basemap is built from the NL OSM extract with **planetiler**, producing a single
`nl-basemap.pmtiles` (all zooms, vector). No per-load billing, self-hosted (brief §3):

```bash
java -jar planetiler.jar --area=netherlands \
  --download --output=nl-basemap.pmtiles --force
```

Served over HTTP range requests from Supabase Storage / a CDN; MapLibre reads it directly via the
`pmtiles://` protocol.

### 5.2 Overlay tiles

Our derived layers (score heat, visited, do-not-knock) are cut with **tippecanoe** from GeoJSON
exports of `score_cell`/`visit`/`do_not_knock`, into per-layer PMTiles:

```bash
tippecanoe -o heat.pmtiles -l heat -Z8 -z15 \
  --drop-densest-as-needed --coalesce-densest-as-needed score_cells.geojson
```

Heat is org-scoped, rebuilt nightly; visited/do-not-knock are small and rebuilt on session close.

### 5.3 Per-Day-Pack extraction

The offline pack is a **bbox extract** of each PMTiles archive (basemap + relevant overlays), so the
rep carries only their plan's footprint:

```bash
pmtiles extract nl-basemap.pmtiles daypack-basemap.pmtiles \
  --bbox=5.26,51.68,5.36,51.74 --maxzoom=17   # Den Bosch Maaspoort footprint
```

Basemap capped at z17 (all street detail a walker needs); overlays at native zoom. Packs are cached
in the service worker; a staleness badge (brief §7) shows the snapshot date.

### 5.4 Address & door data slice

Beyond tiles, the Day Pack ships the **vector door data** the offline L3 re-order and 1-tap logging
need (brief §7): for every `street_edge` in the plan's areas, its geometry, `doors_left/right`,
per-side EV, and the attributed `address_unit` points (id, huisnummer, `edge_side`, `edge_measure`,
`gebruiksdoel`, do-not-knock flag). Exported as **FlatGeobuf** (indexed, streamable, ~50–100 B/door)
so the client can spatially query it on-device without inflating IndexedDB. A residential city loop is
a few thousand doors → a couple hundred KB, leaving the 25 MB budget dominated by basemap tiles.

### 5.5 Styling layers

MapLibre style JSON, Fieldkit tokens (brief §8), rendered bottom→top:

1. **Basemap** — land, water, landuse, buildings (subtle), roads, labels. Night/Sun variants swap the
   token palette; road casing uses `accent` #3B82F6 for the active route line.
2. **heat** — `score_cell` fill, opacity ramp on `ev` (transparent → warn amber), below labels.
3. **route** — active `plan_leg` lines: transit dashed, walk solid `accent`, L3 loop emphasized.
4. **visited** — today's `visit` points colored by the outcome palette (sale green, no-answer slate…).
5. **do-not-knock** — red (`danger` #EF4444) circles/hatch, always on top; a compliance layer that
   is never occluded.

## 6. Geometry hygiene & generalization

- **Validity on ingest.** Every polygon/line runs `ST_MakeValid` then an `ST_IsValid` assertion;
  `ogr2ogr -oo AUTOCORRECT_INVALID_DATA=YES` catches most BAG self-intersections at load. Invalid
  rows are quarantined to `stg_*_invalid`, never merged live.
- **Snapping / slivers.** `ST_SnapToGrid(geom, 0.001)` (~1 mm in 28992) removes duplicate vertices;
  buurt boundaries snapped to a shared grid to avoid cross-area slivers.
- **Node graph.** `street_edge` endpoints are snapped to a 0.5 m node grid so `from_node`/`to_node`
  are shared at true intersections — a hard requirement for the L3 arc graph to be connected.
- **Generalization per zoom.** Overlay tiles are simplified zoom-dependently by tippecanoe; `area`
  polygons additionally get `ST_SimplifyPreserveTopology` cached at ~1 m (z≥12), ~10 m (z8–11), ~50 m
  (z≤7). Doors and `street_edge` render only from z13 (never simplified — a mislocated door is a
  wasted knock). Topology-preserving simplification prevents gaps between neighboring buurten.
