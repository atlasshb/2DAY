/**
 * L1 — Day Compiler (macro: *where* to work today). docs/00 §5, docs/11 §2.
 *
 * Candidate enumeration + scoring, NOT sequencing (that is L2). For each
 * reachable working station we shortlist its buurten, enumerate bounded
 * area-subsets, and score each with the exact objective of doc 11 §2.4 using
 * the goal-preset weight vector of §2.5. We implement a *simplified* version of
 * those formulas (per the brief) — same terms, cheaper sub-models — and return
 * the top candidate + up to 2 materially-different alternatives (§2.6).
 *
 * Deterministic: scoring reads only fixture features + request + local hour.
 */
import type { PlanRequest, ULID } from "../core.js";
import type { WalkingEngine } from "../adapters/walking.js";
import type { TransitPlanner, TransitItinerary } from "../adapters/transit.js";
import {
  AREAS,
  STATIONS,
  areasForStation,
  gymForStation,
  nearestStation,
  type AreaFixture,
  type StationFixture,
} from "../fixtures/brabant.js";
import type { L1Candidate, L1Result, L1Weights } from "../domain.js";
import {
  CARRY_BETA_MIN_PER_HOUR,
  DEFAULT_WALK_MPS,
  END_SAFETY_MIN,
  FIXED_BUFFER_MIN,
  GYM_DROP_MIN,
  L1_SHORTLIST_K,
  L1_SUBSET_SIZES,
  LUNCH_MIN,
  PLATFORM_BUFFER_MIN,
  VALUE_OF_TIME_MIN_PER_EUR,
  DAY_WALK_RESERVE,
} from "../config.js";
import { localHour, parseOffset, toEpoch, MIN } from "../util/time.js";
import { mstLengthM } from "../util/geo.js";
import {
  areaDoorEV,
  areaDoorsPerHour,
  dayPotential,
} from "./areaModel.js";

/** doc 11 §2.5 goal-preset weight vectors. */
export const PRESET_WEIGHTS: Record<PlanRequest["goalPreset"], L1Weights> = {
  max_sales: { wRev: 1.0, wTravel: 0.6, wCarry: 0.3, wWalk: 0.2, wNovel: 0.0, wIncome: 0.0, wRisk: 0.5 },
  easy_day: { wRev: 0.55, wTravel: 1.0, wCarry: 1.0, wWalk: 1.0, wNovel: 0.0, wIncome: 0.0, wRisk: 0.8 },
  highest_income: { wRev: 0.8, wTravel: 0.6, wCarry: 0.3, wWalk: 0.3, wNovel: 0.0, wIncome: 1.0, wRisk: 0.5 },
  shortest_walking: { wRev: 0.6, wTravel: 0.8, wCarry: 0.6, wWalk: 1.2, wNovel: 0.0, wIncome: 0.0, wRisk: 0.6 },
  explore: { wRev: 0.7, wTravel: 0.5, wCarry: 0.3, wWalk: 0.3, wNovel: 1.0, wIncome: 0.1, wRisk: 0.4 },
};

interface L1Deps {
  walking: WalkingEngine;
  transit: TransitPlanner;
}

/** All k-subsets of `items` for each size in `sizes`. */
function boundedSubsets<T>(items: T[], sizes: number[]): T[][] {
  const out: T[][] = [];
  const rec = (start: number, pick: T[], size: number): void => {
    if (pick.length === size) {
      out.push([...pick]);
      return;
    }
    for (let i = start; i < items.length; i++) {
      pick.push(items[i]!);
      rec(i + 1, pick, size);
      pick.pop();
    }
  };
  for (const size of sizes) {
    if (size <= items.length) rec(0, [], size);
  }
  return out;
}

function earliestArrival(its: TransitItinerary[]): TransitItinerary | null {
  return its.length > 0 ? its[0]! : null; // itineraries() returns arrival-sorted
}

/** Latest outbound that still arrives at the destination station by `byMs`. */
function latestArrivingBy(its: TransitItinerary[], byMs: number): TransitItinerary | null {
  let best: TransitItinerary | null = null;
  for (const it of its) {
    if (toEpoch(it.arriveAt) <= byMs) {
      if (!best || toEpoch(it.departAt) > toEpoch(best.departAt)) best = it;
    }
  }
  return best;
}

