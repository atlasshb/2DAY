export function DisruptionsCard() {
  return (
    <div className="card" style={{ display: "flex", gap: 10, alignItems: "center" }}>
      <span className="dot" style={{ background: "var(--ok)" }} />
      <span className="sub" style={{ fontSize: 14 }}>
        No disruptions on your lines · NS &amp; Arriva live
      </span>
    </div>
  );
}
