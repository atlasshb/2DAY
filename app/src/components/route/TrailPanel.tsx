"use client";

/**
 * Day Trail panel — TRAIL-BRIEF. Start/Stop toggle with permission UX, a
 * live point count + elapsed timer while tracking, a compact auto-fitting
 * SVG polyline of today's points (MapSvg's viewBox is a stylized fictional
 * neighborhood — projecting real lat/lon into it wouldn't be meaningful, so
 * this is its own panel, per the brief), and a chronological retrace list:
 * each recorded point plus the day's logged door visits, interleaved by
 * time, so the rep can see where they were when.
 *
 * Independent of demo/wizard mode — recording your own movement isn't a
 * "day setup" answer, it just works, on every Route tab visit.
 */
import { useEffect, useState } from "react";
import { localDateKey, todayKey } from "@/lib/dayProfile";
import { db, type OutboxRow, type TrailPointRow } from "@/lib/offline/db";
import { useLiveQuery } from "@/lib/offline/useLiveQuery";
import { useNow } from "@/lib/useNow";
import { boundingBox, formatDistance, haversineMeters } from "@/lib/geoMath";
import {
  getTrailPointsForDay,
  getTracerState,
  startTrail,
  stopTrail,
  subscribeTracer,
  type TracerState,
} from "@/lib/tracer";

function useTracerState(): TracerState {
  const [state, setState] = useState<TracerState>(() => getTracerState());
  useEffect(() => subscribeTracer(setState), []);
  return state;
}

function elapsedLabel(startedAt: number | null, now: Date): string {
  if (!startedAt) return "0:00";
  const s = Math.max(0, Math.round((now.getTime() - startedAt) / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

async function loadVisitsForDay(day: string): Promise<OutboxRow[]> {
  const rows = await db.visitOutbox.toArray();
  return rows.filter((r) => localDateKey(r.event.at) === day);
}

export function TrailPanel() {
  const day = todayKey();
  const tracer = useTracerState();
  const now = useNow(1000);

  const points = useLiveQuery<TrailPointRow[]>(() => getTrailPointsForDay(day), [day], []);
  const visits = useLiveQuery<OutboxRow[]>(() => loadVisitsForDay(day), [day], []);

  function handleToggle() {
    if (tracer.status === "tracking") {
      stopTrail();
    } else {
      startTrail();
    }
  }

  const bbox = boundingBox(points.map((p) => ({ lat: p.lat, lng: p.lon })));

  type RetraceItem =
    | { ts: string; kind: "point"; deltaM: number | null }
    | { ts: string; kind: "visit"; outcome: string };

  const items: RetraceItem[] = [
    ...points.map((p, i): RetraceItem => ({
      ts: p.ts,
      kind: "point",
      deltaM:
        i === 0
          ? null
          : Math.round(
              haversineMeters(
                { lat: points[i - 1]!.lat, lng: points[i - 1]!.lon },
                { lat: p.lat, lng: p.lon },
              ),
            ),
    })),
    ...visits.map((v): RetraceItem => ({ ts: v.event.at, kind: "visit", outcome: v.event.outcome })),
  ].sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime());

  return (
    <div className="card trailpanel">
      <div className="cardtitle">Day Trail</div>
      <p className="wizcopy" style={{ marginTop: -4 }}>
        Trail stays on this phone — never synced, never sent.
      </p>

      <div className="trailtoggle">
        <button
          type="button"
          className={tracer.status === "tracking" ? "primary" : "ghost"}
          style={{ width: "auto", padding: "0 18px", minHeight: 48 }}
          onClick={handleToggle}
          data-testid="trail-toggle"
        >
          {tracer.status === "tracking" ? "Stop trail" : "Start trail"}
        </button>
        {tracer.status === "tracking" && (
          <span className="trailstats" data-testid="trail-live-stats">
            {tracer.pointCount} point{tracer.pointCount === 1 ? "" : "s"} · {elapsedLabel(tracer.startedAt, now)}
          </span>
        )}
      </div>

      {(tracer.status === "denied" || tracer.status === "unsupported") && (
        <p className="wizhint" data-testid="trail-denied-hint">
          {tracer.status === "denied"
            ? "Location access is off — enable it in your browser settings to record a trail."
            : "This device/browser doesn't support location tracking."}
        </p>
      )}

      {points.length > 1 && bbox && (
        <div className="trailsvgwrap">
          <TrailSvg points={points} bbox={bbox} />
        </div>
      )}

      {items.length > 0 ? (
        <div className="retracelist" data-testid="retrace-list">
          {items.map((item, i) => (
            <div className="retracerow" key={i} data-testid={item.kind === "point" ? "retrace-point" : "retrace-visit"}>
              <span className="t">{item.ts.slice(11, 16)}</span>
              {item.kind === "point" ? (
                <span>{item.deltaM == null ? "Trail started" : `Moved ${formatDistance(item.deltaM)}`}</span>
              ) : (
                <span>Visit logged: {item.outcome.replace(/_/g, " ")}</span>
              )}
            </div>
          ))}
        </div>
      ) : (
        <p className="sub" style={{ fontSize: 13 }}>
          No trail recorded yet today.
        </p>
      )}
    </div>
  );
}

function TrailSvg({
  points,
  bbox,
}: {
  points: TrailPointRow[];
  bbox: { minLat: number; maxLat: number; minLng: number; maxLng: number };
}) {
  const width = 320;
  const height = 140;
  const latSpan = bbox.maxLat - bbox.minLat || 1e-6;
  const lngSpan = bbox.maxLng - bbox.minLng || 1e-6;
  const project = (lat: number, lon: number): [number, number] => [
    ((lon - bbox.minLng) / lngSpan) * width,
    height - ((lat - bbox.minLat) / latSpan) * height,
  ];
  const projected = points.map((p) => project(p.lat, p.lon));
  const polyline = projected.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const [sx, sy] = projected[0]!;
  const [ex, ey] = projected[projected.length - 1]!;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={140} role="img" aria-label="Today's trail">
      <polyline
        points={polyline}
        fill="none"
        stroke="var(--accent)"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={sx} cy={sy} r="5" fill="var(--ok)" />
      <circle cx={ex} cy={ey} r="5" fill="var(--accent)" />
    </svg>
  );
}
