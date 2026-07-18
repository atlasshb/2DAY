# 2DAY — Database Schema (PostgreSQL 16 + PostGIS 3.4)

> Elaborates the canonical entities in `00-design-decisions.md` §6. All entity names are taken
> verbatim from the brief. This document is the runnable source of truth for the Supabase
> (Postgres 16) schema. DDL here is production-shaped: types, indexes, RLS, partitions, retention.

## 1. Conventions & extensions

```sql
create extension if not exists postgis;          -- 3.4
create extension if not exists postgis_topology; -- optional, RPP node graph hygiene
create extension if not exists h3;               -- h3-pg: H3 index helpers
create extension if not exists pg_trgm;          -- fuzzy street/name lookups
create extension if not exists btree_gist;       -- mixed btree+gist composite indexes
```

- **Primary keys.** Reference/aggregate rows use `uuid` (`gen_random_uuid()`). Field-generated
  append-only rows (`visit`, `gps_breadcrumb`, `work_session` marks) use a **client-generated ULID**
  so writes are idempotent offline (brief §7). ULID domain:

  ```sql
  create domain ulid as char(26)
    check (value ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'); -- Crockford base32, lexicographically time-sortable
  ```

- **Timestamps.** Always `timestamptz`, stored UTC. `occurred_at` = field event time (device clock,
  corrected on sync); `created_at` = server insert time.
- **Multi-tenancy.** Every *tenant* row carries `org_id uuid not null` and is guarded by RLS (§9).
  **Deviation from brief §6 (justified):** the shared **reference geodata** — `area`, `building`,
  `address_unit`, `street_edge`, `poi`, and the base `score_cell` — is derived wholesale from open
  data (BAG/CBS/OSM/EP-Online) and is *identical for every tenant*. Duplicating ~9M BAG units per org
  is untenable, so these tables are **global** (readable by all authenticated reps, writable only by
  the ingestion service role). Everything a tenant *produces* (`plan`, `visit`, `sale`, overlays,
  gamification, sync) carries `org_id` and is RLS-isolated. This preserves the brief's intent — tenant
  data is isolated, reps own their `visit` stream — without pathological storage blow-up.

## 2. CRS decision (store 4326, compute in 28992)

BAG/CBS/OSM are delivered in **RD New (EPSG:28992)**, the Dutch national grid, accurate to ~mm across
NL. Web serving (MapLibre, PMTiles, H3) requires **WGS84 (EPSG:4326)**. Decision:

- **Canonical/served geometry: `geometry(..., 4326)`.** Every geometry column the client or H3 touches.
- **Metric-critical geometry: a parallel `geom_rd geometry(..., 28992)`** on `address_unit`,
  `street_edge`, `building`. Door-side projection, door spacing, edge length, and buffers are computed
  in 28992 (planar meters, no `cos(lat)` distortion). We *store* rather than reproject-on-the-fly
  because these ops run in tight loops during L3 arc-routing.
- **`geography`** is used only for the rare cross-country great-circle distance (country-pluggability),
  never as the primary store.

## 3. Enum types

```sql
create type rep_role         as enum ('rep','team_lead','org_admin');
create type campaign_vertical as enum ('energy','telecom','solar','charity','internet','insurance','home_services');
create type visit_outcome    as enum ('no_answer','conversation','sale','not_interested','follow_up','do_not_knock','inaccessible');
create type poi_kind         as enum ('gym','coffee','lunch','water','toilet','parking','locker','station');
create type plan_leg_kind    as enum ('transit','walk','gym','canvass','break','wait');
create type plan_status      as enum ('draft','compiled','active','completed','abandoned');
create type goal_preset      as enum ('max_sales','easy_day','highest_income','shortest_walking','explore');
create type disruption_kind  as enum ('transit','roadworks','weather','street_closed');
create type edge_side        as enum ('left','right');
create type sync_op          as enum ('insert','correction','tombstone');
```

## 4. Tenancy & identity

```sql
create table org (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  country_pack text not null default 'NL',          -- §1 country-pluggable
  settings     jsonb not null default '{}',
  created_at   timestamptz not null default now()
);

create table team (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references org(id) on delete cascade,
  name       text not null,
  created_at timestamptz not null default now()
);

-- rep.id == auth.users.id (Supabase Auth). One profile row per authenticated rep.
create table rep (
  id               uuid primary key references auth.users(id) on delete cascade,
  org_id           uuid not null references org(id) on delete cascade,
  team_id          uuid references team(id) on delete set null,
  role             rep_role not null default 'rep',
  display_name     text not null,
  walking_speed_mps numeric(3,2) not null default 1.35,  -- learned per rep, feeds Valhalla costing
  home_geom        geometry(Point,4326),
  preferences      jsonb not null default '{}',           -- goal presets, carry prefs, quiet hours
  created_at       timestamptz not null default now()
);
create index on rep (org_id, team_id);

create table campaign (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references org(id) on delete cascade,
  vertical         campaign_vertical not null,
  name             text not null,
  commission_model jsonb not null,        -- {type:'flat'|'tiered', eur:..., tiers:[...]}
  target_filter    jsonb not null default '{}',  -- e.g. {ownership_min:0.4, energy_label_in:['E','F','G']}
  active           boolean not null default true,
  valid_from       date,
  valid_to         date,
  created_at       timestamptz not null default now()
);
create index on campaign (org_id) where active;
```

