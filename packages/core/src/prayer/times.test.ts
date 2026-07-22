import { describe, expect, it } from "vitest";
import {
  computePrayerTimes,
  computePrayerTimesISO,
  formatClock,
  schedulePrayerStops,
  STOP_DURATION_MIN,
  type AsrMadhab,
  type PrayerTimesMinutes,
} from "./times.js";

/**
 * Reference rows verbatim from scratchpad/ref/prayer-times.json (aladhan.com
 * API, method=3 = Muslim World League, school 0 = Shafi/Standard, school 1 =
 * Hanafi). All three Netherlands cities, both solstices + a summer date,
 * both madhabs — 18 rows total, matching the brief.
 *
 * Timezone handling: aladhan reports wall-clock local time for
 * Europe/Amsterdam, which is UTC+2 (CEST) in June/July and UTC+1 (CET) in
 * December — the offset fed to `computePrayerTimes` must match the DST rule
 * for that specific date, not a fixed offset.
 */
const REFERENCE_ROWS: {
  city: string;
  lat: number;
  lon: number;
  date: string; // dd-mm-yyyy
  school: 0 | 1;
  timings: Record<"Fajr" | "Sunrise" | "Dhuhr" | "Asr" | "Maghrib" | "Isha", string>;
}[] = [
  { city: "Tilburg", lat: 51.5606, lon: 5.0919, date: "21-07-2026", school: 0, timings: { Fajr: "03:22", Sunrise: "05:47", Dhuhr: "13:46", Asr: "18:03", Maghrib: "21:44", Isha: "00:01" } },
  { city: "Tilburg", lat: 51.5606, lon: 5.0919, date: "21-07-2026", school: 1, timings: { Fajr: "03:22", Sunrise: "05:47", Dhuhr: "13:46", Asr: "19:13", Maghrib: "21:44", Isha: "00:01" } },
  { city: "Tilburg", lat: 51.5606, lon: 5.0919, date: "21-12-2026", school: 0, timings: { Fajr: "06:39", Sunrise: "08:43", Dhuhr: "12:38", Asr: "14:16", Maghrib: "16:32", Isha: "18:30" } },
  { city: "Tilburg", lat: 51.5606, lon: 5.0919, date: "21-12-2026", school: 1, timings: { Fajr: "06:39", Sunrise: "08:43", Dhuhr: "12:38", Asr: "14:46", Maghrib: "16:32", Isha: "18:30" } },
  { city: "Tilburg", lat: 51.5606, lon: 5.0919, date: "21-06-2026", school: 0, timings: { Fajr: "03:10", Sunrise: "05:22", Dhuhr: "13:41", Asr: "18:04", Maghrib: "22:01", Isha: "00:06" } },
  { city: "Tilburg", lat: 51.5606, lon: 5.0919, date: "21-06-2026", school: 1, timings: { Fajr: "03:10", Sunrise: "05:22", Dhuhr: "13:41", Asr: "19:19", Maghrib: "22:01", Isha: "00:06" } },
  { city: "Eindhoven", lat: 51.4416, lon: 5.4697, date: "21-07-2026", school: 0, timings: { Fajr: "03:21", Sunrise: "05:46", Dhuhr: "13:45", Asr: "18:01", Maghrib: "21:42", Isha: "23:59" } },
  { city: "Eindhoven", lat: 51.4416, lon: 5.4697, date: "21-07-2026", school: 1, timings: { Fajr: "03:21", Sunrise: "05:46", Dhuhr: "13:45", Asr: "19:11", Maghrib: "21:42", Isha: "23:59" } },
  { city: "Eindhoven", lat: 51.4416, lon: 5.4697, date: "21-12-2026", school: 0, timings: { Fajr: "06:37", Sunrise: "08:41", Dhuhr: "12:36", Asr: "14:15", Maghrib: "16:31", Isha: "18:29" } },
  { city: "Eindhoven", lat: 51.4416, lon: 5.4697, date: "21-12-2026", school: 1, timings: { Fajr: "06:37", Sunrise: "08:41", Dhuhr: "12:36", Asr: "14:45", Maghrib: "16:31", Isha: "18:29" } },
  { city: "Eindhoven", lat: 51.4416, lon: 5.4697, date: "21-06-2026", school: 0, timings: { Fajr: "03:08", Sunrise: "05:21", Dhuhr: "13:40", Asr: "18:03", Maghrib: "21:59", Isha: "00:04" } },
  { city: "Eindhoven", lat: 51.4416, lon: 5.4697, date: "21-06-2026", school: 1, timings: { Fajr: "03:08", Sunrise: "05:21", Dhuhr: "13:40", Asr: "19:17", Maghrib: "21:59", Isha: "00:04" } },
  { city: "Amsterdam", lat: 52.3676, lon: 4.9041, date: "21-07-2026", school: 0, timings: { Fajr: "03:22", Sunrise: "05:44", Dhuhr: "13:47", Asr: "18:05", Maghrib: "21:49", Isha: "00:03" } },
  { city: "Amsterdam", lat: 52.3676, lon: 4.9041, date: "21-07-2026", school: 1, timings: { Fajr: "03:22", Sunrise: "05:44", Dhuhr: "13:47", Asr: "19:15", Maghrib: "21:49", Isha: "00:03" } },
  { city: "Amsterdam", lat: 52.3676, lon: 4.9041, date: "21-12-2026", school: 0, timings: { Fajr: "06:41", Sunrise: "08:48", Dhuhr: "12:38", Asr: "14:13", Maghrib: "16:29", Isha: "18:29" } },
  { city: "Amsterdam", lat: 52.3676, lon: 4.9041, date: "21-12-2026", school: 1, timings: { Fajr: "06:41", Sunrise: "08:48", Dhuhr: "12:38", Asr: "14:42", Maghrib: "16:29", Isha: "18:29" } },
  { city: "Amsterdam", lat: 52.3676, lon: 4.9041, date: "21-06-2026", school: 0, timings: { Fajr: "03:09", Sunrise: "05:18", Dhuhr: "13:42", Asr: "18:07", Maghrib: "22:06", Isha: "00:09" } },
  { city: "Amsterdam", lat: 52.3676, lon: 4.9041, date: "21-06-2026", school: 1, timings: { Fajr: "03:09", Sunrise: "05:18", Dhuhr: "13:42", Asr: "19:22", Maghrib: "22:06", Isha: "00:09" } },
];

