import { Timeline } from "@/components/stats/Timeline";
import { NeighborhoodTable } from "@/components/stats/NeighborhoodTable";
import { CoachCard } from "@/components/stats/CoachCard";
import { StreakRecords } from "@/components/stats/StreakRecords";

export default function StatsPage() {
  return (
    <section className="screen" aria-label="Stats">
      <div className="h1">Today&apos;s review</div>
      <Timeline />
      <NeighborhoodTable />
      <CoachCard />
      <StreakRecords />
    </section>
  );
}
