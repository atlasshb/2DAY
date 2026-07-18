/**
 * Walking engine adapter. THIS IS THE SEAM where the real self-hosted
 * **Valhalla** pedestrian router plugs in later (docs/00 §3, docs/11 §1
 * `M_walk`). The interface is exactly what the pipeline needs — a pedestrian
 * duration matrix in seconds — so the production implementation just swaps the
 * mock for a Valhalla `/sources_to_targets` call. Nothing downstream changes.
 *
 * Mock cost model (docs/11 §7 fallback): great-circle distance × 1.25 urban
 * detour factor ÷ walking speed. Deterministic — no randomness, no clock.
 */
import type { GeoPoint } from "../core.js";
import { DEFAULT_WALK_MPS, URBAN_DETOUR } from "../config.js";
import { haversineM } from "../util/geo.js";

export interface WalkingEngine {
  /** Symmetric N×N pedestrian duration matrix in seconds (0 on the diagonal). */
  matrix(points: GeoPoint[]): Promise<number[][]>;
}

export class MockWalkingEngine implements WalkingEngine {
  constructor(private readonly speedMps: number = DEFAULT_WALK_MPS) {}

  async matrix(points: GeoPoint[]): Promise<number[][]> {
    const n = points.length;
    const m: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(0));
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const sec = Math.round((haversineM(points[i]!, points[j]!) * URBAN_DETOUR) / this.speedMps);
        m[i]![j] = sec;
        m[j]![i] = sec;
      }
    }
    return m;
  }
}
