import { Hero } from "@/components/today/Hero";
import { StatGrid } from "@/components/today/StatGrid";
import { RouteLegsCard } from "@/components/today/RouteLegsCard";
import { TrainCard } from "@/components/today/TrainCard";
import { DisruptionsCard } from "@/components/today/DisruptionsCard";

/** The original Tilburg demo day — unchanged, only ever shown once the rep
 *  has explicitly picked "Try the demo" (WIZARD-BRIEF). */
export function TodayDemo() {
  return (
    <>
      <Hero />
      <StatGrid />
      <RouteLegsCard />
      <TrainCard />
      <DisruptionsCard />
    </>
  );
}
