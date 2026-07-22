import type { CanvassLegDetail, Plan } from "@2day/core";
import type { PlanSource } from "@/lib/api";
import { compiledPlanStats, planLegRows, SALE_VALUE_EUR, type PlanLegRow } from "@/lib/mock";
import { legRow } from "@/lib/legDisplay";

interface CardStats {
  doors: number;
  convos: number;
  sales: number;
  km: number;
}

/** Map a server Plan's score/legs onto the four EV pills. Best-effort: doors and
 *  sales aren't first-class on Plan, so doors sums the canvass legs and sales is
 *  derived from expected revenue. Only meaningful when a scoring model actually
 *  produced non-zero expectations (the demo/planner path) — a real wizard-built
 *  plan has no scoring model, so its score is honestly all zeros and the card
 *  skips this row entirely (see `CompiledPlanCard` below). */
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

/** Map a Plan's legs onto the presentational leg rows (shared with Today/Route
 *  for real, wizard-built plans — see lib/legDisplay.ts). */
function serverLegRows(plan: Plan): PlanLegRow[] {
  return plan.legs.map(legRow);
}

/**
 * `demo` distinguishes the Plan tab's two very different "local" plans:
 * the fixed demo fixture (`demo=true`, source is always "local" since no
 * planner runs in this repo) vs. a real plan built from the Day Setup
 * wizard's answers (`demo=false`) — which has no scoring model, so its EV
 * row is skipped in favor of a plain, honest summary line.
 */
export function CompiledPlanCard({
  plan,
  source,
  demo = true,
  areaLabel,
}: {
  plan: Plan;
  source: PlanSource;
  demo?: boolean;
  areaLabel?: string;
}) {
  const local = source !== "planner";
  const useFixture = local && demo;
  const stats: CardStats = useFixture ? compiledPlanStats : serverStats(plan);
  const rows: PlanLegRow[] = useFixture ? planLegRows : serverLegRows(plan);
  // The demo fixture is always "Tilburg" (its one fixed scenario); real
  // plans pass their own work-area label explicitly.
  const resolvedAreaLabel = areaLabel ?? (useFixture ? "Tilburg" : undefined);
  const totalMinutes = plan.legs.length
    ? Math.round(
        (new Date(plan.legs[plan.legs.length - 1]!.endAt).getTime() -
          new Date(plan.legs[0]!.startAt).getTime()) /
          60_000,
      )
    : 0;

  return (
    <div className="card" style={{ marginBottom: 12 }}>
      <div className="cardtitle">
        Compiled plan{resolvedAreaLabel ? ` · ${resolvedAreaLabel}` : ""}
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
      {useFixture ? (
        <div className="evrow">
          <span className="pill">~{stats.doors} doors</span>
          <span className="pill">~{stats.convos} convos</span>
          <span className="pill" style={{ color: "var(--sale)" }}>
            ~{stats.sales} sales
          </span>
          <span className="pill">{stats.km} km</span>
        </div>
      ) : (
        <p className="sub" style={{ fontSize: 13, marginBottom: 6 }}>
          {rows.length} stop{rows.length === 1 ? "" : "s"} · {totalMinutes} min planned
        </p>
      )}
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