## 5. Reference geodata (global, shared)

```sql
-- area == CBS buurt (brief §4 maps 1:1). Carries computed CBS features.
create table area (
  id              uuid primary key default gen_random_uuid(),
  buurt_code      text not null,          -- CBS 'BU0772...'
  wijk_code       text not null,
  gemeente_code   text not null,
  name            text not null,
  geom            geometry(MultiPolygon,4326) not null,
  geom_rd         geometry(MultiPolygon,28992) not null,
  population       int,
  households       int,
  income_median    int,        -- € gestandaardiseerd inkomen
  ownership_pct    numeric(4,3),
  rental_pct       numeric(4,3),
  avg_household_sz numeric(3,1),
  pct_65plus       numeric(4,3),
  address_density  numeric,    -- units / km²
  solar_pct        numeric(4,3),
  energy_label_mix jsonb,      -- {A:..,B:..,...} from EP-Online rollup
  snapshot_version text not null,  -- e.g. 'cbs-2025'
  updated_at      timestamptz not null default now(),
  unique (buurt_code, snapshot_version)
);
create index area_geom_gix   on area using gist (geom);
create index area_geom_rd_gix on area using gist (geom_rd);

-- building == BAG pand
create table building (
  id          uuid primary key default gen_random_uuid(),
  pand_id     text not null,               -- BAG identificatie
  bouwjaar    int,
  status      text,                        -- 'Pand in gebruik' etc
  num_units   int,
  geom        geometry(MultiPolygon,4326) not null,
  geom_rd     geometry(MultiPolygon,28992) not null,
  snapshot_version text not null,
  unique (pand_id, snapshot_version)
);
create index building_geom_gix on building using gist (geom);

-- address_unit == BAG verblijfsobject ("the door")
create table address_unit (
  id            uuid primary key default gen_random_uuid(),
  vbo_id        text not null,             -- BAG identificatie (may churn; see doc 14 §5)
  building_id   uuid references building(id),
  area_id       uuid references area(id),
  street_edge_id uuid references street_edge(id),
  edge_side     edge_side,                 -- computed, doc 12 §2
  edge_measure  numeric(6,5),              -- 0..1 position along edge (ST_LineLocatePoint)
  postcode      char(6),                   -- '5232AB'
  huisnummer    int,
  huisletter    char(1),
  toevoeging    text,
  straat        text,
  woonplaats    text,
  gebruiksdoel  text,                      -- 'woonfunctie', 'kantoorfunctie', ...
  oppervlakte   int,                       -- m²
  energy_label  char(2),                   -- 'A','B',... joined from EP-Online
  energy_src    text,
  geom          geometry(Point,4326) not null,
  geom_rd       geometry(Point,28992) not null,
  h3_r10        bigint,                    -- H3 res-10 cell (positive; H3 top bit is 0)
  snapshot_version text not null,
  unique (vbo_id, snapshot_version)
);
create index au_geom_gix      on address_unit using gist (geom);
create index au_edge_side_ix  on address_unit (street_edge_id, edge_side);
create index au_area_ix       on address_unit (area_id);
create index au_h3_ix         on address_unit (h3_r10);
create index au_pc_huisnr_ix  on address_unit (postcode, huisnummer);
-- Hot: "residential doors only" (L3 works the productive subgraph)
create index au_residential_ix on address_unit (street_edge_id, edge_side)
  where gebruiksdoel = 'woonfunctie';

-- street_edge == routable arc with per-side door counts (feeds L3 arc routing)
create table street_edge (
  id         uuid primary key default gen_random_uuid(),
  osm_way_id bigint not null,
  name       text,
  highway    text,                         -- residential/living_street/footway/...
  oneway     boolean not null default false,
  from_node  bigint,
  to_node    bigint,
  length_m   numeric(8,2),                 -- computed in 28992
  doors_left  int not null default 0,
  doors_right int not null default 0,
  ev_left    numeric,                       -- Σ EV of left-side doors (prebaked)
  ev_right   numeric,
  area_id    uuid references area(id),
  geom       geometry(LineString,4326) not null,
  geom_rd    geometry(LineString,28992) not null,
  snapshot_version text not null,
  unique (osm_way_id, snapshot_version)
);
create index se_geom_gix on street_edge using gist (geom);
create index se_area_ix  on street_edge (area_id);
create index se_name_trgm on street_edge using gin (name gin_trgm_ops);
-- Hot: candidate required-edges for L3 = residential edges with doors, by EV
create index se_productive_ix on street_edge (area_id, ((ev_left + ev_right)) desc)
  where highway in ('residential','living_street') and (doors_left + doors_right) > 0;

-- poi (gym/coffee/lunch/water/toilet/parking/locker/station)
create table poi (
  id         uuid primary key default gen_random_uuid(),
  kind       poi_kind not null,
  name       text,
  brand      text,                          -- 'Basic-Fit', 'NS'
  address    text,
  opening_hours jsonb,                       -- OSM opening_hours parsed to intervals
  attributes jsonb not null default '{}',    -- {has_shower:true, has_locker:true, day_pass:false}
  source     text,
  verified_at timestamptz,
  area_id    uuid references area(id),
  h3_r10     bigint,
  geom       geometry(Point,4326) not null
);
create index poi_geom_gix on poi using gist (geom);
create index poi_kind_ix  on poi (kind);
create index poi_gym_ix   on poi (kind) where kind = 'gym';
```

