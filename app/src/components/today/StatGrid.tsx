"use client";

import { useStore } from "@/lib/store";
import { earnSparkPoints } from "@/lib/mock";

export function StatGrid() {
  const { dayStats } = useStore();

  return (
    <div className="grid" role="list" aria-label="Today's numbers">
      <div className="stat">
        <div className="statv">{dayStats.doors}</div>
        <div className="statl">Doors</div>
      </div>
      <div className="stat">
        <div className="statv">{dayStats.convos}</div>
        <div className="statl">Convos</div>
      </div>
      <div className="stat">
        <div className="statv">{dayStats.sales}</div>
        <div className="statl">Sales</div>
      </div>
      <div className="stat">
        <div className="statv">€{dayStats.earn}</div>
        <div className="statl">Est. earned</div>
        <svg className="spark" width="72" height="16" viewBox="0 0 72 16" aria-hidden="true">
          <polyline
            points={earnSparkPoints}
            fill="none"
            stroke="var(--sale)"
            strokeWidth="2"
          />
        </svg>
      </div>
      <div className="stat">
        <div className="statv">{dayStats.steps.toLocaleString("en-US")}</div>
        <div className="statl">Steps</div>
      </div>
      <div className="stat">
        <div className="statv">{dayStats.km}</div>
        <div className="statl">km walked</div>
      </div>
    </div>
  );
}
