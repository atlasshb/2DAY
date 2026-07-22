/**
 * Builds a real `PlanRequest`/`Plan` from the Day Setup wizard's dayProfile
 * — WIZARD-BRIEF "Wiring real data". Mirrors `lib/planRequest.ts`'s demo
 * builder, but from real inputs instead of ten fixed chips.
 *
 * The planner service stays optional, same never-block contract as the demo
 * (`lib/api.ts`'s `compileDay`): this module's `buildRealLocalPlan` is the
 * local fallback, used whenever the planner is unreachable — which is every
 * run in this environment, same as the demo.
 *
 * Honesty boundary: there is no CBS income/apartment scoring model and no
 * street/H3 canvassing data on-device (that lives in services/planner,
 * which we don't have real data for here) — so a real plan's `score` and its
 * canvass legs' `expectedConversations`/`doorCount` are left at 0 rather
 * than invented. What IS real: the work-hours window, the walk time to the
 * work area (haversine distance ÷ walking speed), the bag/locker legs, and —
 * the actual point of this brief — the prayer stops, computed on-device from
 * @2day/core's astronomical calculator and scheduled per the jam' prefs.
 */
import type {
  CanvassLegDetail,
  GoalPreset,
  GymLegDetail,
  Plan,
  PlanLeg,
  PlanRequest,
} from "@2day/core";
import { computePrayerTimesISO, schedulePrayerStops } from "@2day/core";
import type { DayProfile } from "./dayProfile";
import { haversineMeters } from "./geoMath";
import { ulid } from "./planRequest";

const WALKING_SPEED_MPS = 1.35; // core's default (packages/core preferences.walkingSpeedMps)
const MIN_MEANINGFUL_WALK_M = 80; // below this, "walk to the work area" isn't worth a leg
const BAG_LEG_MINUTES = 5;

export function buildRealPlanRequest(profile: DayProfile): PlanRequest {
  const startPoint = profile.location.lat != null && profile.location.lng != null
    ? { lat: profile.location.lat, lng: profile.location.lng }
    : { lat: profile.workArea.lat ?? 0, lng: profile.workArea.lng ?? 0 };
  const workPoint = profile.workArea.lat != null && profile.workArea.lng != null
    ? { lat: profile.workArea.lat, lng: profile.workArea.lng }
    : startPoint;

  return {
    idempotencyKey: ulid(),
    orgId: ulid(),
    repId: ulid(),
    campaignId: ulid(),
    goalPreset: "max_sales" as GoalPreset, // the wizard doesn't ask for a goal yet — a reasonable default
    location: {
      kind: profile.location.source === "gps" ? "current" : "address",
      point: startPoint,
      label: profile.location.label,
    },
    destination: {
      kind: "address",
      point: workPoint,
      label: profile.workArea.label,
    },
    hours: { startAt: profile.hours.startAt, endAt: profile.hours.endAt },
    transportModes: ["walk"],
    memberships: [],
    bag: {
      size: profile.bag ? "standard" : "none",
      canCarryAllDay: profile.bag && !profile.locker,
    },
    preferences: {
      incomePreference: 0.5,
      apartmentPreference: 0,
      walkingSpeedMps: WALKING_SPEED_MPS,
    },
    overrides: { maxAlternatives: 0 },
  };
}

/** Adds `minutes` to an ISODateTime, preserving its original UTC offset
 *  (naive `toISOString()` + string-swap would silently shift the wall clock
 *  by the offset amount — this re-derives the local fields properly). */
