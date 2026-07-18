/**
 * Canonical domain types for 2DAY.
 * Mirrors docs/09-api-architecture.md (PlanRequest/Plan contracts) and
 * docs/00-design-decisions.md §6 (entity names). Doc 09 is the authority —
 * changes here must be reflected there and vice versa.
 */

export type ULID = string; // 26-char Crockford base32
export type ISODateTime = string; // RFC3339, always with offset
export type H3Index = string; // res 9–10 cell

export type GoalPreset =
  | "max_sales"
  | "easy_day"
  | "highest_income"
  | "shortest_walking"
  | "explore";

export type TransportMode = "walk" | "train" | "bus" | "tram" | "metro" | "bike" | "car";
export type BagSize = "none" | "light" | "standard" | "heavy";

export interface GeoPoint {
  lat: number;
  lng: number;
}

export interface LocationInput {
  /** Where the rep starts. `current` = live GPS; `station`/`address` = explicit. */
  kind: "current" | "station" | "address";
  point: GeoPoint;
  /** PDOK/BAG id or GTFS stop id when kind ≠ current; helps snap to a real anchor. */
  ref?: string;
  label?: string;
}

export interface WorkHours {
  startAt: ISODateTime; // earliest the rep can knock
  endAt: ISODateTime; // hard: must be at destination by (or before) this
  breaks?: { earliest: ISODateTime; latest: ISODateTime; minutes: number }[];
}

export interface MembershipInput {
  chain: string; // "basic_fit" | "anytime_fitness" | ...
  gymMembershipId?: ULID;
}

export interface Preferences {
  /** 0..1 weight nudging toward higher-income buurten (CBS). */
  incomePreference: number;
  /** −1..1. −1 = avoid apartments, +1 = seek high-density. */
  apartmentPreference: number;
  walkingSpeedMps?: number; // default 1.35, personalized from history
  maxWalkMinutes?: number;
}

export interface PlanRequest {
  idempotencyKey: ULID;
  orgId: ULID;
  repId: ULID;
  campaignId: ULID;
  goalPreset: GoalPreset;
  location: LocationInput;
  destination: LocationInput;
  hours: WorkHours;
  transportModes: TransportMode[];
  memberships: MembershipInput[];
  bag: { size: BagSize; canCarryAllDay: boolean };
  preferences: Preferences;
  overrides?: {
    pinnedAreas?: ULID[];
    excludedAreas?: ULID[];
    maxAlternatives?: number; // default 2
  };
}

export type LegKind = "transit" | "walk" | "gym" | "canvass" | "break";

export interface TransitLegDetail {
  mode: Exclude<TransportMode, "walk">;
  routeShortName: string; // "IC 3600" | "bus 156"
  fromStopId: string;
  toStopId: string;
  scheduledDepart: ISODateTime;
  scheduledArrive: ISODateTime;
  realtimeState: "on_time" | "delayed" | "cancelled" | "unknown";
}

export interface CanvassLegDetail {
  areaId: ULID;
  h3Cells: H3Index[];
  streetEdgeIds: ULID[]; // the L3 required-edge set
  expectedConversations: number;
  doorCount: number;
  estWalkMinutes: number;
}

export interface GymLegDetail {
  poiId: ULID;
  action: "drop_bag" | "shower" | "pickup_bag";
}

export interface PlanLeg {
  id: ULID;
  seq: number;
  kind: LegKind;
  startAt: ISODateTime;
  endAt: ISODateTime;
  fromLabel: string;
  toLabel: string;
  areaId?: ULID;
  geometry?: string; // encoded polyline, server-simplified
  detail: TransitLegDetail | CanvassLegDetail | GymLegDetail | Record<string, never>;
}

export interface PlanScore {
  expectedConversations: number;
  expectedRevenueEur: number;
  walkMinutes: number;
  transitMinutes: number;
  carryPenalty: number;
  goalPreset: GoalPreset;
}

export interface PlanAlternative {
  id: ULID;
  label: string;
  score: PlanScore;
  deltaVsChosen: string;
  legs: PlanLeg[];
}

export interface Plan {
  id: ULID;
  orgId: ULID;
  repId: ULID;
  campaignId: ULID;
  goalPreset: GoalPreset;
  compiledAt: ISODateTime;
  planVersion: number; // bumps on each replan; monotonic
  validUntil: ISODateTime;
  score: PlanScore;
  legs: PlanLeg[];
  alternatives: PlanAlternative[];
  explanation?: string[];
  daypackStatus: "none" | "building" | "ready";
}

export type ReplanReason =
  | "rain_nowcast"
  | "transit_disruption"
  | "pace_behind"
  | "pace_ahead"
  | "street_closed"
  | "manual_tweak";

export interface ReplanRequest {
  idempotencyKey: ULID;
  reason: ReplanReason;
  signal: {
    at: ISODateTime;
    atPoint?: GeoPoint;
    rainStartsInMin?: number;
    disruptionId?: ULID;
    doorsAheadOfPlan?: number;
    closedStreetEdgeId?: ULID;
  };
}

/** Append-only door event — docs/14-data-model.md. Never updated, only appended. */
export type VisitOutcome =
  | "no_answer"
  | "conversation"
  | "sale"
  | "not_interested"
  | "follow_up"
  | "do_not_knock"
  | "inaccessible";

export interface VisitEvent {
  id: ULID; // client-generated; sync dedupe key (doc 15)
  orgId: ULID;
  repId: ULID;
  campaignId: ULID;
  addressUnitId?: ULID; // BAG verblijfsobject when resolved
  planId?: ULID;
  outcome: VisitOutcome;
  at: ISODateTime; // device clock
  deviceSeq: number; // monotonic per device, tie-breaker for same-ms events
  point?: GeoPoint;
  saleValueEur?: number;
  note?: string;
  /** Set when this event corrects an earlier one (immutable log — doc 14). */
  correctsEventId?: ULID;
}
