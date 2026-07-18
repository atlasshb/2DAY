/**
 * GET /v1/areas/discover backing logic — docs/09 §3.3. Pure L1 scoring, no
 * VROOM/OTP heavy solve: enumerate buurten reachable within a commute budget
 * and rank them by the goal-weighted L1 objective (doc 11 §2.4/§2.5), reusing
 * the same area model as the full compile. Fast + cacheable in production.
 *
 * Deterministic — score depends only on fixtures, goal, local hour and the
 * commute budget.
 */
import type { GeoPoint, GoalPreset, ISODateTime, Preferences, ULID } from "../core.js";
import type { TransitPlanner } from "../adapters/transit.js";
import { AREAS, nearestStation, getStationById } from "../fixtures/brabant.js";
import { PRESET_WEIGHTS } from "./l1.js";
import {
  areaDoorEV,
  expectedConversationsPerHour,
} from "./areaModel.js";
import { DEFAULT_WALK_MPS } from "../config.js";
import { haversineM } from "../util/geo.js";
import { localHour, toEpoch } from "../util/time.js";

/** docs/09 §3.3 response shapes (not core wire types — response-only). */
export interface AreaCandidate {
  areaId: ULID;
  buurtCode: string;
  name: string;
  centroid: GeoPoint;
  reachMinutes: number;
  expectedConversationsPerHour: number;
  incomeIndex: number;
  apartmentShare: number;
  score: number;
}

export interface AreasDiscoverResponse {
  generatedAt: ISODateTime;
  cacheKey: string;
  candidates: AreaCandidate[];
}

export interface DiscoverParams {
  lat: number;
  lng: number;
  minutes: number; // commute budget C (doc 11 §1)
  goal: GoalPreset;
  startAt?: ISODateTime; // sets the local hour for EV; defaults to mid-morning
}

const DEFAULT_PREFS: Preferences = {
  incomePreference: 0.5,
  apartmentPreference: 0,
  walkingSpeedMps: DEFAULT_WALK_MPS,
};

export async function discoverAreas(
  params: DiscoverParams,
  deps: { transit: TransitPlanner },
  generatedAt: ISODateTime,
): Promise<AreasDiscoverResponse> {
  const origin: GeoPoint = { lat: params.lat, lng: params.lng };
  const originStation = nearestStation(origin);
  const hour = params.startAt ? localHour(params.startAt) : 10;
  const departAfter = params.startAt ?? generatedAt;
  const weights = PRESET_WEIGHTS[params.goal];

  // reach (min) to each working station via transit; origin city = 0.
  const stationReach = new Map<ULID, number>();
  for (const area of AREAS) {
    if (stationReach.has(area.stationId)) continue;
    const station = getStationById(area.stationId)!;
    if (station.id === originStation.id) {
      stationReach.set(station.id, 0);
      continue;
    }
    const its = await deps.transit.itineraries(originStation, station, departAfter);
    stationReach.set(station.id, its.length > 0 ? its[0]!.durationSec / 60 : Infinity);
  }

  const candidates: AreaCandidate[] = [];
  for (const area of AREAS) {
    const station = getStationById(area.stationId)!;
    const transitMin = stationReach.get(area.stationId) ?? Infinity;
    const walkMin = haversineM(station.point, area.centroid) / DEFAULT_PREFS.walkingSpeedMps! / 60;
    const reachMinutes = transitMin + walkMin;
    if (reachMinutes > params.minutes) continue;

    const convPerHour = expectedConversationsPerHour(area, hour, DEFAULT_PREFS);
    const ev = areaDoorEV(area, hour, DEFAULT_PREFS);
    const revPerHour = convPerHour * ev.pSale * ev.expectedRevenueEur; // € potential proxy
    const income = DEFAULT_PREFS.incomePreference * area.incomeTier;

    const score =
      weights.wRev * (convPerHour * 10) -
      weights.wTravel * reachMinutes +
      weights.wIncome * income * 10 +
      revPerHour * 0; // revPerHour folded into convPerHour; kept for clarity

    candidates.push({
      areaId: area.id,
      buurtCode: area.buurtCode,
      name: `${area.name}, ${area.city}`,
      centroid: area.centroid,
      reachMinutes: round1(reachMinutes),
      expectedConversationsPerHour: round2(convPerHour),
      incomeIndex: area.incomeTier,
      apartmentShare: area.apartmentRatio,
      score: round2(score),
    });
  }

  candidates.sort((a, b) => b.score - a.score || a.areaId.localeCompare(b.areaId));

  const cacheKey = `${params.lat.toFixed(2)}:${params.lng.toFixed(2)}:${Math.round(toEpoch(departAfter) / (30 * 60_000))}:${params.goal}`;
  return { generatedAt, cacheKey, candidates };
}

const round1 = (x: number): number => Math.round(x * 10) / 10;
const round2 = (x: number): number => Math.round(x * 100) / 100;
