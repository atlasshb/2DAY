"use client";

/**
 * Real (non-demo) Stats tab — WIZARD-BRIEF: "empty states are honest
 * instead of fixture numbers." The per-neighborhood table, coach tips, and
 * streak/records all need days of history this fresh install doesn't have
 * yet, so they say so plainly rather than showing invented figures. The
 * Timeline is real: today's actual logged visits.
 */
import { localDateKey, todayKey } from "@/lib/dayProfile";
import { db, type OutboxRow, type TrailPointRow } from "@/lib/offline/db";
import { useLiveQuery } from "@/lib/offline/useLiveQuery";
import { getTrailPointsForDay } from "@/lib/tracer";

async function loadVisits(day: string): Promise<OutboxRow[]> {
  const rows = await db.visitOutbox.toArray();
  return rows
    .filter((r) => localDateKey(r.event.at) === day)
    .sort((a, b) => a.event.at.localeCompare(b.event.at));
}

export function StatsLive() {
  const day = todayKey();
  const visits = useLiveQuery<OutboxRow[]>(() => loadVisits(day), [day], []);
  const points = useLiveQuery<TrailPointRow[]>(() => getTrailPointsForDay(day), [day], []);

  return (
    <>
      <div className="card">
        <div className="cardtitle">Timeline</div>
        {visits.length === 0 ? (
          <p className="sub" style={{ fontSize: 14 }} data-testid="stats-no-visits">
            No visits logged yet today.
          </p>
        ) : (
          <div className="tl">
            {visits.map((v) => (
              <div className="tlr" key={v.id}>
                <span className="t">{v.event.at.slice(11, 16)}</span>
                {v.event.outcome.replace(/_/g, " ")}
                {v.event.saleValueEur ? ` · €${v.event.saleValueEur}` : ""}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card">
        <div className="cardtitle">By neighborhood</div>
        <p className="sub" style={{ fontSize: 14 }}>
          Not enough data yet — this needs a few days of logged visits across areas.
        </p>
      </div>

      <div className="card">
        <div className="cardtitle">Coach</div>
        <p className="sub" style={{ fontSize: 14 }}>
          Log a few more doors and 2DAY will start surfacing coaching tips here.
        </p>
      </div>

      <div className="card" data-testid="stats-trail-summary">
        <div className="cardtitle">Trail today</div>
        <p className="sub" style={{ fontSize: 14 }}>
          {points.length === 0
            ? "No trail recorded yet — start it on the Route tab."
            : `${points.length} point${points.length === 1 ? "" : "s"} recorded today.`}
        </p>
      </div>
    </>
  );
}
