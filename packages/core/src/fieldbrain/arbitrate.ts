/**
 * Arbitration — doc 10 §4.2 "never > 1 nudge / 2 min".
 *
 * Contract:
 *   1. Evaluate every rule against the signals at the caller's `now`.
 *   2. Drop candidates still inside their per-rule (per cooldown-key) cooldown.
 *   3. Order survivors by priority tier, then by earliest deadline (most urgent).
 *   4. The global 2-minute gate suppresses everything EXCEPT the interrupting tiers
 *      `safety` and `deadline` (doc 10's safety override, generalized to the tiers).
 *   5. Fire the single winner; return the winner + the advanced state (immutably).
 *
 * Pure: no clock, no I/O. Identical (rules, signals, state, now) ⇒ identical result.
 */
import type { FieldBrainState, Nudge, Rule, Signals } from "./types.js";
import { PRIORITY_RANK } from "./types.js";

/** ≤ 1 nudge / 2 min — the hard global rate limit (doc 10 §4.2). */
export const GLOBAL_COOLDOWN_MS = 120_000;

function cooldownKeyOf(n: Nudge): string {
  return n.cooldownKey ?? n.ruleId;
}

/** True when this nudge's cooldown key fired within its rule's cooldown window. */
function onCooldown(n: Nudge, now: number, state: FieldBrainState, cooldownSec: number): boolean {
  if (cooldownSec <= 0) return false;
  const last = state.lastFiredAt[cooldownKeyOf(n)];
  if (last === undefined) return false;
  return now - last < cooldownSec * 1000;
}

/**
 * Deterministic ordering, best first:
 *   priority tier desc → earliest deadline → ruleId asc (stable final tiebreak).
 */
export function compareNudges(a: Nudge, b: Nudge): number {
  const rank = PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority];
  if (rank !== 0) return rank;
  const da = a.deadlineAt ?? Number.POSITIVE_INFINITY;
  const db = b.deadlineAt ?? Number.POSITIVE_INFINITY;
  if (da !== db) return da - db;
  return a.ruleId < b.ruleId ? -1 : a.ruleId > b.ruleId ? 1 : 0;
}

export interface NextNudgeResult {
  nudge: Nudge | null;
  state: FieldBrainState;
}

/**
 * Evaluate the catalog and pick at most one nudge to surface, updating state.
 * `now` (epoch ms) is authoritative — it also seeds each rule's `ctx.now`.
 */
export function nextNudge(
  rules: Rule[],
  signals: Signals,
  state: FieldBrainState,
  now: number,
): NextNudgeResult {
  const ctx = { now };
  const cooldownByRule = new Map<string, number>();
  for (const r of rules) cooldownByRule.set(r.id, r.cooldownSec);

  const eligible: Nudge[] = [];
  for (const rule of rules) {
    const nudge = rule.evaluate(signals, ctx);
    if (!nudge) continue;
    const cd = cooldownByRule.get(nudge.ruleId) ?? rule.cooldownSec;
    if (onCooldown(nudge, now, state, cd)) continue;
    eligible.push(nudge);
  }

  if (eligible.length === 0) return { nudge: null, state };

  eligible.sort(compareNudges);
  const winner = eligible[0]!;

  // Interrupting tiers bypass the global 2-min gate; others must wait it out.
  const interrupts = winner.priority === "safety" || winner.priority === "deadline";
  if (!interrupts && now - state.lastNudgeAt < GLOBAL_COOLDOWN_MS) {
    return { nudge: null, state };
  }

  const nextState: FieldBrainState = {
    lastFiredAt: { ...state.lastFiredAt, [cooldownKeyOf(winner)]: now },
    lastNudgeAt: now,
  };
  return { nudge: winner, state: nextState };
}
