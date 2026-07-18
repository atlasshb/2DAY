import { timeline } from "@/lib/mock";

export function Timeline() {
  return (
    <div className="card">
      <div className="cardtitle">Timeline</div>
      <div className="tl">
        {timeline.map((row) => (
          <div className="tlr" key={row.time + row.text}>
            <span className="t">{row.time}</span>
            {row.text}
            {row.dots ? (
              <span style={{ color: "var(--sale)" }}>
                {" "}
                {Array.from({ length: row.dots }, () => "●").join(" ")}
              </span>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
