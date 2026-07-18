-- Assembled from docs/08-database-schema.md — the doc is the authority.
-- To modify the schema, edit docs/08-database-schema.md, then regenerate
-- this migration; do not hand-edit statements here.
-- Target: Supabase Postgres 16 + PostGIS 3.4, RLS enabled.

-- ============================================================================
-- Extensions
-- ============================================================================
create extension if not exists postgis;
create extension if not exists postgis_topology;
create extension if not exists h3;
create extension if not exists pg_trgm;
create extension if not exists btree_gist;

-- ============================================================================
-- Domain Types
-- ============================================================================
create domain ulid as char(26)
  check (value ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$');

-- ============================================================================
-- Enum Types
-- ============================================================================
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

-- ============================================================================
-- Tables: Tenancy & Identity
-- ============================================================================
create table org (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  country_pack text not null default 'NL',
  settings     jsonb not null default '{}',
  created_at   timestamptz not null default now()
);

create table team (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references org(id) on delete cascade,
  name       text not null,
  created_at timestamptz not null default now()
);

create table rep (
  id               uuid primary key references auth.users(id) on delete cascade,
  org_id           uuid not null references org(id) on delete cascade,
  team_id          uuid references team(id) on delete set null,
  role             rep_role not null default 'rep',
  display_name     text not null,
  walking_speed_mps numeric(3,2) not null default 1.35,
  home_geom        geometry(Point,4326),
  preferences      jsonb not null default '{}',
  created_at       timestamptz not null default now()
);

create table campaign (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references org(id) on delete cascade,
  vertical         campaign_vertical not null,
  name             text not null,
  commission_model jsonb not null,
  target_filter    jsonb not null default '{}',
  active           boolean not null default true,
  valid_from       date,
  valid_to         date,
  created_at       timestamptz not null default now()
);

-- ============================================================================
-- Indexes: Tenancy & Identity
-- ============================================================================
create index on rep (org_id, team_id);
create index on campaign (org_id) where active;

-- ============================================================================
-- Tables: Reference Geodata (Global, Shared)
-- ============================================================================
create table area (
  id              uuid primary key default gen_random_uuid(),
  buurt_code      text not null,
  wijk_code       text not null,
  gemeente_code   text not null,
  name            text not null,
  geom            geometry(MultiPolygon,4326) not null,
  geom_rd         geometry(MultiPolygon,28992) not null,
  population       int,
  households       int,
  income_median    int,
  ownership_pct    numeric(4,3),
  rental_pct       numeric(4,3),
  avg_household_sz numeric(3,1),
  pct_65plus       numeric(4,3),
  address_density  numeric,
  solar_pct        numeric(4,3),
  energy_label_mix jsonb,
  snapshot_version text not null,
  updated_at      timestamptz not null default now(),
  unique (buurt_code, snapshot_version)
);

create table building (
  id          uuid primary key default gen_random_uuid(),
  pand_id     text not null,
  bouwjaar    int,
  status      text,
  num_units   int,
  geom        geometry(MultiPolygon,4326) not null,
  geom_rd     geometry(MultiPolygon,28992) not null,
  snapshot_version text not null,
  unique (pand_id, snapshot_version)
);

create table street_edge (
  id         uuid primary key default gen_random_uuid(),
  osm_way_id bigint not null,
  name       text,
  highway    text,
  oneway     boolean not null default false,
  from_node  bigint,
  to_node    bigint,
  length_m   numeric(8,2),
  doors_left  int not null default 0,
  doors_right int not null default 0,
  ev_left    numeric,
  ev_right   numeric,
  area_id    uuid references area(id),
  geom       geometry(LineString,4326) not null,
  geom_rd    geometry(LineString,28992) not null,
  snapshot_version text not null,
  unique (osm_way_id, snapshot_version)
);

create table address_unit (
  id            uuid primary key default gen_random_uuid(),
  vbo_id        text not null,
  building_id   uuid references building(id),
  area_id       uuid references area(id),
  street_edge_id uuid references street_edge(id),
  edge_side     edge_side,
  edge_measure  numeric(6,5),
  postcode      char(6),
  huisnummer    int,
  huisletter    char(1),
  toevoeging    text,
  straat        text,
  woonplaats    text,
  gebruiksdoel  text,
  oppervlakte   int,
  energy_label  char(2),
  energy_src    text,
  geom          geometry(Point,4326) not null,
  geom_rd       geometry(Point,28992) not null,
  h3_r10        bigint,
  snapshot_version text not null,
  unique (vbo_id, snapshot_version)
);

create table poi (
  id         uuid primary key default gen_random_uuid(),
  kind       poi_kind not null,
  name       text,
  brand      text,
  address    text,
  opening_hours jsonb,
  attributes jsonb not null default '{}',
  source     text,
  verified_at timestamptz,
  area_id    uuid references area(id),
  h3_r10     bigint,
  geom       geometry(Point,4326) not null
);

-- ============================================================================
-- Indexes: Reference Geodata
-- ============================================================================
create index area_geom_gix   on area using gist (geom);
create index area_geom_rd_gix on area using gist (geom_rd);
create index building_geom_gix on building using gist (geom);
create index se_geom_gix on street_edge using gist (geom);
create index se_area_ix  on street_edge (area_id);
create index se_name_trgm on street_edge using gin (name gin_trgm_ops);
create index se_productive_ix on street_edge (area_id, ((ev_left + ev_right)) desc)
  where highway in ('residential','living_street') and (doors_left + doors_right) > 0;
create index au_geom_gix      on address_unit using gist (geom);
create index au_edge_side_ix  on address_unit (street_edge_id, edge_side);
create index au_area_ix       on address_unit (area_id);
create index au_h3_ix         on address_unit (h3_r10);
create index au_pc_huisnr_ix  on address_unit (postcode, huisnummer);
create index au_residential_ix on address_unit (street_edge_id, edge_side)
  where gebruiksdoel = 'woonfunctie';
create index poi_geom_gix on poi using gist (geom);
create index poi_kind_ix  on poi (kind);
create index poi_gym_ix   on poi (kind) where kind = 'gym';

-- ============================================================================
-- Tables: H3 Scoring (Base Shared + Per-Tenant Overlay)
-- ============================================================================
create table score_cell (
  h3            bigint primary key,
  resolution    smallint not null,
  area_id       uuid references area(id),
  geom          geometry(Polygon,4326) not null,
  address_count int not null default 0,
  dwelling_mix  jsonb,
  ownership_pct numeric(4,3),
  income_band   smallint,
  label_mix     jsonb,
  ev_prior      numeric not null default 0,
  snapshot_version text not null,
  updated_at    timestamptz not null default now()
);

create table score_cell_org (
  h3          bigint not null,
  org_id      uuid not null references org(id) on delete cascade,
  rep_id      uuid references rep(id) on delete cascade,
  ev_posterior numeric not null default 0,
  alpha        numeric not null default 1,
  beta         numeric not null default 1,
  n_visits     int not null default 0,
  n_answers    int not null default 0,
  n_sales      int not null default 0,
  last_visit_at timestamptz,
  decayed_at    timestamptz,
  updated_at    timestamptz not null default now(),
  primary key (h3, org_id, coalesce(rep_id, '00000000-0000-0000-0000-000000000000'::uuid))
);

-- ============================================================================
-- Indexes: H3 Scoring
-- ============================================================================
create index score_cell_geom_gix on score_cell using gist (geom);
create index score_cell_res_ix   on score_cell (resolution);
create index sco_org_ix on score_cell_org (org_id, h3) where rep_id is null;

-- ============================================================================
-- Tables: Planning
-- ============================================================================
create table plan (
  id                 ulid primary key,
  org_id             uuid not null references org(id) on delete cascade,
  rep_id             uuid not null references rep(id) on delete cascade,
  request            jsonb not null,
  goal_preset        goal_preset not null default 'max_sales',
  status             plan_status not null default 'draft',
  work_start         timestamptz,
  work_end           timestamptz,
  start_point        geometry(Point,4326),
  end_point          geometry(Point,4326),
  arrival_station_id uuid references poi(id),
  departure_station_id uuid references poi(id),
  departure_train_at timestamptz,
  expected_value       numeric,
  expected_conversations numeric,
  total_walk_m        numeric,
  compiled_at        timestamptz,
  created_at         timestamptz not null default now()
);

create table plan_alternative (
  id              uuid primary key default gen_random_uuid(),
  plan_id         ulid not null references plan(id) on delete cascade,
  rank            smallint not null,
  summary         text,
  expected_value  numeric,
  chosen          boolean not null default false,
  payload         jsonb not null
);

create table plan_leg (
  id             uuid primary key default gen_random_uuid(),
  plan_id        ulid not null references plan(id) on delete cascade,
  org_id         uuid not null references org(id) on delete cascade,
  seq            smallint not null,
  kind           plan_leg_kind not null,
  area_id        uuid references area(id),
  from_poi_id    uuid references poi(id),
  to_poi_id      uuid references poi(id),
  geom           geometry(LineString,4326),
  planned_start  timestamptz,
  planned_end    timestamptz,
  distance_m     numeric,
  expected_conversations numeric,
  payload        jsonb not null default '{}',
  unique (plan_id, seq)
);

-- ============================================================================
-- Indexes: Planning
-- ============================================================================
create index plan_rep_ix on plan (org_id, rep_id, created_at desc);
create index plan_active_ix on plan (rep_id) where status = 'active';
create index plan_alt_ix on plan_alternative (plan_id, rank);
create index plan_leg_ix on plan_leg (plan_id, seq);

-- ============================================================================
-- Tables: Execution (Append-Only, Partitioned)
-- ============================================================================
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
  summary     jsonb not null default '{}',
  closed      boolean not null default false,
  primary key (id)
);

