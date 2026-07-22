import { InputChips } from "@/components/plan/InputChips";
import { PlanFlow } from "@/components/plan/PlanFlow";

/** The original Tilburg demo compile flow — unchanged, only shown once the
 *  rep has explicitly picked "Try the demo" (WIZARD-BRIEF). */
export function PlanDemo() {
  return (
    <>
      <div>
        <div className="h1">Compile your day</div>
        <div className="sub">Ten taps, zero typing. 2DAY does the rest.</div>
      </div>
      <div className="card">
        <div className="cardtitle">Inputs</div>
        <InputChips />
      </div>
      <PlanFlow />
    </>
  );
}
