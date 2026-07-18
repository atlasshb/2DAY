-- Assembled from docs/08-database-schema.md §13 (Conversation intelligence) — the doc is the authority.
-- To modify the schema, edit docs/08-database-schema.md, then regenerate
-- this migration; do not hand-edit statements here.
-- Target: Supabase Postgres 16 + PostGIS 3.4, RLS enabled. Extends 0001_init.sql.
--
-- DESIGN, not an implemented backend (doc 21). Conversation intelligence adds the
-- doorstep conversation coach: a synced transcript plus its derived analysis. The wire
-- contracts and the exact jsonb payload shapes live in packages/core/src/conversation.ts
-- — that file is the schema authority; this migration is only the persistence layer.
--
-- PRIVACY INVARIANT (doc 21 §2, doc 17 §3): raw audio NEVER leaves the device and is
-- deleted the moment a transcript exists. There is deliberately NO audio column of any
-- kind below — the absence is the enforcement, the DB analog of the wire contract's
-- `audioRetained: false` literal. Only transcript text + derived analysis ever persist.

-- ============================================================================
-- Enum Types
-- ============================================================================
-- consent_state — packages/core/src/conversation.ts ConsentState (doc 21 §2.2).
-- There is no "record the resident silently" state, by construction.
create type consent_state as enum ('resident_informed','notes_only');

-- objection_kind — mirrors ObjectionKind (conversation.ts). First resident mention wins,
-- carrying the verbatim quote (personal data — doc 14).
create type objection_kind as enum (
  'price','trust','no_time','already_has_provider',
  'not_decision_maker','language_barrier','bad_experience','other');

-- coach_engine — which analyzer produced the analysis: the deterministic offline floor
-- or the online Claude coach (doc 21 §5).
create type coach_engine as enum ('deterministic','claude');

-- conversation_outcome — the 4-value classified subset of visit_outcome (doc 14 §4.1).
-- Semantics mirror visit_outcome exactly for these four; an analysis never mints
-- no_answer / do_not_knock / inaccessible (conversation.ts ConversationAnalysis.outcome).
-- Postgres enums cannot subtype, so this is a distinct type over the shared four values.
create type conversation_outcome as enum ('conversation','sale','not_interested','follow_up');

-- ============================================================================
-- Tables: Conversation Intelligence (doc 21)
-- ============================================================================
-- conversation == append-only doorstep conversation meta + transcript. Comparable to
-- `visit` (doc 08 §8): a field event with a natural time key and a retention window, so it
-- is RANGE-partitioned monthly on started_at (see Partitioning below) and, like visit,
-- omits FK references on the tenant/geo columns to keep the partitioned DDL light.
-- NO audio column exists by design (see header): audio is transcribed on-device and the
-- buffer discarded; only the transcript text syncs.
create table conversation (
  id               ulid not null,               -- client-minted ULID (offline-idempotent, brief §7)
  org_id           uuid not null,
  rep_id           uuid not null,
  campaign_id      uuid not null,               -- required by ConversationMeta (conversation.ts)
  visit_event_id   ulid,                        -- soft back-link to the logged visit (no FK to partitioned table)
  address_unit_id  uuid,                        -- BAG door when resolved (a public address, not a resident)
  point            geometry(Point,4326),        -- optional; STRIPPED before any Claude call (doc 21 §2.1)
  started_at       timestamptz not null,        -- PARTITION KEY (device clock, corrected on sync)
  duration_ms      int not null,
  consent          consent_state not null,
  language         text not null,               -- BCP-47 dominant language (doc 21 §4)
  -- transcript == TranscriptSegment[] with per-segment BCP-47 `lang`. Schema authority:
  -- packages/core/src/conversation.ts (transcriptSegment). Personal data of BOTH the rep and
  -- the resident (doc 14) — encrypted at rest under the rep's DEK and crypto-shreddable (doc 17 §3.6).
  transcript       jsonb not null default '[]',
  device_id        uuid not null,               -- sync provenance, as on visit/work_session
  created_at       timestamptz not null default now(),
  primary key (id, started_at)                  -- partition key must be in the PK
) partition by range (started_at);

-- conversation_analysis == 1:1 derived coaching analysis. Comparable to `sale` (doc 08 §8):
-- a derived companion to a partitioned event, so it uses a SOFT ref (no FK to the partitioned
-- parent) + carries the parent partition key, is itself not partitioned, and DOES carry FK
-- references on its own tenant columns. 1:1 is enforced by the unique index on conversation_id.
create table conversation_analysis (
  id                      ulid primary key,      -- analyzer-minted deterministic ULID (doc 21 §5.3)
  conversation_id         ulid not null,         -- soft ref to conversation (no FK to partitioned table)
  conversation_started_at timestamptz not null,  -- carries the conversation partition key for lookups
  org_id                  uuid not null references org(id) on delete cascade,
  rep_id                  uuid not null references rep(id) on delete cascade,
  campaign_id             uuid not null references campaign(id),  -- denormalized for campaign aggregates
  outcome                 conversation_outcome not null,
  confidence              numeric(4,3) not null,  -- 0..1 (conversation.ts)
  summary                 text not null,
  -- what_went_well == string[]; improvements == CoachingTip[]; objections == Objection[]
  -- (each carrying the verbatim resident quote — personal data, doc 14). The jsonb payload
  -- shapes are authored by packages/core/src/conversation.ts, which is the schema authority.
  what_went_well          jsonb not null default '[]',
  improvements            jsonb not null default '[]',
  objections              jsonb not null default '[]',
  talk_ratio              numeric(4,3) not null,  -- rep speaking time / total (healthy ≈ 0.4–0.6)
  questions_asked         int not null default 0,
  next_step               text,                   -- set for follow_up outcomes
  language                text not null,
  translated_summary      text,                   -- summary in the rep's UI language when it differs
  engine                  coach_engine not null,
  analyzed_at             timestamptz not null,
  created_at              timestamptz not null default now()
);

