"use client";

/**
 * Small cross-screen React context — mode (night/sun), the live day-stats
 * mutated by Log taps (with 5s undo), the address scrubber position, the
 * accepted-plan flag, and the nudge banner. No external state library.
 */
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { ConversationAnalysis, NudgePriority, VisitEvent, VisitOutcome } from "@2day/core";
import {
  initialDayStats,
  logStreet,
  SALE_VALUE_EUR,
  type DayStats,
} from "./mock";
import { useDemoMode } from "./dayProfile";
import { enqueueVisit } from "./offline/outbox";
import { ulid } from "./planRequest";

// Stable, on-device-only identity for real (non-demo) visit events. Never
// synced anywhere (no server to dedupe against in this repo — see doc 15),
// so a fresh id per app load is fine; it just needs to be a well-formed ULID
// for `visitEvent` schema validation in `enqueueVisit`.
const LOCAL_ORG_ID = ulid();
const LOCAL_REP_ID = ulid();
const LOCAL_CAMPAIGN_ID = ulid();

export type Mode = "night" | "sun";

interface LastAction {
  outcome: VisitOutcome;
  label: string;
  houseNo: number;
  doorIdx: number;
}

export interface NudgeState {
  kind: "rain" | "train";
  title: string;
  body: string;
  act: string;
  /** Amber caution accent — per-rule styling carried in the nudge copy table. */
  warn: boolean;
  /** The originating core rule's priority tier, surfaced from nextNudge(). */
  priority?: NudgePriority;
}

interface AddrState {
  street: string;
  houseNo: number;
  doorIdx: number;
  total: number;
  meta: string;
}

interface StoreValue {
  mode: Mode;
  toggleMode: () => void;

  dayStats: DayStats;
  logOutcome: (outcome: VisitOutcome, label: string) => void;
  undoLast: () => void;

  addr: AddrState;
  goPrevDoor: () => void;
  goNextDoor: () => void;

  snackbarText: string | null;
  snackbarShow: boolean;
  dismissSnackbar: () => void;

  planAccepted: boolean;
  acceptPlan: () => void;

  nudge: NudgeState | null;
  nudgeShow: boolean;
  /** Surface an engine-produced nudge (called by the field brain, lib/nudges.ts). */
  pushNudge: (nudge: NudgeState) => void;
  dismissNudge: () => void;
  requestTrainNudge: () => void;
  /** True once the Route tab has been entered — arms the train nudge trigger. */
  trainArmed: boolean;

  rainReplanned: boolean;

  /** Doorstep conversation-recording flow (components/coach/**) — true
   *  while the record sheet is open or a session is actively capturing. */
  recording: boolean;
  setRecording: (active: boolean) => void;
  /** Most recent ConversationAnalysis, kept around so the analysis card can
   *  re-render across store updates until it's logged or dismissed. */
  lastAnalysis: ConversationAnalysis | null;
  setLastAnalysis: (analysis: ConversationAnalysis | null) => void;
}

const StoreContext = createContext<StoreValue | null>(null);

const NUDGE_AUTO_DISMISS_MS = 9000;
const SNACKBAR_AUTO_DISMISS_MS = 5000;

