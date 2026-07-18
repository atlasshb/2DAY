/**
 * Dexie (IndexedDB) binding for the 2DAY field client — docs/15-offline-sync.md §2.1.
 * Browser-only, deliberately thin: schema + typed tables. All domain shapes come from
 * @2day/core (never redeclared here). The append-only `visitOutbox` is the source of
 * truth for writes; `plans` / `daypackMeta` are Day-Pack read models; `syncState`
 * holds the device cursor, the monotonic seq counter, and the sync status.
 */
import Dexie, { type Table } from "dexie";
import type { Plan, ULID, VisitEvent } from "@2day/core";

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

export class TwoDayDB extends Dexie {
  visitOutbox!: Table<OutboxRow, ULID>;
  plans!: Table<Plan, ULID>;
  syncState!: Table<SyncStateRow, string>;
  daypackMeta!: Table<DaypackMetaRow, ULID>;

  constructor(name = "twoday") {
    super(name);
    // Version bumps are additive; the event table is never dropped (doc 15 §2.1).
    this.version(1).stores({
      visitOutbox: "id, [synced+at], deviceSeq, synced, at",
      plans: "id, planVersion",
      syncState: "key",
      daypackMeta: "planId, validUntil",
    });
  }
}

/** Shared singleton for the app. */
export const db = new TwoDayDB();