-- ============================================================================
-- Indexes: Conversation Intelligence
-- ============================================================================
-- Hot: a rep's conversations for a day (review history), partition-pruned on started_at.
create index conv_rep_day_ix on conversation (org_id, rep_id, started_at desc);
-- Link back to the logged door outcome.
create index conv_visit_ix on conversation (visit_event_id) where visit_event_id is not null;

-- 1:1 with conversation.
create unique index conv_analysis_conv_uix on conversation_analysis (conversation_id);
-- Hot: campaign-level outcome aggregates (feeds conversation_org_stats).
create index conv_analysis_campaign_ix on conversation_analysis (org_id, campaign_id, outcome);
-- Hot: outcome filtering across the org.
create index conv_analysis_outcome_ix on conversation_analysis (org_id, outcome);
-- Rep-scoped reads (RLS ownership + a rep's coaching history).
create index conv_analysis_rep_ix on conversation_analysis (org_id, rep_id, analyzed_at desc);

-- ============================================================================
-- Row-Level Security: Policies
-- ============================================================================
-- Stricter than `visit` (doc 08 §10): a transcript is personal data of BOTH the rep and the
-- resident (doc 14), so there is NO lead/admin read path to raw conversations or analyses.
-- Leads see ONLY the quote-free, k-anonymized conversation_org_stats view below (doc 21 §8).
-- Helper functions auth.org_id() / auth.role_is() are defined in 0001_init.sql.

alter table conversation enable row level security;

create policy conversation_insert_own on conversation for insert to authenticated
  with check (org_id = auth.org_id() and rep_id = auth.uid());

create policy conversation_select_own on conversation for select to authenticated
  using (org_id = auth.org_id() and rep_id = auth.uid());
-- No UPDATE/DELETE policies by design: conversations are append-only; erasure is the
-- per-rep crypto-shred (doc 17 §3.6), not a row DELETE.

alter table conversation_analysis enable row level security;

create policy conversation_analysis_insert_own on conversation_analysis for insert to authenticated
  with check (org_id = auth.org_id() and rep_id = auth.uid());

create policy conversation_analysis_select_own on conversation_analysis for select to authenticated
  using (org_id = auth.org_id() and rep_id = auth.uid());

-- Server-side (re)analysis: the planner /v1/conversations/analyze and the V2 Claude sampling
-- job write under service_role, mirroring the nightly learning loop (doc 08 §10 sco_write_service).
create policy conversation_analysis_write_service on conversation_analysis for all to service_role
  using (true) with check (true);

-- ============================================================================
-- View: conversation_org_stats (the org-lead surface — quote-free by construction)
-- ============================================================================
-- The ONLY window a lead/admin has into conversation intelligence. It exposes derived
-- AGGREGATES only — never a transcript segment, never a verbatim objection quote. The
-- selected columns are counts / averages plus the outcome + campaign dimensions; the
-- summary, objections, and transcript payloads are never referenced here, so quotes cannot
-- leak. It is k-anonymized to ≥ 5 distinct reps per bucket (doc 17 §3.3, K_ANON = 5) so no
-- single rep or resident is re-identifiable. The view runs with definer semantics (its owner
-- reads the base table, so it can aggregate across reps past their rep-owned RLS) but is
-- org-scoped by auth.org_id() in the body — a caller only ever sees their own org's rollup.
-- This is the doc 08 §10 / doc 17 §3.3 "aggregates via a view, never raw SELECT" pattern.
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

-- ============================================================================
-- Partitioning & Retention Setup
-- ============================================================================
-- conversation is partitioned monthly like `visit` / `gps_breadcrumb` (doc 08 §11), managed
-- by pg_partman (premake 3 months ahead). Retention tracks doc 17 §3.5: transcripts are
-- org-configured, ≤ 90 days by default. We set the 90-day ceiling here (as gps_breadcrumb
-- does); a shorter per-org window is applied by the nightly job (doc 21 §2.4).
-- conversation_analysis tracks its transcript and is deleted with it by that same job.
-- Erasure is independent of partition drop: destroying the rep's DEK crypto-shreds every
-- transcript + analysis ciphertext in O(1), backups included (doc 17 §3.6).
select partman.create_parent(
  p_parent_table := 'public.conversation',
  p_control := 'started_at', p_type := 'range', p_interval := '1 month', p_premake := 3);

update partman.part_config
  set retention = '90 days', retention_keep_table = false
  where parent_table = 'public.conversation';
