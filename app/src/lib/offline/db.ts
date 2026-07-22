/**
 * Dexie (IndexedDB) binding for the 2DAY field client — docs/15-offline-sync.md §2.1.
 * Browser-only, deliberately thin: schema + typed tables. All domain shapes come from
 * @2day/core (never redeclared here). The append-only `visitOutbox` is the source of
 * truth for writes; `plans` / `daypackMeta` are Day-Pack read models; `syncState`
 * holds the device cursor, the monotonic seq counter, and the sync status.
 *
 * v2 (WIZARD-BRIEF / TRAIL-BRIEF) adds four on-device-only stores — nothing here
 * is ever synced: `dayProfile` (the Day Setup wizard's answers, one row per
 * calendar day), `settings` (cross-day prefs: bag default, prayer method/madhab/
 * combine, demo mode), `mosqueCache` (Overpass results, so a re-run of the wizard
 * doesn't re-hit the network for the same work area), and `trailPoints` (the
 * append-only GPS breadcrumb log). Existing v1 stores are untouched — Dexie
 * carries forward any table not mentioned in a later version(), so this upgrade
 * never drops or migrates `visitOutbox`/`plans`/`syncState`/`daypackMeta`.
 */
import Dexie, { type Table } from "dexie";
import type { Plan, ULID, VisitEvent } from "@2day/core";
import type { DayProfile } from "../dayProfile";
import type { MosqueResult } from "../wizard/mosques";

/** One durable outbox row wrapping a validated append-only visit event. */
export interface OutboxRow {
  /** = VisitEvent.id (Crockford ULID); primary key + server dedupe key (doc 15 §2.2). */
  id: ULID;
  /** Per-device monotonic counter, tie-breaker for same-ms events (doc 15 §2.2). */
  deviceSeq: number;
  /** = VisitEvent.at (device clock, ISO); orders the drain oldest-first. */
  at: string;
  /** 0 = pending push, 1 = acked by server. */
  synced: 0 | 1;
  /** The full, zod-validated event payload. */
  event: VisitEvent;
}

/** Key/value bookkeeping row (device id, pull cursor, last seq, sync status). */
export interface SyncStateRow {
  key: string;
  value: unknown;
}

/** Cached Day-Pack manifest metadata for a plan (doc 15 §1.1). */
export interface DaypackMetaRow {
  planId: ULID;
  builtAt: string;
  validUntil: string;
  sizeBytes: number;
  sha256: string;
}

/** Well-known `syncState` keys. */
export const SYNC_KEYS = {
  deviceId: "deviceId",
  lastSeq: "lastSeq",
  pullCursor: "pullCursor",
  status: "status",
} as const;

/** One Day Setup wizard answer set, keyed by calendar day (WIZARD-BRIEF §6). */
export interface DayProfileRow extends DayProfile {
  date: string; // "YYYY-MM-DD", primary key
}

/** Cross-day preference key/value store (bag default, prayer method/madhab,
 *  combine prefs, demo mode) — same shape as `syncState`, kept as a separate
 *  table so wizard prefs and sync bookkeeping don't share a namespace. */
export interface SettingsRow {
  key: string;
  value: unknown;
}

/** Cached Overpass mosque-search results for a work area, so re-running the
 *  wizard for the same spot doesn't re-hit the network (WIZARD-BRIEF §5c). */
export interface MosqueCacheRow {
  /** Rounded "lat,lng" of the searched work area — coarse on purpose (a cache
   *  key, not a precise location). */
  areaKey: string;
  fetchedAt: string;
  results: MosqueResult[];
}

/** One GPS breadcrumb — append-only, on-device only (TRAIL-BRIEF §1). */
export interface TrailPointRow {
  id?: number; // Dexie auto-increment
  day: string; // "YYYY-MM-DD", groups points into a day's trail
  lat: number;
  lon: number;
  accuracy: number;
  ts: string; // ISODateTime
}

export class TwoDayDB extends Dexie {
  visitOutbox!: Table<OutboxRow, ULID>;
  plans!: Table<Plan, ULID>;
  syncState!: Table<SyncStateRow, string>;
  daypackMeta!: Table<DaypackMetaRow, ULID>;
  dayProfile!: Table<DayProfileRow, string>;
  settings!: Table<SettingsRow, string>;
  mosqueCache!: Table<MosqueCacheRow, string>;
  trailPoints!: Table<TrailPointRow, number>;

  constructor(name = "twoday") {
    super(name);
    // Version bumps are additive; the event table is never dropped (doc 15 §2.1).
    this.version(1).stores({
      visitOutbox: "id, [synced+at], deviceSeq, synced, at",
      plans: "id, planVersion",
      syncState: "key",
      daypackMeta: "planId, validUntil",
    });
    // v2 (WIZARD-BRIEF/TRAIL-BRIEF): only new stores are listed — Dexie carries
    // v1's stores forward unchanged, so existing visitOutbox/plans/syncState/
    // daypackMeta data survives this upgrade untouched.
    this.version(2).stores({
      dayProfile: "date",
      settings: "key",
      mosqueCache: "areaKey",
      trailPoints: "++id, day, ts",
    });
  }
}

/** Shared singleton for the app. */
export const db = new TwoDayDB();
