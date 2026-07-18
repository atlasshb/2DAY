import { mockPlan } from "@/lib/mock";

export function Alternatives() {
  return (
    <>
      <div className="cardtitle" style={{ margin: "0 2px 2px" }}>
        Alternatives
      </div>
      <div className="alts">
        {mockPlan.alternatives.map((alt) => (
          <div key={alt.id} className="alt">
            <b>{alt.label}</b>
            <div className="sc">{alt.deltaVsChosen}</div>
          </div>
        ))}
      </div>
    </>
  );
}
