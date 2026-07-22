import { describe, expect, it } from "vitest";
import { buildRealLocalPlan } from "./planFromProfile";
import type { DayProfile } from "./dayProfile";

/**
 * Regression test for the "prayer stop eats the whole afternoon" bug caught
 * in review: `schedulePrayerStops` used to give each prayer stop the fiqh
 * VALIDITY window (endAt = next prayer's time) instead of a realistic
 * duration, so `buildRealLocalPlan` turned it into a break leg spanning
 * hours — on the default 12:00-18:00 + prayer-enabled config, the entire
 * afternoon collapsed into one break with zero canvass after it.
 *
 * Tilburg, 21-07-2026, MWL/standard (see packages/core/src/prayer/times.test.ts's
 * reference row): Dhuhr 13:46, Asr 18:03 — Dhuhr falls inside 12:00-18:00,
 * Asr does not (18:03 > 18:00 end), so exactly one prayer stop is expected.
 */
const TILBURG = { lat: 51.5606, lng: 5.0919 };

function goldenProfile(overrides: Partial<DayProfile> = {}): DayProfile {
  return {
    location: { source: "gps", lat: TILBURG.lat, lng: TILBURG.lng, label: "Current location" },
    workArea: { source: "geocoded", lat: TILBURG.lat, lng: TILBURG.lng, label: "Groenewoud, Tilburg" },
    hours: { startAt: "2026-07-21T12:00:00+02:00", endAt: "2026-07-21T18:00:00+02:00" },
    bag: false,
    locker: false,
    prayerPlan: {
      enabled: true,
      method: "MWL",
      asrMadhab: "standard",
      combineDhuhrAsr: false,
      combineMaghribIsha: false,
    },
    createdAt: "2026-07-21T10:00:00+02:00",
    ...overrides,
  };
}

describe("buildRealLocalPlan — prayer stops must not eat the afternoon", () => {
  const now = new Date("2026-07-21T11:00:00+02:00");

  it("keeps prayer breaks short and still fills the rest of the window with canvass legs", () => {
    const plan = buildRealLocalPlan(goldenProfile(), now);

    const breakLegs = plan.legs.filter((l) => l.kind === "break");
    const canvassLegs = plan.legs.filter((l) => l.kind === "canvass");

    // Exactly one prayer (Dhuhr) falls inside the default 12:00-18:00 window.
    expect(breakLegs).toHaveLength(1);

    // The fix: each break leg is a short, fixed duration (<= 20 min), NOT
    // the multi-hour fiqh window to the next prayer.
    for (const b of breakLegs) {
      const durationMin = (new Date(b.endAt).getTime() - new Date(b.startAt).getTime()) / 60_000;
      expect(durationMin).toBeLessThanOrEqual(20);
    }

    // There must be at least one canvass leg that starts at or after the
    // first prayer stop ends — i.e. the afternoon is NOT entirely consumed
    // by the prayer break.
    const firstBreakEnd = new Date(breakLegs[0]!.endAt).getTime();
    const hasCanvassAfterPrayer = canvassLegs.some(
      (l) => new Date(l.startAt).getTime() >= firstBreakEnd,
    );
    expect(hasCanvassAfterPrayer).toBe(true);

    // And canvass time should dominate the 6-hour window, not be reduced to
    // near zero by an oversized break.
    const totalCanvassMin = canvassLegs.reduce(
      (sum, l) => sum + (new Date(l.endAt).getTime() - new Date(l.startAt).getTime()) / 60_000,
      0,
    );
    expect(totalCanvassMin).toBeGreaterThan(300); // out of a 360-minute work window
  });

  it("combined Dhuhr+Asr still produces just one short break, not a multi-hour one", () => {
    const plan = buildRealLocalPlan(
      goldenProfile({
        prayerPlan: {
          enabled: true,
          method: "MWL",
          asrMadhab: "standard",
          combineDhuhrAsr: true,
          combineMaghribIsha: false,
        },
      }),
      now,
    );
    const breakLegs = plan.legs.filter((l) => l.kind === "break");
    expect(breakLegs).toHaveLength(1);
    const durationMin =
      (new Date(breakLegs[0]!.endAt).getTime() - new Date(breakLegs[0]!.startAt).getTime()) / 60_000;
    expect(durationMin).toBeLessThanOrEqual(20);
  });

  it("no prayer stops at all when prayerPlan.enabled is false — canvass fills the whole window", () => {
    const plan = buildRealLocalPlan(
      goldenProfile({ prayerPlan: { enabled: false, method: "MWL", asrMadhab: "standard", combineDhuhrAsr: false, combineMaghribIsha: false } }),
      now,
    );
    expect(plan.legs.filter((l) => l.kind === "break")).toHaveLength(0);
    const totalCanvassMin = plan.legs
      .filter((l) => l.kind === "canvass")
      .reduce((sum, l) => sum + (new Date(l.endAt).getTime() - new Date(l.startAt).getTime()) / 60_000, 0);
    expect(totalCanvassMin).toBe(360); // the full 12:00-18:00 window
  });
});
