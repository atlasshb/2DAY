/**
 * On-device prayer time calculation — WIZARD-BRIEF §5a/b.
 *
 * Pure astronomical calculation, no network, no dependency. Uses the sun's
 * declination and the equation of time (NOAA's low-precision solar position
 * series, accurate to well under a minute for civil use) plus the standard
 * hour-angle formula for a given depression/elevation angle. Fajr/Isha use
 * the calculation method's twilight angle; Asr uses the madhab's shadow
 * factor. Above ~48° latitude the sun sometimes never reaches the twilight
 * angle in midsummer (or the angle-based solution lands implausibly deep in
 * the night) — the "Angle-Based" high-latitude rule (the convention most
 * calculation authorities, incl. the Muslim World League, use for NW Europe)
 * substitutes a fraction of the night's length in that case.
 *
 * Verified against docs' reference dataset (18 rows, Netherlands, MWL
 * method, both madhabs, solstices + an equinox-ish date) to <= 2 min.
 */
import type { ISODateTime } from "../types.js";

export type PrayerCalcMethod = "MWL" | "ISNA";
export type AsrMadhab = "standard" | "hanafi";

/** Twilight angles (degrees below horizon) per calculation method. */
const METHOD_ANGLES: Record<PrayerCalcMethod, { fajr: number; isha: number }> = {
  MWL: { fajr: 18, isha: 17 },
  ISNA: { fajr: 15, isha: 15 },
};

export interface PrayerTimesInput {
  /** Calendar date, local to the location (not shifted to UTC). */
  year: number;
  month: number; // 1-12
  day: number;
  lat: number;
  lng: number;
  /** UTC offset of local civil time at this location/date, in minutes (e.g. 120 for CEST). */
  utcOffsetMinutes: number;
  method?: PrayerCalcMethod; // default MWL
  asrMadhab?: AsrMadhab; // default standard
}

/** Minutes from local midnight. Can be negative or exceed 1440 near date
 *  boundaries (e.g. Isha past midnight in NW-European summer) — callers
 *  normalize with `prayerMinutesToISO`, which rolls the calendar day over. */
export interface PrayerTimesMinutes {
  fajr: number;
  sunrise: number;
  dhuhr: number;
  asr: number;
  maghrib: number;
  isha: number;
}

const d2r = (deg: number): number => (deg * Math.PI) / 180;
const r2d = (rad: number): number => (rad * 180) / Math.PI;

function dayOfYear(year: number, month: number, day: number): number {
  const start = Date.UTC(year, 0, 1);
  const cur = Date.UTC(year, month - 1, day);
  return Math.round((cur - start) / 86_400_000) + 1;
}

/** NOAA low-precision solar position series (public domain). Returns the
 *  sun's declination (radians) and the equation of time (minutes) for a
 *  given day of year, evaluated at local noon. */
function sunPosition(doy: number): { decl: number; eqtimeMin: number } {
  const gamma = ((2 * Math.PI) / 365) * (doy - 1);
  const decl =
    0.006918 -
    0.399912 * Math.cos(gamma) +
    0.070257 * Math.sin(gamma) -
    0.006758 * Math.cos(2 * gamma) +
    0.000907 * Math.sin(2 * gamma) -
    0.002697 * Math.cos(3 * gamma) +
    0.00148 * Math.sin(3 * gamma);
  const eqtimeMin =
    229.18 *
    (0.000075 +
      0.001868 * Math.cos(gamma) -
      0.032077 * Math.sin(gamma) -
      0.014615 * Math.cos(2 * gamma) -
      0.040849 * Math.sin(2 * gamma));
  return { decl, eqtimeMin };
}

/** cos(hour angle) for the sun to reach `altitudeDeg` (signed: negative =
 *  below horizon) at `lat`/`decl`. Outside [-1, 1] the sun never reaches
 *  that altitude on this day. */
