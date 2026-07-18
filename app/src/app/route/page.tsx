import { MapSvg } from "@/components/route/MapSvg";
import { MapTools } from "@/components/route/MapTools";
import { SnapSheet } from "@/components/route/SnapSheet";
import { RouteEffects } from "@/components/route/RouteEffects";

export default function RoutePage() {
  return (
    <section className="screen screen-route" aria-label="Route">
      <RouteEffects />
      <div className="mapwrap">
        <MapSvg />
      </div>
      <MapTools />
      <SnapSheet />
    </section>
  );
}
