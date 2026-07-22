/** Shared "how does a PlanLeg render as a timeline row" mapping — used by
 *  the Plan tab's CompiledPlanCard and, for real (wizard) plans, by Today
 *  and Route too. Kept in one place so all three read the same leg the
 *  same way. */
import type { CanvassLegDetail, PlanLeg, TransitLegDetail } from "@2day/core";

export const LEG_KIND_ICON: Record<PlanLeg["kind"], string> = {
  walk: "🚶",
  transit: "🚆",
  gym: "🏋️",
  canvass: "🚪",
  break: "🕌",
};

export interface LegRow {
  time: string;
  icon: string;
  text: string;
}

/** HH:MM off the leg's ISO start — reads the wall-clock in the offset-tagged
 *  timestamp directly, no timezone math. */
function hhmm(iso: string): string {
  return iso.slice(11, 16);
}

export function legRow(leg: PlanLeg): LegRow {
  let text: string;
  switch (leg.kind) {
    case "transit": {
      const d = leg.detail as TransitLegDetail;
      text = `${d.routeShortName} → ${leg.toLabel}`;
      break;
    }
    case "canvass": {
      const d = leg.detail as CanvassLegDetail;
      text = d.doorCount > 0 ? `${leg.toLabel} · ${d.doorCount} doors` : `Work ${leg.toLabel}`;
      break;
    }
    case "gym":
      text = leg.toLabel;
      break;
    case "break":
      // Real plans only ever use "break" for a prayer stop (planFromProfile.ts).
      text = leg.toLabel !== leg.fromLabel ? `${leg.fromLabel} · ${leg.toLabel}` : leg.fromLabel;
      break;
    default:
      text = `Walk to ${leg.toLabel}`;
  }
  return { time: hhmm(leg.startAt), icon: LEG_KIND_ICON[leg.kind], text };
}