create table visit (
  id               ulid not null,
  org_id           uuid not null,
  rep_id           uuid not null,
  work_session_id  ulid not null,
  address_unit_id  uuid,
  street_edge_id   uuid,
  edge_side        edge_side,
  campaign_id      uuid,
  outcome          visit_outcome not null,
  occurred_at      timestamptz not null,
  client_seq       bigint not null,
  device_id        uuid not null,
  geom             geometry(Point,4326),
  dwell_seconds    int,
  note             text,
  corrects_visit_id ulid,
  op               sync_op not null default 'insert',
  created_at       timestamptz not null default now(),
  primary key (id, occurred_at)
) partition by range (occurred_at);

create table gps_breadcrumb (
  id              ulid not null,
  org_id          uuid not null,
  rep_id          uuid not null,
  work_session_id ulid not null,
  occurred_at     timestamptz not null,
  geom            geometry(Point,4326) not null,
  accuracy_m      real,
  speed_mps       real,
  battery_pct     smallint,
  device_id       uuid not null,
  primary key (id, occurred_at)
) partition by range (occurred_at);

create table sale (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references org(id) on delete cascade,
  rep_id      uuid not null references rep(id) on delete cascade,
  visit_id    ulid not null,
  visit_occurred_at timestamptz not null,
  campaign_id uuid not null references campaign(id),
  amount      numeric(10,2),
  commission  numeric(10,2),
  product     jsonb not null default '{}',
  contract_ref text,
  status      text not null default 'pending',
  occurred_at timestamptz not null,
  created_at  timestamptz not null default now()
);

