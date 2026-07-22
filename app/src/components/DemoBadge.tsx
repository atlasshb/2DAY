"use client";

/** Visible on every tab whenever demo mode is on (WIZARD-BRIEF: "carries a
 *  visible DEMO badge on every tab"). Mounted once in AppShell so it can't
 *  be forgotten on a screen. Tapping it exits demo mode immediately —
 *  demo is reversible, same as it was explicit to enter. */
import { setDemoMode, useDemoMode } from "@/lib/dayProfile";

export function DemoBadge() {
  const demo = useDemoMode();
  if (!demo) return null;
  return (
    <button
      type="button"
      className="demobadge"
      data-testid="demo-badge"
      aria-label="Exit demo mode"
      onClick={() => void setDemoMode(false)}
    >
      DEMO · tap to exit
    </button>
  );
}