const TOLERANCE_MIN = 4;

function parseHHMM(s: string): number {
  const [h, m] = s.split(":").map(Number);
  return h! * 60 + m!;
}

/** Circular difference (minutes), so 23:59 vs 00:01 reads as 2 min, not 1438. */
function circularDiffMinutes(a: number, b: number): number {
  const d = Math.abs(a - b) % 1440;
  return Math.min(d, 1440 - d);
}

describe("computePrayerTimes — reference dataset (18 rows, Netherlands, MWL)", () => {
  for (const row of REFERENCE_ROWS) {
    const [dd, mm, yyyy] = row.date.split("-").map(Number);
    // Europe/Amsterdam: CEST (UTC+2) in Jun/Jul, CET (UTC+1) in Dec.
    const utcOffsetMinutes = mm === 12 ? 60 : 120;
    const asrMadhab: AsrMadhab = row.school === 1 ? "hanafi" : "standard";

    it(`${row.city} ${row.date} school=${row.school}`, () => {
      const minutes = computePrayerTimes({
        year: yyyy!,
        month: mm!,
        day: dd!,
        lat: row.lat,
        lng: row.lon,
        utcOffsetMinutes,
        method: "MWL",
        asrMadhab,
      });

      const expected: Record<keyof PrayerTimesMinutes, number> = {
        fajr: parseHHMM(row.timings.Fajr),
        sunrise: parseHHMM(row.timings.Sunrise),
        dhuhr: parseHHMM(row.timings.Dhuhr),
        asr: parseHHMM(row.timings.Asr),
        maghrib: parseHHMM(row.timings.Maghrib),
        isha: parseHHMM(row.timings.Isha),
      };

      for (const key of Object.keys(expected) as (keyof PrayerTimesMinutes)[]) {
        const got = ((minutes[key] % 1440) + 1440) % 1440;
        const diff = circularDiffMinutes(expected[key]!, got);
        expect
          .soft(diff, `${key}: expected ${formatClock(expected[key]!)}, got ${formatClock(got)}`)
          .toBeLessThanOrEqual(TOLERANCE_MIN);
      }
    });
  }
});

describe("computePrayerTimesISO", () => {
  it("rolls Isha over to the next calendar day when it falls after midnight", () => {
    // Tilburg, 21-07-2026 — Isha (00:01) is technically 22-07 local time.
    const iso = computePrayerTimesISO({
      year: 2026,
      month: 7,
      day: 21,
      lat: 51.5606,
      lng: 5.0919,
      utcOffsetMinutes: 120,
    });
    expect(iso.isha.startsWith("2026-07-22T00:0")).toBe(true);
    expect(iso.isha.endsWith("+02:00")).toBe(true);
    expect(iso.dhuhr.startsWith("2026-07-21T13:4")).toBe(true);
  });
});

