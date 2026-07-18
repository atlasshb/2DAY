"use client";

import { useStore } from "@/lib/store";
import { clockNow } from "@/lib/mock";

export function StatusStrip() {
  const { mode, toggleMode } = useStore();
  const isNight = mode === "night";

  return (
    <div className="status">
      <span className="clock">{clockNow}</span>
      <span className="sys">
        <span className="sysitem">
          <span className="dot" style={{ background: "var(--ok)" }} />
          GPS
        </span>
        <span className="sysitem">
          <span className="dot" style={{ background: "var(--ok)" }} />
          Sync
        </span>
        <span className="sysitem" style={{ fontWeight: 600 }}>
          71%
        </span>
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
