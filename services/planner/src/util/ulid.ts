/**
 * Tiny monotonic ULID generator — no dependencies (brief: no new deps).
 *
 * A ULID is a 48-bit millisecond timestamp (10 Crockford base32 chars) + 80
 * bits of entropy (16 chars) = 26 chars, lexicographically sortable. Ours is
 * *monotonic*: within one millisecond the entropy is incremented, and the clock
 * is clamped so a backwards clock never breaks ordering.
 *
 * Determinism (brief rule): the entropy is derived deterministically from the
 * clock via splitmix64 — there is NO Math.random. Pass a fixed `clock` (and
 * optional `seed`) to `createUlidFactory` and the id stream is fully
 * reproducible, which the tests rely on.
 */

const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"; // no I, L, O, U
const MASK64 = (1n << 64n) - 1n;
const MASK80 = (1n << 80n) - 1n;

/** Encode a non-negative bigint as `length` Crockford base32 chars, MSB first. */
export function encodeCrockford(value: bigint, length: number): string {
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

/** Deterministic 80-bit entropy from a millisecond seed. */
function deriveEntropy(ms: bigint, seed: bigint): bigint {
  const a = splitmix64(ms ^ seed);
  const b = splitmix64((ms + 1n) ^ (seed ^ 0xd1b54a32d192ed03n));
  return ((a << 16n) ^ b) & MASK80;
}

export interface UlidFactoryOptions {
  /** Millisecond clock; defaults to Date.now (allowed only for id minting). */
  clock?: () => number;
  /** Entropy seed; fix it in tests for reproducible ids. */
  seed?: number;
}

/**
 * Returns a monotonic ULID generator. Two ids from the same factory are always
 * strictly increasing as strings, even within the same millisecond.
 */
export function createUlidFactory(opts: UlidFactoryOptions = {}): () => string {
  const clock = opts.clock ?? ((): number => Date.now());
  const seed = BigInt(opts.seed ?? 0x2da75eed);
  let lastTime = -1;
  let lastRand = 0n;
  return function ulid(): string {
    let now = Math.floor(clock());
    if (now < lastTime) now = lastTime; // clamp backwards clock → stay monotonic
    if (now === lastTime) {
      lastRand = (lastRand + 1n) & MASK80;
    } else {
      lastTime = now;
      lastRand = deriveEntropy(BigInt(now), seed);
    }
    return encodeCrockford(BigInt(now), 10) + encodeCrockford(lastRand, 16);
  };
}
