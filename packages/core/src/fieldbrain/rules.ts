/**
 * The doc-10 §4.1 rule catalog (15 rules), verbatim triggers/cooldowns/templates.
 * Each rule is a pure predicate over `Signals` + a caller clock. Thresholds come from
 * `FieldBrainConfig` (doc 10 §4.1: "All thresholds are config, not code"); the module
 * exports a `defaultRules(config?)` factory that bakes the config into the closures so
 * arbitrate.ts can stay config-free.
 *
 * Priority mapping (doc-10 numeric → 4-tier enum). The interrupting tiers `safety`
 * and `deadline` bypass the global 2-min gate; `opportunity`/`info` are rate-limited:
 *   safety     : catch_train(100), gym_closing(85), do_not_knock_ahead(80)
 *   deadline   : rain_before_loop(90), disruption_reroute(88), train... see below,
 *                daylight_fade(65), pace_behind(55)
 *   opportunity: train_delayed(70), skip_apartment_street(60), high_ev_cluster(45),
 *                weather_window(42), pace_ahead(40)
 *   info       : battery_budget(50), lunch_window(30), street_done(25)
 * (train_delayed reports *good news* — more canvassing time — so it is deliberately a
 * non-interrupting `opportunity`, not a deadline. See the return summary for the note.)
 */
import type {
  FieldBrainConfig,
  Nudge,
  Rule,
  RuleContext,
  Signals,
  StreetEdgeFeatures,
} from "./types.js";
import { defaultConfig } from "./types.js";

const MS_PER_MIN = 60_000;
const DAY_SEC = 86_400;

function roundMin(ms: number): number {
  return Math.max(0, Math.round(ms / MS_PER_MIN));
}

/** Deterministic edge cooldown scope (prefer the stable edge id, fall back to name). */
function edgeKey(edge: StreetEdgeFeatures): string {
  return edge.streetEdgeId ?? edge.streetName;
}

