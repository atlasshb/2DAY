"use client";

/**
 * The app-side driver for @2day/core's on-device field brain.
 *
 * `useFieldBrain()` holds `FieldBrainState` in a ref and, on a short tick,
 * evaluates the REAL 15-rule catalog via `nextNudge(defaultRules(), ...)`.
 * Arbitration — per-rule cooldowns, the ≤1-nudge/2-min global gate, and the
 * safety/deadline bypass — all flow through core; nothing is reimplemented here.
 *
 * The signals come from a scripted demo `SignalsProvider` that reproduces
 * TODAY'S exact demo behavior: a rain nudge ~5s after load and a train nudge
 * ~2.6s after the Route tab is first entered. The core rule *templates* phrase
 * things slightly differently from the demo's copy, so — per the brief — we do
 * NOT touch the engine or the visible strings: we tune the signal values so the
 * intended rule fires, then map the fired ruleId to the demo's exact copy.
 */
import { useEffect, useRef } from "react";
import {
  defaultRules,
  initialState,
  nextNudge,
  type FieldBrainState,
  type Rule,
  type Signals,
} from "@2day/core";
import { useStore, type NudgeState } from "@/lib/store";
import { rainNudge, trainNudge } from "@/lib/mock";

const TICK_MS = 300;
const RAIN_AFTER_LOAD_MS = 5_000; // prototype's 5s rain nudge
const TRAIN_AFTER_ARM_MS = 2_600; // prototype's 2.6s train nudge on Route entry

/**
 * Copy table keyed by the core ruleId. The engine only decides *which* ruleId
 * surfaces; the banner renders this copy (title/body/action) so it stays
 * byte-identical to the demo. `warn` is the per-rule amber accent (on for the
 * rain deadline, off for the train heads-up); the engine's `priority` is also
 * surfaced onto the dispatched NudgeState.
 */
const NUDGE_COPY: Record<string, NudgeState> = {
  rain_before_loop: { kind: "rain", ...rainNudge },
  catch_train: { kind: "train", ...trainNudge },
};

/** Baseline signal snapshot that fires no rule — the quiet state the demo idles in. */
function baselineSignals(): Signals {
  return {
    plannedDoorsPerHour: 40,
    actualDoorsPerHour: 40,
    paceWindowMin: 0, // < 15 ⇒ pace_behind / pace_ahead can't fire
    remainingDoors: 40,
    remainingEv: 20,
    batteryPct: 82, // > 15 ⇒ battery_budget can't fire
    trackingOn: true,
    canvassLegsRemaining: 3,
  };
}

/** The mutable script the demo SignalsProvider advances over wall-clock time. */
interface DemoScript {
  loadedAt: number;
  trainArmedAt: number | null;
  rainFired: boolean;
  trainFired: boolean;
}

/**
 * The scripted demo SignalsProvider: given `now` and the script, return the
 * `Signals` snapshot the rules should see. It only flips triggers on at the
 * scripted times — the engine decides everything else.
 */
function scriptedSignals(now: number, script: DemoScript): Signals {
  const s = baselineSignals();

  // Rain nudge ~5s after app load → rain_before_loop (deadline tier).
  // rainStartsInMin 22 keeps the engine's own "Rain in 22 min" template aligned
  // with the demo's "Rain starts in 22 min" (the banner shows the demo copy).
  if (!script.rainFired && now - script.loadedAt >= RAIN_AFTER_LOAD_MS) {
    s.rainStartsInMin = 22; // ≤ rainLeadMin (25)
    s.rainIntensityMmH = 1.0; // ≥ rainMinMmH (0.5)
    s.dryLoopReorderAvailable = true;
    s.loopLabel = "Zuid";
  }

  // Train nudge ~2.6s after Route-tab entry → catch_train (safety tier).
  // slack = minutesToDepart − walk − platformBuffer = 14 − 14 − 3 = −3 ≤ 0.
  if (
    !script.trainFired &&
    script.trainArmedAt != null &&
    now - script.trainArmedAt >= TRAIN_AFTER_ARM_MS
  ) {
    s.transit = {
      routeShortName: "IC 18:02",
      departureAt: now + 14 * 60_000,
      walkMinutesToStop: 14,
      realtimeState: "on_time",
    };
  }

  return s;
}

/**
 * Mount once (in AppShell). Ticks the field brain, dispatches whatever nudge
 * core returns to the store. Returns nothing — it's a driver, not a value.
 */
export function useFieldBrain(): void {
  const { pushNudge, trainArmed } = useStore();

  const stateRef = useRef<FieldBrainState>(initialState());
  const rulesRef = useRef<Rule[]>(defaultRules());
  const scriptRef = useRef<DemoScript>({
    loadedAt: Date.now(),
    trainArmedAt: null,
    rainFired: false,
    trainFired: false,
  });
  const pushRef = useRef(pushNudge);
  pushRef.current = pushNudge;

  // Record when the Route tab first armed the train nudge.
  useEffect(() => {
    if (trainArmed && scriptRef.current.trainArmedAt == null) {
      scriptRef.current.trainArmedAt = Date.now();
    }
  }, [trainArmed]);

  useEffect(() => {
    const id = window.setInterval(() => {
      const now = Date.now();
      const signals = scriptedSignals(now, scriptRef.current);
      const { nudge, state } = nextNudge(rulesRef.current, signals, stateRef.current, now);
      stateRef.current = state;
      if (!nudge) return;

      // Retract the scripted trigger so a fired demo nudge doesn't repeat
      // (catch_train has a 0s per-rule cooldown and would otherwise re-fire).
      if (nudge.ruleId === "rain_before_loop") scriptRef.current.rainFired = true;
      if (nudge.ruleId === "catch_train") scriptRef.current.trainFired = true;

      const copy = NUDGE_COPY[nudge.ruleId];
      if (!copy) return; // a rule outside the demo script fired — ignore in the demo
      pushRef.current({ ...copy, priority: nudge.priority });
    }, TICK_MS);
    return () => window.clearInterval(id);
  }, []);
}
