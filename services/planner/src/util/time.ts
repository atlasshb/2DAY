/**
 * ISO-8601 (RFC3339 with offset) time helpers. The planner's clock always
 * comes from the request's `hours` (brief determinism rule); these functions
 * carry the request's UTC offset through every derived leg time so the emitted
 * timestamps stay in the rep's local wall-clock zone (e.g. +02:00 in NL summer).
 */
import type { ISODateTime } from "../core.js";

export const MIN = 60_000;

/** Extract the trailing offset token ("Z" | "+02:00" | "-05:30") from an ISO string. */
export function parseOffset(iso: ISODateTime): string {
  const m = iso.match(/(Z|[+-]\d{2}:\d{2})$/);
  return m ? m[1]! : "+00:00";
}

/** Offset token → milliseconds east of UTC. */
export function offsetToMs(offset: string): number {
  if (offset === "Z") return 0;
  const m = offset.match(/^([+-])(\d{2}):(\d{2})$/);
  if (!m) return 0;
  const sign = m[1] === "-" ? -1 : 1;
  return sign * (Number(m[2]) * 60 + Number(m[3])) * MIN;
}

/** ISO string → epoch ms (Date.parse honours the embedded offset). */
export function toEpoch(iso: ISODateTime): number {
  return Date.parse(iso);
}

/** Local wall-clock hour (0..23) as written in the ISO string. */
export function localHour(iso: ISODateTime): number {
  const m = iso.match(/T(\d{2}):/);
  return m ? Number(m[1]) : 12;
}

/** epoch ms + offset token → ISO string in that offset's local wall clock. */
export function formatIso(epochMs: number, offset: string): ISODateTime {
  const shifted = new Date(epochMs + offsetToMs(offset));
  const pad = (n: number): string => String(n).padStart(2, "0");
  const body =
    `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}` +
    `T${pad(shifted.getUTCHours())}:${pad(shifted.getUTCMinutes())}:${pad(shifted.getUTCSeconds())}`;
  return body + (offset === "Z" ? "Z" : offset);
}

/** Local hour (0..23) for an epoch ms rendered in the given offset. */
export function localHourAt(epochMs: number, offset: string): number {
  return new Date(epochMs + offsetToMs(offset)).getUTCHours();
}
