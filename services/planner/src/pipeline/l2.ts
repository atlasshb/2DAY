/**
 * L2 — Orienteering with Time Windows (meso: *in what order*). docs/00 §5,
 * docs/11 §3.
 *
 * Takes an L1 candidate (fixed area-set + anchors), sequences the canvass nodes
 * with the Optimizer (mock VROOM: nearest-neighbour + 2-opt + prize-drop under
 * the hard train deadline — doc 11 §3.2/§3.3), and assembles the ordered
 * PlanLeg list. The special anchors of doc 11 §3.4 are handled here:
 *   - gym bag-drop immediately after arrival + a pickup before the final
 *     transit (constraint 6: drop precedes any canvass),
 *   - a 30-min lunch inside the provided break window (soft, constraint 7),
 *   - the hard end-station deadline = train departure − platform buffer,
 *     with the rep back ≥10 min before hours.endAt (brief).
 *
 * Leg times are strictly monotonic by construction (forward accumulation).
 * Deterministic — local hour drives EV; no clock/random in the logic.
 */
import type {
  CanvassLegDetail,
  GeoPoint,
  GymLegDetail,
  PlanLeg,
  PlanRequest,
  PlanScore,
  TransitLegDetail,
  ULID,
} from "../core.js";
import type { WalkingEngine } from "../adapters/walking.js";
import type { Optimizer } from "../adapters/optimizer.js";
import { getAreaById } from "../fixtures/brabant.js";
import type { L1Candidate } from "../domain.js";
import { runL3, type L3Result } from "./l3.js";
import { expectedConversationsPerHour } from "./areaModel.js";
import { GYM_DROP_MIN, GYM_PICKUP_MIN, LUNCH_MIN, PLATFORM_BUFFER_MIN } from "../config.js";
import { formatIso, localHourAt, parseOffset, toEpoch, MIN } from "../util/time.js";

export interface L2Output {
  legs: PlanLeg[];
  score: PlanScore;
  canvassDetails: L3Result[];
}

interface L2Deps {
  walking: WalkingEngine;
  optimizer: Optimizer;
  ulid: () => string;
}

/** Replan hooks — let /replan reuse the L2 assembler deterministically. */
export interface L2Overrides {
  /** Canvass order to use verbatim instead of the optimizer (rain reorder). */
  fixedOrder?: ULID[];
  /** Edges dropped from L3 selection (street_closed). */
  excludedEdgeIds?: ReadonlySet<ULID>;
  /** Multiply each area's canvass budget (pace_ahead >1 extends, pace_behind <1 trims). */
  budgetScale?: number;
}