## 6. H3 scoring (base shared + per-tenant overlay)

```sql
-- Base cell: open-data-derived features + global prior. Shared across orgs.
create table score_cell (
  h3            bigint primary key,          -- res 9 or 10, disambiguated by resolution col
  resolution    smallint not null,           -- 9 (heat/day-pack) or 10 (scoring), brief §3
  area_id       uuid references area(id),
  geom          geometry(Polygon,4326) not null,  -- precomputed h3ToGeoBoundary
  address_count int not null default 0,
  dwelling_mix  jsonb,                        -- {woning:..,appartement:..}
  ownership_pct numeric(4,3),
  income_band   smallint,
  label_mix     jsonb,
  ev_prior      numeric not null default 0,  -- EV(door) prior from CBS/BAG features (§EV, doc 14)
  snapshot_version text not null,
  updated_at    timestamptz not null default now()
);
create index score_cell_geom_gix on score_cell using gist (geom);
create index score_cell_res_ix   on score_cell (resolution);

-- Overlay: per-org (rep_id NULL) and per-rep posteriors. Tenant-isolated.
create table score_cell_org (
  h3          bigint not null,
  org_id      uuid not null references org(id) on delete cascade,
  rep_id      uuid references rep(id) on delete cascade,  -- NULL = org-level aggregate
  ev_posterior numeric not null default 0,
  alpha        numeric not null default 1,   -- Beta(α,β) for P(answer), decayed pseudo-counts
  beta         numeric not null default 1,
  n_visits     int not null default 0,
  n_answers    int not null default 0,
  n_sales      int not null default 0,
  last_visit_at timestamptz,
  decayed_at    timestamptz,                  -- last time 90-day half-life applied
  updated_at    timestamptz not null default now(),
  -- COALESCE trick makes (h3, org, rep|org-sentinel) unique incl. the NULL rep row
  primary key (h3, org_id, coalesce(rep_id, '00000000-0000-0000-0000-000000000000'::uuid))
);
create index sco_org_ix on score_cell_org (org_id, h3) where rep_id is null;
```

## 7. Planning

