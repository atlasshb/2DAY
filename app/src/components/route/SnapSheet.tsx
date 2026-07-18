"use client";

import { useState } from "react";
import { nextStreet, streetQueue } from "@/lib/mock";

const RADIUS = 22;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export function SnapSheet() {
  const [open, setOpen] = useState(false);
  const dashOffset = CIRCUMFERENCE * (1 - nextStreet.progressPct / 100);

  return (
    <div className={`sheet${open ? " open" : ""}`} id="sheet">
      <button
        style={{ width: "100%" }}
        aria-label="Expand street queue"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <div className="grab" />
      </button>
      <div className="nextrow">
        <svg className="ring" width="52" height="52" viewBox="0 0 52 52" aria-hidden="true">
          <circle cx="26" cy="26" r={RADIUS} fill="none" stroke="var(--surface2)" strokeWidth="5" />
          <circle
            cx="26"
            cy="26"
            r={RADIUS}
            fill="none"
            stroke="var(--accent)"
            strokeWidth="5"
            strokeDasharray={CIRCUMFERENCE.toFixed(0)}
            strokeDashoffset={dashOffset.toFixed(0)}
            strokeLinecap="round"
            transform="rotate(-90 26 26)"
          />
          <text x="26" y="31" textAnchor="middle" fontSize="13" fontWeight="700" fill="var(--ink)">
            {nextStreet.progressPct}%
          </text>
        </svg>
        <div>
          <div className="nextst">{nextStreet.name}</div>
          <div className="nextmeta">{nextStreet.meta}</div>
        </div>
      </div>
      <div className="queue">
        {streetQueue.map((row) => (
          <div className="qrow" key={row.n + row.label} style={row.skipped ? { opacity: 0.55 } : undefined}>
            <span className="n">{row.n}</span>
            {row.label}
            {row.evPct !== undefined && (
              <span className="evbar">
                <i style={{ width: `${row.evPct}%` }} />
              </span>
            )}
            <span className="doors">{row.doors ?? ""}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
