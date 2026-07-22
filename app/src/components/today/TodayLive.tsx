"use client";

/**
 * The real (non-demo) Today tab — WIZARD-BRIEF. No dayProfile yet: an honest
 * onboarding card ("Set up my day" / "Try the demo"), not fixture numbers.
 * Profile set: real work-hours progress, real day stats (visit outbox +
 * Trail), and the real compiled plan's legs once one exists.
 */
import Link from "next/link";
import { todayKey, useDayProfile, setDemoMode } from "@/lib/dayProfile";
import { useRealDayStats } from "@/lib/todayStats";
import { useNow } from "@/lib/useNow";
import { legRow } from "@/lib/legDisplay";
import { EditDayButton } from "@/components/wizard/EditDayButton";

function formatHM(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export function TodayLive() {
  const date = todayKey();
  const profile = useDayProfile(date);
  const stats = useRealDayStats(date);
  const now = useNow();

  if (profile === undefined) {
    // First tick before Dexie answers — a beat, not a flash of fixture data.
    return <div className="card" aria-hidden="true" style={{ minHeight: 80 }} />;
  }

  if (profile === null) {
    return (
      <div className="card emptycard" data-testid="today-onboarding">
        <span className="emptyicon" aria-hidden="true">
          🧭
        </span>
        <span className="emptytitle">Set up your day</span>
        <p className="wizcopy">
          Where you&apos;re headed, your work hours, your bag, and prayer stops — a couple
          of taps and 2DAY plans around them. Nothing here leaves your phone.
        </p>
        <EditDayButton
          existing={null}
          label="Set up my day"
          className="primary"
          testId="start-setup-btn"
        />
        <button
          type="button"
          className="ghost"
          data-testid="try-demo-btn"
          onClick={() => void setDemoMode(true)}
        >
          Try the demo instead
        </button>
      </div>
    );
  }

  const startMs = new Date(profile.hours.startAt).getTime();
  const endMs = new Date(profile.hours.endAt).getTime();
  const nowMs = now.getTime();
  const fillPct = Math.max(
    0,
    Math.min(100, Math.round(((nowMs - startMs) / Math.max(1, endMs - startMs)) * 100)),
  );
  const elapsedMin = Math.max(0, Math.round((nowMs - startMs) / 60_000));
  const remainingMin = Math.max(0, Math.round((endMs - nowMs) / 60_000));
  const hoursStatus =
    nowMs < startMs ? "not started yet" : nowMs > endMs ? "workday done" : `${formatHM(elapsedMin)} in · ${formatHM(remainingMin)} left`;

  const legs = profile.plan?.legs ?? [];

  return (
    <>
      <div className="hero">
        <div className="heror">
          <span className="loc">{profile.workArea.label}</span>
          <EditDayButton existing={profile} label="Edit my day" testId="edit-day-btn" />
        </div>
        <div className="hoursbar">
          <div className="hourslbl">
            <span>
              Workday {profile.hours.startAt.slice(11, 16)}–{profile.hours.endAt.slice(11, 16)}
            </span>
            <span>{hoursStatus}</span>
          </div>
          <div className="track">
            <div className="fill" style={{ width: `${fillPct}%` }} />
          </div>
        </div>
      </div>

      <div className="grid" role="list" aria-label="Today's numbers">
        <div className="stat">
          <div className="statv">{stats.doors}</div>
          <div className="statl">Doors</div>
        </div>
        <div className="stat">
          <div className="statv">{stats.convos}</div>
          <div className="statl">Convos</div>
        </div>
        <div className="stat">
          <div className="statv">{stats.sales}</div>
          <div className="statl">Sales</div>
        </div>
        <div className="stat">
          <div className="statv">€{stats.earn}</div>
          <div className="statl">Est. earned</div>
        </div>
        <div className="stat">
          <div className="statv">{stats.kmWalked}</div>
          <div className="statl">km walked</div>
        </div>
      </div>

      <div className="card">
        <div className="cardtitle">Route</div>
        {legs.length === 0 ? (
          <div data-testid="today-no-plan">
            <p className="sub" style={{ fontSize: 14 }}>No plan yet — compile today&apos;s plan on the Plan tab.</p>
            <Link href="/plan" className="ghost" style={{ display: "block", textAlign: "center", textDecoration: "none", marginTop: 8 }}>
              Go to Plan
            </Link>
          </div>
        ) : (
          legs.map((leg) => {
            const row = legRow(leg);
            const status =
              nowMs > new Date(leg.endAt).getTime()
                ? "done"
                : nowMs >= new Date(leg.startAt).getTime()
                  ? "now"
                  : "upcoming";
            return (
              <div key={leg.id} className={status === "upcoming" ? "legrow" : `legrow ${status}`}>
                <span className="t">{row.time}</span>
                <span className="legicon">{row.icon}</span>
                {row.text}
              </div>
            );
          })
        )}
      </div>

      {stats.doors === 0 && (
        <p className="sub" style={{ textAlign: "center", fontSize: 13 }} data-testid="today-no-visits">
          No visits logged yet — log a door on the Log tab.
        </p>
      )}
    </>
  );
}