```sql
create table plan (
  id                 ulid primary key,       -- client can pre-mint for offline draft
  org_id             uuid not null references org(id) on delete cascade,
  rep_id             uuid not null references rep(id) on delete cascade,
  request            jsonb not null,          -- typed PlanRequest (brief §9)
  goal_preset        goal_preset not null default 'max_sales',
  status             plan_status not null default 'draft',
  work_start         timestamptz,
  work_end           timestamptz,
  start_point        geometry(Point,4326),
  end_point          geometry(Point,4326),
  arrival_station_id uuid references poi(id),
  departure_station_id uuid references poi(id),
  departure_train_at timestamptz,             -- hard L2 deadline (brief §5)
  expected_value       numeric,
  expected_conversations numeric,
  total_walk_m        numeric,
  compiled_at        timestamptz,
  created_at         timestamptz not null default now()
);
create index plan_rep_ix on plan (org_id, rep_id, created_at desc);
create index plan_active_ix on plan (rep_id) where status = 'active';

-- top plan + 2 alternatives (brief §5 L1 output)
create table plan_alternative (
  id              uuid primary key default gen_random_uuid(),
  plan_id         ulid not null references plan(id) on delete cascade,
  rank            smallint not null,          -- 0 = chosen
  summary         text,                        -- Sonnet plan-explainer text (brief §9.2)
  expected_value  numeric,
  chosen          boolean not null default false,
  payload         jsonb not null              -- rejected-candidate detail for audit
);
create index plan_alt_ix on plan_alternative (plan_id, rank);

create table plan_leg (
  id             uuid primary key default gen_random_uuid(),
  plan_id        ulid not null references plan(id) on delete cascade,
  org_id         uuid not null references org(id) on delete cascade,
  seq            smallint not null,
  kind           plan_leg_kind not null,
  area_id        uuid references area(id),
  from_poi_id    uuid references poi(id),
  to_poi_id      uuid references poi(id),
  geom           geometry(LineString,4326),   -- transit shape or Valhalla walk path or L3 loop
  planned_start  timestamptz,
  planned_end    timestamptz,
  distance_m     numeric,
  expected_conversations numeric,
  payload        jsonb not null default '{}',  -- {gtfs_trip_id, arc_route_edges:[...], costing}
  unique (plan_id, seq)
);
create index plan_leg_ix on plan_leg (plan_id, seq);
```

## 8. Execution (append-only, partitioned)

```sql
create table work_session (
  id          ulid not null,
  org_id      uuid not null references org(id) on delete cascade,
  rep_id      uuid not null references rep(id) on delete cascade,
  plan_id     ulid references plan(id),
  device_id   uuid not null,
  started_at  timestamptz not null,
  ended_at    timestamptz,
  start_geom  geometry(Point,4326),
  end_geom    geometry(Point,4326),
  summary     jsonb not null default '{}',      -- filled on session close (doc 14 lifecycle)
  closed      boolean not null default false,
  primary key (id)
);
create index ws_rep_ix on work_session (org_id, rep_id, started_at desc);

-- visit == append-only door event (brief §6). RANGE-partitioned monthly on occurred_at.
create table visit (
  id               ulid not null,
  org_id           uuid not null,
  rep_id           uuid not null,
  work_session_id  ulid not null,
  address_unit_id  uuid,                        -- NULL if off-BAG (rare); geom always present
  street_edge_id   uuid,
  edge_side        edge_side,
  campaign_id      uuid,
  outcome          visit_outcome not null,
  occurred_at      timestamptz not null,        -- PARTITION KEY
  client_seq       bigint not null,             -- device monotonic counter (idempotency)
  device_id        uuid not null,
  geom             geometry(Point,4326),
  dwell_seconds    int,
  note             text,
  corrects_visit_id ulid,                        -- correction event target (doc 14 §event taxonomy)
  op               sync_op not null default 'insert',
  created_at       timestamptz not null default now(),
  primary key (id, occurred_at)                  -- partition key must be in PK
) partition by range (occurred_at);

-- idempotent sync: a (device, client_seq) pair may only land once
create unique index visit_idem_ix on visit (device_id, client_seq);
create index visit_rep_time_ix   on visit (org_id, rep_id, occurred_at desc);
create index visit_session_ix    on visit (work_session_id);
create index visit_addr_ix       on visit (address_unit_id, occurred_at desc);
create index visit_edge_ix       on visit (street_edge_id, edge_side);
create index visit_geom_gix      on visit using gist (geom);
-- Hot: unresolved do-not-knock lookups
create index visit_dnk_ix on visit (org_id, address_unit_id)
  where outcome = 'do_not_knock' and op = 'insert';

-- gps_breadcrumb == high-volume GPS trail (V2 background GPS). Partitioned + short retention.
create table gps_breadcrumb (
  id              ulid not null,
  org_id          uuid not null,
  rep_id          uuid not null,
  work_session_id ulid not null,
  occurred_at     timestamptz not null,          -- PARTITION KEY
  geom            geometry(Point,4326) not null,
  accuracy_m      real,
  speed_mps       real,
  battery_pct     smallint,
  device_id       uuid not null,
  primary key (id, occurred_at)
) partition by range (occurred_at);
create index bc_session_ix on gps_breadcrumb (work_session_id, occurred_at);
create index bc_geom_gix   on gps_breadcrumb using gist (geom);

create table sale (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references org(id) on delete cascade,
  rep_id      uuid not null references rep(id) on delete cascade,
  visit_id    ulid not null,                     -- soft ref to visit (no FK to partitioned table)
  visit_occurred_at timestamptz not null,        -- carries partition key for lookups
  campaign_id uuid not null references campaign(id),
  amount      numeric(10,2),
  commission  numeric(10,2),
  product     jsonb not null default '{}',
  contract_ref text,
  status      text not null default 'pending',   -- pending/confirmed/cancelled/clawback
  occurred_at timestamptz not null,
  created_at  timestamptz not null default now()
);
create index sale_rep_ix on sale (org_id, rep_id, occurred_at desc);
create index sale_campaign_ix on sale (campaign_id, status);

create table disruption_event (
  id          uuid primary key default gen_random_uuid(),
  kind        disruption_kind not null,
  source      text not null,                     -- 'OVapi','NDW','KNMI'
  external_id text,
  severity    text,
  geom        geometry(Geometry,4326),           -- point/line/polygon per source
  area_id     uuid references area(id),
  starts_at   timestamptz,
  ends_at     timestamptz,
  payload     jsonb not null default '{}',
  ingested_at timestamptz not null default now(),
  unique (source, external_id)
);
create index de_geom_gix on disruption_event using gist (geom);
create index de_active_ix on disruption_event (starts_at, ends_at);

-- Compliance materialization of do_not_knock (brief §11 AVG). Derived from visits, org-scoped.
create table do_not_knock (
  org_id          uuid not null references org(id) on delete cascade,
  address_unit_id uuid not null references address_unit(id),
  reason          text,
  created_at      timestamptz not null default now(),
  expires_at      timestamptz,                    -- some ordinances allow re-approach after N months
  primary key (org_id, address_unit_id)
);
```

