/**
 * Planner MVP acceptance tests (vitest + fastify.inject — no network).
 * Covers the six scenarios named in the brief plus a couple of guards.
 * Determinism: every server is built with a fixed clock + ULID seed and the
 * default mock adapters, so runs are reproducible.
 */
import { describe, it, expect } from "vitest";
import { buildServer } from "./server.js";
import { runL3 } from "./pipeline/l3.js";
import { encodeCrockford } from "./util/ulid.js";
import { AREAS, STATIONS, getAreaById } from "./fixtures/brabant.js";
import type { Plan, PlanLeg, GymLegDetail, CanvassLegDetail } from "./core.js";

const fid = (n: number): string => encodeCrockford(BigInt(n), 26);
const CLOCK = (): number => Date.parse("2026-07-20T06:00:00+02:00");

const ST = (city: string): string => STATIONS.find((s) => s.city === city)!.stopId;
const areaByName = (name: string) => AREAS.find((a) => a.name === name)!;

/** A rep commuting Eindhoven → (work) → Eindhoven, heavy bag + Basic-Fit. */
function heavyCommuteRequest(overrides: Record<string, unknown> = {}) {
  return {
    idempotencyKey: fid(1),
    orgId: fid(2),
    repId: fid(3),
    campaignId: fid(4),
    goalPreset: "max_sales",
    location: { kind: "station", point: { lat: 51.4433, lng: 5.4797 }, ref: ST("Eindhoven") },
    destination: { kind: "station", point: { lat: 51.4433, lng: 5.4797 }, ref: ST("Eindhoven") },
    hours: {
      startAt: "2026-07-20T08:30:00+02:00",
      endAt: "2026-07-20T17:30:00+02:00",
      breaks: [{ earliest: "2026-07-20T11:30:00+02:00", latest: "2026-07-20T13:30:00+02:00", minutes: 30 }],
    },
    transportModes: ["train", "walk"],
    memberships: [{ chain: "basic_fit" }],
    bag: { size: "heavy", canCarryAllDay: false },
    preferences: { incomePreference: 0.6, apartmentPreference: -0.5, walkingSpeedMps: 1.35 },
    // exclude the only Eindhoven buurt so the rep must commute (⇒ transit + gym)
    overrides: { excludedAreas: [areaByName("Achtse Barrier").id] },
    ...overrides,
  };
}

const ms = (iso: string): number => Date.parse(iso);
const legsOfKind = (plan: Plan, kind: PlanLeg["kind"]): PlanLeg[] => plan.legs.filter((l) => l.kind === kind);

