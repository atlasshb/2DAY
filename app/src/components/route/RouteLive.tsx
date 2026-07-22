"use client";

import Link from "next/link";
import { todayKey, useDayProfile } from "@/lib/dayProfile";
import { legRow } from "@/lib/legDisplay";
import { TrailPanel } from "@/components/route/TrailPanel";

/** Real (non-demo) Route tab — the compiled plan's legs (once one exists),
 *  plus the Day Trail panel, which works regardless of wizard/plan state. */
export function RouteLive() {
  const date = todayKey();
  const profile = useDayProfile(date);

  return (
    <>
      {profile === null && (
        <div className="card emptycard" data-testid="route-no-profile">
          <span className="emptytitle">No plan yet</span>
          <p className="wizcopy">Set up your day on Today, then compile a plan on the Plan tab.</p>
          <Link href="/" className="ghost" style={{ display: "block", textAlign: "center", textDecoration: "none" }}>
            Go to Today
          </Link>
        </div>
      )}

      {profile &&
        (profile.plan ? (
          <div className="card" data-testid="route-plan-legs">
            <div className="cardtitle">Today&apos;s route</div>
            {profile.plan.legs.map((leg) => {
              const row = legRow(leg);
              return (
                <div key={leg.id} className="legrow">
                  <span className="t">{row.time}</span>
                  <span className="legicon">{row.icon}</span>
                  {row.text}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="card emptycard" data-testid="route-no-plan">
            <span className="emptytitle">Compile your plan</span>
            <p className="wizcopy">Head to the Plan tab to compile today&apos;s route.</p>
            <Link href="/plan" className="ghost" style={{ display: "block", textAlign: "center", textDecoration: "none" }}>
              Go to Plan
            </Link>
          </div>
        ))}

      <TrailPanel />
    </>
  );
}
