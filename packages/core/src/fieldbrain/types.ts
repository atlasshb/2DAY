/**
 * Field brain — on-device deterministic rules engine (docs/10-ai-architecture.md §4,
 * docs/00-design-decisions.md §9). NO LLM, NO I/O, NO timers: the caller supplies the
 * clock (`now` in epoch ms) so evaluation is 100% reproducible. This file declares the
 * public shapes; `rules.ts` implements the doc-10 catalog and `arbitrate.ts` the
 * "≤ 1 nudge / 2 min" arbitration contract.
 */
import type { GeoPoint, TransitLegDetail, ULID } from "../types.js";

/**
 * Priority classes, highest first. Maps the doc-10 numeric priorities onto four
 * interrupt tiers. `safety` and `deadline` are the *interrupting* classes — they
 * bypass the global 2-minute rate limit (doc 10 §4.2 override, generalized per the
 * arbitration contract); `opportunity` and `info` are rate-limited.
 */
export type NudgePriority = "safety" | "deadline" | "opportunity" | "info";

/** Numeric rank for ordering; higher wins. */
export const PRIORITY_RANK: Record<NudgePriority, number> = {
  safety: 3,
  deadline: 2,
  opportunity: 1,
  info: 0,
};

export type NudgeActionKind =
  | "reorder_loop"
  | "leave_now"
  | "navigate"
  | "grab_bag"
  | "skip_street"
  | "take_break"
  | "reroute"
  | "low_power"
  | "acknowledge";

/** A single suggested action the rep can take from a nudge. Rendered as one button. */
export interface NudgeAction {
  kind: NudgeActionKind;
  /** Human-readable button label (already localized upstream in real usage). */
  label: string;
}

/**
 * A nudge produced by a rule. `title`/`body` are the filled template (the source of
 * truth per doc 10 §4 — the LLM only re-tones this when online). `deadlineAt` and
 * `cooldownKey` are optional arbitration hints (see arbitrate.ts).
 */
export interface Nudge {
  /** Deterministic id: `${ruleId}@${now}` so identical inputs yield identical ids. */
  id: string;
  ruleId: string;
  priority: NudgePriority;
  title: string;
  body: string;
  action: NudgeAction;
  /** Epoch ms of the hard deadline this nudge races (train, sunset, gym close). */
  deadlineAt?: number;
  /**
   * Cooldown scope key. Defaults to `ruleId`; per-street/per-address rules set a
   * scoped key (e.g. `skip_apartment_street:<edgeId>`) so a new street resets it.
   */
  cooldownKey?: string;
}

/** Rules never mutate signals; ctx carries only the caller-supplied clock. */
export interface RuleContext {
  /** Epoch ms — the single source of "now" for the whole evaluation. */
  now: number;
}

export interface Rule {
  id: string;
  priority: NudgePriority;
  /** Per-rule cooldown in seconds (doc 10 §4.1 table). 0 = never suppressed. */
  cooldownSec: number;
  /** Pure predicate → filled nudge, or null when the trigger doesn't hold. */
  evaluate(signals: Signals, ctx: RuleContext): Nudge | null;
}

/** Per-rule (per cooldown-key) last-fire ledger + the global last-nudge stamp. */
export interface FieldBrainState {
  /** cooldownKey → epoch ms it last fired. */
  lastFiredAt: Record<string, number>;
  /** Epoch ms the last nudge of ANY rule fired — drives the global 2-min gate. */
  lastNudgeAt: number;
}

/** Features of a routable street edge (doc 00 §6 `street_edge`, doc 15 §1.2). */
export interface StreetEdgeFeatures {
  streetEdgeId?: ULID;
  streetName: string;
  /** 0..100 — share of units that are apartments (BAG). */
  apartmentSharePct: number;
  /** Locked communal entrance / no direct door access. */
  doorAccessLocked: boolean;
  doorsTotal: number;
  doorsLogged: number;
  /** Count of org do-not-knock addresses on this edge (compliance, doc 00 §11). */
  doNotKnockCount: number;
}

/** Live transit state for the planned return leg (doc 13 §4). */
export interface TransitSignal {
  routeShortName: string;
  /** Epoch ms departure — realtime if fresh, else the cached scheduled time. */
  departureAt: number;
  /** Valhalla pedestrian minutes from current GPS to the departure platform. */
  walkMinutesToStop: number;
  realtimeState: TransitLegDetail["realtimeState"];
  /** Override for the default platform buffer (min); falls back to config. */
  platformBufferMin?: number;
  /** + minutes of delay on the planned train (GTFS-RT trip update). */
  delayMin?: number;
  cancelled?: boolean;
  /** Alternate itinerary label for a reroute when the planned line is cancelled. */
  altItineraryVia?: string;
  /** Timetable slice is stale (offline) — triggers a conservative early bias. */
  timetableStale?: boolean;
}

