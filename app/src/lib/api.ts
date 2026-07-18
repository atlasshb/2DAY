/**
 * Planner API client — the app's single seam to services/planner (doc 09).
 *
 * Design rule (doc 00 §2.4): the rep is never blocked by a missing backend.
 * Every call has a hard timeout and a local fallback; callers always get an
 * answer plus a `source` tag so the UI can show an honest staleness badge
 * ("plan compiled offline") instead of an error state.
 */
import type { Plan, PlanRequest } from "@2day/core";

export type PlanSource = "planner" | "local";

export interface CompileResult {
  plan: Plan;
  source: PlanSource;
}

const PLANNER_URL =
  process.env.NEXT_PUBLIC_PLANNER_URL ?? "http://localhost:8787";

const COMPILE_TIMEOUT_MS = 6_000;

/**
 * POST /v1/plans/compile with timeout; falls back to `localFallback()` on any
 * failure (network, timeout, non-2xx, invalid payload). Fallback is supplied
 * by the caller so this module stays free of mock-data imports.
 */
export async function compileDay(
  req: PlanRequest,
  localFallback: () => Plan,
): Promise<CompileResult> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), COMPILE_TIMEOUT_MS);
  try {
    const res = await fetch(`${PLANNER_URL}/v1/plans/compile`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(req),
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`planner ${res.status}`);
    const plan = (await res.json()) as Plan;
    if (!Array.isArray(plan.legs) || plan.legs.length === 0) {
      throw new Error("planner returned no legs");
    }
    return { plan, source: "planner" };
  } catch {
    return { plan: localFallback(), source: "local" };
  } finally {
    clearTimeout(timer);
  }
}

/** Same never-block contract for live re-planning. */
export async function replanDay(
  planId: string,
  body: unknown,
  localFallback: () => Plan,
): Promise<CompileResult> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), COMPILE_TIMEOUT_MS);
  try {
    const res = await fetch(`${PLANNER_URL}/v1/plans/${planId}/replan`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`planner ${res.status}`);
    return { plan: (await res.json()) as Plan, source: "planner" };
  } catch {
    return { plan: localFallback(), source: "local" };
  } finally {
    clearTimeout(timer);
  }
}
