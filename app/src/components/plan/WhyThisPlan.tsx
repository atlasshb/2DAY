import { mockPlan, planWhyLeadIn } from "@/lib/mock";

export function WhyThisPlan() {
  return (
    <div className="card" style={{ marginBottom: 12 }}>
      <div className="cardtitle">Why this plan</div>
      <p className="explain">
        <b>{planWhyLeadIn}</b> {mockPlan.explanation?.join(" ")}
      </p>
    </div>
  );
}