export async function runL1(req: PlanRequest, deps: L1Deps): Promise<L1Result> {
  const offset = parseOffset(req.hours.startAt);
  const startMs = toEpoch(req.hours.startAt);
  const endMs = toEpoch(req.hours.endAt);
  const startHour = localHour(req.hours.startAt);
  const vwalk = req.preferences.walkingSpeedMps ?? DEFAULT_WALK_MPS;

  const originStation = req.location.ref
    ? (STATIONS.find((s) => s.stopId === req.location.ref) ?? nearestStation(req.location.point))
    : nearestStation(req.location.point);
  const destStation = req.destination.ref
    ? (STATIONS.find((s) => s.stopId === req.destination.ref) ?? nearestStation(req.destination.point))
    : nearestStation(req.destination.point);

  const excluded = new Set(req.overrides?.excludedAreas ?? []);
  const pinned = new Set(req.overrides?.pinnedAreas ?? []);
  const weights = PRESET_WEIGHTS[req.goalPreset];
  const hasLunch = (req.hours.breaks?.length ?? 0) > 0;

  const bagNeedsDrop = req.bag.size === "standard" || req.bag.size === "heavy";
  const memberChains = new Set(req.memberships.map((m) => m.chain));

  const candidates: L1Candidate[] = [];

  for (const station of STATIONS) {
    // --- reachability: inbound + outbound transit (doc 11 §2.2) -----------
    let inbound: TransitItinerary | null = null;
    let arriveWorkMs = startMs;
    if (station.id !== originStation.id) {
      inbound = earliestArrival(await deps.transit.itineraries(originStation, station, req.hours.startAt));
      if (!inbound) continue; // no way to reach this station
      arriveWorkMs = toEpoch(inbound.arriveAt);
    }

    let outbound: TransitItinerary | null = null;
    let latestBackMs = endMs - END_SAFETY_MIN * MIN; // must be back ≥10 min before endAt
    if (station.id !== destStation.id) {
      const outs = await deps.transit.itineraries(station, destStation, req.hours.startAt);
      outbound = latestArrivingBy(outs, endMs);
      if (!outbound) continue; // cannot get home from here in time
      // Board the departure train with a platform buffer, and never later than the 10-min safety.
      latestBackMs = Math.min(toEpoch(outbound.departAt) - PLATFORM_BUFFER_MIN * MIN, latestBackMs);
    }

    if (latestBackMs <= arriveWorkMs) continue;

    const gym = bagNeedsDrop && gymForStation(station.id) && memberChains.has(gymForStation(station.id)!.chain)
      ? gymForStation(station.id)!
      : null;

    const overheadMin =
      (gym ? GYM_DROP_MIN : 0) + (hasLunch ? LUNCH_MIN : 0) + FIXED_BUFFER_MIN;
    const inboundMin = inbound ? inbound.durationSec / 60 : 0;
    const outboundMin = outbound ? outbound.durationSec / 60 : 0;

    const availMin = (latestBackMs - arriveWorkMs) / MIN;
    const walkBudgetMin = availMin - overheadMin;
    if (walkBudgetMin <= 15) continue; // not enough to knock a single loop

    // --- shortlist buurten for this station (doc 11 §2.2) -----------------
    const cityAreas = areasForStation(station.id)
      .filter((a) => !excluded.has(a.id))
      .sort((a, b) => dayPotential(b, startHour, req.preferences) - dayPotential(a, startHour, req.preferences));
    const shortlist = cityAreas.slice(0, L1_SHORTLIST_K);
    if (shortlist.length === 0) continue;

    for (const subset of boundedSubsets(shortlist, L1_SUBSET_SIZES)) {
      // Respect pinned areas: if any pins fall in this city, the subset must include them.
      const cityPins = shortlist.filter((a) => pinned.has(a.id)).map((a) => a.id);
      if (cityPins.length > 0 && !cityPins.every((id) => subset.some((a) => a.id === id))) continue;

      const parts = scoreParts(
        subset,
        walkBudgetMin,
        startHour,
        req,
        weights,
        inboundMin + outboundMin,
        (inbound?.fareEur ?? 0) + (outbound?.fareEur ?? 0),
        gym !== null,
        bagNeedsDrop,
      );

      const score =
        weights.wRev * parts.expectedRevenueEur -
        weights.wTravel * parts.travelMinutes -
        weights.wCarry * parts.carryPenalty -
        weights.wWalk * parts.walkMinutes +
        weights.wIncome * parts.incomeAlignment;

      candidates.push({
        station,
        originStation,
        destStation,
        areaIds: subset.map((a) => a.id),
        gym,
        inbound,
        outbound,
        arriveWorkMs,
        latestBackMs,
        hAllocSec: allocate(subset, walkBudgetMin, startHour, req),
        score,
        parts,
      });
    }
  }

  if (candidates.length === 0) {
    throw new InfeasiblePlanError(
      "No candidate satisfies the hard constraints (reachability / deadline / work budget).",
    );
  }

  candidates.sort((a, b) => b.score - a.score);
  const chosen = candidates[0]!;
  const alternatives = pickAlternatives(chosen, candidates, req.overrides?.maxAlternatives);
  return { chosen, alternatives };
}

