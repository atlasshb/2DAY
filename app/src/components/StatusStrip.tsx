"use client";

import { useEffect, useState } from "react";
import { useStore } from "@/lib/store";
import { useDemoMode } from "@/lib/dayProfile";
import { getTracerState, subscribeTracer, type TracerState } from "@/lib/tracer";
import { useNow } from "@/lib/useNow";

function useTracerStatus(): TracerState["status"] {
  const [status, setStatus] = useState<TracerState["status"]>(() => getTracerState().status);
  useEffect(() => subscribeTracer((s) => setStatus(s.status)), []);
  return status;
}

const GPS_DOT: Record<TracerState["status"], string> = {
  tracking: "var(--ok)",
  off: "var(--faint)",
  denied: "var(--danger)",
  unsupported: "var(--faint)",
};
const GPS_LABEL: Record<TracerState["status"], string> = {
  tracking: "GPS",
  off: "GPS off",
  denied: "GPS denied",
  unsupported: "GPS off",
};

export function StatusStrip() {
  const { mode, toggleMode } = useStore();
  const demo = useDemoMode();
  const isNight = mode === "night";
  const now = useNow();
  const tracerStatus = useTracerStatus();

  // Demo keeps its fixed fixture chips (GPS/Sync "ok", 71% battery) — this
  // strip is shared across every tab, so the honest-real-state chips only
  // take over once demo mode is off (TRAIL-BRIEF).
  const gpsColor = demo ? "var(--ok)" : GPS_DOT[tracerStatus];
  const gpsLabel = demo ? "GPS" : GPS_LABEL[tracerStatus];
  const clock = demo
    ? "14:38"
    : `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

  return (
    <div className="status">
      <span className="clock">{clock}</span>
      <span className="sys">
        <span className="sysitem" data-testid="gps-chip">
          <span className="dot" style={{ background: gpsColor }} />
          {gpsLabel}
        </span>
        <span className="sysitem" data-testid="sync-chip">
          <span className="dot" style={{ background: demo ? "var(--ok)" : "var(--faint)" }} />
          {demo ? "Sync" : "Local only"}
        </span>
        {demo && (
          <span className="sysitem" style={{ fontWeight: 600 }}>
            71%
          </span>
        )}
        <button
          type="button"
          className="modebtn"
          aria-label="Toggle sunlight mode"
          onClick={toggleMode}
        >
          {isNight ? "☀︎ Sun" : "☾ Night"}
        </button>
      </span>
    </div>
  );
}
