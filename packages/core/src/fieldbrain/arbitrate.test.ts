import { describe, expect, it } from "vitest";
import {
  defaultRules,
  initialState,
  nextNudge,
  trainSlackMin,
  type Signals,
} from "./index.js";
import { defaultConfig } from "./types.js";

const T0 = Date.UTC(2026, 6, 18, 12, 0, 0); // fixed clock, epoch ms

/** A quiet baseline where no rule fires; individual tests turn one signal on. */
function baseSignals(): Signals {
  return {
    plannedDoorsPerHour: 20,
    actualDoorsPerHour: 20,
    paceWindowMin: 0,
    remainingDoors: 100,
    remainingEv: 40,
    batteryPct: 90,
    trackingOn: true,
    canvassLegsRemaining: 2,
  };
}

describe("field brain arbitration", () => {
  it("rain (deadline) beats a nearby high-EV cluster (opportunity)", () => {
    const rules = defaultRules();
    const s: Signals = {
      ...baseSignals(),
      rainStartsInMin: 12,
      rainIntensityMmH: 1.2,
      dryLoopReorderAvailable: true,
      loopLabel: "Zuid",
      highEvClusterNearby: { streetName: "Beethovenlaan", doorCount: 6, distanceM: 90, evPercentile: 95 },
    };
    const { nudge } = nextNudge(rules, s, initialState(), T0);
    expect(nudge?.ruleId).toBe("rain_before_loop");
    expect(nudge?.priority).toBe("deadline");
    expect(nudge?.body).toContain("Zuid");
  });

  it("global 2-min cooldown suppresses an info nudge but not a deadline nudge", () => {
    const rules = defaultRules();
    // state: something fired 30s ago → inside the 120s global window.
    const recent = { lastFiredAt: {}, lastNudgeAt: T0 - 30_000 };

    // info-only signal (battery low) → suppressed by the global gate.
    const infoSignals: Signals = { ...baseSignals(), batteryPct: 10 };
    expect(nextNudge(rules, infoSignals, recent, T0).nudge).toBeNull();

    // deadline signal (rain) at the same recent state → bypasses the gate and fires.
    const deadlineSignals: Signals = {
      ...baseSignals(),
      rainStartsInMin: 10,
      rainIntensityMmH: 0.8,
      dryLoopReorderAvailable: true,
    };
    const out = nextNudge(rules, deadlineSignals, recent, T0);
    expect(out.nudge?.ruleId).toBe("rain_before_loop");
  });

  it("leave-for-train fires exactly at the slack threshold and not one minute before", () => {
    const rules = defaultRules();
    const walk = 8;
    const buffer = defaultConfig.platformBufferMin; // 3
    // slack === 0  ⇒  departure = now + (walk + buffer) minutes
    const atThreshold: Signals = {
      ...baseSignals(),
      transit: {
        routeShortName: "IC 3600",
        departureAt: T0 + (walk + buffer) * 60_000,
        walkMinutesToStop: walk,
        realtimeState: "on_time",
      },
    };
    expect(trainSlackMin(atThreshold, T0, defaultConfig)).toBe(0);
    expect(nextNudge(rules, atThreshold, initialState(), T0).nudge?.ruleId).toBe("catch_train");

    // one more minute of slack ⇒ does not fire (no other rule active either)
    const oneEarly: Signals = {
      ...baseSignals(),
      transit: {
        routeShortName: "IC 3600",
        departureAt: T0 + (walk + buffer + 1) * 60_000,
        walkMinutesToStop: walk,
        realtimeState: "on_time",
      },
    };
    expect(trainSlackMin(oneEarly, T0, defaultConfig)).toBe(1);
    expect(nextNudge(rules, oneEarly, initialState(), T0).nudge).toBeNull();
  });

  it("safety catch_train bypasses the global cooldown", () => {
    const rules = defaultRules();
    const recent = { lastFiredAt: {}, lastNudgeAt: T0 - 5_000 };
    const s: Signals = {
      ...baseSignals(),
      transit: {
        routeShortName: "IC 3600",
        departureAt: T0 + 3 * 60_000, // slack negative
        walkMinutesToStop: 8,
        realtimeState: "on_time",
      },
    };
    expect(nextNudge(rules, s, recent, T0).nudge?.ruleId).toBe("catch_train");
  });

  it("per-rule cooldown prevents an immediate repeat fire", () => {
    const rules = defaultRules();
    const s: Signals = {
      ...baseSignals(),
      rainStartsInMin: 10,
      rainIntensityMmH: 0.8,
      dryLoopReorderAvailable: true,
    };
    const first = nextNudge(rules, s, initialState(), T0);
    expect(first.nudge?.ruleId).toBe("rain_before_loop");

    // 5 minutes later, well inside the 20-min rain cooldown → no repeat.
    const second = nextNudge(rules, s, first.state, T0 + 5 * 60_000);
    expect(second.nudge).toBeNull();

    // 21 minutes later, past the cooldown → fires again.
    const third = nextNudge(rules, s, first.state, T0 + 21 * 60_000);
    expect(third.nudge?.ruleId).toBe("rain_before_loop");
  });

  it("per-street cooldown key resets when the street changes", () => {
    const rules = defaultRules();
    const edgeA: Signals = {
      ...baseSignals(),
      nextEdge: {
        streetEdgeId: "01J8XR000000000000000000AA",
        streetName: "Beethovenlaan",
        apartmentSharePct: 78,
        doorAccessLocked: true,
        doorsTotal: 30,
        doorsLogged: 0,
        doNotKnockCount: 0,
      },
    };
    const first = nextNudge(rules, edgeA, initialState(), T0);
    expect(first.nudge?.ruleId).toBe("skip_apartment_street");

    // Same street, well past the global 2-min gate → still suppressed because the
    // per-street cooldown key is held (isolates per-street behavior from the global gate).
    const later = T0 + 130_000;
    expect(nextNudge(rules, edgeA, first.state, later).nudge).toBeNull();

    // A different street → different cooldown key → fires again.
    const edgeB: Signals = {
      ...edgeA,
      nextEdge: { ...edgeA.nextEdge!, streetEdgeId: "01J8XR000000000000000000BB", streetName: "Mozartlaan" },
    };
    expect(nextNudge(rules, edgeB, first.state, later).nudge?.ruleId).toBe("skip_apartment_street");
  });

  it("is deterministic: identical inputs yield identical output", () => {
    const s: Signals = {
      ...baseSignals(),
      rainStartsInMin: 10,
      rainIntensityMmH: 0.8,
      dryLoopReorderAvailable: true,
      highEvClusterNearby: { streetName: "Mozartlaan", doorCount: 5, distanceM: 100, evPercentile: 92 },
    };
    const a = nextNudge(defaultRules(), s, initialState(), T0);
    const b = nextNudge(defaultRules(), s, initialState(), T0);
    expect(a.nudge).toEqual(b.nudge);
    expect(a.state).toEqual(b.state);
  });

  it("implements the full doc-10 catalog of 15 rules", () => {
    const ids = defaultRules().map((r) => r.id);
    expect(ids).toHaveLength(15);
    expect(new Set(ids).size).toBe(15);
    expect(ids).toContain("catch_train");
    expect(ids).toContain("street_done");
  });
});
