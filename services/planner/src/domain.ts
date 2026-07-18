/**
 * Planner-internal types (NOT wire contracts — those come from @2day/core via
 * ./core.js and must never be redeclared). These describe intermediate shapes
 * passed between L1 → L2 → L3.
 */
import type { GoalPreset, ULID } from "./core.js";
import type { GymFixture, StationFixture } from "./fixtures/brabant.js";
import type { TransitItinerary } from "./adapters/transit.js";

/** L1 goal-preset weight vector — doc 11 §2.5 table. */
export interface L1Weights {
  wRev: number;
  wTravel: number;
  wCarry: number;
  wWalk: number;
  wNovel: number;
  wIncome: number;
  wRisk: number;
}

/** The scoring breakdown that feeds PlanScore. */
export interface CandidateScoreParts {
  expectedConversations: number;
  expectedRevenueEur: number;
  travelMinutes: number;
  transitMinutes: number;
  walkMinutes: number; // intra-area straight-line proxy (L1)
  carryPenalty: number;
  incomeAlignment: number;
}

/** A scored L1 candidate = (anchor station, area-set, gym) + reachability. */
export interface L1Candidate {
  station: StationFixture;
  originStation: StationFixture;
  destStation: StationFixture;
  areaIds: ULID[];
  gym: GymFixture | null; // bag-drop POI, or null (carry penalty applies)
  inbound: TransitItinerary | null; // origin → work station
  outbound: TransitItinerary | null; // work station → destination
  arriveWorkMs: number; // clock the rep can start working at the station
  latestBackMs: number; // hard: latest arrival back at the departure station
  hAllocSec: Record<ULID, number>; // per-area canvass budget (L2 service time / L3 budget)
  score: number;
  parts: CandidateScoreParts;
}

export interface L1Result {
  chosen: L1Candidate;
  alternatives: L1Candidate[];
}

export interface CompileClock {
  /** Milliseconds; used ONLY for compiledAt/validUntil/ULID seed metadata,
   *  never for pipeline scoring (brief determinism rule). */
  nowMs: number;
}

export type { GoalPreset };