## 9. Gamification & sync

```sql
create table achievement (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references org(id) on delete cascade,
  rep_id     uuid not null references rep(id) on delete cascade,
  kind       text not null,                      -- 'first_100_doors','rainy_day_hero'
  awarded_at timestamptz not null default now(),
  payload    jsonb not null default '{}'
);
create table streak (
  org_id      uuid not null references org(id) on delete cascade,
  rep_id      uuid not null references rep(id) on delete cascade,
  kind        text not null,                     -- 'daily_active','weekly_target'
  current_len int not null default 0,
  best_len    int not null default 0,
  last_day    date,
  updated_at  timestamptz not null default now(),
  primary key (org_id, rep_id, kind)
);

create table device (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references org(id) on delete cascade,
  rep_id      uuid not null references rep(id) on delete cascade,
  platform    text,
  push_token  text,
  created_at  timestamptz not null default now(),
  last_seen_at timestamptz
);

-- per-device change cursor (brief §7 "server keeps a per-device change cursor")
create table sync_cursor (
  device_id   uuid not null references device(id) on delete cascade,
  stream      text not null,                     -- 'visit','plan','score_cell_org',...
  cursor      bigint not null default 0,         -- server change sequence acked by device
  updated_at  timestamptz not null default now(),
  primary key (device_id, stream)
);
```

## 10. Row-Level Security (Supabase)

Helper reads tenant + role from the JWT (`org_id`/`role` set in `app_metadata` at sign-in):

```sql
create or replace function auth.org_id() returns uuid language sql stable as
  $$ select (auth.jwt() -> 'app_metadata' ->> 'org_id')::uuid $$;
create or replace function auth.role_is(r text) returns boolean language sql stable as
  $$ select (auth.jwt() -> 'app_metadata' ->> 'role') = r $$;
```

**visit — reps own their stream; leads see the team; all tenant-isolated:**

```sql
alter table visit enable row level security;

create policy visit_insert_own on visit for insert to authenticated
  with check (org_id = auth.org_id() and rep_id = auth.uid());

create policy visit_select_scope on visit for select to authenticated
  using (
    org_id = auth.org_id()
    and ( rep_id = auth.uid()                    -- own stream
       or auth.role_is('team_lead')              -- lead sees org (team filter in view)
       or auth.role_is('org_admin') )
  );
-- No UPDATE/DELETE policies exist by design: visits are immutable (doc 14). Corrections are inserts.
```

**plan — private to the owning rep within the org:**

```sql
alter table plan enable row level security;
create policy plan_owner on plan for all to authenticated
  using  (org_id = auth.org_id() and rep_id = auth.uid())
  with check (org_id = auth.org_id() and rep_id = auth.uid());
```

**score_cell_org — org-level overlay readable org-wide; personal posteriors private:**

```sql
alter table score_cell_org enable row level security;
create policy sco_read on score_cell_org for select to authenticated
  using (
    org_id = auth.org_id()
    and (rep_id is null or rep_id = auth.uid())   -- org aggregate OR my own posteriors
  );
create policy sco_write_service on score_cell_org for all to service_role
  using (true) with check (true);                  -- nightly learning loop only (brief §9.5)
```

Base `score_cell`, `area`, `address_unit`, `street_edge`, `poi` carry no `org_id`: a single
`for select using (true)` policy grants read to all `authenticated`; writes restricted to
`service_role` (the ingestion pipelines, doc 12).

