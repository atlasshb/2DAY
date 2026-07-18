"use client";

import { useStore } from "@/lib/store";

export function NudgeBanner() {
  const { nudge, nudgeShow, dismissNudge } = useStore();
  if (!nudge) return null;

  return (
    <div
      className={`nudge${nudgeShow ? " show" : ""}${nudge.warn ? " warn" : ""}`}
      role="status"
    >
      <div>
        <div className="nt">{nudge.title}</div>
        <div className="nb">{nudge.body}</div>
      </div>
      <button type="button" className="act" onClick={dismissNudge}>
        {nudge.act}
      </button>
    </div>
  );
}
