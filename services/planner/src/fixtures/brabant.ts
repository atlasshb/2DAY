/**
 * Deterministic seed dataset for the MVP — real Noord-Brabant neighbourhoods,
 * stations and Basic-Fit gyms (brief §12: concrete Dutch examples). In
 * production every row here is a Postgres/PostGIS record (`area`,
 * `street_edge`, `poi`, station stop) read via PostGIS; the pipeline treats
 * this module as the read-only reference layer, so swapping to the DB is a
 * matter of replacing the loaders below.
 *
 * Coordinates are approximate real centroids; door counts / dwelling mixes are
 * plausible (est.) values, not surveyed facts (brief §12: label estimates).
 */
import type { DwellingFeatures, GeoPoint, H3Index, ULID } from "../core.js";
import { encodeCrockford } from "../util/ulid.js";
import { haversineM } from "../util/geo.js";

type DwellingKind = DwellingFeatures["kind"];

export interface StreetEdge {
  id: ULID;
  name: string;
  lengthM: number;
  doorsEven: number;
  doorsOdd: number;
  apartmentRatio: number; // 0..1 share of units behind locked portiek entries
}

export interface AreaFixture {
  id: ULID;
  buurtCode: string; // CBS buurt code
  name: string;
  city: string;
  stationId: ULID; // the working-city station this buurt hangs off
  centroid: GeoPoint;
  doorCount: number;
  dwellingMix: Record<DwellingKind, number>; // fractions, ~sum 1
  incomeTier: number; // 0 low … 1 high (CBS)
  apartmentRatio: number; // 0..1
  h3Cells: H3Index[]; // res-9 scoring cells (illustrative)
  edges: StreetEdge[];
}

export interface StationFixture {
  id: ULID;
  name: string;
  stopId: string; // GTFS-ish stop id
  city: string;
  point: GeoPoint;
}

export interface GymFixture {
  id: ULID;
  chain: string;
  name: string;
  nearStationId: ULID;
  point: GeoPoint;
  lockers: boolean;
  showers: boolean;
}

/** Stable, valid Crockford-base32 ULIDs for fixtures (deterministic per index). */
const fid = (n: number): ULID => encodeCrockford(BigInt(n), 26);

// --- Stations -------------------------------------------------------------
const ST_DEN_BOSCH = fid(1);
const ST_TILBURG = fid(2);
const ST_EINDHOVEN = fid(3);
const ST_BREDA = fid(4);

export const STATIONS: StationFixture[] = [
  { id: ST_DEN_BOSCH, name: "'s-Hertogenbosch", stopId: "NL:S:ht", city: "'s-Hertogenbosch", point: { lat: 51.6906, lng: 5.2933 } },
  { id: ST_TILBURG, name: "Tilburg", stopId: "NL:S:tb", city: "Tilburg", point: { lat: 51.5606, lng: 5.0836 } },
  { id: ST_EINDHOVEN, name: "Eindhoven Centraal", stopId: "NL:S:ehv", city: "Eindhoven", point: { lat: 51.4433, lng: 5.4797 } },
  { id: ST_BREDA, name: "Breda", stopId: "NL:S:bd", city: "Breda", point: { lat: 51.5952, lng: 4.7799 } },
];

// --- Gyms (Basic-Fit near each station) ----------------------------------
export const GYMS: GymFixture[] = [
  { id: fid(101), chain: "basic_fit", name: "Basic-Fit 's-Hertogenbosch Centraal", nearStationId: ST_DEN_BOSCH, point: { lat: 51.6918, lng: 5.2966 }, lockers: true, showers: true },
  { id: fid(102), chain: "basic_fit", name: "Basic-Fit Tilburg Spoorlaan", nearStationId: ST_TILBURG, point: { lat: 51.5619, lng: 5.0871 }, lockers: true, showers: true },
  { id: fid(103), chain: "basic_fit", name: "Basic-Fit Eindhoven Centraal", nearStationId: ST_EINDHOVEN, point: { lat: 51.4451, lng: 5.4772 }, lockers: true, showers: true },
  { id: fid(104), chain: "basic_fit", name: "Basic-Fit Breda Stationsplein", nearStationId: ST_BREDA, point: { lat: 51.5941, lng: 4.7823 }, lockers: true, showers: true },
];