## 11. Partitioning & retention

- **`visit`**: monthly `RANGE (occurred_at)` partitions. Managed by `pg_partman` (premake 3 months
  ahead). Visits are permanent (analytics + EV posteriors), so no drop — but partitions older than
  18 months move to cheaper storage and are detached to an `archive` schema kept `read only`.
- **`gps_breadcrumb`**: monthly partitions, **90-day retention** — breadcrumbs are only needed for
  in-session replay and short-window pace analysis. `pg_partman` drops partitions past 90 days
  (aligns with brief §11 GDPR data-minimization).

```sql
select partman.create_parent(
  p_parent_table := 'public.visit',
  p_control := 'occurred_at', p_type := 'range', p_interval := '1 month', p_premake := 3);

select partman.create_parent(
  p_parent_table := 'public.gps_breadcrumb',
  p_control := 'occurred_at', p_type := 'range', p_interval := '1 month', p_premake := 3);

update partman.part_config
  set retention = '90 days', retention_keep_table = false
  where parent_table = 'public.gps_breadcrumb';
```

Example current-month partition (what `pg_partman` templates):

```sql
create table visit_p2026_07 partition of visit
  for values from ('2026-07-01') to ('2026-08-01');
```

## 12. Hot queries & the indexes that serve them

**Q1 — Top-scoring areas within a transit isochrone of a station.** (OTP2 returns the 25-min
isochrone polygon `:iso`; PostGIS ranks cells inside it.)

```sql
select s.area_id, sum(s.ev_prior * s.address_count) as expected
from score_cell s
where s.resolution = 9
  and s.geom && :iso and st_intersects(s.geom, :iso)
group by s.area_id order by expected desc limit 20;
-- served by: score_cell_geom_gix (GIST) + score_cell_res_ix
```

**Q2 — Residential doors not yet visited on street edge Y today.** (feeds L3 required-edge selection.)

```sql
select a.id, a.huisnummer, a.edge_side, a.geom
from address_unit a
where a.street_edge_id = :edge and a.gebruiksdoel = 'woonfunctie'
  and not exists (
    select 1 from visit v
    where v.address_unit_id = a.id
      and v.occurred_at >= date_trunc('day', now()) and v.op = 'insert');
-- served by: au_residential_ix (partial) + visit_addr_ix
```

**Q3 — Rep week aggregate (Stats tab).** (partition pruning on occurred_at.)

```sql
select outcome, count(*)
from visit
where org_id = :org and rep_id = :rep
  and occurred_at >= date_trunc('week', now()) and op = 'insert'
group by outcome;
-- served by: visit_rep_time_ix + monthly partition pruning
```

**Q4 — Nearest gym with shower + locker to arrival station (bag drop).** (kNN.)

```sql
select p.id, p.name, st_distance(p.geom::geography, :station::geography) as m
from poi p
where p.kind = 'gym'
  and p.attributes @> '{"has_shower":true,"has_locker":true}'
order by p.geom <-> :station limit 3;
-- served by: poi_gym_ix (partial) + poi_geom_gix (GIST kNN)
```

**Q5 — Do-not-knock overlay for a Day Pack bbox.** (compliance layer, brief §11.)

```sql
select a.id, a.geom
from do_not_knock d join address_unit a on a.id = d.address_unit_id
where d.org_id = :org and (d.expires_at is null or d.expires_at > now())
  and a.geom && st_makeenvelope(:xmin,:ymin,:xmax,:ymax,4326);
-- served by: do_not_knock PK (org_id,...) + au_geom_gix
```

**Q6 — Merged base + org posterior score for a res-10 bbox (heat overlay tiles).**

```sql
select s.h3, s.geom,
       coalesce(o.ev_posterior, s.ev_prior) as ev
from score_cell s
left join score_cell_org o
  on o.h3 = s.h3 and o.org_id = :org and o.rep_id is null
where s.resolution = 10
  and s.geom && st_makeenvelope(:xmin,:ymin,:xmax,:ymax,4326);
-- served by: score_cell_geom_gix + score_cell_org PK (org-level rows via sco_org_ix)
```

**Q7 — Per-edge-side door counts for an area (L3 Rural Postman weights).**

```sql
select id, name, doors_left, doors_right, ev_left, ev_right, geom
from street_edge
where area_id = :area
  and highway in ('residential','living_street') and (doors_left + doors_right) > 0
order by (ev_left + ev_right) desc;
-- served by: se_productive_ix (partial, pre-sorted by EV)
```

**Q8 — Active disruptions intersecting the planned walking corridor.** (re-optimization trigger.)

