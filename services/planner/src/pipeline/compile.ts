/**
 * Compile orchestration: L1 → L2 → L3 assembled into a `Plan`.
 *
 * MVP DEVIATION (documented): docs/09 §3.1 / §4 specify `POST /v1/plans/compile`
 * returns `202 Accepted` + a job handle (the compile is a queued job row). The
 * MVP runs the pipeline **synchronously** and returns `200` + the `Plan`
 * directly — there is no job store / Redis stream here. The wire `Plan` shape
 * is unchanged, so switching to the async job model later is additive.
 *
 * Deterministic: pipeline scoring never reads the wall clock; `nowMs` is used
 * only for `compiledAt` / `validUntil` / ULID seeding metadata.
 */
import type { Plan, PlanAlternative, PlanRequest, PlanScore } from "../core.js";
import type { WalkingEngine } from "../adapters/walking.js";
import type { TransitPlanner } from "../adapters/transit.js";
import type { Optimizer } from "../adapters/optimizer.js";
import type { L1Candidate } from "../domain.js";
import { runL1 } from "./l1.js";
import { runL2, type L2Output } from "./l2.js";
import { getAreaById } from "../fixtures/brabant.js";
import { DEFAULT_MAX_ALTERNATIVES } from "../config.js";
import { formatIso, parseOffset } from "../util/time.js";

export interface CompileDeps {
  walking: WalkingEngine;
  transit: TransitPlanner;
  optimizer: Optimizer;
  ulid: () => string;
  nowMs: number;
}

export interface CompileOutput {
  plan: Plan;
  chosen: L1Candidate;
}

export async function compilePlan(req: PlanRequest, deps: CompileDeps): Promise<CompileOutput> {
  const offset = parseOffset(req.hours.startAt);
  const { chosen, alternatives } = await runL1(req, deps);

  const chosenOut = await runL2(req, chosen, deps);

  const maxAlt = req.overrides?.maxAlternatives ?? DEFAULT_MAX_ALTERNATIVES;
  const altPlans: PlanAlternative[] = [];
  for (const alt of alternatives.slice(0, maxAlt)) {
    const out = await runL2(req, alt, deps);
    altPlans.push({
      id: deps.ulid(),
      label: altLabel(alt),
      score: out.score,
      deltaVsChosen: deltaLine(chosenOut.score, out.score),
      legs: out.legs,
    });
  }

  const plan: Plan = {
    id: deps.ulid(),
    orgId: req.orgId,
    repId: req.repId,
    campaignId: req.campaignId,
    goalPreset: req.goalPreset,
    compiledAt: formatIso(deps.nowMs, offset),
    planVersion: 1,
    validUntil: req.hours.endAt, // transit slice stays valid through the work day
    score: chosenOut.score,
    legs: chosenOut.legs,
    alternatives: altPlans,
    daypackStatus: "none",
  };

  return { plan, chosen };
}

function altLabel(c: L1Candidate): string {
  const names = c.areaIds.map((id) => getAreaById(id)?.name ?? id);
  return `${c.station.city}: ${names.join(" + ")}`;
}

function deltaLine(chosen: PlanScore, alt: PlanScore): string {
  const dConv = round1(alt.expectedConversations - chosen.expectedConversations);
  const dWalk = Math.round(alt.walkMinutes - chosen.walkMinutes);
  const convTxt = `${dConv >= 0 ? "+" : ""}${dConv} conversations`;
  const walkTxt = `${dWalk >= 0 ? "+" : ""}${dWalk} min walk`;
  return `${convTxt}, ${walkTxt}`;
}

const round1 = (x: number): number => Math.round(x * 10) / 10;
