import { coachTips } from "@/lib/mock";

export function CoachCard() {
  return (
    <div className="card">
      <div className="cardtitle">Coach · 3 improvements</div>
      <ol className="coach">
        {coachTips.map((tip) => (
          <li key={tip.text}>
            {tip.bold && <b>{tip.bold}</b>} {tip.text}
          </li>
        ))}
      </ol>
    </div>
  );
}
