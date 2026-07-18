import { Hero } from "@/components/today/Hero";
import { StatGrid } from "@/components/today/StatGrid";
import { RouteLegsCard } from "@/components/today/RouteLegsCard";
import { TrainCard } from "@/components/today/TrainCard";
import { DisruptionsCard } from "@/components/today/DisruptionsCard";

export default function TodayPage() {
  return (
    <section className="screen" aria-label="Today">
      <Hero />
      <StatGrid />
      <RouteLegsCard />
      <TrainCard />
      <DisruptionsCard />
    </section>
  );
}
