import { Timeline } from "@/components/stats/Timeline";
import { NeighborhoodTable } from "@/components/stats/NeighborhoodTable";
import { CoachCard } from "@/components/stats/CoachCard";
import { StreakRecords } from "@/components/stats/StreakRecords";

/** The original Tilburg demo stats — unchanged, only shown once the rep has
 *  explicitly picked "Try the demo" (WIZARD-BRIEF). */
export function StatsDemo() {
  return (
    <>
      <Timeline />
      <NeighborhoodTable />
      <CoachCard />
      <StreakRecords />
    </>
  );
}
