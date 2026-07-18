/**
 * Route optimizer adapter. THIS IS THE SEAM where the real **VROOM** VRP-TW
 * solver plugs in later (docs/00 §3, docs/11 §3.2). The interface takes prize-
 * carrying jobs + a walking matrix + a hard end-time anchor and returns an
 * ordered visit sequence with the dropped (unassigned) prizes — exactly the
 * OPTW-via-VROOM behaviour of doc 11 §3.2. Production swaps the mock body for
 * a VROOM call with the Valhalla matrix; the ILS refinement (§3.3) can layer on
 * top later.
 *
 * Mock solver = nearest-neighbour construction + 2-opt improvement over the
 * walking matrix, then prize-drop until the route respects the hard end
 * deadline (arrive at the end anchor ≤ hardEndByMs). Deterministic — no
 * randomness; ties broken by job index.
 */

export interface OptimizerJob {
  id: string;
  matrixIndex: number; // row/col of this job's point in `matrix`
  serviceSec: number; // canvass/dwell time at the node
  prize: number; // expected conversations (OPTW prize p_i)
}

export interface OptimizerOptions {
  startIndex: number; // matrix index of the start anchor (arrival station)
  endIndex: number; // matrix index of the end anchor (departure station)
  departMs: number; // clock at the start anchor
  hardEndByMs: number; // latest allowed arrival at the end anchor (train deadline)
  matrix: number[][]; // pedestrian seconds
}

export interface OptimizerResult {
  order: string[]; // visited job ids, in sequence (start/end anchors excluded)
  droppedIds: string[]; // prizes left on the table (time-infeasible)
  feasible: boolean;
  endArrivalMs: number; // arrival time at the end anchor for the returned route
}

export interface Optimizer {
  sequence(jobs: OptimizerJob[], opts: OptimizerOptions): Promise<OptimizerResult>;
}

export class MockOptimizer implements Optimizer {
  async sequence(jobs: OptimizerJob[], opts: OptimizerOptions): Promise<OptimizerResult> {
    const { matrix, startIndex, endIndex } = opts;
    const walk = (a: number, b: number): number => matrix[a]?.[b] ?? 0;

    // --- nearest-neighbour construction from the start anchor ----------------
    let remaining = [...jobs];
    const nnOrder: OptimizerJob[] = [];
    let cur = startIndex;
    while (remaining.length > 0) {
      let bestI = 0;
      let bestD = Infinity;
      for (let i = 0; i < remaining.length; i++) {
        const d = walk(cur, remaining[i]!.matrixIndex);
        if (d < bestD - 1e-9 || (Math.abs(d - bestD) <= 1e-9 && remaining[i]!.matrixIndex < remaining[bestI]!.matrixIndex)) {
          bestD = d;
          bestI = i;
        }
      }
      const next = remaining.splice(bestI, 1)[0]!;
      nnOrder.push(next);
      cur = next.matrixIndex;
    }

    // --- 2-opt improvement (minimise total walking incl. start/end) ----------
    let order = twoOpt(nnOrder, startIndex, endIndex, walk);

    // --- prize-drop until the end deadline is met (OPTW infeasibility) -------
    const dropped: OptimizerJob[] = [];
    let endArrival = simulateEnd(order, opts, walk);
    while (order.length > 0 && endArrival > opts.hardEndByMs) {
      // drop the worst prize-per-marginal-time job (doc 11 §3.3 prize-drop).
      let worstPos = 0;
      let worstRatio = Infinity;
      for (let i = 0; i < order.length; i++) {
        const prev = i === 0 ? startIndex : order[i - 1]!.matrixIndex;
        const nextIdx = i === order.length - 1 ? endIndex : order[i + 1]!.matrixIndex;
        const marginal =
          walk(prev, order[i]!.matrixIndex) + order[i]!.serviceSec + walk(order[i]!.matrixIndex, nextIdx) - walk(prev, nextIdx);
        const ratio = order[i]!.prize / Math.max(1, marginal);
        if (ratio < worstRatio - 1e-9) {
          worstRatio = ratio;
          worstPos = i;
        }
      }
      dropped.push(order[worstPos]!);
      order = order.filter((_, i) => i !== worstPos);
      order = twoOpt(order, startIndex, endIndex, walk);
      endArrival = simulateEnd(order, opts, walk);
    }

    return {
      order: order.map((j) => j.id),
      droppedIds: dropped.map((j) => j.id),
      feasible: endArrival <= opts.hardEndByMs,
      endArrivalMs: endArrival,
    };
  }
}

/** Forward time propagation → arrival at the end anchor for a route. doc 11 §3.3. */
function simulateEnd(
  order: OptimizerJob[],
  opts: OptimizerOptions,
  walk: (a: number, b: number) => number,
): number {
  let t = opts.departMs;
  let cur = opts.startIndex;
  for (const job of order) {
    t += walk(cur, job.matrixIndex) * 1000;
    t += job.serviceSec * 1000;
    cur = job.matrixIndex;
  }
  t += walk(cur, opts.endIndex) * 1000;
  return t;
}

/** Total walking time (s) of a route start→…→end. */
function routeWalk(
  order: OptimizerJob[],
  startIndex: number,
  endIndex: number,
  walk: (a: number, b: number) => number,
): number {
  let sum = 0;
  let cur = startIndex;
  for (const job of order) {
    sum += walk(cur, job.matrixIndex);
    cur = job.matrixIndex;
  }
  sum += walk(cur, endIndex);
  return sum;
}

/** Classic 2-opt on the middle sequence; anchors fixed. Deterministic. */
function twoOpt(
  order: OptimizerJob[],
  startIndex: number,
  endIndex: number,
  walk: (a: number, b: number) => number,
): OptimizerJob[] {
  if (order.length < 3) return order;
  let best = [...order];
  let bestCost = routeWalk(best, startIndex, endIndex, walk);
  let improved = true;
  while (improved) {
    improved = false;
    for (let i = 0; i < best.length - 1; i++) {
      for (let k = i + 1; k < best.length; k++) {
        const candidate = best.slice(0, i).concat(best.slice(i, k + 1).reverse(), best.slice(k + 1));
        const cost = routeWalk(candidate, startIndex, endIndex, walk);
        if (cost < bestCost - 1e-9) {
          best = candidate;
          bestCost = cost;
          improved = true;
        }
      }
    }
  }
  return best;
}
