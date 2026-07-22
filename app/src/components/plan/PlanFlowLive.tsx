"use client";

/** Real (wizard-built) compile flow — WIZARD-BRIEF "Wiring real data".
 *  Structurally the same as the demo's PlanFlow (compile → compiled card →
 *  accept → navigate to Route), but built from the Day Setup wizard's
 *  answers instead of ten fixed chips, and honest about having no scoring
 *  model (see CompiledPlanCard's `demo=false` path). */
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import { compileDay, type CompileResult } from "@/lib/api";
import { buildRealLocalPlan, buildRealPlanRequest } from "@/lib/planFromProfile";
import { attachPlanToDayProfile, todayKey, type DayProfile } from "@/lib/dayProfile";
import { CompiledPlanCard } from "@/components/plan/CompiledPlanCard";
import { WhyThisPlan } from "@/components/plan/WhyThisPlan";

type CompileState = "idle" | "compiling" | "done";

const COMPILE_MS = 700;
const ACCEPT_NAV_DELAY_MS = 500;

export function PlanFlowLive({ profile }: { profile: DayProfile }) {
  const [compileState, setCompileState] = useState<CompileState>("idle");
  const [result, setResult] = useState<CompileResult | null>(null);
  const [accepted, setAccepted] = useState(false);
  const { acceptPlan } = useStore();
  const router = useRouter();
  const resultRef = useRef<HTMLDivElement>(null);

  function handleCompile() {
    setCompileState("compiling");
    const startedAt = Date.now();
    void compileDay(buildRealPlanRequest(profile), () => buildRealLocalPlan(profile)).then((res) => {
      const hold = Math.max(0, COMPILE_MS - (Date.now() - startedAt));
      window.setTimeout(() => {
        setResult(res);
        setCompileState("done");
      }, hold);
    });
  }

  useEffect(() => {
    if (compileState === "done") {
      resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [compileState]);

  function handleAccept() {
    if (!result) return;
    setAccepted(true);
    acceptPlan();
    void attachPlanToDayProfile(todayKey(), result.plan);
    setTimeout(() => router.push("/route"), ACCEPT_NAV_DELAY_MS);
  }

  return (
    <>
      {compileState !== "done" && (
        <button
          type="button"
          className="primary"
          disabled={compileState === "compiling"}
          onClick={handleCompile}
          data-testid="plan-compile-btn"
        >
          {compileState === "compiling" ? (
            <span className="compiling" style={{ justifyContent: "center", color: "#fff" }}>
              <span className="spinner" />
              Compiling your day…
            </span>
          ) : (
            "Compile my day"
          )}
        </button>
      )}

      {compileState === "done" && result && (
        <div ref={resultRef}>
          <CompiledPlanCard
            plan={result.plan}
            source={result.source}
            demo={false}
            areaLabel={profile.workArea.label}
          />
          <WhyThisPlan plan={result.plan} source={result.source} demo={false} />
          <div style={{ height: 12 }} />
          <button
            type="button"
            className="primary"
            style={accepted ? { background: "var(--sale)" } : undefined}
            onClick={handleAccept}
            disabled={accepted}
            data-testid="plan-accept-btn"
          >
            {accepted ? "Plan is live ✓" : "Accept plan"}
          </button>
          <div style={{ height: 8 }} />
          <button type="button" className="ghost" onClick={() => setCompileState("idle")}>
            Adjust inputs
          </button>
        </div>
      )}
    </>
  );
}
