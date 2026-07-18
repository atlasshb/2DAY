import { describe, expect, it } from "vitest";
import {
  applyPull,
  applyPushResult,
  compareEvents,
  dedupeEvents,
  emptyStore,
  nextBatch,
  type PushResult,
  type ServerChange,
  type SyncEvent,
  type SyncPullResult,
} from "./sync.js";
import type { VisitEvent } from "./types.js";

const ORG = "01J8ORG00000000000000000AA";
const REP = "01J8REP00000000000000000AA";
const CAMP = "01J8CAMP0000000000000000AA";

function ev(id: string, at: string, deviceSeq: number): SyncEvent {
  return { id, at, deviceSeq };
}

function visit(id: string, at: string, deviceSeq: number, outcome: VisitEvent["outcome"] = "conversation"): VisitEvent {
  return { id, orgId: ORG, repId: REP, campaignId: CAMP, outcome, at, deviceSeq };
}

describe("outbox batching", () => {
  it("orders by (at, deviceSeq) stably regardless of input order", () => {
    const events = [
      ev("01J8E00000000000000000000C", "2026-07-18T12:00:01+02:00", 0),
      ev("01J8E00000000000000000000A", "2026-07-18T12:00:00+02:00", 5),
      ev("01J8E00000000000000000000B", "2026-07-18T12:00:00+02:00", 2),
    ];
    const { events: batch } = nextBatch(events);
    expect(batch.map((e) => e.id)).toEqual([
      "01J8E00000000000000000000B", // same ts, lower seq first
      "01J8E00000000000000000000A",
      "01J8E00000000000000000000C",
    ]);
  });

  it("respects maxCount", () => {
    const events = Array.from({ length: 10 }, (_, i) =>
      ev(`01J8E0000000000000000000${String(i).padStart(2, "0")}`, `2026-07-18T12:00:0${i}+02:00`, i),
    );
    expect(nextBatch(events, { maxCount: 3 }).events).toHaveLength(3);
  });

  it("respects maxBytes but always emits at least one event", () => {
    const many = Array.from({ length: 5 }, (_, i) =>
      ev(`01J8E0000000000000000000A${i}`, `2026-07-18T12:00:0${i}+02:00`, i),
    );
    // maxBytes far smaller than one event ⇒ still emit exactly one (never wedge).
    const tiny = nextBatch(many, { maxBytes: 1 });
    expect(tiny.events).toHaveLength(1);
    expect(tiny.bytes).toBeGreaterThan(1);

    // a budget big enough for ~two events but not five ⇒ a partial batch.
    const perEvent = tiny.bytes; // bytes of a single event
    const partial = nextBatch(many, { maxBytes: perEvent * 2 + 1 });
    expect(partial.events.length).toBeGreaterThanOrEqual(2);
    expect(partial.events.length).toBeLessThan(5);

    // no byte cap ⇒ everything drains.
    expect(nextBatch(many).events).toHaveLength(5);
  });

  it("compareEvents is a total order", () => {
    const a = ev("A", "2026-07-18T12:00:00+02:00", 1);
    const b = ev("B", "2026-07-18T12:00:00+02:00", 1);
    expect(compareEvents(a, a)).toBe(0);
    expect(compareEvents(a, b)).toBeLessThan(0);
    expect(compareEvents(b, a)).toBeGreaterThan(0);
  });
});

describe("push result application (idempotent, at-least-once)", () => {
  it("acks applied ∪ duplicates and retries unmentioned events", () => {
    const batch = [{ id: "A" }, { id: "B" }, { id: "C" }];
    const result: PushResult = { applied: ["A"], duplicates: ["B"], rejected: [], serverCursor: "c1" };
    const app = applyPushResult(batch, result);
    expect(app.acked.sort()).toEqual(["A", "B"]);
    expect(app.retry).toEqual(["C"]); // C never mentioned → at-least-once retry
    expect(app.terminal).toEqual([]);
    expect(app.serverCursor).toBe("c1");
  });

  it("re-push after a partial ack does not duplicate", () => {
    const batch = [{ id: "A" }, { id: "B" }, { id: "C" }];
    // first push: A,B applied; C dropped mid-flight (unmentioned)
    const first = applyPushResult(batch, { applied: ["A", "B"], duplicates: [], rejected: [] });
    expect(first.acked.sort()).toEqual(["A", "B"]);
    expect(first.retry).toEqual(["C"]);

    // client re-pushes only C; server had actually stored it → duplicate, not re-applied
    const second = applyPushResult([{ id: "C" }], { applied: [], duplicates: ["C"], rejected: [] });
    expect(second.acked).toEqual(["C"]);
    expect(second.retry).toEqual([]);
  });

  it("separates retryable from terminal rejects", () => {
    const batch = [{ id: "A" }, { id: "B" }];
    const app = applyPushResult(batch, {
      applied: [],
      duplicates: [],
      rejected: [
        { id: "A", code: "conn_reset", retryable: true },
        { id: "B", code: "schema_invalid" },
      ],
    });
    expect(app.retry).toEqual(["A"]);
    expect(app.terminal).toEqual([{ id: "B", code: "schema_invalid" }]);
    expect(app.acked).toEqual([]);
  });
});

