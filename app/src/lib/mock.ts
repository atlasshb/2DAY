/**
 * One typed mock-data module — the Tilburg demo day.
 * Every screen (Today, Plan, Route, Log, Stats) reads from here so figures
 * stay identical across tabs, matching prototype/index.html's numbers
 * (87 doors, 14 convos, €152, IC 18:02...).
 *
 * Typed with @2day/core's canonical domain types (packages/core/src/types.ts)
 * per docs/00-design-decisions.md §6.
 */
import type {
  GoalPreset,
  Plan,
  PlanAlternative,
  PlanLeg,
  VisitOutcome,
} from "@2day/core";

/* ============ Plan inputs (chip row on /plan) ============ */

export interface InputChip {
  icon: string;
  /** Plain-text prefix before the (optionally bold) label, e.g. "End in ". */
  prefix?: string;
  label: string;
  bold?: boolean;
  emphasis?: boolean;
}

export const goalPreset: GoalPreset = "max_sales";

export const planInputChips: InputChip[] = [
  { icon: "📍", label: "Maaspoort, Den Bosch", bold: true },
  { icon: "🏁", prefix: "End in ", label: "Tilburg", bold: true },
  { icon: "🕐", label: "12:00–18:00", bold: true },
  { icon: "🚆", label: "Train" },
  { icon: "🎒", label: "Backpack" },
  { icon: "🏋️", label: "Basic-Fit" },
  { icon: "👟", label: "Normal pace" },
  { icon: "💶", label: "Middle income" },
  { icon: "🏢", label: "Avoid apartments" },
  { icon: "🎯", label: "Max sales", bold: true, emphasis: true },
];

/* ============ Canonical plan (legs typed as PlanLeg) ============ */

const planLegs: PlanLeg[] = [
  {
    id: "01J9Z8QPLANLEG00000000001",
    seq: 1,
    kind: "walk",
    startAt: "2026-07-18T12:04:00+02:00",
    endAt: "2026-07-18T12:15:00+02:00",
    fromLabel: "Maaspoort",
    toLabel: "Den Bosch Centraal",
    detail: {},
  },
  {
    id: "01J9Z8QPLANLEG00000000002",
    seq: 2,
    kind: "transit",
    startAt: "2026-07-18T12:19:00+02:00",
    endAt: "2026-07-18T12:46:00+02:00",
    fromLabel: "Den Bosch Centraal",
    toLabel: "Tilburg",
    detail: {
      mode: "train",
      routeShortName: "Sprinter",
      fromStopId: "nl-s-dbc",
      toStopId: "nl-s-tb",
      scheduledDepart: "2026-07-18T12:19:00+02:00",
      scheduledArrive: "2026-07-18T12:46:00+02:00",
      realtimeState: "on_time",
    },
  },
  {
    id: "01J9Z8QPLANLEG00000000003",
    seq: 3,
    kind: "gym",
    startAt: "2026-07-18T12:46:00+02:00",
    endAt: "2026-07-18T13:05:00+02:00",
    fromLabel: "Tilburg",
    toLabel: "Basic-Fit Spoorlaan",
    detail: { poiId: "01J9Z8QPOIBASICFITSPOOR01", action: "drop_bag" },
  },
  {
    id: "01J9Z8QPLANLEG00000000004",
    seq: 4,
    kind: "canvass",
    startAt: "2026-07-18T13:05:00+02:00",
    endAt: "2026-07-18T14:25:00+02:00",
    fromLabel: "Basic-Fit Spoorlaan",
    toLabel: "Groenewoud-West",
    areaId: "01J9Z8QAREAGROENEWOUDW001",
    detail: {
      areaId: "01J9Z8QAREAGROENEWOUDW001",
      h3Cells: [],
      streetEdgeIds: [],
      expectedConversations: 11,
      doorCount: 62,
      estWalkMinutes: 80,
    },
  },
  {
    id: "01J9Z8QPLANLEG00000000005",
    seq: 5,
    kind: "canvass",
    startAt: "2026-07-18T14:25:00+02:00",
    endAt: "2026-07-18T15:40:00+02:00",
    fromLabel: "Groenewoud-West",
    toLabel: "Groenewoud-Oost",
    areaId: "01J9Z8QAREAGROENEWOUDO001",
    detail: {
      areaId: "01J9Z8QAREAGROENEWOUDO001",
      h3Cells: [],
      streetEdgeIds: [],
      expectedConversations: 10,
      doorCount: 58,
      estWalkMinutes: 75,
    },
  },
  {
    id: "01J9Z8QPLANLEG00000000006",
    seq: 6,
    kind: "break",
    startAt: "2026-07-18T15:40:00+02:00",
    endAt: "2026-07-18T16:00:00+02:00",
    fromLabel: "Groenewoud-Oost",
    toLabel: "Anne & Max",
    detail: {},
  },
  {
    id: "01J9Z8QPLANLEG00000000007",
    seq: 7,
    kind: "canvass",
    startAt: "2026-07-18T16:00:00+02:00",
    endAt: "2026-07-18T17:45:00+02:00",
    fromLabel: "Anne & Max",
    toLabel: "Stappegoor-Noord",
    areaId: "01J9Z8QAREASTAPPEGOORN01",
    detail: {
      areaId: "01J9Z8QAREASTAPPEGOORN01",
      h3Cells: [],
      streetEdgeIds: [],
      expectedConversations: 13,
      doorCount: 54,
      estWalkMinutes: 105,
    },
  },
  {
    id: "01J9Z8QPLANLEG00000000008",
    seq: 8,
    kind: "transit",
    startAt: "2026-07-18T17:45:00+02:00",
    endAt: "2026-07-18T18:29:00+02:00",
    fromLabel: "Basic-Fit Spoorlaan (bag pickup)",
    toLabel: "Den Bosch Centraal",
    detail: {
      mode: "train",
      routeShortName: "IC 3600",
      fromStopId: "nl-s-tb",
      toStopId: "nl-s-dbc",
      scheduledDepart: "2026-07-18T18:02:00+02:00",
      scheduledArrive: "2026-07-18T18:29:00+02:00",
      realtimeState: "on_time",
    },
  },
];

