import type { CanvassLegDetail, Plan, PlanLeg, TransitLegDetail } from "@2day/core";
import type { PlanSource } from "@/lib/api";
import { compiledPlanStats, planLegRows, SALE_VALUE_EUR, type PlanLegRow } from "@/lib/mock";

const KIND_ICON: Record<PlanLeg["kind"], string> = {
  walk: "🚶",
  transit: "🚆",
  gym: "🏋️",
  canvass: "🚪",
  break: "☕",
};

/** HH:MM off the leg's ISO start — reads the wall-clock in the offset-tagged
 *  timestamp directly, no timezone math. */
function hhmm(iso: string): string {
  return iso.slice(11, 16);
}

interface CardStats {
  doors: number;
  convos: number;
  sales: number;
  km: number;
}

/** Map a server Plan's score/legs onto the four EV pills. Best-effort: doors and
 *  sales aren't first-class on Plan, so doors sums the canvass legs and sales is
 *  derived from expected revenue. Only used on the (untested) planner path — the
 *  local fallback keeps the exact demo figures below. */
function serverStats(plan: Plan): CardStats {
  const doors = plan.legs.reduce(
    (n, l) => n + (l.kind === "canvass" ? (l.detail as CanvassLegDetail).doorCount : 0),
    0,
  );
  return {
    doors,
    convos: plan.score.expectedConversations,
    sales: Math.round(plan.score.expectedRevenueEur / SALE_VALUE_EUR),
    km: +(plan.score.walkMinutes * 0.08).toFixed(1),
  };
}

/** Map a server Plan's legs onto the presentational leg rows. */
function serverLegRows(plan: Plan): PlanLegRow[] {
  return plan.legs.map((leg) => {
    let text: string;
    switch (leg.kind) {
      case "transit": {
        const d = leg.detail as TransitLegDetail;
        text = `${d.routeShortName} → ${leg.toLabel}`;
        break;
      }
      case "canvass": {
        const d = leg.detail as CanvassLegDetail;
        text = `${leg.toLabel} · ${d.doorCount} doors`;
        break;
      }
      case "gym":
        text = `${leg.toLabel} · bag drop`;
        break;
      case "break":
        text = `Coffee · ${leg.toLabel}`;
        break;
      default:
        text = `Walk to ${leg.toLabel}`;
    }
    return { time: hhmm(leg.startAt), icon: KIND_ICON[leg.kind], text };
  });
}

export function CompiledPlanCard({ plan, source }: { plan: Plan; source: PlanSource }) {
  const local = source !== "planner";
  const stats: CardStats = local ? compiledPlanStats : serverStats(plan);
  const rows: PlanLegRow[] = local ? planLegRows : serverLegRows(plan);

  return (
    <div className="card" style={{ marginBottom: 12 }}>
      <div className="cardtitle">
        Compiled plan · Tilburg
        {/* Honest-staleness pill (docs 00 §2.4 / 07 §"amber dot + caption"): the
            plan was produced by the on-device fallback, not the planner. */}
        {local && (
          <span
            className="srcpill"
            style={{
              marginLeft: 8,
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: 0,
              textTransform: "none",
              color: "var(--dim)",
              background: "var(--chipbg)",
              border: "1px solid var(--line)",
              borderRadius: 999,
              padding: "2px 8px",
              whiteSpace: "nowrap",
            }}
          >
            <span aria-hidden style={{ color: "var(--warn)", marginRight: 5 }}>
              ●
            </span>
            compiled on device
          </span>
        )}
      </div>
      <div className="evrow">
        <span className="pill">~{stats.doors} doors</span>
        <span className="pill">~{stats.convos} convos</span>
        <span className="pill" style={{ color: "var(--sale)" }}>
          ~{stats.sales} sales
        </span>
        <span className="pill">{stats.km} km</span>
      </div>
      {rows.map((row) => (
        <div key={row.time + row.text} className="legrow">
          <span className="t">{row.time}</span>
          <span className="legicon">{row.icon}</span>
          {row.text}
        </div>
      ))}
    </div>
  );
}
