import type { Plan } from "@2day/core";

export function Alternatives({ plan }: { plan: Plan }) {
  return (
    <>
      <div className="cardtitle" style={{ margin: "0 2px 2px" }}>
        Alternatives
      </div>
      <div className="alts">
        {plan.alternatives.map((alt) => (
          <div key={alt.id} className="alt">
            <b>{alt.label}</b>
            <div className="sc">{alt.deltaVsChosen}</div>
          </div>
        ))}
      </div>
    </>
  );
}
