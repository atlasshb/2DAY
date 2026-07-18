/**
 * Pure sync engine — protocol logic only, storage-agnostic (docs/15-offline-sync.md).
 * No Dexie, no fetch, no clock: functions take data in and return data out so they run
 * identically in the app, the planner, and tests.
 *
 * Four responsibilities (doc 15 §2):
 *   - outbox batching preserving (at, deviceSeq) order          → nextBatch
 *   - idempotent at-least-once push-result application          → applyPushResult
 *   - pull-cursor merge (LWW-per-field / append-only / tombstone) → applyPull
 *   - ULID de-duplication keeping the first occurrence          → dedupeEvents
 */
import type { ISODateTime, ULID, VisitEvent } from "./types.js";

// ---------------------------------------------------------------------------
// Ordering
// ---------------------------------------------------------------------------

/** The minimal shape the outbox protocol needs; `VisitEvent` satisfies it. */
export interface SyncEvent {
  id: ULID;
  at: ISODateTime;
  deviceSeq: number;
}

function tsMs(at: ISODateTime): number {
  const t = Date.parse(at);
  return Number.isNaN(t) ? 0 : t;
}

/**
 * Total order over outbox events: by device clock (`at`), then the per-device
 * monotonic `deviceSeq` (tie-breaks same-ms events, doc 15 §2.2), then `id` for a
 * fully deterministic sort even across devices.
 */
export function compareEvents(a: SyncEvent, b: SyncEvent): number {
  const ta = tsMs(a.at);
  const tb = tsMs(b.at);
  if (ta !== tb) return ta - tb;
  if (a.deviceSeq !== b.deviceSeq) return a.deviceSeq - b.deviceSeq;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

// ---------------------------------------------------------------------------
// Batching
// ---------------------------------------------------------------------------

export interface BatchLimits {
  /** Max events per batch (doc 15 §2.3 caps at 200). */
  maxCount?: number;
  /** Max serialized UTF-8 bytes; the first event is always included. */
  maxBytes?: number;
}

export interface Batch<T extends SyncEvent> {
  events: T[];
  bytes: number;
}

/** UTF-8 byte length without depending on TextEncoder (keeps lib to ES2022). */
function utf8Len(s: string): number {
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 0x80) n += 1;
    else if (c < 0x800) n += 2;
    else if (c >= 0xd800 && c <= 0xdbff) {
      n += 4; // surrogate pair → one 4-byte code point
      i++;
    } else n += 3;
  }
  return n;
}

function eventBytes(e: unknown): number {
  return utf8Len(JSON.stringify(e));
}

/**
 * Take the next drainable batch, oldest-first in (at, deviceSeq) order. Stops at
 * `maxCount` events or when adding the next event would exceed `maxBytes` (a single
 * over-size event is still emitted alone so the queue never wedges).
 */
export function nextBatch<T extends SyncEvent>(events: T[], limits: BatchLimits = {}): Batch<T> {
  const maxCount = limits.maxCount ?? 200;
  const maxBytes = limits.maxBytes;

  const ordered = [...events].sort(compareEvents);
  const out: T[] = [];
  let bytes = 0;
  for (const e of ordered) {
    if (out.length >= maxCount) break;
    const sz = eventBytes(e);
    if (maxBytes !== undefined && out.length > 0 && bytes + sz > maxBytes) break;
    out.push(e);
    bytes += sz;
  }
  return { events: out, bytes };
}

// ---------------------------------------------------------------------------
// Push result application (idempotent, at-least-once)
// ---------------------------------------------------------------------------

export interface RejectedEvent {
  id: ULID;
  code: string;
  /** Transient failure the client should retry; otherwise it's terminal/quarantined. */
  retryable?: boolean;
}

/** Server response to a push batch (doc 15 §2.3). */
export interface PushResult {
  /** Committed for the first time. */
  applied: ULID[];
  /** Already present on the server — also a success (idempotent re-send). */
  duplicates: ULID[];
  /** Schema/tenant failures. */
  rejected: RejectedEvent[];
  serverCursor?: string;
}

export interface PushApplication {
  /** applied ∪ duplicates → mark synced / remove from the outbox. */
  acked: ULID[];
  /** Keep in the outbox and retry: retryable rejects + events the server never mentioned. */
  retry: ULID[];
  /** Terminal rejects — quarantine, do not retry. */
  terminal: RejectedEvent[];
  serverCursor?: string;
}

/**
 * Reconcile a pushed batch against the server's result.
 *
 * At-least-once semantics: any event the server neither acked nor rejected is retried
 * (a dropped connection mid-flight is safe — on retry it comes back as a duplicate).
 * Because acks remove the row, a re-push after a partial ack never double-applies.
 */
export function applyPushResult(batch: readonly { id: ULID }[], result: PushResult): PushApplication {
  const acked = [...result.applied, ...result.duplicates];
  const retry: ULID[] = [];
  const terminal: RejectedEvent[] = [];

  for (const r of result.rejected) {
    if (r.retryable) retry.push(r.id);
    else terminal.push(r);
  }

  const mentioned = new Set<ULID>(acked);
  for (const r of result.rejected) mentioned.add(r.id);
  for (const e of batch) {
    if (!mentioned.has(e.id)) retry.push(e.id);
  }

  return { acked, retry, terminal, serverCursor: result.serverCursor };
}

// ---------------------------------------------------------------------------
// De-duplication
// ---------------------------------------------------------------------------