create table disruption_event (
  id          uuid primary key default gen_random_uuid(),
  kind        disruption_kind not null,
  source      text not null,
  external_id text,
  severity    text,
  geom        geometry(Geometry,4326),
  area_id     uuid references area(id),
  starts_at   timestamptz,
  ends_at     timestamptz,
  payload     jsonb not null default '{}',
  ingested_at timestamptz not null default now(),
  unique (source, external_id)
);

create table do_not_knock (
  org_id          uuid not null references org(id) on delete cascade,
  address_unit_id uuid not null references address_unit(id),
  reason          text,
  created_at      timestamptz not null default now(),
  expires_at      timestamptz,
  primary key (org_id, address_unit_id)
);

-- ============================================================================
-- Indexes: Execution
-- ============================================================================
create index ws_rep_ix on work_session (org_id, rep_id, started_at desc);
create unique index visit_idem_ix on visit (device_id, client_seq);
create index visit_rep_time_ix   on visit (org_id, rep_id, occurred_at desc);
create index visit_session_ix    on visit (work_session_id);
create index visit_addr_ix       on visit (address_unit_id, occurred_at desc);
create index visit_edge_ix       on visit (street_edge_id, edge_side);
create index visit_geom_gix      on visit using gist (geom);
create index visit_dnk_ix on visit (org_id, address_unit_id)
  where outcome = 'do_not_knock' and op = 'insert';