describe("schedulePrayerStops — jam' (combining)", () => {
  // Fixed instants so the test doesn't depend on the solar calculation.
  const times = {
    fajr: "2026-07-21T03:22:00+02:00",
    sunrise: "2026-07-21T05:47:00+02:00",
    dhuhr: "2026-07-21T13:46:00+02:00",
    asr: "2026-07-21T18:03:00+02:00",
    maghrib: "2026-07-21T21:44:00+02:00",
    isha: "2026-07-21T22:30:00+02:00",
  } as const;
  const workStart = "2026-07-21T12:00:00+02:00";
  const workEnd = "2026-07-21T23:00:00+02:00";

  it("combined Dhuhr+Asr yields exactly one SHORT stop at Dhuhr's time (not spanning to Asr)", () => {
    const stops = schedulePrayerStops(
      times,
      { combineDhuhrAsr: true, combineMaghribIsha: false },
      workStart,
      workEnd,
    );
    const dhuhrAsr = stops.filter((s) => s.prayers.includes("dhuhr") || s.prayers.includes("asr"));
    expect(dhuhrAsr).toHaveLength(1);
    expect(dhuhrAsr[0]!.id).toBe("dhuhr_asr");
    expect(dhuhrAsr[0]!.prayers).toEqual(["dhuhr", "asr"]);
    expect(dhuhrAsr[0]!.startAt).toBe(times.dhuhr);
    // Regression guard for the "afternoon eaten by one giant break" bug:
    // endAt must be a short, fixed duration after startAt, NOT the next
    // prayer's time (times.asr, over 4 hours later).
    const durationMin = (new Date(dhuhrAsr[0]!.endAt).getTime() - new Date(dhuhrAsr[0]!.startAt).getTime()) / 60_000;
    expect(durationMin).toBe(STOP_DURATION_MIN);
    expect(dhuhrAsr[0]!.endAt).not.toBe(times.asr);
  });

  it("every scheduled stop lasts STOP_DURATION_MIN minutes, never the fiqh window to the next prayer", () => {
    const stops = schedulePrayerStops(
      times,
      { combineDhuhrAsr: false, combineMaghribIsha: false },
      "2026-07-21T00:00:00+02:00",
      "2026-07-21T23:59:00+02:00",
    );
    expect(stops.length).toBeGreaterThan(0);
    for (const s of stops) {
      const durationMin = (new Date(s.endAt).getTime() - new Date(s.startAt).getTime()) / 60_000;
      expect(durationMin).toBe(STOP_DURATION_MIN);
    }
  });

  it("not combined yields one stop per prayer that falls in work hours", () => {
    const stops = schedulePrayerStops(
      times,
      { combineDhuhrAsr: false, combineMaghribIsha: false },
      workStart,
      workEnd,
    );
    const dhuhrAsr = stops.filter((s) => s.prayers.includes("dhuhr") || s.prayers.includes("asr"));
    expect(dhuhrAsr).toHaveLength(2);
    expect(dhuhrAsr.map((s) => s.id).sort()).toEqual(["asr", "dhuhr"]);
  });

  it("combined Maghrib+Isha yields one stop; uncombined yields two", () => {
    const combined = schedulePrayerStops(
      times,
      { combineDhuhrAsr: false, combineMaghribIsha: true },
      workStart,
      workEnd,
    );
    expect(combined.filter((s) => s.id === "maghrib_isha")).toHaveLength(1);

    const separate = schedulePrayerStops(
      times,
      { combineDhuhrAsr: false, combineMaghribIsha: false },
      workStart,
      workEnd,
    );
    expect(separate.filter((s) => s.id === "maghrib" || s.id === "isha")).toHaveLength(2);
  });

  it("excludes prayers outside work hours (Fajr, before a 12:00 start)", () => {
    const stops = schedulePrayerStops(
      times,
      { combineDhuhrAsr: false, combineMaghribIsha: false },
      workStart,
      workEnd,
    );
    expect(stops.find((s) => s.id === "fajr")).toBeUndefined();
  });

  it("stops are returned in chronological order", () => {
    const stops = schedulePrayerStops(
      times,
      { combineDhuhrAsr: false, combineMaghribIsha: false },
      "2026-07-21T00:00:00+02:00",
      "2026-07-21T23:59:00+02:00",
    );
    const startTimes = stops.map((s) => new Date(s.startAt).getTime());
    expect(startTimes).toEqual([...startTimes].sort((a, b) => a - b));
  });
});
