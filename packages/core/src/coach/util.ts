/**
 * Coach internals — pure helpers shared by the deterministic + Claude analyzers.
 *
 * Determinism rule (docs/00 §9, mirrors the field brain and planner): NO
 * `Date.now`, NO `Math.random`, NO I/O. `analyzedAt` comes from an injectable
 * clock; when none is supplied it is derived from the conversation itself
 * (`meta.startedAt + meta.durationMs` — the moment the door conversation ends).
 * The analysis `id` is a valid ULID derived deterministically from that instant
 * plus a splitmix64 hash of the conversation id, so identical inputs always
 * yield an identical, contract-shaped id without any entropy source.
 */
import type { ConversationMeta } from "../conversation.js";
import type { ISODateTime } from "../types.js";

const MS_PER_MIN = 60_000;
const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"; // no I, L, O, U — matches ulid regex
const MASK64 = (1n << 64n) - 1n;
const MASK80 = (1n << 80n) - 1n;

export function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}

/** Trailing RFC3339 offset token ("Z" | "+02:00" | "-05:30") from an ISO string. */
export function offsetOf(iso: ISODateTime): string {
  const m = iso.match(/(Z|[+-]\d{2}:\d{2})$/);
  return m ? m[1]! : "+00:00";
}

function offsetToMs(offset: string): number {
  if (offset === "Z") return 0;
  const m = offset.match(/^([+-])(\d{2}):(\d{2})$/);
  if (!m) return 0;
  const sign = m[1] === "-" ? -1 : 1;
  return sign * (Number(m[2]) * 60 + Number(m[3])) * MS_PER_MIN;
}

/** ISO (RFC3339 w/ offset) → epoch ms; Date.parse honours the embedded offset. */
export function epochOf(iso: ISODateTime): number {
  return Date.parse(iso);
}

/** epoch ms + offset token → RFC3339 string in that offset's local wall clock. */
export function formatIso(epochMs: number, offset: string): ISODateTime {
  const shifted = new Date(epochMs + offsetToMs(offset));
  const pad = (n: number): string => String(n).padStart(2, "0");
  const body =
    `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}` +
    `T${pad(shifted.getUTCHours())}:${pad(shifted.getUTCMinutes())}:${pad(shifted.getUTCSeconds())}`;
  return body + (offset === "Z" ? "Z" : offset);
}

export interface Analyzed {
  iso: ISODateTime;
  epochMs: number;
}

/**
 * The instant the analysis is stamped. Default (no clock): the conversation's
 * own end time, so the same fixture always analyzes to the same timestamp.
 */
export function resolveAnalyzedAt(meta: ConversationMeta, clock?: () => number): Analyzed {
  const offset = offsetOf(meta.startedAt);
  const epochMs = clock ? Math.floor(clock()) : epochOf(meta.startedAt) + meta.durationMs;
  return { iso: formatIso(epochMs, offset), epochMs };
}

function encodeCrockford(value: bigint, length: number): string {
  let v = value & ((1n << BigInt(length * 5)) - 1n);
  let out = "";
  for (let i = 0; i < length; i++) {
    out = CROCKFORD[Number(v & 31n)]! + out;
    v >>= 5n;
  }
  return out;
}

function splitmix64(x: bigint): bigint {
  let z = (x + 0x9e3779b97f4a7c15n) & MASK64;
  z = ((z ^ (z >> 30n)) * 0xbf58476d1ce4e5b9n) & MASK64;
  z = ((z ^ (z >> 27n)) * 0x94d049bb133111ebn) & MASK64;
  z = (z ^ (z >> 31n)) & MASK64;
  return z;
}

/** Deterministic 80-bit digest of a string (FNV seed folded through splitmix64). */
function hashString(s: string): bigint {
  let h = 0xcbf29ce484222325n;
  for (let i = 0; i < s.length; i++) {
    h = splitmix64(h ^ BigInt(s.charCodeAt(i)));
  }
  return h & MASK80;
}

/**
 * A valid ULID for a `ConversationAnalysis` derived only from the analyzed
 * instant (48-bit ms → 10 Crockford chars) and a hash of the conversation id
 * (80-bit entropy → 16 chars). No clock, no randomness → reproducible.
 */
export function deterministicAnalysisId(conversationId: string, epochMs: number): string {
  const time = BigInt(Math.max(0, Math.floor(epochMs)));
  return encodeCrockford(time, 10) + encodeCrockford(hashString(conversationId), 16);
}