function hourAngleCos(lat: number, decl: number, altitudeDeg: number): number {
  return (
    (Math.sin(d2r(altitudeDeg)) - Math.sin(d2r(lat)) * Math.sin(decl)) /
    (Math.cos(d2r(lat)) * Math.cos(decl))
  );
}

function hourAngleDeg(lat: number, decl: number, altitudeDeg: number): number {
  const cos = Math.max(-1, Math.min(1, hourAngleCos(lat, decl, altitudeDeg)));
  return r2d(Math.acos(cos));
}

export function computePrayerTimes(input: PrayerTimesInput): PrayerTimesMinutes {
  const method = input.method ?? "MWL";
  const madhab = input.asrMadhab ?? "standard";
  const { fajr: fajrAngle, isha: ishaAngle } = METHOD_ANGLES[method];
  const shadowFactor = madhab === "hanafi" ? 2 : 1;

  const { lat, lng } = input;
  const doy = dayOfYear(input.year, input.month, input.day);
  const { decl, eqtimeMin } = sunPosition(doy);

  // Solar noon and civil-twilight (sunrise/sunset) times, in minutes from
  // local midnight — NOAA's standard formula (720 = 12:00, 4 min per degree
  // of longitude, `utcOffsetMinutes/60` hours added back for civil time).
  const solarNoon = 720 - 4 * lng - eqtimeMin + input.utcOffsetMinutes;
  const haSun = hourAngleDeg(lat, decl, -0.833); // atmospheric refraction + solar radius
  const sunrise = solarNoon - 4 * haSun;
  const maghrib = solarNoon + 4 * haSun;
  const nightLength = 1440 - (maghrib - sunrise); // this night, approximated from today's day length

  /** Fajr (sign -1) or Isha (sign +1): normal angle-based time, unless the
   *  angle is unreachable or the resulting offset eats more than half the
   *  night (the degenerate near-boundary case) — then fall back to the
   *  Angle-Based high-latitude rule: a fixed fraction of the night,
   *  measured from sunrise/maghrib. */
  function twilightTime(angleDeg: number, anchor: number, sign: 1 | -1): number {
    const cos = hourAngleCos(lat, decl, -angleDeg);
    const offset = cos >= -1 && cos <= 1 ? 4 * r2d(Math.acos(cos)) : Infinity;
    if (offset > nightLength / 2) {
      return anchor + sign * (angleDeg / 60) * nightLength;
    }
    return solarNoon + sign * offset;
  }

  const fajr = twilightTime(fajrAngle, sunrise, -1);
  const isha = twilightTime(ishaAngle, maghrib, 1);

  // Asr: sun altitude where an object's shadow = shadowFactor * object length
  // beyond its noon shadow, i.e. altitude = arccot(shadowFactor + tan(|lat - decl|)).
  const latDeclDiff = Math.abs(d2r(lat) - decl);
  const asrAltitude = r2d(Math.atan(1 / (shadowFactor + Math.tan(latDeclDiff))));
  const asr = solarNoon + 4 * hourAngleDeg(lat, decl, asrAltitude);

  return { fajr, sunrise, dhuhr: solarNoon, asr, maghrib, isha };
}