/** A nearby unworked high-EV cluster (doc 10 rule #7). */
export interface HighEvCluster {
  streetName: string;
  doorCount: number;
  distanceM: number;
  /** EV percentile of the cluster's H3 cell today (0..100). */
  evPercentile: number;
}

/**
 * The full sensor snapshot the rules read. Every field is plain data — no methods,
 * no clock. Optional fields absent ⇒ the corresponding rule simply can't fire.
 */
export interface Signals {
  position?: GeoPoint;

  // --- pace vs plan ---
  plannedDoorsPerHour: number;
  actualDoorsPerHour: number;
  /** Minutes the pace deviation has persisted (doc 10 rules #5/#6 need ≥ 15). */
  paceWindowMin: number;

  // --- weather (Buienradar nowcast) ---
  /** Minutes until rain ≥ threshold starts; undefined ⇒ no incoming rain. */
  rainStartsInMin?: number;
  rainIntensityMmH?: number;
  /** A dry-first loop reorder exists (doc 10 rule #1). */
  dryLoopReorderAvailable?: boolean;
  /** Length (min) of a dry gap opening after active rain (rule #12). */
  dryGapMin?: number;
  /** Epoch ms the dry gap lasts until (for the "Dry until {time}" template). */
  dryGapUntil?: number;

  // --- transit ---
  transit?: TransitSignal;

  // --- EV / doors ---
  remainingDoors: number;
  remainingEv: number;
  highEvClusterNearby?: HighEvCluster;

  // --- battery ---
  /** 0..100 device battery. */
  batteryPct: number;
  trackingOn: boolean;

  // --- daylight / end-of-window ---
  /** Epoch ms of sunset (rule #8). */
  sunsetAt?: number;
  canvassLegsRemaining: number;

  // --- gym / bag ---
  bagAtGym?: { gymName: string; closesAt: number; pickupStarted: boolean };

  // --- current & upcoming street edges ---
  currentEdge?: StreetEdgeFeatures;
  nextEdge?: StreetEdgeFeatures;

  // --- lunch window ---
  lunchWindow?: { open: boolean; nearestPoiWalkMin: number; breakTaken: boolean };

  // --- display labels for templates ---
  areaLabel?: string;
  loopLabel?: string;
}

/**
 * All thresholds live here, not in code (doc 10 §4.1: "All thresholds are config").
 * `defaultConfig` encodes the doc-10 table values; callers override per org.
 */
export interface FieldBrainConfig {
  rainLeadMin: number;
  rainMinMmH: number;
  paceBehindFactor: number;
  paceAheadFactor: number;
  paceWindowMin: number;
  apartmentShareMin: number;
  highEvRadiusM: number;
  highEvPercentile: number;
  daylightFadeMin: number;
  gymClosingMin: number;
  batteryPctMin: number;
  weatherWindowMin: number;
  trainDelayMinMin: number;
  lunchPoiWalkMin: number;
  /** Platform buffer subtracted in the leave-for-train slack (doc 13 §4.1). */
  platformBufferMin: number;
  /** Extra early bias when the timetable is stale/offline (doc 13 §4.2). */
  conservativeMarginMin: number;
  /** Minutes east of UTC for clock-time templates (NL = +120 in summer). */
  tzOffsetMin: number;
}

export const defaultConfig: FieldBrainConfig = {
  rainLeadMin: 25,
  rainMinMmH: 0.5,
  paceBehindFactor: 0.8,
  paceAheadFactor: 1.25,
  paceWindowMin: 15,
  apartmentShareMin: 70,
  highEvRadiusM: 150,
  highEvPercentile: 90,
  daylightFadeMin: 40,
  gymClosingMin: 45,
  batteryPctMin: 15,
  weatherWindowMin: 20,
  trainDelayMinMin: 5,
  lunchPoiWalkMin: 4,
  platformBufferMin: 3,
  conservativeMarginMin: 2,
  tzOffsetMin: 120,
};

/** The initial, empty engine state. */
export function initialState(): FieldBrainState {
  return { lastFiredAt: {}, lastNudgeAt: Number.NEGATIVE_INFINITY };
}