describe("dedupeEvents", () => {
  it("keeps the first occurrence per ULID and preserves order", () => {
    const events = [
      visit("01J8V00000000000000000000A", "2026-07-18T12:00:00+02:00", 0, "conversation"),
      visit("01J8V00000000000000000000B", "2026-07-18T12:00:01+02:00", 1, "sale"),
      visit("01J8V00000000000000000000A", "2026-07-18T12:00:02+02:00", 2, "no_answer"), // dup id
    ];
    const out = dedupeEvents(events);
    expect(out.map((e) => e.id)).toEqual([
      "01J8V00000000000000000000A",
      "01J8V00000000000000000000B",
    ]);
    expect(out[0]!.outcome).toBe("conversation"); // first kept, not the later no_answer
  });
});

describe("pull merge", () => {
  const put = (
    changeSeq: number,
    entity: string,
    id: string,
    row: unknown,
    serverTs: string,
  ): ServerChange => ({ changeSeq, entity, id, kind: "put", row, serverTs });

  it("appends visit events and never merges or overwrites them", () => {
    const v1 = visit("01J8V00000000000000000000A", "2026-07-18T12:00:00+02:00", 0, "conversation");
    const v1later = visit("01J8V00000000000000000000A", "2026-07-18T12:05:00+02:00", 1, "sale");
    const pull: SyncPullResult = {
      changes: [
        put(1, "visit", v1.id, v1, "2026-07-18T10:00:00Z"),
        put(2, "visit", v1later.id, v1later, "2026-07-18T10:05:00Z"), // same id, newer
      ],
      nextCursor: "cur-2",
    };
    const store = applyPull(emptyStore(), pull);
    // exactly one row, and it is the first (append-only, immutable) — not overwritten.
    expect(Object.keys(store.visits)).toHaveLength(1);
    expect(store.visits[v1.id]!.outcome).toBe("conversation");
    expect(store.cursor).toBe("cur-2");
  });

  it("LWW picks the newer server ts per field", () => {
    const s1: SyncPullResult = {
      changes: [put(1, "settings", "user", { theme: "night", units: "km" }, "2026-07-18T10:00:00Z")],
      nextCursor: "c1",
    };
    const afterFirst = applyPull(emptyStore(), s1);
    // second change updates only `theme`, newer ts → theme changes, units untouched.
    const s2: SyncPullResult = {
      changes: [put(2, "settings", "user", { theme: "sun" }, "2026-07-18T11:00:00Z")],
      nextCursor: "c2",
    };
    const afterSecond = applyPull(afterFirst, s2);
    const row = afterSecond.mutable["settings:user"]!;
    expect(row.fields.theme!.value).toBe("sun");
    expect(row.fields.units!.value).toBe("km");

    // an out-of-order older write for `theme` must NOT clobber the newer value.
    const s3: SyncPullResult = {
      changes: [put(3, "settings", "user", { theme: "night" }, "2026-07-18T09:00:00Z")],
      nextCursor: "c3",
    };
    const afterStale = applyPull(afterSecond, s3);
    expect(afterStale.mutable["settings:user"]!.fields.theme!.value).toBe("sun");
  });

  it("tombstone wins over a stale update", () => {
    const s1: SyncPullResult = {
      changes: [put(1, "plan_tweak", "plan-1", { legOrder: [3, 1, 2] }, "2026-07-18T10:00:00Z")],
      nextCursor: "c1",
    };
    const afterPut = applyPull(emptyStore(), s1);
    expect(afterPut.mutable["plan_tweak:plan-1"]!.deleted).toBe(false);

    const s2: SyncPullResult = {
      changes: [
        { changeSeq: 2, entity: "plan_tweak", id: "plan-1", kind: "tombstone", serverTs: "2026-07-18T11:00:00Z" },
      ],
      nextCursor: "c2",
    };
    const afterTomb = applyPull(afterPut, s2);
    const row = afterTomb.mutable["plan_tweak:plan-1"]!;
    expect(row.deleted).toBe(true);
    expect(Object.keys(row.fields)).toHaveLength(0);

    // a put OLDER than the tombstone must not resurrect the row.
    const s3: SyncPullResult = {
      changes: [put(3, "plan_tweak", "plan-1", { legOrder: [1, 2, 3] }, "2026-07-18T10:30:00Z")],
      nextCursor: "c3",
    };
    const afterStalePut = applyPull(afterTomb, s3);
    expect(afterStalePut.mutable["plan_tweak:plan-1"]!.deleted).toBe(true);

    // but a put NEWER than the tombstone resurrects that field (LWW).
    const s4: SyncPullResult = {
      changes: [put(4, "plan_tweak", "plan-1", { legOrder: [2, 3, 1] }, "2026-07-18T12:00:00Z")],
      nextCursor: "c4",
    };
    const afterNewPut = applyPull(afterStalePut, s4);
    expect(afterNewPut.mutable["plan_tweak:plan-1"]!.deleted).toBe(false);
    expect(afterNewPut.mutable["plan_tweak:plan-1"]!.fields.legOrder!.value).toEqual([2, 3, 1]);
  });

  it("is idempotent when a page is replayed", () => {
    const pull: SyncPullResult = {
      changes: [put(1, "settings", "user", { theme: "night" }, "2026-07-18T10:00:00Z")],
      nextCursor: "c1",
    };
    const once = applyPull(emptyStore(), pull);
    const twice = applyPull(once, pull);
    expect(twice).toEqual(once);
  });
});
