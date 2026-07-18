import { InputChips } from "@/components/plan/InputChips";
import { PlanFlow } from "@/components/plan/PlanFlow";

export default function PlanPage() {
  return (
    <section className="screen" aria-label="Plan">
      <div>
        <div className="h1">Compile your day</div>
        <div className="sub">Ten taps, zero typing. 2DAY does the rest.</div>
      </div>
      <div className="card">
        <div className="cardtitle">Inputs</div>
        <InputChips />
      </div>
      <PlanFlow />
    </section>
  );
}
