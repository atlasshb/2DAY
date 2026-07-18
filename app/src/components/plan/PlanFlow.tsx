"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import { CompiledPlanCard } from "@/components/plan/CompiledPlanCard";
import { WhyThisPlan } from "@/components/plan/WhyThisPlan";
import { Alternatives } from "@/components/plan/Alternatives";

type CompileState = "idle" | "compiling" | "done";

const COMPILE_MS = 1400;
const ACCEPT_NAV_DELAY_MS = 900;

export function PlanFlow() {
  const [compileState, setCompileState] = useState<CompileState>("idle");
  const [accepted, setAccepted] = useState(false);
  const { acceptPlan } = useStore();
  const router = useRouter();
  const resultRef = useRef<HTMLDivElement>(null);

  function handleCompile() {
    setCompileState("compiling");
    setTimeout(() => setCompileState("done"), COMPILE_MS);
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

      {compileState === "done" && (
        <div ref={resultRef}>
          <CompiledPlanCard />
          <WhyThisPlan />
          <Alternatives />
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
