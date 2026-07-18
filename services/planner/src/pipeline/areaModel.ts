/**
 * Area-level derivations of the canonical EV + doors/hour model
 * (docs/00 §5, docs/11 §5). Everything here is a thin adapter over the pure
 * functions in @2day/core (doorEV, doorsPerHour) — we do NOT re-implement the
 * probability math, only aggregate it from area/edge fixture features and the
 * rep's Preferences. Deterministic: inputs are area features + local hour +
 * prefs; no clock, no randomness.
 */
import type { CampaignFit, DoorEV, DwellingFeatures, Preferences } from "../core.js";
import { doorEV, doorsPerHour } from "../core.js";
import { DEFAULT_COMMISSION_EUR, DEFAULT_WALK_MPS, DWELL_SEC } from "../config.js";
import type { AreaFixture, StreetEdge } from "../fixtures/brabant.js";

type DwellingKind = DwellingFeatures["kind"];

const clamp = (x: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, x));

/** Dominant dwelling kind + derived ownership/family rates for an area. */
export function representativeDwelling(area: AreaFixture): DwellingFeatures {
  let kind: DwellingKind = "terraced";
  let best = -Infinity;
  for (const [k, v] of Object.entries(area.dwellingMix) as [DwellingKind, number][]) {
    if (v > best) {
      best = v;
      kind = k;
    }
  }
  return {
    kind,
    incomeTier: area.incomeTier,
    // ownership falls with apartment share; families concentrate in low-rise.
    ownershipRate: clamp(0.25 + 0.55 * (1 - area.apartmentRatio), 0, 1),
    familyRate: clamp(0.15 + 0.6 * (1 - area.apartmentRatio), 0, 1),
  };
}

/**
 * Campaign fit for an area. targetingFit is the alignment of the area's CBS
 * income tier with the rep's incomePreference (brief L3: "targetingFit from
 * incomeTier vs preferences"): 1 when they match, 0 when maximally apart.
 */
export function areaFit(area: AreaFixture, prefs: Preferences): CampaignFit {
  const targetingFit = clamp(1 - Math.abs(area.incomeTier - prefs.incomePreference), 0, 1);
  return { commissionEur: DEFAULT_COMMISSION_EUR, targetingFit };
}

/** Per-door EV for an area at a given local hour (uses core doorEV verbatim). */
export function areaDoorEV(area: AreaFixture, hourLocal: number, prefs: Preferences): DoorEV {
  return doorEV({
    hourLocal,
    dwelling: representativeDwelling(area),
    fit: areaFit(area, prefs),
  });
}

/**
 * Probability-weighted mean dwell seconds per door for an area (doc 11 §5.2).
 * Outcome mixture built from the core EV probabilities.
 */
export function meanDwellSec(area: AreaFixture, hourLocal: number, prefs: Preferences): number {
  const ev = areaDoorEV(area, hourLocal, prefs);
  const pAns = ev.pAnswer;
  const pConv = ev.pConversation; // conditional on answer
  const pSale = ev.pSale; // conditional on conversation
  const p = {
    no_answer: 1 - pAns,
    not_interested: pAns * (1 - pConv),
    conversation: pAns * pConv * (1 - pSale),
    sale: pAns * pConv * pSale,
  };
  return (
    p.no_answer * DWELL_SEC.no_answer +
    p.not_interested * DWELL_SEC.not_interested +
    p.conversation * DWELL_SEC.conversation +
    p.sale * DWELL_SEC.sale
  );
}

/** Door-count-weighted mean door spacing across an area's edges (metres). doc 11 §5.4. */
export function meanSpacingM(area: AreaFixture): number {
  let doors = 0;
  let length = 0;
  for (const e of area.edges) {
    doors += e.doorsEven + e.doorsOdd;
    length += e.lengthM;
  }
  return doors > 0 ? length / doors : 12;
}

/** doors/hour for an area (core doorsPerHour with area spacing + dwell). */
export function areaDoorsPerHour(area: AreaFixture, hourLocal: number, prefs: Preferences): number {
  return doorsPerHour({
    meanDoorSpacingM: meanSpacingM(area),
    walkingSpeedMps: prefs.walkingSpeedMps ?? DEFAULT_WALK_MPS,
    meanDwellSec: meanDwellSec(area, hourLocal, prefs),
  });
}

/** Expected productive conversations per hour worked in the area. */
export function expectedConversationsPerHour(
  area: AreaFixture,
  hourLocal: number,
  prefs: Preferences,
): number {
  return areaDoorsPerHour(area, hourLocal, prefs) * areaDoorEV(area, hourLocal, prefs).expectedConversations;
}

/**
 * Cheap ranking aggregate (doc 11 §2.3 day_potential): door_count · mean_EV ·
 * access_factor, where access_factor down-weights apartment-heavy areas.
 */
export function dayPotential(area: AreaFixture, hourLocal: number, prefs: Preferences): number {
  const accessFactor = 1 - 0.5 * area.apartmentRatio;
  return area.doorCount * areaDoorEV(area, hourLocal, prefs).expectedConversations * accessFactor;
}

/** Apartment preference multiplier for L3 edge scoring (brief L3). */
export function apartmentWeight(edge: StreetEdge, prefs: Preferences): number {
  // apartmentPreference −1 (avoid) … +1 (seek). Weight <1 deprioritizes, >1 boosts.
  return clamp(1 + prefs.apartmentPreference * edge.apartmentRatio, 0.15, 1.6);
}
