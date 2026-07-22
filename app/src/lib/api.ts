/**
 * Planner API client — the app's single seam to services/planner (doc 09).
 *
 * Design rule (doc 00 §2.4): the rep is never blocked by a missing backend.
 * Every call has a hard timeout and a local fallback; callers always get an
 * answer plus a `source` tag so the UI can show an honest staleness badge
 * ("plan compiled offline") instead of an error state.
 *
 * Fixed in review: the deployed static site has no planner wired at runtime
 * (AGENT-BRIEF — services/planner stays optional), so `NEXT_PUBLIC_PLANNER_URL`
 * is unset in production. Previously that fell through to a hardcoded
 * `localhost:8787` default and always attempted a real fetch, which every
 * real user's browser refuses instantly (attempting to reach a port on the
 * device serving the page? no — on whatever `localhost` resolves to for
 * them, which is never the planner) — except when a slow/intercepted network
 * path let the refusal outrun the fallback's `AbortController` timeout, so
 * the rep or a test could be stuck on "Compiling your day…" for up to
 * `COMPILE_TIMEOUT_MS`. When the planner URL isn't explicitly configured,
 * skip the fetch entirely and go straight to the local fallback — instant
 * and deterministic, same effective result the timeout eventually produced.
 */
import type { Plan, PlanRequest } from "@2day/core";

export type PlanSource = "planner" | "local";

export interface CompileResult {
  plan: Plan;
  source: PlanSource;
}

const PLANNER_URL = process.env.NEXT_PUBLIC_PLANNER_URL;

const COMPILE_TIMEOUT_MS = 6_000;

/**
 * POST /v1/plans/compile with timeout; falls back to `localFallback()` on any
 * failure (network, timeout, non-2xx, invalid payload), or immediately if no
 * planner URL is configured. Fallback is supplied by the caller so this
 * module stays free of mock-data imports.
 */
export async function compileDay(
  req: PlanRequest,
  localFallback: () => Plan,
): Promise<CompileResult> {
  if (!PLANNER_URL) {
    return { plan: localFallback(), source: "local" };
  }
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
  if (!PLANNER_URL) {
    return { plan: localFallback(), source: "local" };
  }
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