/** HH:MM in the configured tz offset — pure, no Intl/timezone dependency. */
function fmtClock(epochMs: number, tzOffsetMin: number): string {
  const shifted = new Date(epochMs + tzOffsetMin * MS_PER_MIN);
  const hh = String(shifted.getUTCHours()).padStart(2, "0");
  const mm = String(shifted.getUTCMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

/**
 * Leave-for-train slack in minutes (doc 13 §4.1):
 *   slack = (T_train − now) − T_walk − platform_buffer  [− conservative margin if stale]
 * catch_train fires when slack ≤ 0.
 */
export function trainSlackMin(signals: Signals, now: number, cfg: FieldBrainConfig): number | null {
  const t = signals.transit;
  if (!t) return null;
  const buffer = t.platformBufferMin ?? cfg.platformBufferMin;
  const stale = t.timetableStale ? cfg.conservativeMarginMin : 0;
  const minutesToDepart = (t.departureAt - now) / MS_PER_MIN;
  return minutesToDepart - t.walkMinutesToStop - buffer - stale;
}

export function defaultRules(overrides: Partial<FieldBrainConfig> = {}): Rule[] {
  const cfg: FieldBrainConfig = { ...defaultConfig, ...overrides };

  const rules: Rule[] = [
    // 1 — rain_before_loop (prio 90, 20 min)
    {
      id: "rain_before_loop",
      priority: "deadline",
      cooldownSec: 20 * 60,
      evaluate(s: Signals, ctx: RuleContext): Nudge | null {
        if (s.rainStartsInMin == null) return null;
        if (s.rainStartsInMin > cfg.rainLeadMin) return null;
        if ((s.rainIntensityMmH ?? 0) < cfg.rainMinMmH) return null;
        if (!s.dryLoopReorderAvailable) return null;
        const min = Math.round(s.rainStartsInMin);
        const loop = s.loopLabel ?? "dry";
        return {
          id: `rain_before_loop@${ctx.now}`,
          ruleId: "rain_before_loop",
          priority: "deadline",
          title: "Rain incoming",
          body: `Rain in ${min} min — do the ${loop} loop first`,
          action: { kind: "reorder_loop", label: "Reorder loop" },
          deadlineAt: ctx.now + s.rainStartsInMin * MS_PER_MIN,
        };
      },
    },

    // 2 — catch_train (prio 100, safety, cooldown 0)
    {
      id: "catch_train",
      priority: "safety",
      cooldownSec: 0,
      evaluate(s: Signals, ctx: RuleContext): Nudge | null {
        const t = s.transit;
        if (!t || t.cancelled) return null;
        const slack = trainSlackMin(s, ctx.now, cfg);
        if (slack == null || slack > 0) return null;
        const min = roundMin(t.departureAt - ctx.now);
        const walk = Math.round(t.walkMinutesToStop);
        return {
          id: `catch_train@${ctx.now}`,
          ruleId: "catch_train",
          priority: "safety",
          title: "Leave now",
          body: `Train in ${min} min, ${walk} min walk — leave now`,
          action: { kind: "leave_now", label: "Navigate to platform" },
          deadlineAt: t.departureAt,
        };
      },
    },

    // 3 — train_delayed (prio 70, 10 min) — non-interrupting: more canvassing time
    {
      id: "train_delayed",
      priority: "opportunity",
      cooldownSec: 10 * 60,
      evaluate(s: Signals, ctx: RuleContext): Nudge | null {
        const t = s.transit;
        if (!t || t.cancelled) return null;
        if (t.realtimeState !== "delayed") return null;
        const delay = t.delayMin ?? 0;
        if (delay < cfg.trainDelayMinMin) return null;
        return {
          id: `train_delayed@${ctx.now}`,
          ruleId: "train_delayed",
          priority: "opportunity",
          title: "Train delayed",
          body: `Your ${t.routeShortName} is +${delay} min — ${delay} min more canvassing`,
          action: { kind: "acknowledge", label: "Got it" },
        };
      },
    },

    // 4 — skip_apartment_street (prio 60, per-street)
    {
      id: "skip_apartment_street",
      priority: "opportunity",
      cooldownSec: DAY_SEC,
      evaluate(s: Signals, ctx: RuleContext): Nudge | null {
        const e = s.nextEdge;
        if (!e) return null;
        if (e.apartmentSharePct < cfg.apartmentShareMin) return null;
        if (!e.doorAccessLocked) return null;
        const pct = Math.round(e.apartmentSharePct);
        return {
          id: `skip_apartment_street@${ctx.now}`,
          ruleId: "skip_apartment_street",
          priority: "opportunity",
          title: "Skip street",
          body: `Skip ${e.streetName}: ${pct}% apartments, door access locked`,
          action: { kind: "skip_street", label: "Skip it" },
          cooldownKey: `skip_apartment_street:${edgeKey(e)}`,
        };
      },
    },

    // 5 — pace_behind (prio 55, 15 min)
    {
      id: "pace_behind",
      priority: "deadline",
      cooldownSec: 15 * 60,
      evaluate(s: Signals, ctx: RuleContext): Nudge | null {
        if (s.paceWindowMin < cfg.paceWindowMin) return null;
        if (s.plannedDoorsPerHour <= 0) return null;
        if (s.actualDoorsPerHour >= cfg.paceBehindFactor * s.plannedDoorsPerHour) return null;
        const area = s.areaLabel ?? "last";
        const train = s.transit?.routeShortName ?? "your train";
        return {
          id: `pace_behind@${ctx.now}`,
          ruleId: "pace_behind",
          priority: "deadline",
          title: "Behind pace",
          body: `Behind pace — drop the ${area} spur to still catch ${train}`,
          action: { kind: "reroute", label: "Drop spur" },
          deadlineAt: s.transit?.departureAt,
        };
      },
    },

    // 6 — pace_ahead (prio 40, 20 min) — needs daylight/time headroom
    {
      id: "pace_ahead",
      priority: "opportunity",
      cooldownSec: 20 * 60,
      evaluate(s: Signals, ctx: RuleContext): Nudge | null {
        if (s.paceWindowMin < cfg.paceWindowMin) return null;
        if (s.plannedDoorsPerHour <= 0) return null;
        if (s.actualDoorsPerHour <= cfg.paceAheadFactor * s.plannedDoorsPerHour) return null;
        // daylight/time allows
        if (s.sunsetAt != null && ctx.now >= s.sunsetAt) return null;
        const cluster = s.highEvClusterNearby;
        if (!cluster) return null;
        const area = s.areaLabel ?? cluster.streetName;
        return {
          id: `pace_ahead@${ctx.now}`,
          ruleId: "pace_ahead",
          priority: "opportunity",
          title: "Ahead of pace",
          body: `Ahead of pace — ${area} has ${cluster.doorCount} more high-EV doors nearby`,
          action: { kind: "navigate", label: "Add doors" },
        };
      },
    },

    // 7 — high_ev_cluster (prio 45, 15 min)
    {
      id: "high_ev_cluster",
      priority: "opportunity",
      cooldownSec: 15 * 60,
      evaluate(s: Signals, ctx: RuleContext): Nudge | null {
        const c = s.highEvClusterNearby;
        if (!c) return null;
        if (c.distanceM > cfg.highEvRadiusM) return null;
        if (c.evPercentile < cfg.highEvPercentile) return null;
        return {
          id: `high_ev_cluster@${ctx.now}`,
          ruleId: "high_ev_cluster",
          priority: "opportunity",
          title: "Strong doors nearby",
          body: `${c.doorCount} strong doors one street over on ${c.streetName}`,
          action: { kind: "navigate", label: "Show me" },
        };
      },
    },

    // 8 — daylight_fade (prio 65, 30 min)
    {
      id: "daylight_fade",
      priority: "deadline",
      cooldownSec: 30 * 60,
      evaluate(s: Signals, ctx: RuleContext): Nudge | null {
        if (s.sunsetAt == null) return null;
        if (s.canvassLegsRemaining <= 0) return null;
        const minLeft = (s.sunsetAt - ctx.now) / MS_PER_MIN;
        if (minLeft > cfg.daylightFadeMin) return null;
        if (minLeft < 0) return null;
        const area = s.areaLabel ?? "your area";
        return {
          id: `daylight_fade@${ctx.now}`,
          ruleId: "daylight_fade",
          priority: "deadline",
          title: "Daylight fading",
          body: `~${Math.round(minLeft)} min of daylight — last loop is ${area}`,
          action: { kind: "acknowledge", label: "Got it" },
          deadlineAt: s.sunsetAt,
        };
      },
    },

    // 9 — gym_closing (prio 85, safety, 20 min)
    {
      id: "gym_closing",
      priority: "safety",
      cooldownSec: 20 * 60,
      evaluate(s: Signals, ctx: RuleContext): Nudge | null {
        const bag = s.bagAtGym;
        if (!bag || bag.pickupStarted) return null;
        const minLeft = (bag.closesAt - ctx.now) / MS_PER_MIN;
        if (minLeft > cfg.gymClosingMin) return null;
        return {
          id: `gym_closing@${ctx.now}`,
          ruleId: "gym_closing",
          priority: "safety",
          title: "Grab your bag",
          body: `Basic-Fit ${bag.gymName} closes in ${Math.max(0, Math.round(minLeft))} min — grab your bag`,
          action: { kind: "grab_bag", label: "Route to gym" },
          deadlineAt: bag.closesAt,
        };
      },
    },

    // 10 — battery_budget (prio 50, 30 min)
    {
      id: "battery_budget",
      priority: "info",
      cooldownSec: 30 * 60,
      evaluate(s: Signals, ctx: RuleContext): Nudge | null {
        if (!s.trackingOn) return null;
        if (s.batteryPct > cfg.batteryPctMin) return null;
        return {
          id: `battery_budget@${ctx.now}`,
          ruleId: "battery_budget",
          priority: "info",
          title: "Low battery",
          body: `Battery ${Math.round(s.batteryPct)}% — switching to low-power tracking`,
          action: { kind: "low_power", label: "OK" },
        };
      },
    },

    // 11 — do_not_knock_ahead (prio 80, safety, per-address)
    {
      id: "do_not_knock_ahead",
      priority: "safety",
      cooldownSec: DAY_SEC,
      evaluate(s: Signals, ctx: RuleContext): Nudge | null {
        const e = s.nextEdge;
        if (!e || e.doNotKnockCount <= 0) return null;
        return {
          id: `do_not_knock_ahead@${ctx.now}`,
          ruleId: "do_not_knock_ahead",
          priority: "safety",
          title: "Do-not-knock ahead",
          body: `${e.doNotKnockCount} do-not-knock on ${e.streetName} — skipped for you`,
          action: { kind: "acknowledge", label: "Understood" },
          cooldownKey: `do_not_knock_ahead:${edgeKey(e)}`,
        };
      },
    },

    // 12 — weather_window (prio 42, 20 min)
    {
      id: "weather_window",
      priority: "opportunity",
      cooldownSec: 20 * 60,
      evaluate(s: Signals, ctx: RuleContext): Nudge | null {
        if (s.dryGapMin == null || s.dryGapUntil == null) return null;
        if (s.dryGapMin < cfg.weatherWindowMin) return null;
        const area = s.areaLabel ?? "your area";
        return {
          id: `weather_window@${ctx.now}`,
          ruleId: "weather_window",
          priority: "opportunity",
          title: "Dry window",
          body: `Dry until ${fmtClock(s.dryGapUntil, cfg.tzOffsetMin)} — good window for ${area}`,
          action: { kind: "acknowledge", label: "Nice" },
          deadlineAt: s.dryGapUntil,
        };
      },
    },

    // 13 — disruption_reroute (prio 88, 5 min)
    {
      id: "disruption_reroute",
      priority: "deadline",
      cooldownSec: 5 * 60,
      evaluate(s: Signals, ctx: RuleContext): Nudge | null {
        const t = s.transit;
        if (!t || !t.cancelled || !t.altItineraryVia) return null;
        return {
          id: `disruption_reroute@${ctx.now}`,
          ruleId: "disruption_reroute",
          priority: "deadline",
          title: "Line cancelled",
          body: `${t.routeShortName} cancelled — new route home via ${t.altItineraryVia}`,
          action: { kind: "reroute", label: "Take new route" },
          deadlineAt: t.departureAt,
        };
      },
    },

    // 14 — lunch_window (prio 30, once/day)
    {
      id: "lunch_window",
      priority: "info",
      cooldownSec: DAY_SEC,
      evaluate(s: Signals, ctx: RuleContext): Nudge | null {
        const lw = s.lunchWindow;
        if (!lw || !lw.open || lw.breakTaken) return null;
        if (lw.nearestPoiWalkMin > cfg.lunchPoiWalkMin) return null;
        return {
          id: `lunch_window@${ctx.now}`,
          ruleId: "lunch_window",
          priority: "info",
          title: "Lunch time",
          body: `Coffee ${Math.max(0, Math.round(lw.nearestPoiWalkMin))} min away — good time for lunch`,
          action: { kind: "take_break", label: "Take a break" },
        };
      },
    },

    // 15 — street_done (prio 25, per-street)
    {
      id: "street_done",
      priority: "info",
      cooldownSec: DAY_SEC,
      evaluate(s: Signals, ctx: RuleContext): Nudge | null {
        const cur = s.currentEdge;
        if (!cur || cur.doorsTotal <= 0) return null;
        if (cur.doorsLogged < cur.doorsTotal) return null;
        const next = s.nextEdge?.streetName ?? "the next street";
        return {
          id: `street_done@${ctx.now}`,
          ruleId: "street_done",
          priority: "info",
          title: "Street done",
          body: `${cur.streetName} done — next up ${next}`,
          action: { kind: "acknowledge", label: "Next" },
          cooldownKey: `street_done:${edgeKey(cur)}`,
        };
      },
    },
  ];

  return rules;
}

/** The catalog under default thresholds. */
export const RULE_IDS = [
  "rain_before_loop",
  "catch_train",
  "train_delayed",
  "skip_apartment_street",
  "pace_behind",
  "pace_ahead",
  "high_ev_cluster",
  "daylight_fade",
  "gym_closing",
  "battery_budget",
  "do_not_knock_ahead",
  "weather_window",
  "disruption_reroute",
  "lunch_window",
  "street_done",
] as const;
