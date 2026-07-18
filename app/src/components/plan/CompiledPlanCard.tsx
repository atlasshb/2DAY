import { compiledPlanStats, planLegRows } from "@/lib/mock";

export function CompiledPlanCard() {
  return (
    <div className="card" style={{ marginBottom: 12 }}>
      <div className="cardtitle">Compiled plan · Tilburg</div>
      <div className="evrow">
        <span className="pill">~{compiledPlanStats.doors} doors</span>
        <span className="pill">~{compiledPlanStats.convos} convos</span>
        <span className="pill" style={{ color: "var(--sale)" }}>
          ~{compiledPlanStats.sales} sales
        </span>
        <span className="pill">{compiledPlanStats.km} km</span>
      </div>
      {planLegRows.map((row) => (
        <div key={row.time + row.text} className="legrow">
          <span className="t">{row.time}</span>
          <span className="legicon">{row.icon}</span>
          {row.text}
        </div>
      ))}
    </div>
  );
}