describe("POST /v1/plans/compile", () => {
  it("(a) returns 200 with a Plan whose legs are monotonic and end by hours.endAt", async () => {
    const app = buildServer({ clock: CLOCK, ulidSeed: 42 });
    const res = await app.inject({ method: "POST", url: "/v1/plans/compile", payload: heavyCommuteRequest() });
    expect(res.statusCode).toBe(200);
    const plan = res.json() as Plan;

    expect(plan.planVersion).toBe(1);
    expect(plan.legs.length).toBeGreaterThan(0);

    // monotonic: each leg ends no earlier than it starts, and no leg starts before the previous ends
    for (const leg of plan.legs) {
      expect(ms(leg.endAt)).toBeGreaterThanOrEqual(ms(leg.startAt));
    }
    for (let i = 1; i < plan.legs.length; i++) {
      expect(ms(plan.legs[i]!.startAt)).toBeGreaterThanOrEqual(ms(plan.legs[i - 1]!.endAt));
      expect(plan.legs[i]!.seq).toBe(plan.legs[i - 1]!.seq + 1);
    }

    // last leg ends by the hard deadline (doc 09: "must be at destination by/before endAt")
    const last = plan.legs[plan.legs.length - 1]!;
    expect(ms(last.endAt)).toBeLessThanOrEqual(ms("2026-07-20T17:30:00+02:00"));

    // a real day of work happened
    expect(legsOfKind(plan, "canvass").length).toBeGreaterThan(0);
    expect(plan.score.expectedConversations).toBeGreaterThan(0);
    expect(plan.alternatives.length).toBeLessThanOrEqual(2);
    await app.close();
  });

  it("(b) rejects an invalid body with 400 and the error taxonomy shape", async () => {
    const app = buildServer({ clock: CLOCK });
    const res = await app.inject({ method: "POST", url: "/v1/plans/compile", payload: { goalPreset: "nope" } });
    expect(res.statusCode).toBe(400);
    const body = res.json() as { error: { code: string; message: string; details?: unknown } };
    expect(body.error.code).toBe("PLAN_REQUEST_INVALID");
    expect(typeof body.error.message).toBe("string");
    expect(body.error.details).toBeDefined();
    await app.close();
  });

  it("(c) heavy bag + Basic-Fit ⇒ gym drop precedes first canvass and pickup precedes final transit", async () => {
    const app = buildServer({ clock: CLOCK, ulidSeed: 7 });
    const res = await app.inject({ method: "POST", url: "/v1/plans/compile", payload: heavyCommuteRequest() });
    expect(res.statusCode).toBe(200);
    const plan = res.json() as Plan;

    const gymDropSeq = plan.legs.find(
      (l) => l.kind === "gym" && (l.detail as GymLegDetail).action === "drop_bag",
    )?.seq;
    const gymPickupSeq = plan.legs.find(
      (l) => l.kind === "gym" && (l.detail as GymLegDetail).action === "pickup_bag",
    )?.seq;
    const firstCanvassSeq = plan.legs.find((l) => l.kind === "canvass")?.seq;
    const transitSeqs = legsOfKind(plan, "transit").map((l) => l.seq);
    const finalTransitSeq = transitSeqs[transitSeqs.length - 1];

    expect(gymDropSeq).toBeDefined();
    expect(gymPickupSeq).toBeDefined();
    expect(firstCanvassSeq).toBeDefined();
    expect(finalTransitSeq).toBeDefined();

    expect(gymDropSeq!).toBeLessThan(firstCanvassSeq!); // drop the bag, then canvass
    expect(gymPickupSeq!).toBeLessThan(finalTransitSeq!); // pick it up before the train home
    expect(gymDropSeq!).toBeLessThan(gymPickupSeq!);
    await app.close();
  });
});

describe("POST /v1/plans/:planId/replan", () => {
  it("(d) rain_nowcast bumps planVersion and reorders exposed loops earlier", async () => {
    const app = buildServer({ clock: CLOCK, ulidSeed: 5 });

    // Work Den Bosch locally with both its buurten pinned; exclude every other
    // area so the chosen plan deterministically holds Maaspoort + Hambaken.
    const dbAreas = AREAS.filter((a) => a.city === "'s-Hertogenbosch");
    const others = AREAS.filter((a) => a.city !== "'s-Hertogenbosch").map((a) => a.id);
    const compileRes = await app.inject({
      method: "POST",
      url: "/v1/plans/compile",
      payload: heavyCommuteRequest({
        idempotencyKey: fid(1000),
        goalPreset: "max_sales",
        location: { kind: "station", point: { lat: 51.6906, lng: 5.2933 }, ref: ST("'s-Hertogenbosch") },
        destination: { kind: "station", point: { lat: 51.6906, lng: 5.2933 }, ref: ST("'s-Hertogenbosch") },
        bag: { size: "none", canCarryAllDay: true }, // no gym → clean canvass sequence
        memberships: [],
        hours: { startAt: "2026-07-20T08:30:00+02:00", endAt: "2026-07-20T17:30:00+02:00" }, // no lunch split
        overrides: { pinnedAreas: dbAreas.map((a) => a.id), excludedAreas: others },
      }),
    });
    expect(compileRes.statusCode).toBe(200);
    const plan = compileRes.json() as Plan;
    const before = legsOfKind(plan, "canvass").map((l) => (l.detail as CanvassLegDetail).areaId);
    expect(before.length).toBe(2);

    const replanRes = await app.inject({
      method: "POST",
      url: `/v1/plans/${plan.id}/replan`,
      payload: {
        idempotencyKey: fid(1001),
        reason: "rain_nowcast",
        signal: { at: "2026-07-20T10:00:00+02:00", rainStartsInMin: 20 },
      },
    });
    expect(replanRes.statusCode).toBe(200);
    const replanned = replanRes.json() as Plan;

    expect(replanned.planVersion).toBe(plan.planVersion + 1);
    const after = legsOfKind(replanned, "canvass").map((l) => (l.detail as CanvassLegDetail).areaId);

    // reordered: most rain-exposed (lowest apartment share) first, and different from before
    expect(after).not.toEqual(before);
    const exposure = (id: string): number => 1 - getAreaById(id)!.apartmentRatio;
    for (let i = 1; i < after.length; i++) {
      expect(exposure(after[i - 1]!)).toBeGreaterThanOrEqual(exposure(after[i]!));
    }
    // legs stay monotonic after re-timing
    for (let i = 1; i < replanned.legs.length; i++) {
      expect(ms(replanned.legs[i]!.startAt)).toBeGreaterThanOrEqual(ms(replanned.legs[i - 1]!.endAt));
    }
    await app.close();
  });

  it("returns 404 for an unknown plan id", async () => {
    const app = buildServer({ clock: CLOCK });
    const res = await app.inject({
      method: "POST",
      url: `/v1/plans/${fid(99)}/replan`,
      payload: { idempotencyKey: fid(98), reason: "manual_tweak", signal: { at: "2026-07-20T10:00:00+02:00" } },
    });
    expect(res.statusCode).toBe(404);
    expect((res.json() as { error: { code: string } }).error.code).toBe("PLAN_NOT_FOUND");
    await app.close();
  });
});

