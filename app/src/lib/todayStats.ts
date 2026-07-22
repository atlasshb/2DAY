"use client";

/**
 * Real (non-demo) day stats — doors/convos/sales/earned from the actual
 * visit outbox, km walked from the actual Day Trail. WIZARD-BRIEF: "Today
 * ... render from the real dayProfile + real logged visits + real trail;
 * empty states are honest instead of fixture numbers." No steps counter —
 * there's no pedometer/step-count source on-device, so it's omitted rather
 * than invented (unlike km, which the Trail actually measures).
 */
import { db } from "./offline/db";
import { getTrailPointsForDay } from "./tracer";
import { haversineMeters } from "./geoMath";
import { useLiveQuery } from "./offline/useLiveQuery";
import { localDateKey } from "./dayProfile";

export interface RealDayStats {
  doors: number;
  convos: number;
  sales: number;
  earn: number;
  kmWalked: number;
}

const EMPTY_STATS: RealDayStats = { doors: 0, convos: 0, sales: 0, earn: 0, kmWalked: 0 };

export async function computeRealDayStats(day: string): Promise<RealDayStats> {
  const [rows, points] = await Promise.all([db.visitOutbox.toArray(), getTrailPointsForDay(day)]);
  const todays = rows.filter((r) => localDateKey(r.event.at) === day);

  let doors = 0;
  let convos = 0;
  let sales = 0;
  let earn = 0;
  for (const row of todays) {
    doors += 1;
    if (row.event.outcome === "conversation" || row.event.outcome === "sale") convos += 1;
    if (row.event.outcome === "sale") {
      sales += 1;
      earn += row.event.saleValueEur ?? 0;
    }
  }

  let meters = 0;
  for (let i = 1; i < points.length; i++) {
    meters += haversineMeters(
      { lat: points[i - 1]!.lat, lng: points[i - 1]!.lon },
      { lat: points[i]!.lat, lng: points[i]!.lon },
    );
  }

  return { doors, convos, sales, earn, kmWalked: Math.round((meters / 1000) * 10) / 10 };
}

/** Reactive read of today's real stats (re-runs whenever visitOutbox or
 *  trailPoints change — liveQuery tracks the tables it touched). */
export function useRealDayStats(day: string): RealDayStats {
  return useLiveQuery<RealDayStats>(() => computeRealDayStats(day), [day], EMPTY_STATS);
}
