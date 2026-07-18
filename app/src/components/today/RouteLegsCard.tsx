import { todayRouteLegs, todayRouteLegsDone, todayRouteLegsTotal } from "@/lib/mock";

export function RouteLegsCard() {
  return (
    <div className="card">
      <div className="cardtitle">
        Route · {todayRouteLegsDone} of {todayRouteLegsTotal} legs done
      </div>
      {todayRouteLegs.map((leg) => (
        <div
          key={leg.time + leg.text}
          className={leg.status === "upcoming" ? "legrow" : `legrow ${leg.status}`}
        >
          <span className="t">{leg.time}</span>
          <span className="legicon">{leg.icon}</span>
          {leg.text}
        </div>
      ))}
    </div>
  );
}
