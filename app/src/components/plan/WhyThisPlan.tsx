import type { Plan } from "@2day/core";
import type { PlanSource } from "@/lib/api";
import { planWhyLeadIn } from "@/lib/mock";

export function WhyThisPlan({ plan, source }: { plan: Plan; source: PlanSource }) {
  const explanation = plan.explanation?.join(" ") ?? "";
  return (
    <div className="card" style={{ marginBottom: 12 }}>
      <div className="cardtitle">Why this plan</div>
      <p className="explain">
        {/* The bold lead-in isn't a Plan field — it's demo copy, so it only
            fronts the local fallback plan; a server plan's explanation stands
            on its own. */}
        {source !== "planner" && <b>{planWhyLeadIn}</b>}
        {source !== "planner" ? " " : ""}
        {explanation}
      </p>
    </div>
  );
}
