/**
 * Mosque lookup near the work area — WIZARD-BRIEF §5c. The one place this app
 * calls out to the network for something other than the (optional) planner:
 * Overpass (OpenStreetMap) for `amenity=place_of_worship` + `religion=muslim`
 * within a 3 km radius. Offline (or on any failure) callers fall back to
 * manual entry — this module never throws, it returns an empty list.
 *
 * Results are cached in Dexie (`mosqueCache`, keyed by a coarse rounded
 * lat/lng) so re-running the wizard for the same work area doesn't re-hit
 * the network.
 */
import { db } from "../offline/db";
import { haversineMeters } from "../geoMath";

export interface MosqueResult {
  id: string; // OSM type/id, e.g. "node/123456"
  name: string;
  lat: number;
  lng: number;
  distanceM: number;
}

const OVERPASS_URL = "https://overpass-api.de/api/interpreter";
const SEARCH_RADIUS_M = 3_000;
const FETCH_TIMEOUT_MS = 8_000;
const CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000; // a day is plenty for a fixed set of mosques

/** Coarse cache key — rounds to ~1 km, deliberately imprecise (this is a
 *  cache bucket, not a location record). */
function areaKey(lat: number, lng: number): string {
  return `${lat.toFixed(2)},${lng.toFixed(2)}`;
}

interface OverpassElement {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

function elementName(el: OverpassElement, index: number): string {
  return el.tags?.name ?? el.tags?.["name:en"] ?? `Mosque ${index + 1}`;
}

async function queryOverpass(lat: number, lng: number): Promise<MosqueResult[]> {
  const query = `[out:json][timeout:6];(
    node["amenity"="place_of_worship"]["religion"="muslim"](around:${SEARCH_RADIUS_M},${lat},${lng});
    way["amenity"="place_of_worship"]["religion"="muslim"](around:${SEARCH_RADIUS_M},${lat},${lng});
  );out center;`;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(OVERPASS_URL, {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: query,
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`overpass ${res.status}`);
    const data = (await res.json()) as { elements: OverpassElement[] };
    return data.elements
      .map((el, i) => {
        const point = el.center ?? { lat: el.lat, lon: el.lon };
        if (point.lat == null || point.lon == null) return null;
        return {
          id: `${el.type}/${el.id}`,
          name: elementName(el, i),
          lat: point.lat,
          lng: point.lon,
          distanceM: haversineMeters({ lat, lng }, { lat: point.lat, lng: point.lon }),
        } satisfies MosqueResult;
      })
      .filter((r): r is MosqueResult => r !== null)
      .sort((a, b) => a.distanceM - b.distanceM);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Nearest 5 mosques around `{lat, lng}` (the work area), nearest first.
 * Cache-first (same day, same ~1km bucket); network only on a cache miss.
 * Never throws — returns `[]` offline or on any Overpass failure, so callers
 * always fall through to "I know a place" manual entry.
 */
export async function findNearbyMosques(lat: number, lng: number): Promise<MosqueResult[]> {
  const key = areaKey(lat, lng);
  try {
    const cached = await db.mosqueCache.get(key);
    if (cached && Date.now() - new Date(cached.fetchedAt).getTime() < CACHE_MAX_AGE_MS) {
      return cached.results.slice(0, 5);
    }
  } catch {
    // Dexie unavailable (shouldn't happen client-side) — fall through to network.
  }

  if (typeof navigator !== "undefined" && navigator.onLine === false) return [];

  try {
    const results = await queryOverpass(lat, lng);
    try {
      await db.mosqueCache.put({ areaKey: key, fetchedAt: new Date().toISOString(), results });
    } catch {
      // Caching is best-effort — a failed write shouldn't fail the search.
    }
    return results.slice(0, 5);
  } catch {
    return [];
  }
}