create index bc_session_ix on gps_breadcrumb (work_session_id, occurred_at);
create index bc_geom_gix   on gps_breadcrumb using gist (geom);
create index sale_rep_ix on sale (org_id, rep_id, occurred_at desc);
create index sale_campaign_ix on sale (campaign_id, status);
create index de_geom_gix on disruption_event using gist (geom);
create index de_active_ix on disruption_event (starts_at, ends_at);

-- ============================================================================
-- Tables: Gamification & Sync
-- ============================================================================
create table achievement (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references org(id) on delete cascade,
  rep_id     uuid not null references rep(id) on delete cascade,
  kind       text not null,
  awarded_at timestamptz not null default now(),
  payload    jsonb not null default '{}'
);

create table streak (
  org_id      uuid not null references org(id) on delete cascade,
  rep_id      uuid not null references rep(id) on delete cascade,
  kind        text not null,
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

create table sync_cursor (
  device_id   uuid not null references device(id) on delete cascade,
  stream      text not null,
  cursor      bigint not null default 0,
  updated_at  timestamptz not null default now(),
  primary key (device_id, stream)
);

-- ============================================================================
-- Row-Level Security: Helper Functions
-- ============================================================================
create or replace function auth.org_id() returns uuid language sql stable as
  $$ select (auth.jwt() -> 'app_metadata' ->> 'org_id')::uuid $$;

create or replace function auth.role_is(r text) returns boolean language sql stable as
  $$ select (auth.jwt() -> 'app_metadata' ->> 'role') = r $$;

-- ============================================================================
-- Row-Level Security: Policies
-- ============================================================================

-- visit policies
alter table visit enable row level security;

create policy visit_insert_own on visit for insert to authenticated
  with check (org_id = auth.org_id() and rep_id = auth.uid());

create policy visit_select_scope on visit for select to authenticated
  using (
    org_id = auth.org_id()
    and ( rep_id = auth.uid()
       or auth.role_is('team_lead')
       or auth.role_is('org_admin') )
  );

-- plan policies
alter table plan enable row level security;

create policy plan_owner on plan for all to authenticated
  using  (org_id = auth.org_id() and rep_id = auth.uid())
  with check (org_id = auth.org_id() and rep_id = auth.uid());

-- score_cell_org policies
alter table score_cell_org enable row level security;

create policy sco_read on score_cell_org for select to authenticated
  using (
    org_id = auth.org_id()
    and (rep_id is null or rep_id = auth.uid())
  );

create policy sco_write_service on score_cell_org for all to service_role
  using (true) with check (true);

-- ============================================================================
-- Partitioning & Retention Setup
-- ============================================================================
select partman.create_parent(
  p_parent_table := 'public.visit',
  p_control := 'occurred_at', p_type := 'range', p_interval := '1 month', p_premake := 3);

select partman.create_parent(
  p_parent_table := 'public.gps_breadcrumb',
  p_control := 'occurred_at', p_type := 'range', p_interval := '1 month', p_premake := 3);

update partman.part_config
  set retention = '90 days', retention_keep_table = false
  where parent_table = 'public.gps_breadcrumb';
