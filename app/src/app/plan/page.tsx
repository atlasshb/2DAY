"use client";

import { useDemoMode } from "@/lib/dayProfile";
import { PlanDemo } from "@/components/plan/PlanDemo";
import { PlanLive } from "@/components/plan/PlanLive";

export default function PlanPage() {
  const demo = useDemoMode();
  return <section className="screen" aria-label="Plan">{demo ? <PlanDemo /> : <PlanLive />}</section>;
}
