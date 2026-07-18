import type { GeoPoint } from "../core.js";

/** Great-circle distance in metres between two WGS84 points (haversine). */
export function haversineM(a: GeoPoint, b: GeoPoint): number {
  const R = 6_371_000; // mean Earth radius, m
  const toRad = (d: number): number => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Straight-line MST length (metres) over a set of points. Cheap proxy used by
 * L1 `intra_area_walk` (doc 11 §2.4) to discourage scattering areas across a
 * city. Prim's algorithm — deterministic, O(n²).
 */
export function mstLengthM(points: GeoPoint[]): number {
  if (points.length <= 1) return 0;
  const n = points.length;
  const inTree = new Array<boolean>(n).fill(false);
  const dist = new Array<number>(n).fill(Infinity);
  dist[0] = 0;
  let total = 0;
  for (let iter = 0; iter < n; iter++) {
    let u = -1;
    let best = Infinity;
    for (let i = 0; i < n; i++) {
      if (!inTree[i] && dist[i]! < best) {
        best = dist[i]!;
        u = i;
      }
    }
    if (u === -1) break;
    inTree[u] = true;
    total += best === Infinity ? 0 : best;
    for (let v = 0; v < n; v++) {
      if (!inTree[v]) {
        const d = haversineM(points[u]!, points[v]!);
        if (d < dist[v]!) dist[v] = d;
      }
    }
  }
  return total;
}
