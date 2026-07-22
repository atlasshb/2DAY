import type { Plan } from "@2day/core";
import type { PlanSource } from "@/lib/api";
import { planWhyLeadIn } from "@/lib/mock";

export function WhyThisPlan({
  plan,
  source,
  demo = true,
}: {
  plan: Plan;
  source: PlanSource;
  demo?: boolean;
}) {
  const explanation = plan.explanation?.join(" ") ?? "";
  const useFixtureLeadIn = source !== "planner" && demo;
  return (
    <div className="card" style={{ marginBottom: 12 }}>
      <div className="cardtitle">Why this plan</div>
      <p className="explain">
        {/* The bold lead-in isn't a Plan field — it's demo copy, so it only
            fronts the demo's local fixture; a real (wizard-built) or server
            plan's explanation stands on its own. */}
        {useFixtureLeadIn && <b>{planWhyLeadIn}</b>}
        {useFixtureLeadIn ? " " : ""}
        {explanation}
      </p>
    </div>
  );
}
