"use client";

import Link from "next/link";
import { todayKey, useDayProfile } from "@/lib/dayProfile";
import { PlanFlowLive } from "@/components/plan/PlanFlowLive";

export function PlanLive() {
  const date = todayKey();
  const profile = useDayProfile(date);

  if (profile === undefined) {
    return <div className="card" aria-hidden="true" style={{ minHeight: 80 }} />;
  }

  if (profile === null) {
    return (
      <div className="card emptycard" data-testid="plan-no-profile">
        <span className="emptytitle">Set up your day first</span>
        <p className="wizcopy">
          Head to Today to answer a few quick questions, then come back to compile your plan.
        </p>
        <Link
          href="/"
          className="primary"
          style={{ display: "block", textAlign: "center", textDecoration: "none" }}
        >
          Go to Today
        </Link>
      </div>
    );
  }

  const chips: { icon: string; label: string }[] = [
    { icon: "📍", label: profile.location.label },
    { icon: "🏁", label: `Work in ${profile.workArea.label}` },
    { icon: "🕐", label: `${profile.hours.startAt.slice(11, 16)}–${profile.hours.endAt.slice(11, 16)}` },
    { icon: "🎒", label: profile.bag ? (profile.locker ? "Bag + locker" : "Bag, carried") : "No bag" },
    {
      icon: "🕌",
      label: profile.prayerPlan.enabled
        ? `Prayer stops${profile.prayerPlan.mosque ? ` · ${profile.prayerPlan.mosque.name}` : ""}`
        : "No prayer stops",
    },
  ];

  return (
    <>
      <div>
        <div className="h1">Compile your day</div>
        <div className="sub">Built from your Day Setup answers.</div>
      </div>
      <div className="card">
        <div className="cardtitle">Inputs</div>
        <div className="chips">
          {chips.map((c) => (
            <span key={c.icon + c.label} className="pill">
              {c.icon} {c.label}
            </span>
          ))}
        </div>
      </div>
      <PlanFlowLive profile={profile} />
    </>
  );
}
