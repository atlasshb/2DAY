"use client";

import { useDemoMode } from "@/lib/dayProfile";
import { StatsDemo } from "@/components/stats/StatsDemo";
import { StatsLive } from "@/components/stats/StatsLive";

export default function StatsPage() {
  const demo = useDemoMode();
  return (
    <section className="screen" aria-label="Stats">
      <div className="h1">Today&apos;s review</div>
      {demo ? <StatsDemo /> : <StatsLive />}
    </section>
  );
}