```sql
select d.id, d.kind, d.severity, d.payload
from disruption_event d
where tstzrange(d.starts_at, d.ends_at) @> now()
  and d.geom && :corridor and st_intersects(d.geom, :corridor);
-- served by: de_active_ix + de_geom_gix
```

## 13. Conversation intelligence (doc 21)

> **Design, not yet an implemented backend.** The doorstep conversation coach (doc 21) persists a
> synced **transcript** plus its **derived analysis**. The wire contracts and the exact jsonb payload
> shapes are authored in `packages/core/src/conversation.ts` — that file is the schema authority; the
> DDL here is only the persistence layer. Shipped as migration `0002_conversations.sql`.

The one non-negotiable, encoded structurally: **raw audio never leaves the device and is deleted the
moment a transcript exists** (doc 21 §2, doc 17 §3). There is deliberately **no audio column of any
kind** below — the absence is the enforcement, the database analog of the wire contract's
`audioRetained: false` literal. Only transcript text and derived analysis ever persist.

### 13.1 Enums

`conversation_outcome` is the **4-value classified subset of `visit_outcome`** (doc 14 §4.1); an
analysis never mints `no_answer` / `do_not_knock` / `inaccessible`. Postgres enums cannot subtype, so
it is a distinct type over the shared four values, semantics mirrored from `visit_outcome`.

```sql
create type consent_state        as enum ('resident_informed','notes_only');
create type objection_kind       as enum ('price','trust','no_time','already_has_provider',
                                          'not_decision_maker','language_barrier','bad_experience','other');
create type coach_engine         as enum ('deterministic','claude');
create type conversation_outcome as enum ('conversation','sale','not_interested','follow_up');
```

### 13.2 Tables

`conversation` is a field event with a natural time key and a retention window, exactly like `visit`
(§8): it is **RANGE-partitioned monthly on `started_at`** and, like `visit`, omits FK references on
the tenant/geo columns to keep the partitioned DDL light. `conversation_analysis` is its 1:1 derived
companion, treated like `sale` (§8) — a **soft ref** to the partitioned parent (no FK) that carries
the parent's partition key, itself not partitioned, with FK references on its own tenant columns; the
1:1 is enforced by a unique index on `conversation_id`.

```sql
-- conversation == append-only doorstep meta + transcript. No audio column exists by design.
create table conversation (
  id               ulid not null,               -- client-minted ULID (offline-idempotent, brief §7)
  org_id           uuid not null,
  rep_id           uuid not null,
  campaign_id      uuid not null,               -- required by ConversationMeta (conversation.ts)
  visit_event_id   ulid,                        -- soft back-link to the logged visit (no FK)
  address_unit_id  uuid,                        -- BAG door when resolved (public address, not a resident)
  point            geometry(Point,4326),        -- optional; STRIPPED before any Claude call (doc 21 §2.1)
  started_at       timestamptz not null,        -- PARTITION KEY (device clock, corrected on sync)
  duration_ms      int not null,
  consent          consent_state not null,
  language         text not null,               -- BCP-47 dominant language (doc 21 §4)
  transcript       jsonb not null default '[]', -- TranscriptSegment[] w/ per-segment lang; schema authority:
                                                -- conversation.ts. Personal data of rep + resident (doc 14);
                                                -- encrypted at rest under the rep's DEK, crypto-shreddable (doc 17 §3.6).
  device_id        uuid not null,               -- sync provenance, as on visit/work_session
  created_at       timestamptz not null default now(),
  primary key (id, started_at)                  -- partition key must be in the PK
) partition by range (started_at);

-- conversation_analysis == 1:1 derived coaching analysis (soft ref to the partitioned parent).
create table conversation_analysis (
  id                      ulid primary key,      -- analyzer-minted deterministic ULID (doc 21 §5.3)
  conversation_id         ulid not null,         -- soft ref to conversation (no FK to partitioned table)
  conversation_started_at timestamptz not null,  -- carries the conversation partition key for lookups
  org_id                  uuid not null references org(id) on delete cascade,
  rep_id                  uuid not null references rep(id) on delete cascade,
  campaign_id             uuid not null references campaign(id),  -- denormalized for campaign aggregates
  outcome                 conversation_outcome not null,
  confidence              numeric(4,3) not null, -- 0..1
  summary                 text not null,
  -- jsonb payload shapes authored by conversation.ts (schema authority):
  what_went_well          jsonb not null default '[]',  -- string[]
  improvements            jsonb not null default '[]',  -- CoachingTip[]
  objections              jsonb not null default '[]',  -- Objection[] (verbatim quote — personal, doc 14)
  talk_ratio              numeric(4,3) not null, -- rep speaking time / total (healthy ≈ 0.4–0.6)
  questions_asked         int not null default 0,
  next_step               text,                  -- set for follow_up outcomes
  language                text not null,
  translated_summary      text,                  -- summary in the rep's UI language when it differs
  engine                  coach_engine not null,
  analyzed_at             timestamptz not null,
  created_at              timestamptz not null default now()
);
```

