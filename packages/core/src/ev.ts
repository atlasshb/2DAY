/**
 * Expected-value model — docs/00-design-decisions.md §5, docs/14-data-model.md.
 *
 *   EV(door) = P(answer | hour, dwelling, history)
 *            × P(conversation | answer, campaign fit)
 *            × P(sale | conversation, demographics fit)
 *            × commission
 *
 * Posteriors are Beta-Binomial shrinkage toward priors with recency decay
 * (half-life 90 days). Pure functions — runs identically in the planner
 * service and on-device (offline L3 re-ordering, field brain rule #7).
 */

export interface RateObservations {
  /** Decay-weighted successes/trials (apply decayWeight before summing). */
  successes: number;
  trials: number;
}

export interface DwellingFeatures {
  /** BAG-derived. */
  kind: "terraced" | "detached" | "semi_detached" | "apartment" | "other";
  constructionYear?: number;
  /** CBS buurt features, normalized 0..1. */
  incomeTier: number; // 0 low … 1 high
  ownershipRate: number; // 0..1
  familyRate: number; // 0..1
}

export interface CampaignFit {
  commissionEur: number;
  /** 0..1 — how well campaign targeting matches this dwelling (e.g. energy label for solar). */
  targetingFit: number;
}

/** Recency decay, half-life in days (default 90 per brief §5). */
export function decayWeight(ageDays: number, halfLifeDays = 90): number {
  if (ageDays <= 0) return 1;
  return Math.pow(0.5, ageDays / halfLifeDays);
}

/**
 * Posterior mean of a Beta-Binomial: shrink the observed rate toward the
 * prior. `priorStrength` is the prior's pseudo-trial count — higher = slower
 * to trust sparse personal history (doc 14 uses 20 for rep-level, 200 for
 * org-level pools).
 */
export function shrunkRate(
  obs: RateObservations,
  priorRate: number,
  priorStrength: number,
): number {
  const a = priorRate * priorStrength + obs.successes;
  const b = priorStrength + obs.trials;
  return b > 0 ? a / b : priorRate;
}

/** Baseline P(answer) by local hour — Dutch canvassing curve (estimates; calibrated from data). */
export function answerPrior(hourLocal: number, dwelling: DwellingFeatures): number {
  // Curve peaks late afternoon/early evening; apartments penalized for access.
  const byHour: Record<number, number> = {
    9: 0.28, 10: 0.3, 11: 0.31, 12: 0.3, 13: 0.32, 14: 0.34,
    15: 0.36, 16: 0.4, 17: 0.44, 18: 0.46, 19: 0.44, 20: 0.38,
  };
  const base = byHour[hourLocal] ?? 0.25;
  const accessFactor = dwelling.kind === "apartment" ? 0.55 : 1;
  const familyFactor = 0.9 + 0.2 * dwelling.familyRate; // families are home more predictably
  return Math.min(0.95, base * accessFactor * familyFactor);
}

export function conversationPrior(dwelling: DwellingFeatures, fit: CampaignFit): number {
  // Given an answered door: willingness to talk scales with targeting fit.
  return Math.min(0.9, 0.35 + 0.35 * fit.targetingFit);
}

export function salePrior(dwelling: DwellingFeatures, fit: CampaignFit): number {
  // Given a conversation: ownership helps (decision authority), income tier is campaign-relative.
  return Math.min(0.6, (0.08 + 0.1 * fit.targetingFit) * (0.7 + 0.5 * dwelling.ownershipRate));
}

export interface DoorEVInput {
  hourLocal: number;
  dwelling: DwellingFeatures;
  fit: CampaignFit;
  /** Decay-weighted history, most-specific pool available (address < street < buurt). */
  answerObs?: RateObservations;
  conversationObs?: RateObservations;
  saleObs?: RateObservations;
  priorStrength?: number; // default 20 (rep-level)
}

export interface DoorEV {
  pAnswer: number;
  pConversation: number; // conditional on answer
  pSale: number; // conditional on conversation
  expectedConversations: number;
  expectedRevenueEur: number;
}

export function doorEV(input: DoorEVInput): DoorEV {
  const k = input.priorStrength ?? 20;
  const pAnswer = shrunkRate(
    input.answerObs ?? { successes: 0, trials: 0 },
    answerPrior(input.hourLocal, input.dwelling),
    k,
  );
  const pConversation = shrunkRate(
    input.conversationObs ?? { successes: 0, trials: 0 },
    conversationPrior(input.dwelling, input.fit),
    k,
  );
  const pSale = shrunkRate(
    input.saleObs ?? { successes: 0, trials: 0 },
    salePrior(input.dwelling, input.fit),
    k,
  );
  const expectedConversations = pAnswer * pConversation;
  return {
    pAnswer,
    pConversation,
    pSale,
    expectedConversations,
    expectedRevenueEur: expectedConversations * pSale * input.fit.commissionEur,
  };
}

/** Doors/hour prediction — doc 11 §4: spacing, dwell times, pace. */
export function doorsPerHour(params: {
  meanDoorSpacingM: number;
  walkingSpeedMps: number;
  /** Probability-weighted mean seconds spent per door across outcomes. */
  meanDwellSec: number;
}): number {
  const walkSecPerDoor = params.meanDoorSpacingM / params.walkingSpeedMps;
  return 3600 / (walkSecPerDoor + params.meanDwellSec);
}
