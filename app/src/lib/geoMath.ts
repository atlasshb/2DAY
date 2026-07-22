/** Small shared geo helpers — no dependency, used by the trail (TRAIL-BRIEF)
 *  and the mosque search / wizard distance display (WIZARD-BRIEF). */

const EARTH_RADIUS_M = 6_371_000;

export interface LatLng {
  lat: number;
  lng: number;
}

/** Great-circle distance in meters (haversine formula). */
export function haversineMeters(a: LatLng, b: LatLng): number {
  const d2r = (d: number) => (d * Math.PI) / 180;
  const dLat = d2r(b.lat - a.lat);
  const dLng = d2r(b.lng - a.lng);
  const lat1 = d2r(a.lat);
  const lat2 = d2r(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Bounding box of a set of points, with a small margin so points don't sit
 *  flush against the edge of an SVG viewBox. Returns `null` for < 1 point. */
export function boundingBox(
  points: LatLng[],
  marginFrac = 0.12,
): { minLat: number; maxLat: number; minLng: number; maxLng: number } | null {
  if (points.length === 0) return null;
  let minLat = points[0]!.lat;
  let maxLat = points[0]!.lat;
  let minLng = points[0]!.lng;
  let maxLng = points[0]!.lng;
  for (const p of points) {
    if (p.lat < minLat) minLat = p.lat;
    if (p.lat > maxLat) maxLat = p.lat;
    if (p.lng < minLng) minLng = p.lng;
    if (p.lng > maxLng) maxLng = p.lng;
  }
  const latSpan = Math.max(maxLat - minLat, 1e-5);
  const lngSpan = Math.max(maxLng - minLng, 1e-5);
  const latMargin = latSpan * marginFrac;
  const lngMargin = lngSpan * marginFrac;
  return {
    minLat: minLat - latMargin,
    maxLat: maxLat + latMargin,
    minLng: minLng - lngMargin,
    maxLng: maxLng + lngMargin,
  };
}

/** Renders friendly "12 m" / "1.3 km" text for a UI distance pill. */
export function formatDistance(meters: number): string {
  if (meters < 950) return `${Math.round(meters / 10) * 10} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}