// --- Edge builder ---------------------------------------------------------
// Compact tuple: [name, lengthM, doorsEven, doorsOdd, apartmentRatio]
type EdgeSpec = [string, number, number, number, number];
const edges = (areaIdx: number, specs: EdgeSpec[]): StreetEdge[] =>
  specs.map((s, i) => ({
    id: fid(100_000 + areaIdx * 100 + i),
    name: s[0],
    lengthM: s[1],
    doorsEven: s[2],
    doorsOdd: s[3],
    apartmentRatio: s[4],
  }));

const mix = (
  terraced: number,
  detached: number,
  semi_detached: number,
  apartment: number,
  other: number,
): Record<DwellingKind, number> => ({ terraced, detached, semi_detached, apartment, other });

// --- Areas ----------------------------------------------------------------
export const AREAS: AreaFixture[] = [
  {
    id: fid(201),
    buurtCode: "BU08550710",
    name: "Groenewoud-West",
    city: "Tilburg",
    stationId: ST_TILBURG,
    centroid: { lat: 51.5401, lng: 5.0902 },
    doorCount: 612,
    dwellingMix: mix(0.52, 0.06, 0.18, 0.2, 0.04),
    incomeTier: 0.58,
    apartmentRatio: 0.2,
    h3Cells: ["891f2d4a15bffff", "891f2d4a153ffff"],
    edges: edges(1, [
      ["Prof. Cobbenhagenlaan", 340, 22, 20, 0.15],
      ["Prof. Verbernelaan", 260, 18, 16, 0.05],
      ["Prof. Dondersstraat", 210, 14, 14, 0.0],
      ["Prof. de Moorplein", 180, 10, 8, 0.6],
      ["Academielaan", 300, 20, 18, 0.1],
      ["Conservatoriumlaan", 240, 16, 15, 0.25],
      ["Prof. Goossenslaan", 280, 19, 17, 0.05],
      ["Warandelaan", 420, 12, 10, 0.4],
      ["Statenlaan", 360, 24, 22, 0.3],
    ]),
  },
  {
    id: fid(202),
    buurtCode: "BU08550711",
    name: "Groenewoud-Oost",
    city: "Tilburg",
    stationId: ST_TILBURG,
    centroid: { lat: 51.5386, lng: 5.0981 },
    doorCount: 548,
    dwellingMix: mix(0.46, 0.05, 0.2, 0.25, 0.04),
    incomeTier: 0.52,
    apartmentRatio: 0.25,
    h3Cells: ["891f2d4a157ffff"],
    edges: edges(2, [
      ["Prof. Stoopstraat", 220, 15, 14, 0.1],
      ["Prof. Gimbrèrelaan", 300, 20, 18, 0.2],
      ["Prof. Keetelslaan", 240, 16, 15, 0.05],
      ["Prof. Kolfschotenstraat", 200, 13, 12, 0.0],
      ["Ringbaan-Oost", 480, 10, 8, 0.7],
      ["Sophiastraat", 260, 18, 16, 0.15],
      ["Generaal Smutslaan", 320, 21, 19, 0.3],
      ["Montfortanenlaan", 210, 14, 13, 0.1],
    ]),
  },
  {
    id: fid(203),
    buurtCode: "BU08550820",
    name: "Stappegoor-Noord",
    city: "Tilburg",
    stationId: ST_TILBURG,
    centroid: { lat: 51.5449, lng: 5.0851 },
    doorCount: 466,
    dwellingMix: mix(0.4, 0.04, 0.16, 0.36, 0.04),
    incomeTier: 0.48,
    apartmentRatio: 0.36,
    h3Cells: ["891f2d4a14bffff", "891f2d4a143ffff"],
    edges: edges(3, [
      ["Stappegoorweg", 520, 16, 14, 0.5],
      ["Hoogvensestraat", 300, 20, 18, 0.2],
      ["Broekhovenseweg", 460, 24, 22, 0.15],
      ["Goirleseweg", 400, 18, 16, 0.4],
      ["Zwijsenplein", 160, 9, 8, 0.65],
      ["Ringbaan-Zuid", 480, 8, 6, 0.7],
      ["Jan Wierhof", 240, 15, 14, 0.1],
      ["Trouwlaan", 340, 22, 20, 0.2],
      ["Abcovenseweg", 280, 17, 15, 0.05],
    ]),
  },
  {
    id: fid(204),
    buurtCode: "BU07960311",
    name: "Maaspoort",
    city: "'s-Hertogenbosch",
    stationId: ST_DEN_BOSCH,
    centroid: { lat: 51.7182, lng: 5.3049 },
    doorCount: 704,
    dwellingMix: mix(0.6, 0.08, 0.18, 0.1, 0.04),
    incomeTier: 0.55,
    apartmentRatio: 0.1,
    h3Cells: ["891f2d05a2bffff", "891f2d05a23ffff", "891f2d05a27ffff"],
    edges: edges(4, [
      ["Rembrandtlaan", 380, 26, 24, 0.05],
      ["Jan Steenstraat", 240, 18, 16, 0.0],
      ["Vermeerstraat", 260, 19, 17, 0.0],
      ["Frans Halsstraat", 220, 15, 14, 0.05],
      ["Jeroen Boschlaan", 440, 22, 20, 0.2],
      ["Jan Sluijtersstraat", 300, 21, 19, 0.0],
      ["Marisstraat", 210, 14, 13, 0.0],
      ["Nachtwachtlaan", 360, 24, 22, 0.1],
      ["Rompertsebaan", 520, 12, 10, 0.45],
      ["Mondriaanplein", 180, 10, 9, 0.55],
    ]),
  },
  {
    id: fid(205),
    buurtCode: "BU07960120",
    name: "Hambaken",
    city: "'s-Hertogenbosch",
    stationId: ST_DEN_BOSCH,
    centroid: { lat: 51.7003, lng: 5.3208 },
    doorCount: 512,
    dwellingMix: mix(0.5, 0.05, 0.15, 0.26, 0.04),
    incomeTier: 0.5,
    apartmentRatio: 0.26,
    h3Cells: ["891f2d05a0bffff"],
    edges: edges(5, [
      ["Hervensebaan", 480, 16, 14, 0.35],
      ["Hambakendreef", 420, 18, 16, 0.3],
      ["Graafseweg", 500, 22, 20, 0.25],
      ["Aartshertogenlaan", 340, 20, 18, 0.2],
      ["Vlijmenseweg", 460, 14, 12, 0.5],
      ["Zandzuigerstraat", 240, 15, 14, 0.1],
      ["Ertveldstraat", 220, 13, 12, 0.05],
      ["Balkweg", 300, 17, 15, 0.4],
    ]),
  },
  {
    id: fid(206),
    buurtCode: "BU07720640",
    name: "Achtse Barrier",
    city: "Eindhoven",
    stationId: ST_EINDHOVEN,
    centroid: { lat: 51.4848, lng: 5.4553 },
    doorCount: 588,
    dwellingMix: mix(0.55, 0.06, 0.19, 0.16, 0.04),
    incomeTier: 0.53,
    apartmentRatio: 0.16,
    h3Cells: ["891f2c9b19bffff", "891f2c9b193ffff"],
    edges: edges(6, [
      ["Gunterslaer", 360, 22, 20, 0.1],
      ["Baekelandplein", 200, 12, 10, 0.5],
      ["Ariënsstraat", 260, 18, 16, 0.05],
      ["Distelvlinderplein", 180, 11, 10, 0.4],
      ["Vlokhovenseweg", 440, 24, 22, 0.15],
      ["Boschdijk", 520, 14, 12, 0.6],
      ["Wachterstraat", 240, 16, 15, 0.1],
      ["Frankrijkstraat", 300, 20, 18, 0.2],
      ["Rijnstraat", 280, 19, 17, 0.15],
    ]),
  },
  {
    id: fid(207),
    buurtCode: "BU07580810",
    name: "Haagse Beemden",
    city: "Breda",
    stationId: ST_BREDA,
    centroid: { lat: 51.6101, lng: 4.7501 },
    doorCount: 656,
    dwellingMix: mix(0.58, 0.07, 0.2, 0.11, 0.04),
    incomeTier: 0.6,
    apartmentRatio: 0.11,
    h3Cells: ["891f2d38b2bffff", "891f2d38b23ffff", "891f2d38b27ffff"],
    edges: edges(7, [
      ["Heksenwiel", 420, 24, 22, 0.1],
      ["Muizenberg", 360, 22, 20, 0.05],
      ["Kroeten", 340, 20, 18, 0.1],
      ["Waterdonken", 300, 18, 16, 0.15],
      ["Moerenpad", 260, 16, 14, 0.0],
      ["Asterd", 280, 17, 15, 0.05],
      ["Kesteren", 320, 19, 17, 0.2],
      ["Emerparklaan", 480, 14, 12, 0.4],
      ["Nieuwe Kadijk", 500, 12, 10, 0.55],
      ["Hoefblad", 220, 14, 13, 0.05],
    ]),
  },
  {
    id: fid(208),
    buurtCode: "BU07580730",
    name: "Hoge Vucht",
    city: "Breda",
    stationId: ST_BREDA,
    centroid: { lat: 51.6046, lng: 4.7902 },
    doorCount: 534,
    dwellingMix: mix(0.38, 0.03, 0.14, 0.41, 0.04),
    incomeTier: 0.42,
    apartmentRatio: 0.41,
    h3Cells: ["891f2d38b0bffff", "891f2d38b03ffff"],
    edges: edges(8, [
      ["Moleneind", 460, 16, 14, 0.45],
      ["Wisselaar", 380, 18, 16, 0.4],
      ["Geeren-Noord", 420, 20, 18, 0.5],
      ["Kesterenlaan", 300, 15, 14, 0.35],
      ["Doornbos", 340, 17, 15, 0.3],
      ["Biesdonk", 280, 14, 13, 0.4],
      ["Muwiterrein", 240, 12, 11, 0.6],
      ["Terheijdenseweg", 520, 13, 11, 0.55],
    ]),
  },
];

// --- Loaders (the read seam to PostGIS) -----------------------------------
export const getAreaById = (id: ULID): AreaFixture | undefined =>
  AREAS.find((a) => a.id === id);

export const getStationById = (id: ULID): StationFixture | undefined =>
  STATIONS.find((s) => s.id === id);

export const areasForStation = (stationId: ULID): AreaFixture[] =>
  AREAS.filter((a) => a.stationId === stationId);

export const gymForStation = (stationId: ULID): GymFixture | undefined =>
  GYMS.find((g) => g.nearStationId === stationId);

/** Nearest fixture station to an arbitrary point (great-circle). */
export function nearestStation(point: GeoPoint): StationFixture {
  let best = STATIONS[0]!;
  let bestD = Infinity;
  for (const s of STATIONS) {
    const d = haversineM(point, s.point);
    if (d < bestD) {
      bestD = d;
      best = s;
    }
  }
  return best;
}

export const getEdgeById = (id: ULID): { area: AreaFixture; edge: StreetEdge } | undefined => {
  for (const area of AREAS) {
    const edge = area.edges.find((e) => e.id === id);
    if (edge) return { area, edge };
  }
  return undefined;
};