function addMinutes(iso: string, minutes: number): string {
  const m = /([+-])(\d{2}):(\d{2})$/.exec(iso);
  const offsetMin = m ? (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])) : 0;
  const suffix = m ? m[0] : "Z";
  const local = new Date(new Date(iso).getTime() + minutes * 60_000 + offsetMin * 60_000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${local.getUTCFullYear()}-${pad(local.getUTCMonth() + 1)}-${pad(local.getUTCDate())}` +
    `T${pad(local.getUTCHours())}:${pad(local.getUTCMinutes())}:${pad(local.getUTCSeconds())}${suffix}`
  );
}

/** The device's current UTC offset in minutes — used as a stand-in for "the
 *  work area's timezone" (a reasonable assumption: a field rep and their
 *  work area share a country/timezone). */
function localUtcOffsetMinutes(d = new Date()): number {
  return -d.getTimezoneOffset();
}

/**
 * Builds today's real Plan directly from the wizard's answers — no network.
 * This is the `localFallback` passed to `compileDay()`.
 */
export function buildRealLocalPlan(profile: DayProfile, now = new Date()): Plan {
  const legs: PlanLeg[] = [];
  let seq = 1;
  const nextId = () => ulid();

  const hasStartCoords = profile.location.lat != null && profile.location.lng != null;
  const hasWorkCoords = profile.workArea.lat != null && profile.workArea.lng != null;
  const startPoint = hasStartCoords ? { lat: profile.location.lat!, lng: profile.location.lng! } : null;
  const workPoint = hasWorkCoords ? { lat: profile.workArea.lat!, lng: profile.workArea.lng! } : null;

  let cursor = profile.hours.startAt;
  let totalWalkMinutes = 0;

  // 1) Walk to the work area, if we know both points and they're not already the same spot.
  if (startPoint && workPoint) {
    const distanceM = haversineMeters(startPoint, workPoint);
    if (distanceM >= MIN_MEANINGFUL_WALK_M) {
      const walkMinutes = Math.max(1, Math.round(distanceM / WALKING_SPEED_MPS / 60));
      const endAt = addMinutes(cursor, walkMinutes);
      legs.push({
        id: nextId(),
        seq: seq++,
        kind: "walk",
        startAt: cursor,
        endAt,
        fromLabel: profile.location.label,
        toLabel: profile.workArea.label,
        detail: {},
      });
      totalWalkMinutes += walkMinutes;
      cursor = endAt;
    }
  }

  // 2) Bag drop, if carrying a bag and wanting a locker/drop point.
  if (profile.bag && profile.locker) {
    const endAt = addMinutes(cursor, BAG_LEG_MINUTES);
    legs.push({
      id: nextId(),
      seq: seq++,
      kind: "gym",
      startAt: cursor,
      endAt,
      fromLabel: profile.workArea.label,
      toLabel: "Locker / bag drop near the work area",
      detail: { poiId: nextId(), action: "drop_bag" } satisfies GymLegDetail,
    });
    cursor = endAt;
  }

  // 3) Prayer stops — the actual point of this brief. Computed on-device
  //    from the work area's coordinates (falling back to the start location)
  //    and today's date; scheduled per the jam' (combining) prefs.
  const prayerStops = profile.prayerPlan.enabled && (workPoint ?? startPoint)
    ? schedulePrayerStops(
        computePrayerTimesISO({
          year: now.getFullYear(),
          month: now.getMonth() + 1,
          day: now.getDate(),
          lat: (workPoint ?? startPoint)!.lat,
          lng: (workPoint ?? startPoint)!.lng,
          utcOffsetMinutes: localUtcOffsetMinutes(now),
          method: profile.prayerPlan.method,
          asrMadhab: profile.prayerPlan.asrMadhab,
        }),
        {
          combineDhuhrAsr: profile.prayerPlan.combineDhuhrAsr,
          combineMaghribIsha: profile.prayerPlan.combineMaghribIsha,
        },
        profile.hours.startAt,
        profile.hours.endAt,
      )
    : [];

  // 4) Fill the remaining window with canvass legs, one per gap between
  //    fixed commitments (walk/bag/prayer) — honestly zeroed EV, no
  //    street/H3 data on-device.
  type FixedBlock = { startAt: string; endAt: string; leg?: PlanLeg };
  const fixed: FixedBlock[] = [
    ...legs.map((l) => ({ startAt: l.startAt, endAt: l.endAt, leg: l })),
    ...prayerStops.map((p) => ({
      startAt: p.startAt,
      endAt: p.endAt,
      leg: {
        id: nextId(),
        seq: 0, // reassigned below once everything is time-sorted
        kind: "break" as const,
        startAt: p.startAt,
        endAt: p.endAt,
        fromLabel: p.label,
        toLabel: profile.prayerPlan.mosque?.name ?? "Nearby, no place picked",
        detail: {},
      },
    })),
  ].sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());

  const allLegs: PlanLeg[] = [...legs];
  let gapCursor = profile.hours.startAt;
  for (const block of fixed) {
    if (block.leg && !legs.includes(block.leg)) {
      // prayer-derived leg — insert it, and account for the gap before it.
      if (new Date(block.startAt).getTime() > new Date(gapCursor).getTime()) {
        const durMin = Math.round((new Date(block.startAt).getTime() - new Date(gapCursor).getTime()) / 60_000);
        if (durMin > 0) {
          allLegs.push({
            id: nextId(),
            seq: 0,
            kind: "canvass",
            startAt: gapCursor,
            endAt: block.startAt,
            fromLabel: profile.workArea.label,
            toLabel: profile.workArea.label,
            areaId: undefined,
            detail: {
              areaId: "",
              h3Cells: [],
              streetEdgeIds: [],
              expectedConversations: 0,
              doorCount: 0,
              estWalkMinutes: durMin,
            } satisfies CanvassLegDetail,
          });
        }
      }
      allLegs.push(block.leg);
    }
    gapCursor = block.endAt;
  }
  // Final canvass block from the last fixed commitment to end of work hours.
  if (new Date(profile.hours.endAt).getTime() > new Date(gapCursor).getTime()) {
    const durMin = Math.round(
      (new Date(profile.hours.endAt).getTime() - new Date(gapCursor).getTime()) / 60_000,
    );
    if (durMin > 0) {
      allLegs.push({
        id: nextId(),
        seq: 0,
        kind: "canvass",
        startAt: gapCursor,
        endAt: profile.hours.endAt,
        fromLabel: profile.workArea.label,
        toLabel: profile.workArea.label,
        detail: {
          areaId: "",
          h3Cells: [],
          streetEdgeIds: [],
          expectedConversations: 0,
          doorCount: 0,
          estWalkMinutes: durMin,
        } satisfies CanvassLegDetail,
      });
    }
  }

  allLegs.sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());
  allLegs.forEach((leg, i) => {
    leg.seq = i + 1;
  });

  const explanation: string[] = [
    `Built from your Day Setup: ${hhmm(profile.hours.startAt)}–${hhmm(profile.hours.endAt)} in ${profile.workArea.label}.`,
  ];
  if (profile.bag) {
    explanation.push(
      profile.locker
        ? "Bag drop planned near the work area."
        : "Carrying the bag all day — no locker requested.",
    );
  }
  if (profile.prayerPlan.enabled) {
    explanation.push(
      prayerStops.length > 0
        ? `${prayerStops.length} prayer stop${prayerStops.length > 1 ? "s" : ""} scheduled${
            profile.prayerPlan.mosque ? ` at ${profile.prayerPlan.mosque.name}` : ""
          }.`
        : "None of today's prayer times fall inside your work hours.",
    );
  }

  return {
    id: ulid(),
    orgId: ulid(),
    repId: ulid(),
    campaignId: ulid(),
    goalPreset: "max_sales",
    compiledAt: now.toISOString(),
    planVersion: 1,
    validUntil: profile.hours.endAt,
    score: {
      expectedConversations: 0,
      expectedRevenueEur: 0,
      walkMinutes: totalWalkMinutes,
      transitMinutes: 0,
      carryPenalty: profile.bag ? (profile.locker ? 0.05 : 0.15) : 0,
      goalPreset: "max_sales",
    },
    legs: allLegs,
    alternatives: [],
    explanation,
    daypackStatus: "none",
  };
}

function hhmm(iso: string): string {
  return iso.slice(11, 16);
}

/** Prayer-stop legs only (every "break" leg in a real plan is a prayer stop
 *  — `buildRealLocalPlan` never adds any other kind of break), for callers
 *  (Route tab) that just want the prayer timeline. */
export function prayerLegsOf(plan: Plan): PlanLeg[] {
  return plan.legs.filter((l) => l.kind === "break");
}