const alternatives: PlanAlternative[] = [
  {
    id: "01J9Z8QALTBREDAHAAGSEBE01",
    label: "Breda · Haagse Beemden",
    deltaVsChosen: "~29 convos · 1 change · score 87",
    score: {
      expectedConversations: 29,
      expectedRevenueEur: 128,
      walkMinutes: 210,
      transitMinutes: 34,
      carryPenalty: 0.1,
      goalPreset: "max_sales",
    },
    legs: [],
  },
  {
    id: "01J9Z8QALTEINDHOVENACHT01",
    label: "Eindhoven · Achtse Barrier",
    deltaVsChosen: "~31 convos · longer ride · score 84",
    score: {
      expectedConversations: 31,
      expectedRevenueEur: 134,
      walkMinutes: 225,
      transitMinutes: 48,
      carryPenalty: 0.15,
      goalPreset: "max_sales",
    },
    legs: [],
  },
];

export const mockPlan: Plan = {
  id: "01J9Z8QPLANTILBURG0000001",
  orgId: "01J9Z8QORGDEMO000000001",
  repId: "01J9Z8QREPDEMO000000001",
  campaignId: "01J9Z8QCAMPAIGNDEMO00001",
  goalPreset,
  compiledAt: "2026-07-18T11:58:00+02:00",
  planVersion: 1,
  validUntil: "2026-07-18T19:00:00+02:00",
  score: {
    expectedConversations: 34,
    expectedRevenueEur: 152,
    walkMinutes: 260,
    transitMinutes: 61,
    carryPenalty: 0,
    goalPreset,
  },
  legs: planLegs,
  alternatives,
  explanation: [
    "84% terraced housing (you avoid apartments), middle-income fit, and your history here converts 1.7× your average.",
    "Loops run west→east so you finish 14 min from the station — no backtracking, and the gym holds your bag the whole day.",
  ],
  daypackStatus: "ready",
};

/** Bold lead-in phrase of the "Why this plan" explainer paragraph — the rest
 *  of the sentence lives in `mockPlan.explanation[0]`. */
export const planWhyLeadIn = "Groenewoud beats Breda-Noord today:";