describe("L3 micro routing", () => {
  it("(e) respects the leg time budget (sum of est minutes ≤ budget)", async () => {
    const area = AREAS[0]!;
    const prefs = { incomePreference: 0.6, apartmentPreference: -0.5, walkingSpeedMps: 1.35 };
    // Budget-respect invariant holds for every budget, including tiny ones that
    // fit no street (a single terraced street is ~25-40 min incl. sale dwell).
    for (const budgetMin of [5, 20, 45, 90, 180]) {
      const res = runL3(area, budgetMin * 60, 15, prefs);
      expect(res.estTotalMinutes).toBeLessThanOrEqual(budgetMin + 1e-6);
    }
    // With a realistic loop budget it selects streets and doors.
    for (const budgetMin of [45, 90, 180]) {
      const res = runL3(area, budgetMin * 60, 15, prefs);
      expect(res.streetEdgeIds.length).toBeGreaterThan(0);
      expect(res.doorCount).toBeGreaterThan(0);
    }
  });

  it("drops a closed edge from selection when excluded", async () => {
    const area = AREAS[3]!; // Maaspoort
    const prefs = { incomePreference: 0.5, apartmentPreference: 0, walkingSpeedMps: 1.35 };
    const full = runL3(area, 60 * 60, 15, prefs);
    const closed = full.streetEdgeIds[0]!;
    const reduced = runL3(area, 60 * 60, 15, prefs, new Set([closed]));
    expect(reduced.streetEdgeIds).not.toContain(closed);
  });
});

describe("GET /v1/areas/discover", () => {
  it("(f) returns candidates ranked by descending score", async () => {
    const app = buildServer({ clock: CLOCK });
    const res = await app.inject({
      method: "GET",
      url: "/v1/areas/discover?lat=51.6906&lng=5.2933&minutes=240&goal=max_sales",
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { candidates: { score: number }[]; cacheKey: string };
    expect(body.candidates.length).toBeGreaterThan(1);
    for (let i = 1; i < body.candidates.length; i++) {
      expect(body.candidates[i - 1]!.score).toBeGreaterThanOrEqual(body.candidates[i]!.score);
    }
    await app.close();
  });

  it("rejects a missing/invalid query with 400", async () => {
    const app = buildServer({ clock: CLOCK });
    const res = await app.inject({ method: "GET", url: "/v1/areas/discover?lat=abc&lng=5.3&minutes=60" });
    expect(res.statusCode).toBe(400);
    expect((res.json() as { error: { code: string } }).error.code).toBe("DISCOVER_REQUEST_INVALID");
    await app.close();
  });
});

describe("GET /v1/health", () => {
  it("reports mock deps", async () => {
    const app = buildServer({ clock: CLOCK });
    const res = await app.inject({ method: "GET", url: "/v1/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true, deps: { valhalla: "mock", vroom: "mock", otp: "mock" } });
    await app.close();
  });
});
