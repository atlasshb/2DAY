/**
 * Fastify v5 app factory for the 2DAY planner service (docs/09 §3).
 *
 * `buildServer()` returns a configured Fastify instance (exported for tests via
 * `app.inject` — no network). When this module is run directly it also listens
 * on PORT (default 8787).
 *
 * All request bodies are validated with the canonical zod schemas from
 * @2day/core; validation failures become 400s in the brief's error envelope
 * `{error:{code,message,details}}`.
 *
 * Injectable seams (walking/transit/optimizer/clock/store) make the whole
 * service deterministic under test — the clock comes from options, never from
 * the pipeline (brief determinism rule).
 */
import Fastify, { type FastifyError, type FastifyInstance } from "fastify";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { z } from "zod";

import { planRequest, replanRequest, type PlanRequest, type ReplanRequest } from "./core.js";
import { MockWalkingEngine, type WalkingEngine } from "./adapters/walking.js";
import { MockTransitPlanner, type TransitPlanner } from "./adapters/transit.js";
import { MockOptimizer, type Optimizer } from "./adapters/optimizer.js";
import { PlanStore } from "./store.js";
import { createUlidFactory } from "./util/ulid.js";
import { compilePlan } from "./pipeline/compile.js";
import { replan } from "./pipeline/replan.js";
import { discoverAreas } from "./pipeline/discover.js";
import { InfeasiblePlanError } from "./pipeline/l1.js";
import { errorBody, zodErrorBody } from "./errors.js";
import { registerConversationRoutes } from "./conversations.js";
import { formatIso, parseOffset } from "./util/time.js";

export interface BuildServerOptions {
  /** Deterministic clock (ms). Used only for metadata (compiledAt / ulid seed). */
  clock?: () => number;
  ulidSeed?: number;
  walking?: WalkingEngine;
  transit?: TransitPlanner;
  optimizer?: Optimizer;
  store?: PlanStore;
  logger?: boolean;
}

const discoverQuery = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  minutes: z.coerce.number().positive().max(600),
  goal: z
    .enum(["max_sales", "easy_day", "highest_income", "shortest_walking", "explore"])
    .optional()
    .default("max_sales"),
  startAt: z.string().optional(),
});

export function buildServer(options: BuildServerOptions = {}): FastifyInstance {
  const clock = options.clock ?? ((): number => Date.now());
  const ulid = createUlidFactory({ clock, seed: options.ulidSeed });
  const walking = options.walking ?? new MockWalkingEngine();
  const transit = options.transit ?? new MockTransitPlanner();
  const optimizer = options.optimizer ?? new MockOptimizer();
  const store = options.store ?? new PlanStore();

  const app = Fastify({ logger: options.logger ?? false });

  // --- GET /v1/health -------------------------------------------------------
  app.get("/v1/health", async () => ({
    ok: true,
    deps: { valhalla: "mock", vroom: "mock", otp: "mock" },
  }));

  // --- POST /v1/plans/compile ----------------------------------------------
  // docs/09 §3.1 specifies 202 + job; MVP deviation: synchronous 200 + Plan
  // (see pipeline/compile.ts header, docs/09 §4).
  app.post("/v1/plans/compile", async (request, reply) => {
    const parsed = planRequest.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send(zodErrorBody("PLAN_REQUEST_INVALID", parsed.error));
    }
    const req: PlanRequest = parsed.data;

    // Idempotency (docs/09 §4): a retried compile returns the same plan.
    const existing = store.getByIdempotencyKey(req.idempotencyKey);
    if (existing) return reply.code(200).send(existing.plan);

    try {
      const nowMs = clock();
      const { plan, chosen } = await compilePlan(req, { walking, transit, optimizer, ulid, nowMs });
      store.put({ plan, req, candidate: chosen, offset: parseOffset(req.hours.startAt) });
      return reply.code(200).send(plan);
    } catch (err) {
      if (err instanceof InfeasiblePlanError) {
        return reply.code(422).send(errorBody(err.code, err.message));
      }
      throw err;
    }
  });

  // --- GET /v1/plans/:planId -----------------------------------------------
  app.get<{ Params: { planId: string } }>("/v1/plans/:planId", async (request, reply) => {
    const stored = store.get(request.params.planId);
    if (!stored) return reply.code(404).send(errorBody("PLAN_NOT_FOUND", "Unknown plan id."));
    return reply.code(200).send(stored.plan);
  });

  // --- POST /v1/plans/:planId/replan ---------------------------------------
  // docs/09 §3.2: L3 always, L2 if >15 min deviation, L1 never. MVP deviation:
  // synchronous 200 + updated Plan (planVersion++).
  app.post<{ Params: { planId: string } }>("/v1/plans/:planId/replan", async (request, reply) => {
    const stored = store.get(request.params.planId);
    if (!stored) return reply.code(404).send(errorBody("PLAN_NOT_FOUND", "Unknown plan id."));

    const parsed = replanRequest.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send(zodErrorBody("REPLAN_REQUEST_INVALID", parsed.error));
    }
    const body: ReplanRequest = parsed.data;

    const { plan } = await replan(stored, body, { walking, optimizer, ulid });
    store.update({ ...stored, plan });
    return reply.code(200).send(plan);
  });

  // --- GET /v1/areas/discover ----------------------------------------------
  app.get("/v1/areas/discover", async (request, reply) => {
    const parsed = discoverQuery.safeParse(request.query);
    if (!parsed.success) {
      return reply.code(400).send(zodErrorBody("DISCOVER_REQUEST_INVALID", parsed.error));
    }
    const generatedAt = formatIso(
      clock(),
      parsed.data.startAt ? parseOffset(parsed.data.startAt) : "+02:00",
    );
    const result = await discoverAreas(parsed.data, { transit }, generatedAt);
    return reply.code(200).send(result);
  });

  // --- POST /v1/conversations/analyze --------------------------------------
  // Conversation intelligence (docs/21): deterministic offline coach.
  registerConversationRoutes(app);

  // --- fallback error envelope ---------------------------------------------
  app.setErrorHandler((err: FastifyError, _request, reply) => {
    const status = typeof err.statusCode === "number" ? err.statusCode : 500;
    if (status === 400) {
      return reply.code(400).send(errorBody("BAD_REQUEST", err.message));
    }
    return reply
      .code(status >= 400 ? status : 500)
      .send(errorBody("INTERNAL", "Unexpected planner error."));
  });

  app.setNotFoundHandler((_request, reply) => {
    reply.code(404).send(errorBody("NOT_FOUND", "No such route."));
  });

  return app;
}

// --- listen when run directly (tsx src/server.ts) --------------------------
const invokedDirectly =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  const port = Number(process.env.PORT ?? 8787);
  const app = buildServer({ logger: true });
  app
    .listen({ port, host: "0.0.0.0" })
    .then((addr) => app.log.info(`2DAY planner listening on ${addr}`))
    .catch((err) => {
      app.log.error(err);
      process.exit(1);
    });
}
