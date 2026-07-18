"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import { compileDay, type CompileResult } from "@/lib/api";
import { buildPlanRequest } from "@/lib/planRequest";
import { mockPlan } from "@/lib/mock";
import { CompiledPlanCard } from "@/components/plan/CompiledPlanCard";
import { WhyThisPlan } from "@/components/plan/WhyThisPlan";
import { Alternatives } from "@/components/plan/Alternatives";

type CompileState = "idle" | "compiling" | "done";

/** Minimum time the compile progress is shown, regardless of how fast the
 *  planner (or the local fallback) answers — keeps the "scoring 14 areas" feel. */
const COMPILE_MS = 1400;
const ACCEPT_NAV_DELAY_MS = 900;

export function PlanFlow() {
  const [compileState, setCompileState] = useState<CompileState>("idle");
  const [result, setResult] = useState<CompileResult | null>(null);
  const [accepted, setAccepted] = useState(false);
  const { acceptPlan } = useStore();
  const router = useRouter();
  const resultRef = useRef<HTMLDivElement>(null);

  function handleCompile() {
    setCompileState("compiling");
    const startedAt = Date.now();
    // Real planner call; never-block contract falls back to the local mock plan
    // (source: "local") whenever the planner is unreachable — which is the case
    // in dev/E2E, so the fallback path is what the tests exercise.
    void compileDay(buildPlanRequest(), () => mockPlan).then((res) => {
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
    setAccepted(true);
    acceptPlan();
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
        >
          {compileState === "compiling" ? (
            <span className="compiling" style={{ justifyContent: "center", color: "#fff" }}>
              <span className="spinner" />
              Compiling — scoring 14 areas…
            </span>
          ) : (
            "Compile day"
          )}
        </button>
      )}

      {compileState === "done" && result && (
        <div ref={resultRef}>
          <CompiledPlanCard plan={result.plan} source={result.source} />
          <WhyThisPlan plan={result.plan} source={result.source} />
          <Alternatives plan={result.plan} />
          <div style={{ height: 12 }} />
          <button
            type="button"
            className="primary"
            style={accepted ? { background: "var(--sale)" } : undefined}
            onClick={handleAccept}
            disabled={accepted}
          >
            {accepted ? "Day Pack downloaded ✓ — plan is live" : "Accept · download Day Pack (18 MB)"}
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
