/**
 * Tuning constants for the planner MVP. Values are (est.) defaults mirroring
 * docs/11-routing-algorithms.md §5 (walking speed / dwell) and §2 (overheads,
 * platform buffer). In production these live in the `preset` / campaign tables
 * (doc 11 §2.5); here they are hard-coded so the pipeline is fully
 * deterministic. NONE of these introduce Math.random or Date.now.
 */
import type { VisitOutcome } from "./core.js";

/** doc 11 §5.3 — v_base 1.35 m/s (~4.9 km/h). */
export const DEFAULT_WALK_MPS = 1.35;
/** Great-circle → street distance inflation for the mock walking engine. */
export const URBAN_DETOUR = 1.25;

/** Mixture dwell times per outcome, seconds. doc 11 §5.2. */
export const DWELL_SEC: Record<VisitOutcome, number> = {
  no_answer: 25,
  not_interested: 40,
  conversation: 180,
  sale: 420,
  follow_up: 150,
  do_not_knock: 5,
  inaccessible: 5,
};

/** Default commission per sale (€) — stands in for the campaign commission model. */
export const DEFAULT_COMMISSION_EUR = 55;

/** doc 11 §3.4 — platform buffer before the departure train (min). */
export const PLATFORM_BUFFER_MIN = 4;
/** Brief: "must arrive ≥10 min before hours.endAt". */
export const END_SAFETY_MIN = 10;

/** Bag drop / pickup service times at the gym (min). */
export const GYM_DROP_MIN = 6;
export const GYM_PICKUP_MIN = 5;

/** Lunch service time (min). doc 11 §3.4 lunch window is soft. */
export const LUNCH_MIN = 30;

/** L1 fixed overhead reserve (bag drop + lunch + buffer), doc 11 §2.2 ≈ 45 min. */
export const FIXED_BUFFER_MIN = 15;

/** Fraction of the day's walk budget assignable to canvassing; the rest is the
 *  station↔gym↔area deadhead the L2 optimizer must fit. Keeps a single dense
 *  area from consuming the whole day and being dropped as infeasible. */
export const DAY_WALK_RESERVE = 0.85;

/** doc 11 §4.6 — reserve of the L3 budget kept for deadhead/connective walking. */
export const L3_DEADHEAD_RESERVE = 0.15;

/** travel_cost money→time conversion: rep value_of_time (min per €). doc 11 §2.4. */
export const VALUE_OF_TIME_MIN_PER_EUR = 3;

/** carry_penalty fatigue when a heavy/standard bag is carried all day (min/hour). */
export const CARRY_BETA_MIN_PER_HOUR = 12;

/** L1 candidate shortlist size per station (doc 11 §2.2 K=8; our cities are smaller). */
export const L1_SHORTLIST_K = 8;
/** L1 area-set sizes to enumerate (doc 11 §2.4 p ∈ {2,3,4}; MVP cities hold ≤3 areas). */
export const L1_SUBSET_SIZES = [1, 2, 3];

/** Default alternatives returned with a plan (brief §2: top plan + 2 alternatives). */
export const DEFAULT_MAX_ALTERNATIVES = 2;

/** Re-optimization threshold: L2 only kicks in past this deviation (brief §5). */
export const REPLAN_L2_DEVIATION_MIN = 15;
