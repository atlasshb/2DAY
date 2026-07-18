"use client";

import { useStore } from "@/lib/store";
import { locationBreadcrumb, todayDateLabel, weather, workHoursToday } from "@/lib/mock";

export function Hero() {
  const { rainReplanned } = useStore();

  return (
    <div className="hero">
      <div className="heror">
        <span className="loc">{locationBreadcrumb}</span>
        <span className="pill" style={{ marginLeft: "auto" }}>
          {todayDateLabel}
        </span>
      </div>
      <div className="weather">
        <span className="temp">{weather.temp}°</span>
        <span className="wmeta">
          {weather.condition} · {weather.wind}
        </span>
        <span className="pill rainpill">
          {rainReplanned ? "☂ Route re-planned for rain" : `☂ Rain in ${weather.rainInMin} min`}
        </span>
      </div>
      <div className="hoursbar">
        <div className="hourslbl">
          <span>{workHoursToday.label}</span>
          <span>
            {workHoursToday.elapsed} · {workHoursToday.remaining}
          </span>
        </div>
        <div className="track">
          <div className="fill" style={{ width: `${workHoursToday.fillPct}%` }} />
        </div>
      </div>
    </div>
  );
}
