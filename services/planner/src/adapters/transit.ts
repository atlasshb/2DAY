/**
 * Transit planner adapter. THIS IS THE SEAM where the real self-hosted
 * **OpenTripPlanner 2** (OVapi GTFS + GTFS-RT) plugs in later (docs/00 §3,
 * docs/11 §1 `M_transit`, doc 13). The interface returns ranked itineraries;
 * production swaps the mock timetable for an OTP2 `/plan` call.
 *
 * Mock timetable covers the Brabant corridor Den Bosch ↔ Tilburg ↔ Eindhoven
 * ↔ Breda with fixed IC/Sprinter durations and clock-anchored headways
 * (IC :00/:30, SPR :15/:45). Fully deterministic — departures are a function
 * of the departAfter wall-clock only; no randomness.
 */
import type { ISODateTime } from "../core.js";
import { formatIso, parseOffset, toEpoch, MIN } from "../util/time.js";
import type { StationFixture } from "../fixtures/brabant.js";

export interface TransitItinerary {
  fromStopId: string;
  toStopId: string;
  routeShortName: string; // "IC 3500" | "SPR 6400"
  mode: "train";
  departAt: ISODateTime;
  arriveAt: ISODateTime;
  durationSec: number;
  fareEur: number;
}

export interface TransitPlanner {
  itineraries(
    from: StationFixture,
    to: StationFixture,
    departAfter: ISODateTime,
  ): Promise<TransitItinerary[]>;
}

interface ServicePattern {
  label: string; // "IC" | "SPR"
  durationMin: number;
  headwayMinuteMarks: number[]; // clock minutes past the hour a train departs
  seq: number; // for route number synthesis
}

/** Symmetric city-pair timetable. Durations are plausible NS values (est.). */
const PATTERNS: Record<string, ServicePattern[]> = {
  "ht|tb": [
    { label: "IC", durationMin: 16, headwayMinuteMarks: [3, 33], seq: 3500 },
    { label: "SPR", durationMin: 22, headwayMinuteMarks: [18, 48], seq: 6400 },
  ],
  "ht|ehv": [{ label: "IC", durationMin: 22, headwayMinuteMarks: [7, 37], seq: 3600 }],
  "ht|bd": [{ label: "IC", durationMin: 26, headwayMinuteMarks: [12, 42], seq: 3700 }],
  "tb|ehv": [
    { label: "IC", durationMin: 21, headwayMinuteMarks: [9, 39], seq: 3540 },
    { label: "SPR", durationMin: 27, headwayMinuteMarks: [24, 54], seq: 6420 },
  ],
  "tb|bd": [
    { label: "IC", durationMin: 14, headwayMinuteMarks: [5, 35], seq: 3510 },
    { label: "SPR", durationMin: 19, headwayMinuteMarks: [20, 50], seq: 6440 },
  ],
  "ehv|bd": [{ label: "IC", durationMin: 38, headwayMinuteMarks: [15, 45], seq: 3560 }],
};

const shortCode = (stopId: string): string => stopId.split(":").pop() ?? stopId;

function patternKey(a: string, b: string): { key: string; forward: boolean } {
  const ca = shortCode(a);
  const cb = shortCode(b);
  const direct = `${ca}|${cb}`;
  if (PATTERNS[direct]) return { key: direct, forward: true };
  return { key: `${cb}|${ca}`, forward: false };
}

const HORIZON_HOURS = 15; // enumerate ~a full service day of departures from departAfter

export class MockTransitPlanner implements TransitPlanner {
  async itineraries(
    from: StationFixture,
    to: StationFixture,
    departAfter: ISODateTime,
  ): Promise<TransitItinerary[]> {
    if (from.stopId === to.stopId) return [];
    const { key } = patternKey(from.stopId, to.stopId);
    const patterns = PATTERNS[key];
    if (!patterns) return [];

    const offset = parseOffset(departAfter);
    const afterMs = toEpoch(departAfter);
    const out: TransitItinerary[] = [];

    const baseHour = Math.floor(afterMs / (60 * MIN)) * 60 * MIN;
    for (const p of patterns) {
      // Enumerate the whole service day forward from departAfter so callers can
      // find both the earliest arrival (inbound) and the latest usable train
      // home (outbound). Bounded to HORIZON_HOURS to stay finite.
      for (let h = 0; h < HORIZON_HOURS; h++) {
        for (const mark of p.headwayMinuteMarks) {
          const depMs = baseHour + h * 60 * MIN + mark * MIN;
          if (depMs < afterMs) continue;
          const arrMs = depMs + p.durationMin * MIN;
          out.push({
            fromStopId: from.stopId,
            toStopId: to.stopId,
            routeShortName: `${p.label} ${p.seq}`,
            mode: "train",
            departAt: formatIso(depMs, offset),
            arriveAt: formatIso(arrMs, offset),
            durationSec: p.durationMin * 60,
            fareEur: Math.round((2.4 + 0.16 * p.durationMin) * 100) / 100,
          });
        }
      }
    }
    // Rank by arrival time (earliest first), stable.
    out.sort((a, b) => toEpoch(a.arriveAt) - toEpoch(b.arriveAt));
    return out;
  }
}