export async function runL2(
  req: PlanRequest,
  candidate: L1Candidate,
  deps: L2Deps,
  overrides: L2Overrides = {},
): Promise<L2Output> {
  const scale = overrides.budgetScale ?? 1;
  const budgetOf = (areaId: ULID): number => (candidate.hAllocSec[areaId] ?? 0) * scale;
  const offset = parseOffset(req.hours.startAt);
  const { station, gym } = candidate;
  const areas = candidate.areaIds.map((id) => getAreaById(id)!).filter(Boolean);

  // --- build the walking matrix over [station, gym?, ...areas] --------------
  const points: GeoPoint[] = [station.point];
  const gymIdx = gym ? points.push(gym.point) - 1 : -1;
  const areaBaseIdx = points.length;
  for (const a of areas) points.push(a.centroid);
  const matrix = await deps.walking.matrix(points);
  const stationIdx = 0;
  const walk = (i: number, j: number): number => matrix[i]?.[j] ?? 0;

  const hasLunch = (req.hours.breaks?.length ?? 0) > 0;
  const breakWin = req.hours.breaks?.[0];
  const arriveHour = localHourAt(candidate.arriveWorkMs, offset);

  // --- sequence the canvass nodes (mock VROOM: NN + 2-opt) -----------------
  // The optimizer orders the loops over the walking matrix; the hard end-station
  // deadline is then enforced exactly by trimming canvass budgets to the real
  // route below (keeping every area rather than dropping a far one outright).
  let orderedAreaIds: ULID[];
  if (overrides.fixedOrder) {
    orderedAreaIds = overrides.fixedOrder.filter((id) => areas.some((a) => a.id === id));
  } else {
    const orderJobs = areas.map((a, i) => ({
      id: a.id,
      matrixIndex: areaBaseIdx + i,
      serviceSec: budgetOf(a.id),
      prize: expectedConversationsPerHour(a, arriveHour, req.preferences) * (budgetOf(a.id) / 3600),
    }));
    const ordering = await deps.optimizer.sequence(orderJobs, {
      startIndex: stationIdx,
      endIndex: stationIdx,
      departMs: candidate.arriveWorkMs,
      hardEndByMs: Number.MAX_SAFE_INTEGER, // relaxed: this call only sequences
      matrix,
    });
    orderedAreaIds = ordering.order;
  }

  // --- enforce the hard deadline by trimming budgets to the real route ------
  // Deadhead = station → gym(drop) → loops → gym(pickup) → station, plus the
  // fixed gym/lunch service. Whatever time is left is the canvassable budget;
  // scale each area's L1 allocation to fit so the rep is back ≥10 min before end.
  const orderIdxOf = (id: ULID): number => areaBaseIdx + areas.findIndex((a) => a.id === id);
  const deadhead = (ids: ULID[]): number => {
    let cur = stationIdx;
    let sum = 0;
    if (gymIdx >= 0) { sum += walk(cur, gymIdx); cur = gymIdx; }
    for (const id of ids) { const idx = orderIdxOf(id); sum += walk(cur, idx); cur = idx; }
    if (gymIdx >= 0) { sum += walk(cur, gymIdx); cur = gymIdx; }
    sum += walk(cur, stationIdx);
    return sum;
  };
  const fixedSec = (gym ? (GYM_DROP_MIN + GYM_PICKUP_MIN) * 60 : 0) + (hasLunch ? LUNCH_MIN * 60 : 0);
  const windowSec = (candidate.latestBackMs - candidate.arriveWorkMs) / 1000;
  const L2_SAFETY_SEC = 90;

  let deadheadSec = deadhead(orderedAreaIds);
  let availCanvassSec = windowSec - deadheadSec - fixedSec - L2_SAFETY_SEC;
  // If even the walking doesn't fit, shed the last-visited (farthest) loop.
  while (availCanvassSec < 0 && orderedAreaIds.length > 1) {
    orderedAreaIds = orderedAreaIds.slice(0, -1);
    deadheadSec = deadhead(orderedAreaIds);
    availCanvassSec = windowSec - deadheadSec - fixedSec - L2_SAFETY_SEC;
  }
  const desiredSec = orderedAreaIds.reduce((s, id) => s + budgetOf(id), 0);
  const trimScale = desiredSec > 0 ? Math.max(0, Math.min(1, availCanvassSec / desiredSec)) : 0;
  const canvassBudget = (id: ULID): number => Math.max(0, budgetOf(id) * trimScale);

  // --- assemble legs (strictly monotonic forward accumulation) -------------
  const legs: PlanLeg[] = [];
  let seq = 0;
  const push = (leg: Omit<PlanLeg, "id" | "seq">): void => {
    legs.push({ id: deps.ulid(), seq: seq++, ...leg });
  };
  const iso = (ms: number): string => formatIso(ms, offset);

  let t = candidate.arriveWorkMs;
  let walkMin = 0;
  let transitMin = 0;
  let expConv = 0;
  let expRev = 0;
  const canvassDetails: L3Result[] = [];

  // inbound transit
  if (candidate.inbound) {
    const it = candidate.inbound;
    const detail: TransitLegDetail = {
      mode: "train",
      routeShortName: it.routeShortName,
      fromStopId: it.fromStopId,
      toStopId: it.toStopId,
      scheduledDepart: it.departAt,
      scheduledArrive: it.arriveAt,
      realtimeState: "on_time",
    };
    push({
      kind: "transit",
      startAt: it.departAt,
      endAt: it.arriveAt,
      fromLabel: candidate.originStation.name,
      toLabel: station.name,
      detail,
    });
    transitMin += it.durationSec / 60;
    t = toEpoch(it.arriveAt);
  }

  let cursor = stationIdx;
  let fromLabel = station.name;
  let bagDropped = false;

  // gym bag-drop right after arrival (precedes any canvass — doc 11 §3.4)
  if (gym) {
    const w = walk(cursor, gymIdx);
    push({ kind: "walk", startAt: iso(t), endAt: iso(t + w * 1000), fromLabel, toLabel: gym.name, detail: {} });
    t += w * 1000;
    walkMin += w / 60;
    const detail: GymLegDetail = { poiId: gym.id, action: "drop_bag" };
    push({ kind: "gym", startAt: iso(t), endAt: iso(t + GYM_DROP_MIN * MIN), fromLabel: gym.name, toLabel: gym.name, detail });
    t += GYM_DROP_MIN * MIN;
    cursor = gymIdx;
    fromLabel = gym.name;
    bagDropped = true;
  }

  let lunchInserted = !hasLunch;

  for (const areaId of orderedAreaIds) {
    const idx = areas.findIndex((a) => a.id === areaId);
    if (idx < 0) continue;
    const area = areas[idx]!;
    const aMatrix = areaBaseIdx + idx;

    const w = walk(cursor, aMatrix);
    push({ kind: "walk", startAt: iso(t), endAt: iso(t + w * 1000), fromLabel, toLabel: area.name, detail: {} });
    t += w * 1000;
    walkMin += w / 60;

    const budgetSec = canvassBudget(areaId);
    const l3 = runL3(area, budgetSec, localHourAt(t, offset), req.preferences, overrides.excludedEdgeIds);
    canvassDetails.push(l3);
    const detail: CanvassLegDetail = {
      areaId: l3.areaId,
      h3Cells: l3.h3Cells,
      streetEdgeIds: l3.streetEdgeIds,
      expectedConversations: l3.expectedConversations,
      doorCount: l3.doorCount,
      estWalkMinutes: l3.estWalkMinutes,
    };
    const durMs = l3.estTotalMinutes * MIN;

    // 30-min lunch inside the break window (doc 11 §3.4). If this loop straddles
    // the window we split it: canvass → lunch → resume canvass, so the break
    // lands in-window even for a single long loop.
    const earliestMs = breakWin ? toEpoch(breakWin.earliest) : Number.POSITIVE_INFINITY;
    const latestMs = breakWin ? toEpoch(breakWin.latest) : Number.NEGATIVE_INFINITY;
    const straddles = !lunchInserted && breakWin !== undefined && t < latestMs && t + durMs > earliestMs;

    if (straddles) {
      const lunchStart = Math.min(Math.max(t, earliestMs), latestMs);
      const beforeMs = lunchStart - t;
      if (beforeMs > 0) {
        push({ kind: "canvass", startAt: iso(t), endAt: iso(t + beforeMs), fromLabel: area.name, toLabel: area.name, areaId: area.id, detail });
        t += beforeMs;
      }
      push({ kind: "break", startAt: iso(t), endAt: iso(t + LUNCH_MIN * MIN), fromLabel: area.name, toLabel: "Lunch", detail: {} });
      t += LUNCH_MIN * MIN;
      lunchInserted = true;
      const restMs = durMs - beforeMs;
      const contDetail: CanvassLegDetail = beforeMs > 0
        ? { areaId: area.id, h3Cells: area.h3Cells, streetEdgeIds: [], expectedConversations: 0, doorCount: 0, estWalkMinutes: 0 }
        : detail;
      push({ kind: "canvass", startAt: iso(t), endAt: iso(t + restMs), fromLabel: area.name, toLabel: area.name, areaId: area.id, detail: contDetail });
      t += restMs;
    } else {
      push({ kind: "canvass", startAt: iso(t), endAt: iso(t + durMs), fromLabel: area.name, toLabel: area.name, areaId: area.id, detail });
      t += durMs;
    }

    walkMin += l3.estWalkMinutes;
    expConv += l3.expectedConversations;
    expRev += l3.expectedRevenueEur;
    cursor = aMatrix;
    fromLabel = area.name;
  }

  // lunch fallback if the window never coincided with a canvass boundary
  if (!lunchInserted && breakWin) {
    push({ kind: "break", startAt: iso(t), endAt: iso(t + LUNCH_MIN * MIN), fromLabel, toLabel: "Lunch", detail: {} });
    t += LUNCH_MIN * MIN;
    lunchInserted = true;
  }

  // gym pickup before the final transit (doc 11 §3.4; brief test c)
  if (bagDropped && gym) {
    const w = walk(cursor, gymIdx);
    push({ kind: "walk", startAt: iso(t), endAt: iso(t + w * 1000), fromLabel, toLabel: gym.name, detail: {} });
    t += w * 1000;
    walkMin += w / 60;
    const detail: GymLegDetail = { poiId: gym.id, action: "pickup_bag" };
    push({ kind: "gym", startAt: iso(t), endAt: iso(t + GYM_PICKUP_MIN * MIN), fromLabel: gym.name, toLabel: gym.name, detail });
    t += GYM_PICKUP_MIN * MIN;
    cursor = gymIdx;
    fromLabel = gym.name;
  }

  // walk to the departure station
  {
    const w = walk(cursor, stationIdx);
    push({ kind: "walk", startAt: iso(t), endAt: iso(t + w * 1000), fromLabel, toLabel: station.name, detail: {} });
    t += w * 1000;
    walkMin += w / 60;
  }

  // outbound transit (the rep boards the L1-chosen train home)
  if (candidate.outbound) {
    const it = candidate.outbound;
    // Defensive: arrival at the station must precede boarding with the buffer.
    const boardBy = toEpoch(it.departAt) - PLATFORM_BUFFER_MIN * MIN;
    if (t > boardBy) t = boardBy; // guaranteed by hardEndBy reserve, but clamp for safety
    const detail: TransitLegDetail = {
      mode: "train",
      routeShortName: it.routeShortName,
      fromStopId: it.fromStopId,
      toStopId: it.toStopId,
      scheduledDepart: it.departAt,
      scheduledArrive: it.arriveAt,
      realtimeState: "on_time",
    };
    push({
      kind: "transit",
      startAt: it.departAt,
      endAt: it.arriveAt,
      fromLabel: station.name,
      toLabel: candidate.destStation.name,
      detail,
    });
    transitMin += it.durationSec / 60;
  }

  const score: PlanScore = {
    expectedConversations: round2(expConv),
    expectedRevenueEur: round2(expRev),
    walkMinutes: round1(walkMin),
    transitMinutes: round1(transitMin),
    carryPenalty: round1(candidate.parts.carryPenalty),
    goalPreset: req.goalPreset,
  };

  return { legs, score, canvassDetails };
}

const round1 = (x: number): number => Math.round(x * 10) / 10;
const round2 = (x: number): number => Math.round(x * 100) / 100;

/** Re-time a leg list from a fixed start, preserving each leg's duration and order.
 *  Used by replan after reordering canvass legs so leg times stay monotonic. */
export function retimeLegs(legs: PlanLeg[], offset: string): PlanLeg[] {
  if (legs.length === 0) return legs;
  let t = toEpoch(legs[0]!.startAt);
  return legs.map((leg, i) => {
    const durMs = toEpoch(leg.endAt) - toEpoch(leg.startAt);
    // Transit legs keep their scheduled wall-clock times (fixed timetable).
    if (leg.kind === "transit") {
      t = toEpoch(leg.endAt);
      return { ...leg, seq: i };
    }
    const startAt = formatIso(t, offset);
    const endAt = formatIso(t + durMs, offset);
    t += durMs;
    return { ...leg, seq: i, startAt, endAt };
  });
}
export type { ULID };