/** Drop duplicate ULIDs, keeping the FIRST occurrence and preserving input order. */
export function dedupeEvents<T extends { id: ULID }>(events: readonly T[]): T[] {
  const seen = new Set<ULID>();
  const out: T[] = [];
  for (const e of events) {
    if (seen.has(e.id)) continue;
    seen.add(e.id);
    out.push(e);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Pull merge (LWW-per-field / append-only / tombstones)
// ---------------------------------------------------------------------------

/** One field value stamped with the authoritative server timestamp (doc 15 §2.5). */
export interface FieldStamped<V = unknown> {
  value: V;
  serverTs: ISODateTime;
}

/** A mutable row (`settings` / `plan_tweak`) resolved last-writer-wins per field. */
export interface MutableRow {
  id: string;
  fields: Record<string, FieldStamped>;
  /** True once a tombstone has removed every field. */
  deleted: boolean;
}

export interface ServerChange {
  changeSeq: number;
  entity: string;
  id: string;
  kind: "put" | "tombstone";
  serverTs: ISODateTime;
  /**
   * For `put`: the row payload. For a `visit` entity this is a full `VisitEvent`;
   * for a mutable entity it is a flat `{ field: value }` object stamped at `serverTs`.
   */
  row?: unknown;
}

export interface SyncPullResult {
  changes: ServerChange[];
  nextCursor: string;
  hasMore?: boolean;
}

/** The local, storage-agnostic projection the merge operates on. */
export interface LocalStore {
  /** Append-only visit events, keyed by ULID (never overwritten, never merged). */
  visits: Record<ULID, VisitEvent>;
  /** Mutable rows keyed by `${entity}:${id}`. */
  mutable: Record<string, MutableRow>;
  /** Tombstone high-water marks keyed by `${entity}:${id}` → serverTs. */
  tombstones: Record<string, ISODateTime>;
  cursor: string;
}

export function emptyStore(): LocalStore {
  return { visits: {}, mutable: {}, tombstones: {}, cursor: "" };
}

/** Entity name treated as an append-only event stream. */
const VISIT_ENTITY = "visit";

function cmpTs(a: ISODateTime, b: ISODateTime): number {
  return tsMs(a) - tsMs(b);
}

function cloneStore(s: LocalStore): LocalStore {
  const mutable: Record<string, MutableRow> = {};
  for (const [k, row] of Object.entries(s.mutable)) {
    mutable[k] = { id: row.id, deleted: row.deleted, fields: { ...row.fields } };
  }
  return {
    visits: { ...s.visits },
    mutable,
    tombstones: { ...s.tombstones },
    cursor: s.cursor,
  };
}

/**
 * Apply a pull page to the local store. Idempotent and resumable: replaying the same
 * (or an overlapping) page yields the same state, so an old cursor can be re-pulled.
 *
 *   - `visit` puts        → append-only; an id already present is never overwritten.
 *   - mutable puts        → LWW per field on serverTs (later serverTs wins that field
 *                           only; a field newer than a tombstone resurrects it).
 *   - tombstones          → win over any field with an older-or-equal serverTs; a row
 *                           with all fields removed is marked `deleted`.
 *
 * Returns a new store and the advanced cursor (falls back to `cursor` when the page
 * carries no `nextCursor`).
 */
export function applyPull(local: LocalStore, remote: SyncPullResult, cursor?: string): LocalStore {
  const next = cloneStore(local);
  const ordered = [...remote.changes].sort((a, b) => a.changeSeq - b.changeSeq);

  for (const ch of ordered) {
    if (ch.entity === VISIT_ENTITY) {
      // Append-only fact stream. Tombstones never apply; a known id is immutable.
      if (ch.kind === "put" && ch.row && next.visits[ch.id] === undefined) {
        next.visits[ch.id] = ch.row as VisitEvent;
      }
      continue;
    }

    const key = `${ch.entity}:${ch.id}`;

    if (ch.kind === "tombstone") {
      const prevTomb = next.tombstones[key];
      if (prevTomb === undefined || cmpTs(ch.serverTs, prevTomb) > 0) {
        next.tombstones[key] = ch.serverTs;
      }
      const row = next.mutable[key];
      if (row) {
        for (const [field, stamped] of Object.entries(row.fields)) {
          // Tombstone wins over stale updates (older-or-equal serverTs).
          if (cmpTs(stamped.serverTs, ch.serverTs) <= 0) delete row.fields[field];
        }
        row.deleted = Object.keys(row.fields).length === 0;
      } else {
        next.mutable[key] = { id: ch.id, fields: {}, deleted: true };
      }
      continue;
    }

    // kind === "put" on a mutable entity → LWW per field.
    const incoming = (ch.row ?? {}) as Record<string, unknown>;
    const tomb = next.tombstones[key];
    const row: MutableRow = next.mutable[key] ?? { id: ch.id, fields: {}, deleted: false };

    for (const [field, value] of Object.entries(incoming)) {
      // A field older-or-equal to an existing tombstone stays deleted.
      if (tomb !== undefined && cmpTs(ch.serverTs, tomb) <= 0) continue;
      const existing = row.fields[field];
      if (existing === undefined || cmpTs(ch.serverTs, existing.serverTs) > 0) {
        row.fields[field] = { value, serverTs: ch.serverTs };
      }
    }
    row.deleted = Object.keys(row.fields).length === 0;
    next.mutable[key] = row;
  }

  next.cursor = remote.nextCursor || cursor || local.cursor;
  return next;
}
