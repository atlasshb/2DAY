/**
 * Forward geocoding (place name → coordinates) via OpenStreetMap's Nominatim
 * — WIZARD-BRIEF §5 steps 1/2. Same never-block contract as `lib/api.ts`:
 * a hard timeout, and callers always get an answer (possibly empty) instead
 * of a thrown error, so the wizard can fall back to a plain free-text label
 * when offline or when Nominatim has nothing.
 */
const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
const GEOCODE_TIMEOUT_MS = 6_000;

export interface GeocodeMatch {
  label: string;
  lat: number;
  lng: number;
}

interface NominatimResult {
  display_name: string;
  lat: string;
  lon: string;
}

/** Top matches for a free-text query (city/area/street). Returns `[]` offline,
 *  on a network error, or when Nominatim has nothing — never throws. */
export async function geocodeSearch(query: string, limit = 3): Promise<GeocodeMatch[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];
  if (typeof navigator !== "undefined" && navigator.onLine === false) return [];

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), GEOCODE_TIMEOUT_MS);
  try {
    const url = new URL(NOMINATIM_URL);
    url.searchParams.set("q", trimmed);
    url.searchParams.set("format", "json");
    url.searchParams.set("limit", String(limit));
    const res = await fetch(url.toString(), {
      signal: ctrl.signal,
      headers: { accept: "application/json" },
    });
    if (!res.ok) return [];
    const results = (await res.json()) as NominatimResult[];
    return results.map((r) => ({
      label: r.display_name,
      lat: Number(r.lat),
      lng: Number(r.lon),
    }));
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}
