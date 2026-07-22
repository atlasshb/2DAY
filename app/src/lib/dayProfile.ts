"use client";

/**
 * Day Setup wizard domain shape + Dexie-backed persistence — WIZARD-BRIEF.
 * Every answer lives on-device only (`dayProfile`, one row per calendar day)
 * plus a small cross-day `settings` table for the prefs that should carry
 * over (bag default, prayer method/madhab/combine, demo mode). Nothing here
 * is ever synced — see `offline/db.ts`'s v2 note.
 */
import type { AsrMadhab, Plan, PrayerCalcMethod } from "@2day/core";
import { db, type DayProfileRow } from "./offline/db";
import { useLiveQuery } from "./offline/useLiveQuery";

/** A place the wizard collected: either live GPS, a geocoded/typed label, or
 *  explicitly skipped (offline, no coordinates — "we'll plan without them"). */
export interface WizardPlace {
  source: "gps" | "geocoded" | "manual";
  lat?: number;
  lng?: number;
  label: string;
}

export interface WizardMosque {
  name: string;
  lat?: number;
  lng?: number;
  distanceM?: number;
  manual: boolean; // true = "I know a place", not an Overpass pick
}

export interface PrayerPlan {
  enabled: boolean;
  method: PrayerCalcMethod;
  asrMadhab: AsrMadhab;
  combineDhuhrAsr: boolean;
  combineMaghribIsha: boolean;
  mosque?: WizardMosque;
}

export interface DayProfile {
  location: WizardPlace; // "where you are" (step 1)
  workArea: WizardPlace; // "where you plan to work today" (step 2)
  hours: { startAt: string; endAt: string }; // ISODateTime (step 3)
  bag: boolean; // step 4
  locker: boolean; // step 4b
  prayerPlan: PrayerPlan; // step 5
  createdAt: string;
  /** Set once the rep hits "Accept" on a compiled Plan tab result (real
   *  mode) — lets Today/Route/Stats read the day's actual legs without
   *  recomputing them. */
  plan?: Plan;
}

/** Persists the compiled+accepted plan onto today's profile so other tabs can read it. */
export async function attachPlanToDayProfile(date: string, plan: Plan): Promise<void> {
  const existing = await db.dayProfile.get(date);
  if (!existing) return;
  await db.dayProfile.put({ ...existing, plan });
}

/** "YYYY-MM-DD" for the device's local calendar day — the dayProfile/trail key. */
export function todayKey(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Same "YYYY-MM-DD" local-day key, but for an arbitrary ISODateTime instead
 *  of "now" — visit events are stamped with `new Date().toISOString()`
 *  (UTC), so a naive string-prefix match against the local day key would
 *  miscount visits logged in the small hours (UTC and local calendar days
 *  disagree there for any positive-offset timezone). Always convert to
 *  local calendar fields first. */
export function localDateKey(iso: string): string {
  return todayKey(new Date(iso));
}

export async function getDayProfile(date: string): Promise<DayProfileRow | undefined> {
  return db.dayProfile.get(date);
}

export async function saveDayProfile(date: string, profile: DayProfile): Promise<void> {
  await db.dayProfile.put({ date, ...profile });
}

/** Reactive read of a day's profile. `undefined` while loading, `null` once
 *  loaded with no profile for that day (so callers can tell "still loading"
 *  from "confirmed no wizard run yet"). */
export function useDayProfile(date: string): DayProfileRow | undefined | null {
  return useLiveQuery<DayProfileRow | undefined | null>(
    () => db.dayProfile.get(date).then((row) => row ?? null),
    [date],
    undefined,
  );
}

/* ============ Cross-day settings ============ */

export const SETTINGS_KEYS = {
  demoMode: "demoMode",
  bagDefault: "bagDefault",
  lockerDefault: "lockerDefault",
  prayerEnabledDefault: "prayerEnabledDefault",
  prayerMethod: "prayerMethod",
  asrMadhab: "asrMadhab",
  combineDhuhrAsr: "combineDhuhrAsr",
  combineMaghribIsha: "combineMaghribIsha",
  lastWorkHours: "lastWorkHours",
} as const;

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const row = await db.settings.get(key);
  return row ? (row.value as T) : fallback;
}

export async function setSetting<T>(key: string, value: T): Promise<void> {
  await db.settings.put({ key, value });
}

/** Reactive read of one settings key. */
export function useSetting<T>(key: string, fallback: T): T {
  return useLiveQuery<T>(() => getSetting(key, fallback), [key], fallback);
}

/** Demo mode: fixture data on every tab, only ever turned on by an explicit
 *  "Try the demo" tap (WIZARD-BRIEF: "reachable only by explicit choice"). */
export function useDemoMode(): boolean {
  return useSetting<boolean>(SETTINGS_KEYS.demoMode, false);
}

export async function setDemoMode(active: boolean): Promise<void> {
  await setSetting(SETTINGS_KEYS.demoMode, active);
}