### 13.3 Indexes (hot paths)

```sql
create index conv_rep_day_ix on conversation (org_id, rep_id, started_at desc);            -- rep+day review history
create index conv_visit_ix   on conversation (visit_event_id) where visit_event_id is not null;

create unique index conv_analysis_conv_uix on conversation_analysis (conversation_id);     -- 1:1
create index conv_analysis_campaign_ix on conversation_analysis (org_id, campaign_id, outcome);  -- campaign aggregates
create index conv_analysis_outcome_ix  on conversation_analysis (org_id, outcome);         -- outcome filtering
create index conv_analysis_rep_ix      on conversation_analysis (org_id, rep_id, analyzed_at desc);
```

### 13.4 RLS — rep-owned, stricter than `visit`

A transcript is personal data of **both** the rep and the resident (doc 14), so — unlike `visit`,
where a lead sees the stream (§10) — there is **no lead/admin read path** to raw conversations or
analyses. The rep owns their own; leads see only the quote-free aggregate view (§13.5). Erasure is the
per-rep crypto-shred (doc 17 §3.6), so there are no UPDATE/DELETE policies.

```sql
alter table conversation enable row level security;
create policy conversation_insert_own on conversation for insert to authenticated
  with check (org_id = auth.org_id() and rep_id = auth.uid());
create policy conversation_select_own on conversation for select to authenticated
  using (org_id = auth.org_id() and rep_id = auth.uid());

alter table conversation_analysis enable row level security;
create policy conversation_analysis_insert_own on conversation_analysis for insert to authenticated
  with check (org_id = auth.org_id() and rep_id = auth.uid());
create policy conversation_analysis_select_own on conversation_analysis for select to authenticated
  using (org_id = auth.org_id() and rep_id = auth.uid());
-- server-side (re)analysis (planner endpoint, V2 Claude sampling), mirroring sco_write_service (§10):
create policy conversation_analysis_write_service on conversation_analysis for all to service_role
  using (true) with check (true);
```

### 13.5 `conversation_org_stats` — the org-lead surface, quote-free by construction

The only window a lead/admin has into conversation intelligence. It exposes derived **aggregates
only** — never a transcript segment, never a verbatim objection quote (the `summary`, `objections`,
and `transcript` payloads are never referenced, so quotes cannot leak) — and is **k-anonymized** to
≥ 5 distinct reps per bucket (doc 17 §3.3, `K_ANON = 5`). It runs with definer semantics so its owner
can aggregate across reps past their rep-owned RLS, but is org-scoped by `auth.org_id()` in the body,
so a caller only ever sees their own org's rollup. Same "aggregates via a view, never raw SELECT"
pattern as the org heatmap (§10).

```sql
create view conversation_org_stats as
select
  a.org_id,
  a.campaign_id,
  date_trunc('day', a.conversation_started_at) as day,
  a.outcome,
  count(*)                              as conversation_count,
  avg(a.talk_ratio)                     as avg_talk_ratio,
  avg(a.confidence)                     as avg_confidence,
  avg(a.questions_asked)                as avg_questions_asked,
  avg(jsonb_array_length(a.objections)) as avg_objections  -- a count only, never the quotes
from conversation_analysis a
where a.org_id = auth.org_id()
group by a.org_id, a.campaign_id, date_trunc('day', a.conversation_started_at), a.outcome
having count(distinct a.rep_id) >= 5;
grant select on conversation_org_stats to authenticated;
```

### 13.6 Partitioning & retention

`conversation` gets monthly `RANGE (started_at)` partitions via `pg_partman` (premake 3), exactly like
`gps_breadcrumb` (§11). Retention tracks doc 17 §3.5: transcripts are org-configured, **≤ 90 days**
default; we set the 90-day ceiling here and the nightly job applies any shorter per-org window (doc 21
§2.4). `conversation_analysis` tracks its transcript and is deleted with it by that same job. Erasure
is independent of partition drop: destroying the rep's DEK crypto-shreds every transcript + analysis
ciphertext in O(1), backups included (doc 17 §3.6).

```sql
select partman.create_parent(
  p_parent_table := 'public.conversation',
  p_control := 'started_at', p_type := 'range', p_interval := '1 month', p_premake := 3);

update partman.part_config
  set retention = '90 days', retention_keep_table = false
  where parent_table = 'public.conversation';
```
