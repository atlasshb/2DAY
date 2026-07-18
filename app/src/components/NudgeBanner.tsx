"use client";

import { useStore } from "@/lib/store";

/**
 * Renders the single nudge the field brain (@2day/core's nextNudge, driven by
 * lib/nudges.ts) has surfaced through the store. Title/body/action come from
 * the engine-produced nudge; the amber `warn` accent is the per-rule styling,
 * and the engine's priority tier is reflected on the element for good measure.
 */
export function NudgeBanner() {
  const { nudge, nudgeShow, dismissNudge } = useStore();
  if (!nudge) return null;

  return (
    <div
      className={`nudge${nudgeShow ? " show" : ""}${nudge.warn ? " warn" : ""}`}
      role="status"
      data-priority={nudge.priority}
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
