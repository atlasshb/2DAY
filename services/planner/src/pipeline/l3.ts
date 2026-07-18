/**
 * L3 — Rural Postman (micro: *which streets, which side*). docs/00 §5, docs/11 §4.
 *
 * Simplified budgeted-RPP heuristic per the brief:
 *   1. score each street edge by prize density  EV(e)/t(e)  (doc 11 §4.2),
 *      with a preference-driven apartment weight (brief L3),
 *   2. greedy required-edge selection under the leg's time budget with a
 *      deadhead reserve (doc 11 §4.3),
 *   3. serpentine (boustrophedon) ordering of the selected edges (doc 11 §4.4),
 *   4. emit a CanvassLegDetail.
 *
 * EV comes from @2day/core doorEV; per-door dwell/spacing from doc 11 §5. The
 * near-Eulerian augmentation + Hierholzer of the full algorithm (§4.5) is
 * approximated here by a deadhead reserve, which is the MVP simplification.
 * Deterministic — no randomness, no clock.
 */
import type { CanvassLegDetail, Preferences, ULID } from "../core.js";
import { doorEV } from "../core.js";
import type { AreaFixture, StreetEdge } from "../fixtures/brabant.js";
import { DEFAULT_COMMISSION_EUR, DEFAULT_WALK_MPS, L3_DEADHEAD_RESERVE } from "../config.js";
import {
  apartmentWeight,
  areaFit,
  meanDwellSec,
  representativeDwelling,
} from "./areaModel.js";

export interface L3Result extends CanvassLegDetail {
  expectedRevenueEur: number;
  estTotalMinutes: number; // walk + dwell; the value tested against the budget
}

interface ScoredEdge {
  edge: StreetEdge;
  doors: number;
  walkSec: number;
  dwellSec: number;
  tSec: number; // canvass time on the edge (walk + dwell)
  conv: number; // true expected conversations (unweighted)
  revenue: number;
  density: number; // preference-weighted prize per second (selection currency)
}

/**
 * @param budgetSec canvass time budget for this area (L2 service time s_i).
 * @param hourLocal local hour the loop is walked (drives EV time-of-day).
 */
export function runL3(
  area: AreaFixture,
  budgetSec: number,
  hourLocal: number,
  prefs: Preferences,
  /** Edges removed before selection — street_closed / do_not_knock cluster (doc 11 §6.2). */
  excludedEdgeIds?: ReadonlySet<ULID>,
): L3Result {
  const vwalk = prefs.walkingSpeedMps ?? DEFAULT_WALK_MPS;
  const dwelling = representativeDwelling(area);
  const fit = { ...areaFit(area, prefs), commissionEur: DEFAULT_COMMISSION_EUR };
  const perDoor = doorEV({ hourLocal, dwelling, fit });
  const dwellPerDoor = meanDwellSec(area, hourLocal, prefs);

  const usableEdges = excludedEdgeIds
    ? area.edges.filter((e) => !excludedEdgeIds.has(e.id))
    : area.edges;
  const scored: ScoredEdge[] = usableEdges.map((edge) => {
    const doors = edge.doorsEven + edge.doorsOdd;
    const walkSec = edge.lengthM / vwalk;
    const dwellSec = doors * dwellPerDoor;
    const tSec = walkSec + dwellSec;
    const conv = doors * perDoor.expectedConversations;
    const revenue = doors * perDoor.expectedRevenueEur;
    // Preference-weighted prize density is the selection currency (doc 11 §4.2/§4.3).
    const density = (conv * apartmentWeight(edge, prefs)) / Math.max(1, tSec);
    return { edge, doors, walkSec, dwellSec, tSec, conv, revenue, density };
  });

  // --- greedy required-edge selection under budget (doc 11 §4.3) -----------
  // Reserve part of the budget for connective deadhead walking (§4.6).
  const selectable = budgetSec * (1 - L3_DEADHEAD_RESERVE);
  const ranked = [...scored].sort(
    (a, b) => b.density - a.density || a.edge.id.localeCompare(b.edge.id),
  );
  const selected: ScoredEdge[] = [];
  let usedSec = 0;
  for (const s of ranked) {
    if (usedSec + s.tSec > selectable) continue;
    selected.push(s);
    usedSec += s.tSec;
  }
  // Guarantee at least one edge when the budget admits the cheapest one.
  if (selected.length === 0 && ranked.length > 0) {
    const cheapest = [...ranked].sort((a, b) => a.tSec - b.tSec)[0]!;
    if (cheapest.tSec <= budgetSec) {
      selected.push(cheapest);
      usedSec = cheapest.tSec;
    }
  }

  // --- serpentine ordering (doc 11 §4.4) -----------------------------------
  const ordered = serpentine(selected);

  const walkSec = ordered.reduce((s, e) => s + e.walkSec, 0);
  const dwellSec = ordered.reduce((s, e) => s + e.dwellSec, 0);
  // Deadhead estimate stays inside the reserved slice → total ≤ budget.
  const deadheadSec = Math.min(walkSec * L3_DEADHEAD_RESERVE, budgetSec - (walkSec + dwellSec));
  const estWalkSec = walkSec + Math.max(0, deadheadSec);
  const estTotalSec = estWalkSec + dwellSec;

  return {
    areaId: area.id,
    h3Cells: area.h3Cells,
    streetEdgeIds: ordered.map((s) => s.edge.id),
    doorCount: ordered.reduce((s, e) => s + e.doors, 0),
    expectedConversations: round2(ordered.reduce((s, e) => s + e.conv, 0)),
    expectedRevenueEur: round2(ordered.reduce((s, e) => s + e.revenue, 0)),
    estWalkMinutes: round1(estWalkSec / 60),
    estTotalMinutes: round1(estTotalSec / 60),
  };
}

/**
 * Boustrophedon sweep. Without per-edge geometry in the fixtures we approximate
 * the principal-axis projection (doc 11 §4.4) by the edge's stable id order and
 * alternate direction every pair — a deterministic stand-in that keeps
 * consecutive edges adjacent in the emitted sequence.
 */
function serpentine(edges: ScoredEdge[]): ScoredEdge[] {
  const byAxis = [...edges].sort((a, b) => a.edge.id.localeCompare(b.edge.id));
  const out: ScoredEdge[] = [];
  for (let i = 0; i < byAxis.length; i += 2) {
    const a = byAxis[i]!;
    const b = byAxis[i + 1];
    if (i % 4 === 0) {
      out.push(a);
      if (b) out.push(b);
    } else {
      if (b) out.push(b);
      out.push(a);
    }
  }
  return out;
}

const round1 = (x: number): number => Math.round(x * 10) / 10;
const round2 = (x: number): number => Math.round(x * 100) / 100;
