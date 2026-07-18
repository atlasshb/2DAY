/**
 * Maps the Plan tab's fixed demo inputs (the `InputChips` row) into a valid
 * `@2day/core` `PlanRequest` for `compileDay()`.
 *
 * The Plan tab is a canned demo: Maaspoort (Den Bosch) → Tilburg, 12:00–18:00,
 * by train, Basic-Fit member, standard backpack carried all day, normal pace,
 * middle income, avoid apartments, goal = max sales. Those inputs are constant,
 * so this builder is a pure mapping with one moving part: a fresh
 * `idempotencyKey` per compile (doc 09 — retries must dedupe, new intents must
 * not).
 *
 * ULIDs are minted by a tiny local generator (brief: no new deps, and no
 * cross-workspace import from services/* — this mirrors the *approach* of
 * services/planner/src/util/ulid.ts without importing it).
 */
import type { GoalPreset, PlanRequest, ULID } from "@2day/core";
import { goalPreset } from "@/lib/mock";

const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"; // Crockford base32, no I/L/O/U

/** Encode the low `len*5` bits of `value` as Crockford base32, MSB first. */
function encodeCrockford(value: number, len: number): string {
  let v = value;
  let out = "";
  for (let i = 0; i < len; i++) {
    out = CROCKFORD[v % 32]! + out;
    v = Math.floor(v / 32);
  }
  return out;
}

/**
 * A 26-char ULID: 48-bit ms timestamp (10 chars) + 80 bits of entropy (16
 * chars). Determinism isn't required here (the request is discarded whenever
 * the planner is unreachable and the local fallback plan is used), so the
 * entropy is random — this is a client-only mint on the compile tap.
 */
export function ulid(): ULID {
  const time = encodeCrockford(Date.now(), 10);
  let rand = "";
  for (let i = 0; i < 16; i++) rand += CROCKFORD[Math.floor(Math.random() * 32)]!;
  return time + rand;
}

/**
 * Stable identity of the demo rep/org/campaign. Real ULIDs (valid Crockford,
 * 26 chars) so the payload validates; fixed so repeated compiles read as the
 * same actor rather than a new one each time.
 */
const DEMO_ORG_ID: ULID = "01J9Z8QORGDEMO0000000001AB";
const DEMO_REP_ID: ULID = "01J9Z8QREPDEMO0000000001AB";
const DEMO_CAMPAIGN_ID: ULID = "01J9Z8QCAMPAIGNDEMO00001AB";

/** The demo day the whole app is pinned to (see mock.ts — Tue 18 Jul 2026). */
const WORKDAY_START = "2026-07-18T12:00:00+02:00";
const WORKDAY_END = "2026-07-18T18:00:00+02:00";

/**
 * Build the canonical `PlanRequest` for the Plan tab's demo inputs. Called on
 * every "Compile day" tap; only `idempotencyKey` changes between calls.
 */
export function buildPlanRequest(): PlanRequest {
  return {
    idempotencyKey: ulid(),
    orgId: DEMO_ORG_ID,
    repId: DEMO_REP_ID,
    campaignId: DEMO_CAMPAIGN_ID,
    goalPreset: goalPreset as GoalPreset, // "max_sales" chip

    // 📍 Maaspoort, Den Bosch — the start address the rep is standing at.
    location: {
      kind: "address",
      point: { lat: 51.7301, lng: 5.3106 },
      label: "Maaspoort, Den Bosch",
    },
    // 🏁 End in Tilburg — a station endpoint (rep goes home by train).
    destination: {
      kind: "station",
      point: { lat: 51.5606, lng: 5.0839 },
      ref: "nl-s-tb", // GTFS stop id (matches mock's Tilburg leg)
      label: "Tilburg",
    },

    // 🕐 12:00–18:00 workday.
    hours: { startAt: WORKDAY_START, endAt: WORKDAY_END },

    // 🚆 Train (walking is always implied for first/last mile).
    transportModes: ["walk", "train"],

    // 🏋️ Basic-Fit membership (bag drop / shower / pickup POIs).
    memberships: [{ chain: "basic_fit" }],

    // 🎒 Standard backpack, carried all day.
    bag: { size: "standard", canCarryAllDay: true },

    preferences: {
      incomePreference: 0.5, // 💶 middle income
      apartmentPreference: -1, // 🏢 avoid apartments
      walkingSpeedMps: 1.35, // 👟 normal pace (core default)
    },

    overrides: { maxAlternatives: 2 },
  };
}
