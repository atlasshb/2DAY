/**
 * Outbox write + drain — docs/15-offline-sync.md §2.2/§2.3. Thin binding over the
 * pure sync engine in @2day/core: this module owns only the IndexedDB side effects
 * (validate → append → mark synced); ordering, batching and idempotent ack handling
 * are the core's `nextBatch` / `applyPushResult`.
 */
import {
  applyPushResult,
  nextBatch,
  visitEvent as visitEventSchema,
  type PushApplication,
  type PushResult,
  type VisitEvent,
} from "@2day/core";
import { db, SYNC_KEYS, type OutboxRow } from "./db";

/** Batch caps (doc 15 §2.3: server accepts batches of ≤ 200). */
const MAX_COUNT = 200;
const MAX_BYTES = 512 * 1024;

/**
 * Bump the persisted per-device monotonic counter and return the next value.
 * Must run inside a rw transaction that also appends the event so the counter and
 * the event commit atomically (doc 15 §2.2) — never call it standalone.
 */
async function bumpSeq(): Promise<number> {
  const row = await db.syncState.get(SYNC_KEYS.lastSeq);
  const next = (typeof row?.value === "number" ? row.value : -1) + 1;
  await db.syncState.put({ key: SYNC_KEYS.lastSeq, value: next });
  return next;
}

/**
 * Validate a visit event with core's zod schema, stamp it with the next monotonic
 * `deviceSeq`, and durably append it to the outbox. The write is confirmed to the rep
 * the instant this resolves (the outbox is the source of truth, doc 15 §5) — pushing
 * happens later and asynchronously.
 */
export async function enqueueVisit(event: VisitEvent): Promise<OutboxRow> {
  return db.transaction("rw", db.syncState, db.visitOutbox, async () => {
    const deviceSeq = await bumpSeq();
    // The stored counter is authoritative for ordering; stamp it onto the event.
    const stamped: VisitEvent = { ...event, deviceSeq };
    const parsed = visitEventSchema.parse(stamped) as VisitEvent;
    const row: OutboxRow = {
      id: parsed.id,
      deviceSeq: parsed.deviceSeq,
      at: parsed.at,
      synced: 0,
      event: parsed,
    };
    await db.visitOutbox.put(row);
    return row;
  });
}

/** How the outbox reaches the server. Injected so this stays offline-testable. */
export interface PushTransport {
  push(events: VisitEvent[]): Promise<PushResult>;
}

export interface PushOutboxResult extends PushApplication {
  /** Number of events sent in this batch (0 when the outbox was empty). */
  sent: number;
}

/**
 * Drain one batch of pending events oldest-first and reconcile the server's result:
 * acked rows flip to `synced=1`, retryable/unmentioned rows stay for the next drain,
 * terminal rejects are left flagged for quarantine. Safe to call repeatedly.
 */
export async function pushOutbox(transport: PushTransport): Promise<PushOutboxResult> {
  const pending = await db.visitOutbox.where("synced").equals(0).toArray();
  if (pending.length === 0) {
    return { sent: 0, acked: [], retry: [], terminal: [] };
  }

  const batch = nextBatch(pending, { maxCount: MAX_COUNT, maxBytes: MAX_BYTES });
  const events = batch.events.map((row) => row.event);

  const result = await transport.push(events);
  const application = applyPushResult(batch.events, result);

  if (application.acked.length > 0) {
    await db.transaction("rw", db.visitOutbox, async () => {
      for (const id of application.acked) {
        await db.visitOutbox.update(id, { synced: 1 });
      }
    });
  }

  if (application.serverCursor) {
    await db.syncState.put({ key: SYNC_KEYS.pullCursor, value: application.serverCursor });
  }

  return { sent: events.length, ...application };
}
