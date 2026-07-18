/**
 * Zod runtime schemas for the wire contracts in types.ts.
 * The planner service validates every request body with these; the app uses
 * them before enqueueing outbox writes. Keep 1:1 with types.ts.
 */
import { z } from "zod";

export const ulid = z.string().regex(/^[0-9A-HJKMNP-TV-Z]{26}$/, "expected ULID");
export const isoDateTime = z.string().datetime({ offset: true });

export const geoPoint = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

export const locationInput = z.object({
  kind: z.enum(["current", "station", "address"]),
  point: geoPoint,
  ref: z.string().optional(),
  label: z.string().optional(),
});

export const workHours = z
  .object({
    startAt: isoDateTime,
    endAt: isoDateTime,
    breaks: z
      .array(
        z.object({
          earliest: isoDateTime,
          latest: isoDateTime,
          minutes: z.number().int().min(5).max(120),
        }),
      )
      .optional(),
  })
  .refine((h) => new Date(h.startAt) < new Date(h.endAt), {
    message: "hours.startAt must be before hours.endAt",
  });

export const preferences = z.object({
  incomePreference: z.number().min(0).max(1),
  apartmentPreference: z.number().min(-1).max(1),
  walkingSpeedMps: z.number().min(0.5).max(3).optional(),
  maxWalkMinutes: z.number().int().positive().optional(),
});

export const planRequest = z.object({
  idempotencyKey: ulid,
  orgId: ulid,
  repId: ulid,
  campaignId: ulid,
  goalPreset: z.enum(["max_sales", "easy_day", "highest_income", "shortest_walking", "explore"]),
  location: locationInput,
  destination: locationInput,
  hours: workHours,
  transportModes: z
    .array(z.enum(["walk", "train", "bus", "tram", "metro", "bike", "car"]))
    .min(1),
  memberships: z.array(
    z.object({ chain: z.string().min(1), gymMembershipId: ulid.optional() }),
  ),
  bag: z.object({
    size: z.enum(["none", "light", "standard", "heavy"]),
    canCarryAllDay: z.boolean(),
  }),
  preferences,
  overrides: z
    .object({
      pinnedAreas: z.array(ulid).optional(),
      excludedAreas: z.array(ulid).optional(),
      maxAlternatives: z.number().int().min(0).max(4).optional(),
    })
    .optional(),
});

export const replanRequest = z.object({
  idempotencyKey: ulid,
  reason: z.enum([
    "rain_nowcast",
    "transit_disruption",
    "pace_behind",
    "pace_ahead",
    "street_closed",
    "manual_tweak",
  ]),
  signal: z.object({
    at: isoDateTime,
    atPoint: geoPoint.optional(),
    rainStartsInMin: z.number().int().min(0).max(180).optional(),
    disruptionId: ulid.optional(),
    doorsAheadOfPlan: z.number().int().optional(),
    closedStreetEdgeId: ulid.optional(),
  }),
});

export const visitEvent = z.object({
  id: ulid,
  orgId: ulid,
  repId: ulid,
  campaignId: ulid,
  addressUnitId: ulid.optional(),
  planId: ulid.optional(),
  outcome: z.enum([
    "no_answer",
    "conversation",
    "sale",
    "not_interested",
    "follow_up",
    "do_not_knock",
    "inaccessible",
  ]),
  at: isoDateTime,
  deviceSeq: z.number().int().min(0),
  point: geoPoint.optional(),
  saleValueEur: z.number().min(0).optional(),
  note: z.string().max(2000).optional(),
  correctsEventId: ulid.optional(),
});
