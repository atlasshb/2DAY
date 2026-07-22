"use client";

/**
 * Foreground GPS breadcrumb trail — TRAIL-BRIEF §1-2. Wraps
 * `navigator.geolocation.watchPosition`; records a point when the rep has
 * moved >= 15 m (haversine) OR >= 60 s have passed since the last point,
 * whichever comes first. Persisted to Dexie's append-only `trailPoints`
 * table, keyed by calendar day.
 *
 * Privacy: on-device only (Dexie/IndexedDB), never synced, never sent — see
 * `offline/db.ts`'s v2 note and the "Trail stays on this phone" microcopy in
 * the Route tab.
 *
 * Background tracking (app closed) is explicitly out of scope — V2/native-shell
 * per docs/04-feature-prioritization.md:86. This module only ever tracks while
 * the tab/PWA is open and this code is running.
 */
import { db, type TrailPointRow } from "./offline/db";
import { haversineMeters } from "./geoMath";
import { todayKey } from "./dayProfile";

const MIN_MOVE_M = 15;
const MIN_INTERVAL_MS = 60_000;
const WATCH_OPTIONS: PositionOptions = { enableHighAccuracy: false, maximumAge: 15_000 };

export type TracerStatus = "off" | "tracking" | "denied" | "unsupported";

export interface TracerState {
  status: TracerStatus;
  /** Points recorded since the current tracking session started (resets each Start). */
  pointCount: number;
  startedAt: number | null; // epoch ms
}

type Listener = (state: TracerState) => void;

let watchId: number | null = null;
let lastPoint: { lat: number; lon: number; ts: number } | null = null;
let state: TracerState = { status: "off", pointCount: 0, startedAt: null };
const listeners = new Set<Listener>();

function setState(patch: Partial<TracerState>): void {
  state = { ...state, ...patch };
  listeners.forEach((l) => l(state));
}

/** Current tracer state (for reading outside React, e.g. the GPS status chip). */
export function getTracerState(): TracerState {
  return state;
}

/** Subscribe to tracer state changes; returns an unsubscribe function. */
export function subscribeTracer(listener: Listener): () => void {
  listeners.add(listener);
  listener(state);
  return () => {
    listeners.delete(listener);
  };
}

async function recordPoint(lat: number, lon: number, accuracy: number): Promise<void> {
  const ts = new Date().toISOString();
  const row: TrailPointRow = { day: todayKey(), lat, lon, accuracy, ts };
  await db.trailPoints.add(row);
  lastPoint = { lat, lon, ts: Date.now() };
  setState({ pointCount: state.pointCount + 1 });
}

function handlePosition(pos: GeolocationPosition): void {
  const { latitude: lat, longitude: lon, accuracy } = pos.coords;
  if (!lastPoint) {
    // Always seed the trail with the first fix — there's nothing to compare against yet.
    void recordPoint(lat, lon, accuracy);
    return;
  }
  const movedM = haversineMeters({ lat: lastPoint.lat, lng: lastPoint.lon }, { lat, lng: lon });
  const elapsedMs = Date.now() - lastPoint.ts;
  if (movedM >= MIN_MOVE_M || elapsedMs >= MIN_INTERVAL_MS) {
    void recordPoint(lat, lon, accuracy);
  }
}

/** Starts (or no-ops if already tracking) foreground trail recording. Never
 *  throws: an unsupported browser or a denied permission surfaces as a
 *  friendly status, not an exception, so the Route tab can show an inline
 *  hint instead of crashing. */
export function startTrail(): { ok: boolean; reason?: string } {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    setState({ status: "unsupported" });
    return { ok: false, reason: "Geolocation isn't available on this device." };
  }
  if (watchId != null) return { ok: true }; // already tracking

  lastPoint = null;
  setState({ status: "tracking", startedAt: Date.now(), pointCount: 0 });
  watchId = navigator.geolocation.watchPosition(
    handlePosition,
    (err) => {
      // Only a real permission revocation is fatal. POSITION_UNAVAILABLE and
      // TIMEOUT are transient (a momentary lost fix indoors, or — in the
      // browser's geolocation-override machinery — a spurious blip that can
      // precede a same-tick position update) — watchPosition keeps calling
      // back on its own, so tracking just carries on.
      if (err.code === err.PERMISSION_DENIED) {
        if (watchId != null) {
          navigator.geolocation.clearWatch(watchId);
          watchId = null;
        }
        setState({ status: "denied", startedAt: null });
      }
    },
    WATCH_OPTIONS,
  );
  return { ok: true };
}

export function stopTrail(): void {
  if (watchId != null) {
    navigator.geolocation.clearWatch(watchId);
    watchId = null;
  }
  setState({ status: "off", startedAt: null });
}

export function isTracking(): boolean {
  return state.status === "tracking";
}

/** All of today's recorded points, oldest first — the source for the
 *  auto-fit SVG panel and the retrace list (independent of whether tracking
 *  is currently on; covers points from earlier sessions today too). */
export async function getTrailPointsForDay(day: string): Promise<TrailPointRow[]> {
  return db.trailPoints.where("day").equals(day).sortBy("ts");
}
