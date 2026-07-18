import { records, streak } from "@/lib/mock";

export function StreakRecords() {
  return (
    <>
      <div className="card streak">
        <span className="flame">🔥</span>
        <div>
          <b>{streak.days}-day streak</b>
          <div className="sub" style={{ fontSize: 13 }}>
            Personal best: {streak.personalBest} days
          </div>
        </div>
        <span className="pill" style={{ marginLeft: "auto" }}>
          #{streak.weekRank} this week
        </span>
      </div>
      <div className="records">
        {records.map((rec) => (
          <div className="rec" key={rec.label}>
            <div className="rv">{rec.value}</div>
            <div className="rl">{rec.label}</div>
          </div>
        ))}
      </div>
    </>
  );
}
