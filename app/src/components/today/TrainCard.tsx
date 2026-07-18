import { trainCard } from "@/lib/mock";

export function TrainCard() {
  return (
    <div className="card traincard">
      <span className="legicon" style={{ width: 34, height: 34, fontSize: 17 }}>
        🚆
      </span>
      <div>
        <div className="trainbig">{trainCard.headline}</div>
        <div className="sub" style={{ fontSize: 13 }}>
          {trainCard.platform} · <span className="live">{trainCard.status}</span> ·{" "}
          {trainCard.note}
        </div>
      </div>
      <div className="countd">
        <div className="cv">{trainCard.countdown}</div>
        <div className="cl">{trainCard.countdownLabel}</div>
      </div>
    </div>
  );
}