/** Proportional split of the walk budget across areas by day-potential. doc 11 §2.4 `h_a`. */
function allocate(
  subset: AreaFixture[],
  walkBudgetMin: number,
  hour: number,
  req: PlanRequest,
): Record<ULID, number> {
  const pots = subset.map((a) => Math.max(1e-6, dayPotential(a, hour, req.preferences)));
  const total = pots.reduce((s, p) => s + p, 0);
  const assignable = walkBudgetMin * DAY_WALK_RESERVE; // leave slack for deadhead walking
  const out: Record<ULID, number> = {};
  subset.forEach((a, i) => {
    const share = (pots[i]! / total) * assignable;
    // Cap at saturation: an area cannot absorb more hours than it has doors for.
    const dph = areaDoorsPerHour(a, hour, req.preferences);
    const saturationMin = (a.doorCount / dph) * 60;
    out[a.id] = Math.min(share, saturationMin) * 60; // seconds
  });
  return out;
}

function scoreParts(
  subset: AreaFixture[],
  walkBudgetMin: number,
  hour: number,
  req: PlanRequest,
  _weights: L1Weights,
  transitMin: number,
  fareEur: number,
  hasGym: boolean,
  bagNeedsDrop: boolean,
): import("../domain.js").CandidateScoreParts {
  const alloc = allocate(subset, walkBudgetMin, hour, req);
  let expConv = 0;
  let expRev = 0;
  let workedHours = 0;
  let incomeSum = 0;
  for (const a of subset) {
    const hSec = alloc[a.id] ?? 0;
    const hrs = hSec / 3600;
    workedHours += hrs;
    const dph = areaDoorsPerHour(a, hour, req.preferences);
    const ev = areaDoorEV(a, hour, req.preferences);
    const doorsKnocked = hrs * dph;
    expConv += doorsKnocked * ev.expectedConversations;
    expRev += doorsKnocked * ev.expectedRevenueEur;
    incomeSum += req.preferences.incomePreference * a.incomeTier;
  }

  // intra_area_walk: straight-line MST proxy over centroids → minutes (doc 11 §2.4).
  const vwalk = req.preferences.walkingSpeedMps ?? DEFAULT_WALK_MPS;
  const intraWalkMin = mstLengthM(subset.map((a) => a.centroid)) / vwalk / 60;

  // travel_cost: κ_time·minutes + κ_money·fare (fare→minutes via value_of_time).
  const travelMinutes = transitMin + fareEur * VALUE_OF_TIME_MIN_PER_EUR;

  // carry_penalty: 0 with a valid gym drop, else β·Σh_a (doc 11 §2.4).
  const carryPenalty = bagNeedsDrop && !hasGym ? CARRY_BETA_MIN_PER_HOUR * workedHours : 0;

  return {
    expectedConversations: expConv,
    expectedRevenueEur: expRev,
    travelMinutes,
    transitMinutes: transitMin,
    walkMinutes: intraWalkMin,
    carryPenalty,
    incomeAlignment: incomeSum,
  };
}

/** doc 11 §2.6: alternatives must be materially different (other city OR ≥50% different area-set). */
function pickAlternatives(
  chosen: L1Candidate,
  ranked: L1Candidate[],
  maxAlternatives = 2,
): L1Candidate[] {
  const out: L1Candidate[] = [];
  const kept = [chosen];
  for (const c of ranked) {
    if (out.length >= maxAlternatives) break;
    if (c === chosen) continue;
    if (kept.every((k) => materiallyDifferent(k, c))) {
      out.push(c);
      kept.push(c);
    }
  }
  return out;
}

function materiallyDifferent(a: L1Candidate, b: L1Candidate): boolean {
  if (a.station.id !== b.station.id) return true;
  const setA = new Set(a.areaIds);
  const overlap = b.areaIds.filter((id) => setA.has(id)).length;
  const union = new Set([...a.areaIds, ...b.areaIds]).size;
  return overlap / union < 0.5; // ≥50% different
}

export class InfeasiblePlanError extends Error {
  readonly code = "INFEASIBLE_PLAN";
  constructor(message: string) {
    super(message);
    this.name = "InfeasiblePlanError";
  }
}

/** Exposed for GET /v1/areas/discover — reuse of the L1 scoring parts. */
export { boundedSubsets };
export const _internals = { scoreParts, allocate, AREAS };
