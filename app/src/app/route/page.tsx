"use client";

import { useDemoMode } from "@/lib/dayProfile";
import { MapSvg } from "@/components/route/MapSvg";
import { MapTools } from "@/components/route/MapTools";
import { SnapSheet } from "@/components/route/SnapSheet";
import { RouteEffects } from "@/components/route/RouteEffects";
import { RouteLive } from "@/components/route/RouteLive";

export default function RoutePage() {
  const demo = useDemoMode();
  return (
    <section className={`screen${demo ? " screen-route" : ""}`} aria-label="Route">
      {demo ? (
        <>
          <RouteEffects />
          <div className="mapwrap">
            <MapSvg />
          </div>
          <MapTools />
          <SnapSheet />
        </>
      ) : (
        <RouteLive />
      )}
    </section>
  );
}
