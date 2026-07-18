/**
 * Incremental re-plan. docs/09 §3.2 contract: **L3 always, L2 if >15 min
 * deviation, L1 never**. This endpoint never re-runs L1 (it reuses the stored
 * L1 candidate), honoring the brief's re-optimization rule.
 *
 * MVP DEVIATION (documented): docs/09 §3.2 / §4 specify replan returns
 * `202 Accepted` + a fast job handle. The MVP re-plans **synchronously** and
 * returns `200` + the updated `Plan` with `planVersion++`.
 *
 * Reason → change (brief):
 *   - rain_nowcast  → reorder canvass loops so the most rain-EXPOSED
 *                     (low apartment-share) loops are walked first (L2 reorder).
 *   - street_closed → drop the closed edge from its area and reselect (L3).
 *   - pace_ahead    → extend selection (bigger canvass budget).
 *   - pace_behind   → trim selection (smaller canvass budget).
 *   - transit_disruption / manual_tweak → re-time (L3), deadline unchanged in
 *                     the mock timetable.
 *
 * Deterministic — no clock/random in the decision logic.
 */
import type { Plan, PlanRequest, ReplanRequest, ULID } from "../core.js";
import type { WalkingEngine } from "../adapters/walking.js";
import type { Optimizer } from "../adapters/optimizer.js";
import type { StoredPlan } from "../store.js";
import { runL2, retimeLegs, type L2Overrides } from "./l2.js";
import { getAreaById } from "../fixtures/brabant.js";
import { REPLAN_L2_DEVIATION_MIN } from "../config.js";

export interface ReplanDeps {
  walking: WalkingEngine;
  optimizer: Optimizer;
  ulid: () => string;
}

export type ReplanLevel = "L2" | "L3";

export interface ReplanOutput {
  plan: Plan;
  level: ReplanLevel;
}

/** Rough deviation estimate from the signal (min). ~1.5 min per door of drift. */
function deviationMin(reason: ReplanRequest["reason"], signal: ReplanRequest["signal"]): number {
  if (reason === "pace_ahead" || reason === "pace_behind") {
    return Math.abs(signal.doorsAheadOfPlan ?? 0) * 1.5;
  }
  return 0;
}

export async function replan(
  stored: StoredPlan,
  reqBody: ReplanRequest,
  deps: ReplanDeps,
): Promise<ReplanOutput> {
  const { plan, req, candidate, offset } = stored;
  const reason = reqBody.reason;
  const dev = deviationMin(reason, reqBody.signal);

  // Current canvass order (area ids) from the stored plan.
  const currentOrder: ULID[] = plan.legs
    .filter((l) => l.kind === "canvass" && l.areaId)
    .map((l) => l.areaId!) as ULID[];

  let overrides: L2Overrides = {};
  let level: ReplanLevel;

  switch (reason) {
    case "rain_nowcast": {
      // Reorder loops so the most exposed (lowest apartment share) run first.
      const reordered = [...currentOrder].sort((a, b) => exposure(b) - exposure(a));
      overrides = { fixedOrder: reordered };
      level = "L2";
      break;
    }
    case "street_closed": {
      const closed = reqBody.signal.closedStreetEdgeId;
      overrides = {
        fixedOrder: currentOrder, // keep sequence; only the edge set changes (L3)
        excludedEdgeIds: closed ? new Set<ULID>([closed]) : undefined,
      };
      level = "L3";
      break;
    }
    case "pace_ahead": {
      overrides = { fixedOrder: currentOrder, budgetScale: 1.25 };
      level = dev > REPLAN_L2_DEVIATION_MIN ? "L2" : "L3";
      break;
    }
    case "pace_behind": {
      overrides = { fixedOrder: currentOrder, budgetScale: 0.75 };
      level = dev > REPLAN_L2_DEVIATION_MIN ? "L2" : "L3";
      break;
    }
    case "transit_disruption":
    case "manual_tweak":
    default: {
      overrides = { fixedOrder: currentOrder };
      level = "L3";
      break;
    }
  }

  const out = await runL2(req as PlanRequest, candidate, deps, overrides);
  const legs = retimeLegs(out.legs, offset);

  const updated: Plan = {
    ...plan,
    planVersion: plan.planVersion + 1,
    score: out.score,
    legs,
  };
  return { plan: updated, level };
}

/** Rain exposure proxy: open low-rise streets are more exposed than portiek flats. */
function exposure(areaId: ULID): number {
  const area = getAreaById(areaId);
  return area ? 1 - area.apartmentRatio : 0.5;
}