export const compiledPlanStats = {
  doors: 210,
  convos: 34,
  sales: 6,
  km: 9.8,
};

export interface PlanLegRow {
  time: string;
  icon: string;
  text: string;
}

/** Display copy for the Plan screen's "Compiled plan" card — one row per
 *  `mockPlan.legs` entry (same order/count), carrying the exact prototype
 *  wording that the typed PlanLeg fields alone don't encode (durations,
 *  change counts, locker status). */
export const planLegRows: PlanLegRow[] = [
  { time: "12:04", icon: "🚶", text: "Walk to Den Bosch Centraal · 11 min" },
  { time: "12:19", icon: "🚆", text: "Sprinter → Tilburg · 27 min, 0 changes" },
  { time: "12:46", icon: "🏋️", text: "Basic-Fit Spoorlaan · lockers free · bag drop" },
  { time: "13:05", icon: "🚪", text: "Loop A · Groenewoud-West · 62 doors" },
  { time: "14:25", icon: "🚪", text: "Loop B · Groenewoud-Oost · 58 doors" },
  { time: "15:40", icon: "☕", text: "Coffee · Anne&Max · on route" },
  { time: "16:00", icon: "🚪", text: "Loop C · Stappegoor-Noord · 54 doors" },
  { time: "17:45", icon: "🚆", text: "Bag pickup → IC 18:02 · home 18:29" },
];

/* ============ Today screen ============ */

export interface TodayLegRow {
  time: string;
  icon: string;
  text: string;
  status: "done" | "now" | "upcoming";
}

/** Presentational route-progress rows for Today's card — mirrors the plan_leg
 *  sequence (docs/05 §5) but condensed for a mid-stride glance; the canonical
 *  data lives in `mockPlan.legs` above. */
export const todayRouteLegs: TodayLegRow[] = [
  { time: "12:19", icon: "🚆", text: "Sprinter Den Bosch → Tilburg", status: "done" },
  { time: "12:46", icon: "🏋️", text: "Basic-Fit Spoorlaan — bag in locker", status: "done" },
  { time: "13:05", icon: "🚪", text: "Loop A · Groenewoud-West · 62 doors", status: "done" },
  { time: "14:25", icon: "🚪", text: "Loop B · Groenewoud-Oost · 58 doors", status: "now" },
  { time: "15:40", icon: "☕", text: "Coffee · Anne&Max, 6 min ahead", status: "upcoming" },
  { time: "16:00", icon: "🚪", text: "Loop C · Stappegoor-Noord · 54 doors", status: "upcoming" },
  { time: "17:45", icon: "🚆", text: "Bag pickup → IC 18:02 home", status: "upcoming" },
];

export const todayRouteLegsDone = 3;
export const todayRouteLegsTotal = 7;

export interface DayStats {
  doors: number;
  convos: number;
  sales: number;
  earn: number;
  steps: number;
  km: number;
}

export const initialDayStats: DayStats = {
  doors: 87,
  convos: 14,
  sales: 4,
  earn: 152,
  steps: 9418,
  km: 7.2,
};

export const earnSparkPoints = "0,14 12,12 24,12 33,8 45,8 56,4 66,4 72,2";

export const weather = {
  temp: 21,
  condition: "Partly cloudy",
  wind: "Wind SW 3",
  rainInMin: 52,
};

export const workHoursToday = {
  label: "Workday 12:00 – 18:00",
  elapsed: "2h 38m in",
  remaining: "3h 22m left",
  fillPct: 44,
};

export const trainCard = {
  headline: "IC 18:02 → Den Bosch",
  platform: "Platform 2",
  status: "ON TIME",
  note: "walk 14 min + bag pickup",
  countdown: "3:07",
  countdownLabel: "until leave-by",
};

export const clockNow = "14:38";
export const locationBreadcrumb = "Tilburg · Groenewoud";
export const todayDateLabel = "Tue 18 Jul";

/* ============ Route screen ============ */

export const nextStreet = {
  progressPct: 60,
  name: "Meidoornstraat — even side",
  meta: "23 doors · high EV · then left into Lijsterbeslaan",
};

export interface StreetQueueRow {
  n: string;
  label: string;
  evPct?: number;
  doors?: number;
  skipped?: boolean;
  skipReason?: string;
}

