/**
 * In-memory plan store (brief: "in-memory Map keyed by plan id"). The MVP
 * planner is otherwise stateless; in production durable state lives in Postgres
 * (docs/09 §1 — "in-flight jobs owned by a row, not a process"). We keep the
 * originating request + chosen L1 candidate alongside the Plan so /replan can
 * recompute canvass legs without re-running L1 (brief: "L1 never" on replan).
 */
import type { Plan, PlanRequest } from "./core.js";
import type { L1Candidate } from "./domain.js";

export interface StoredPlan {
  plan: Plan;
  req: PlanRequest;
  candidate: L1Candidate;
  offset: string; // request UTC offset, for re-timing legs on replan
}

export class PlanStore {
  private readonly plans = new Map<string, StoredPlan>();
  /** Idempotency: idempotencyKey → planId, so a retried compile returns the same plan. */
  private readonly byIdempotency = new Map<string, string>();

  get(planId: string): StoredPlan | undefined {
    return this.plans.get(planId);
  }

  getByIdempotencyKey(key: string): StoredPlan | undefined {
    const id = this.byIdempotency.get(key);
    return id ? this.plans.get(id) : undefined;
  }

  put(entry: StoredPlan): void {
    this.plans.set(entry.plan.id, entry);
    this.byIdempotency.set(entry.req.idempotencyKey, entry.plan.id);
  }

  update(entry: StoredPlan): void {
    this.plans.set(entry.plan.id, entry);
  }
}