/** Renders minutes-from-midnight (wrapping) as a 24h "HH:MM" clock string, for display only. */
export function formatClock(minutes: number): string {
  const wrapped = ((minutes % 1440) + 1440) % 1440;
  const h = Math.floor(wrapped / 60);
  const m = Math.round(wrapped % 60) % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function pad(n: number, len = 2): string {
  return String(n).padStart(len, "0");
}

function offsetSuffix(utcOffsetMinutes: number): string {
  const sign = utcOffsetMinutes >= 0 ? "+" : "-";
  const abs = Math.abs(utcOffsetMinutes);
  return `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

/** Formats a UTC instant (ms) as a wall-clock ISODateTime at `utcOffsetMinutes`. */
function formatAtOffset(instantMs: number, utcOffsetMinutes: number): ISODateTime {
  const local = new Date(instantMs + utcOffsetMinutes * 60_000);
  return (
    `${local.getUTCFullYear()}-${pad(local.getUTCMonth() + 1)}-${pad(local.getUTCDate())}` +
    `T${pad(local.getUTCHours())}:${pad(local.getUTCMinutes())}:${pad(local.getUTCSeconds())}${offsetSuffix(utcOffsetMinutes)}`
  );
}

/** Combines a calendar day + UTC offset + minutes-from-midnight (may be
 *  negative or >= 1440, rolling to the previous/next calendar day) into a
 *  proper offset ISODateTime. */
export function prayerMinutesToISO(
  base: { year: number; month: number; day: number; utcOffsetMinutes: number },
  minutes: number,
): ISODateTime {
  const localMidnightUtcMs = Date.UTC(base.year, base.month - 1, base.day) - base.utcOffsetMinutes * 60_000;
  const instantMs = localMidnightUtcMs + minutes * 60_000;
  return formatAtOffset(instantMs, base.utcOffsetMinutes);
}

/** Parses the trailing `+HH:MM` / `-HH:MM` / `Z` of an ISODateTime into minutes east of UTC. */
function parseOffsetMinutes(iso: ISODateTime): number {
  const m = /([+-])(\d{2}):(\d{2})$/.exec(iso);
  if (!m) return 0; // "Z" (UTC)
  const sign = m[1] === "-" ? -1 : 1;
  return sign * (Number(m[2]) * 60 + Number(m[3]));
}

/** Adds `minutes` to an ISODateTime, preserving its original UTC offset. */
function addMinutes(iso: ISODateTime, minutes: number): ISODateTime {
  return formatAtOffset(toMs(iso) + minutes * 60_000, parseOffsetMinutes(iso));
}

export type PrayerName = "fajr" | "sunrise" | "dhuhr" | "asr" | "maghrib" | "isha";

/** All five (+sunrise) prayer instants as offset ISO datetimes for the given day. */
export function computePrayerTimesISO(
  input: PrayerTimesInput,
): Record<PrayerName, ISODateTime> {
  const minutes = computePrayerTimes(input);
  const base = { year: input.year, month: input.month, day: input.day, utcOffsetMinutes: input.utcOffsetMinutes };
  return {
    fajr: prayerMinutesToISO(base, minutes.fajr),
    sunrise: prayerMinutesToISO(base, minutes.sunrise),
    dhuhr: prayerMinutesToISO(base, minutes.dhuhr),
    asr: prayerMinutesToISO(base, minutes.asr),
    maghrib: prayerMinutesToISO(base, minutes.maghrib),
    isha: prayerMinutesToISO(base, minutes.isha),
  };
}

/* ============ Jam' (combining) scheduling — WIZARD-BRIEF §5b ============ */

export type CombinablePrayer = "fajr" | "dhuhr" | "asr" | "maghrib" | "isha";

export interface JamPrefs {
  /** Dhuhr + Asr prayed together (jam' taqdim, at Dhuhr's time). */
  combineDhuhrAsr: boolean;
  /** Maghrib + Isha prayed together (jam' taqdim, at Maghrib's time). */
  combineMaghribIsha: boolean;
}

/** A single route-timeline commitment: one prayer, or a combined pair. */
export interface PrayerStop {
  id: string;
  prayers: CombinablePrayer[];
  label: string;
  startAt: ISODateTime;
  endAt: ISODateTime;
}

function toMs(iso: ISODateTime): number {
  return new Date(iso).getTime();
}

/** True if instant `t` falls within [start, end] (inclusive). */
function within(t: ISODateTime, start: ISODateTime, end: ISODateTime): boolean {
  const tt = toMs(t);
  return tt >= toMs(start) && tt <= toMs(end);
}

/** True if window [aStart, aEnd] overlaps [bStart, bEnd] at all. */
function overlaps(aStart: ISODateTime, aEnd: ISODateTime, bStart: ISODateTime, bEnd: ISODateTime): boolean {
  return toMs(aStart) <= toMs(bEnd) && toMs(aEnd) >= toMs(bStart);
}

/** Nominal duration (minutes) a prayer stop actually holds the rep for — this
 *  is how long it takes to pray, NOT the fiqh validity window (which can
 *  span hours, e.g. Dhuhr to Asr). Every stop below is anchored at its
 *  prayer's start time and lasts this long, so the schedule around it stays
 *  free for canvassing. */
export const STOP_DURATION_MIN = 20;

/**
 * Builds the day's prayer stops from computed prayer instants, the jam'
 * (combining) preferences, and the work window. Fajr is never combinable.
 * Combined pairs collapse to ONE short stop at the earlier prayer's time
 * (jam' taqdim); uncombined pairs each get their own short stop when that
 * prayer's time falls inside work hours. Every stop is `STOP_DURATION_MIN`
 * long — the [prayer, nextPrayer] fiqh window is only used to test whether a
 * combined pair's prayers can licitly be prayed together at all, never as
 * the stop's actual duration (a longer duration would wrongly eat the rest
 * of the work window as "prayer time").
 */
export function schedulePrayerStops(
  times: Record<PrayerName, ISODateTime>,
  jam: JamPrefs,
  workStart: ISODateTime,
  workEnd: ISODateTime,
): PrayerStop[] {
  const stops: PrayerStop[] = [];

  if (within(times.fajr, workStart, workEnd)) {
    stops.push({
      id: "fajr",
      prayers: ["fajr"],
      label: "Fajr",
      startAt: times.fajr,
      endAt: addMinutes(times.fajr, STOP_DURATION_MIN),
    });
  }

  if (jam.combineDhuhrAsr) {
    if (overlaps(times.dhuhr, times.asr, workStart, workEnd)) {
      stops.push({
        id: "dhuhr_asr",
        prayers: ["dhuhr", "asr"],
        label: "Dhuhr + Asr (combined)",
        startAt: times.dhuhr,
        endAt: addMinutes(times.dhuhr, STOP_DURATION_MIN),
      });
    }
  } else {
    if (within(times.dhuhr, workStart, workEnd)) {
      stops.push({
        id: "dhuhr",
        prayers: ["dhuhr"],
        label: "Dhuhr",
        startAt: times.dhuhr,
        endAt: addMinutes(times.dhuhr, STOP_DURATION_MIN),
      });
    }
    if (within(times.asr, workStart, workEnd)) {
      stops.push({
        id: "asr",
        prayers: ["asr"],
        label: "Asr",
        startAt: times.asr,
        endAt: addMinutes(times.asr, STOP_DURATION_MIN),
      });
    }
  }

  if (jam.combineMaghribIsha) {
    if (overlaps(times.maghrib, times.isha, workStart, workEnd)) {
      stops.push({
        id: "maghrib_isha",
        prayers: ["maghrib", "isha"],
        label: "Maghrib + Isha (combined)",
        startAt: times.maghrib,
        endAt: addMinutes(times.maghrib, STOP_DURATION_MIN),
      });
    }
  } else {
    if (within(times.maghrib, workStart, workEnd)) {
      stops.push({
        id: "maghrib",
        prayers: ["maghrib"],
        label: "Maghrib",
        startAt: times.maghrib,
        endAt: addMinutes(times.maghrib, STOP_DURATION_MIN),
      });
    }
    if (within(times.isha, workStart, workEnd)) {
      stops.push({
        id: "isha",
        prayers: ["isha"],
        label: "Isha",
        startAt: times.isha,
        endAt: addMinutes(times.isha, STOP_DURATION_MIN),
      });
    }
  }

  return stops.sort((a, b) => toMs(a.startAt) - toMs(b.startAt));
}