export const streetQueue: StreetQueueRow[] = [
  { n: "1", label: "Meidoornstraat (even)", evPct: 86, doors: 23 },
  { n: "2", label: "Lijsterbeslaan (both)", evPct: 71, doors: 31 },
  { n: "3", label: "Esdoornstraat (odd)", evPct: 64, doors: 17 },
  { n: "✕", label: "Beethovenlaan — skipped: 78% apartments", skipped: true },
];

export const trainNudge = {
  title: "🚆 IC 18:02 → leave by 17:45",
  body: "Walk 14 min + bag pickup. You have margin: 43 doors left fit.",
  act: "OK",
  warn: false,
};

export const rainNudge = {
  title: "☂ Rain starts in 22 min",
  body: "Zuid loop first keeps you dry — saves 9 wet minutes.",
  act: "Re-plan",
  warn: true,
};

/* ============ Log screen ============ */

export interface OutcomeButtonConfig {
  outcome: VisitOutcome;
  label: string;
  key: string;
  colorVar: string;
  size: "h72" | "h60" | "h52";
  sub?: string;
  fullWidth?: boolean;
}

export const outcomeButtons: OutcomeButtonConfig[] = [
  { outcome: "no_answer", label: "No answer", key: "🚪", colorVar: "--noans", size: "h72", sub: "~62%", fullWidth: true },
  { outcome: "conversation", label: "Conversation", key: "💬", colorVar: "--convo", size: "h60", fullWidth: true },
  { outcome: "sale", label: "Sale", key: "✓", colorVar: "--sale", size: "h60", sub: "+€38", fullWidth: true },
  { outcome: "not_interested", label: "Not interested", key: "", colorVar: "--notint", size: "h52" },
  { outcome: "follow_up", label: "Follow-up", key: "", colorVar: "--fup", size: "h52" },
  { outcome: "do_not_knock", label: "Do not knock", key: "", colorVar: "--dnk", size: "h52" },
  { outcome: "inaccessible", label: "Inaccessible", key: "", colorVar: "--inacc", size: "h52" },
];

export const SALE_VALUE_EUR = 38;

export const logStreet = {
  name: "Meidoornstraat",
  meta: "Terraced · built 1978 · label C",
  doorTotal: 23,
  initialHouseNo: 42,
  initialDoorIdx: 8,
};

/* ============ Stats screen ============ */

export interface TimelineRow {
  time: string;
  text: string;
  dots?: number;
}

export const timeline: TimelineRow[] = [
  { time: "12:19", text: "Sprinter to Tilburg — planned train caught" },
  { time: "13:05", text: "Loop A start · first sale at 13:22", dots: 1 },
  { time: "14:25", text: "Loop B · pace +9 doors vs plan" },
  { time: "14:31", text: "2 sales in Wilgenstraat", dots: 2 },
];

export interface NeighborhoodRow {
  loop: string;
  doorsPerHour: number;
  convPct: number;
  eur: number;
}

export const neighborhoodStats: NeighborhoodRow[] = [
  { loop: "A · Groenewoud-W", doorsPerHour: 44, convPct: 17, eur: 76 },
  { loop: "B · Groenewoud-O", doorsPerHour: 51, convPct: 15, eur: 76 },
];

export interface CoachTip {
  /** Bold lead-in phrase, if any — rest of the sentence follows unbolded. */
  bold?: string;
  text: string;
}

export const coachTips: CoachTip[] = [
  {
    bold: "Your 13:00–14:00 hour converts 2.1×",
    text: "your late-afternoon — start 30 min earlier when you can.",
  },
  { text: "4 minutes lost re-crossing Ringbaan — accept the suggested crossing next time." },
  { text: "Follow-ups from last Tuesday are 400 m from Loop C — 3 warm doors added." },
];

export const streak = {
  days: 6,
  personalBest: 11,
  weekRank: 3,
};

export interface RecordCard {
  value: string;
  label: string;
}

export const records: RecordCard[] = [
  { value: "21", label: "Best doors in one hour" },
  { value: "23%", label: "Best conversion day" },
  { value: "€41/h", label: "Record rate · Tilburg" },
  { value: "4.1", label: "km per sale (lower = better)" },
];