function addrMeta(doorIdx: number, total: number): string {
  return `${logStreet.meta} · door ${doorIdx} of ${total}`;
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const demoMode = useDemoMode();
  const [mode, setMode] = useState<Mode>("night");
  const [dayStats, setDayStats] = useState<DayStats>(initialDayStats);
  const [planAccepted, setPlanAccepted] = useState(false);
  const [rainReplanned, setRainReplanned] = useState(false);
  const [recording, setRecording] = useState(false);
  const [lastAnalysis, setLastAnalysis] = useState<ConversationAnalysis | null>(null);

  const [houseNo, setHouseNo] = useState(logStreet.initialHouseNo);
  const [doorIdx, setDoorIdx] = useState(logStreet.initialDoorIdx);
  const lastActionRef = useRef<LastAction | null>(null);

  const [snackbarText, setSnackbarText] = useState<string | null>(null);
  const [snackbarShow, setSnackbarShow] = useState(false);
  const snackbarTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [nudge, setNudge] = useState<NudgeState | null>(null);
  const [nudgeShow, setNudgeShow] = useState(false);
  const [trainArmed, setTrainArmed] = useState(false);
  const nudgeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const toggleMode = useCallback(() => {
    setMode((m) => (m === "night" ? "sun" : "night"));
  }, []);

  // Surface an engine-produced nudge. All nudge *scheduling* now lives in the
  // field brain (lib/nudges.ts, driven by @2day/core's nextNudge); the store
  // just holds what's currently shown plus the 9s auto-hide.
  const pushNudge = useCallback((n: NudgeState) => {
    setNudge(n);
    setNudgeShow(true);
    if (nudgeTimer.current) clearTimeout(nudgeTimer.current);
    nudgeTimer.current = setTimeout(() => setNudgeShow(false), NUDGE_AUTO_DISMISS_MS);
  }, []);

  const dismissNudge = useCallback(() => {
    setNudgeShow(false);
    setNudge((current) => {
      if (current?.kind === "rain") setRainReplanned(true);
      return current;
    });
  }, []);

  // Route-tab entry arms the train nudge (once, idempotent). The field brain
  // reads `trainArmed`; ~2.6s later the catch_train rule fires via nextNudge.
  const requestTrainNudge = useCallback(() => {
    setTrainArmed(true);
  }, []);

  const goPrevDoor = useCallback(() => {
    setDoorIdx((idx) => {
      if (idx <= 1) return idx;
      setHouseNo((h) => h - 2);
      return idx - 1;
    });
  }, []);

  const goNextDoor = useCallback(() => {
    setDoorIdx((idx) => {
      if (idx >= logStreet.doorTotal) return idx;
      setHouseNo((h) => h + 2);
      return idx + 1;
    });
  }, []);

  const dismissSnackbar = useCallback(() => {
    setSnackbarShow(false);
    if (snackbarTimer.current) clearTimeout(snackbarTimer.current);
  }, []);

  const logOutcome = useCallback(
    (outcome: VisitOutcome, label: string) => {
      lastActionRef.current = { outcome, label, houseNo, doorIdx };

      setDayStats((s) => ({
        ...s,
        doors: s.doors + 1,
        convos: s.convos + (outcome === "conversation" || outcome === "sale" ? 1 : 0),
        sales: s.sales + (outcome === "sale" ? 1 : 0),
        earn: s.earn + (outcome === "sale" ? SALE_VALUE_EUR : 0),
      }));

      // Real (non-demo) taps are also durably persisted to the append-only
      // visit outbox — the "real logged visits" Today/Stats read from
      // (WIZARD-BRIEF). Demo taps stay purely in-memory so they never
      // pollute real history; this is fire-and-forget, never blocks the tap.
      if (!demoMode) {
        const event: VisitEvent = {
          id: ulid(),
          orgId: LOCAL_ORG_ID,
          repId: LOCAL_REP_ID,
          campaignId: LOCAL_CAMPAIGN_ID,
          outcome,
          at: new Date().toISOString(),
          deviceSeq: 0, // enqueueVisit stamps the real monotonic value
          saleValueEur: outcome === "sale" ? SALE_VALUE_EUR : undefined,
        };
        void enqueueVisit(event);
      }

      if (typeof navigator !== "undefined" && "vibrate" in navigator) {
        navigator.vibrate?.(30);
      }

      setSnackbarText(`${label} — ${logStreet.name} ${houseNo}`);
      setSnackbarShow(true);
      if (snackbarTimer.current) clearTimeout(snackbarTimer.current);
      snackbarTimer.current = setTimeout(() => setSnackbarShow(false), SNACKBAR_AUTO_DISMISS_MS);

      goNextDoor();
    },
    [houseNo, doorIdx, goNextDoor, demoMode],
  );

  const undoLast = useCallback(() => {
    const last = lastActionRef.current;
    if (!last) return;
    setDayStats((s) => ({
      ...s,
      doors: s.doors - 1,
      convos: s.convos - (last.outcome === "conversation" || last.outcome === "sale" ? 1 : 0),
      sales: s.sales - (last.outcome === "sale" ? 1 : 0),
      earn: s.earn - (last.outcome === "sale" ? SALE_VALUE_EUR : 0),
    }));
    setHouseNo(last.houseNo);
    setDoorIdx(last.doorIdx);
    lastActionRef.current = null;
    dismissSnackbar();
  }, [dismissSnackbar]);

  const acceptPlan = useCallback(() => setPlanAccepted(true), []);

  const addr: AddrState = useMemo(
    () => ({
      street: logStreet.name,
      houseNo,
      doorIdx,
      total: logStreet.doorTotal,
      meta: addrMeta(doorIdx, logStreet.doorTotal),
    }),
    [houseNo, doorIdx],
  );

  const value: StoreValue = useMemo(
    () => ({
      mode,
      toggleMode,
      dayStats,
      logOutcome,
      undoLast,
      addr,
      goPrevDoor,
      goNextDoor,
      snackbarText,
      snackbarShow,
      dismissSnackbar,
      planAccepted,
      acceptPlan,
      nudge,
      nudgeShow,
      pushNudge,
      dismissNudge,
      requestTrainNudge,
      trainArmed,
      rainReplanned,
      recording,
      setRecording,
      lastAnalysis,
      setLastAnalysis,
    }),
    [
      mode,
      toggleMode,
      dayStats,
      logOutcome,
      undoLast,
      addr,
      goPrevDoor,
      goNextDoor,
      snackbarText,
      snackbarShow,
      dismissSnackbar,
      planAccepted,
      acceptPlan,
      nudge,
      nudgeShow,
      pushNudge,
      dismissNudge,
      requestTrainNudge,
      trainArmed,
      rainReplanned,
      recording,
      lastAnalysis,
    ],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used within a StoreProvider");
  return ctx;
}
