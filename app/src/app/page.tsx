"use client";

import { useDemoMode } from "@/lib/dayProfile";
import { TodayDemo } from "@/components/today/TodayDemo";
import { TodayLive } from "@/components/today/TodayLive";

export default function TodayPage() {
  const demo = useDemoMode();
  return <section className="screen" aria-label="Today">{demo ? <TodayDemo /> : <TodayLive />}</section>;
}
