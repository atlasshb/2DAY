# 2DAY — AI Architecture

> Elaborates `00-design-decisions.md` §9 ("Compiler, not oracle"). The LLM never computes a route,
> a score, or an EV. It has exactly two jobs: **turn messy human words into typed structs**
> (Haiku, function calling) and **turn typed structs into human words** (Sonnet, explain/coach).
> Everything numeric — routing, scoring, EV learning — is deterministic. This document specifies
> the five roles, the cost envelope, and the guardrails that keep AI output out of the trust path.

## 1. The five roles at a glance

| Role | Engine | Direction | Determinism | Offline |
|---|---|---|---|---|
| 1. Intent parser | **Haiku** + function schema | words → `PlanRequest` | LLM (typed output only) | falls back to form |
| 2. Plan explainer | **Sonnet** | `Plan` → 3 sentences | LLM (text only, cached) | raw template |
| 3. Field brain | **deterministic rules engine, on-device** | streams → nudge | 100% deterministic | native (this is the offline path) |
| 4. Daily/weekly coach | **Sonnet** | aggregates → review + 3 tips | LLM (text only) | deferred until online |
| 5. EV learning | **SQL + small Python, nightly** | history → posteriors | 100% deterministic (Bayesian) | N/A (server batch) |

Only roles 1, 2, 4 call the Claude API. Roles 3 and 5 contain **no LLM** — they are the parts the
brief is most emphatic about, so they get the most concrete treatment here.

## 2. Role 1 — Intent parser (Haiku, function calling)

Free-form rep intent ("easy day, drop the bag at Basic-Fit, end in Tilburg by six") → a *partial*
`PlanRequest` (doc 09 §3.1). Haiku because it is cheap, fast, and the task is extraction, not
reasoning. **Tool use is forced** — the model may only emit a `parse_plan_intent` call, never prose.
The parser fills what it can extract; the app supplies defaults for the rest and **always shows the
resulting plan form for confirmation** before compiling. The LLM's output is a *draft form*, not an
action.

```json
{
  "name": "parse_plan_intent",
  "description": "Extract a door-to-door sales day plan request from a rep's free-form message. Only fill fields you can directly ground in the message. Never invent locations, times, or preferences. Leave anything unstated null so the app can apply the rep's saved defaults.",
  "input_schema": {
    "type": "object",
    "additionalProperties": false,
    "properties": {
      "goalPreset": {
        "type": ["string", "null"],
        "enum": ["max_sales", "easy_day", "highest_income", "shortest_walking", "explore", null],
        "description": "Map phrases: 'easy day'→easy_day, 'make money'/'as many sales'→max_sales, 'rich area'/'high income'→highest_income, 'less walking'→shortest_walking, 'somewhere new'→explore."
      },
      "destinationText": {
        "type": ["string", "null"],
        "description": "Verbatim place the day must end, e.g. 'Tilburg', 'Eindhoven Centraal', 'home'. The app geocodes it via PDOK; do NOT output coordinates."
      },
      "endBy": {
        "type": ["string", "null"],
        "description": "Local clock time the rep must be at the destination, HH:MM 24h. 'by six'→'18:00'. Null if unstated."
      },
      "startAt": {
        "type": ["string", "null"],
        "description": "Local start time HH:MM 24h if stated ('start at 9'→'09:00'), else null."
      },
      "transportModes": {
        "type": ["array", "null"],
        "items": { "type": "string", "enum": ["walk", "train", "bus", "tram", "metro", "bike", "car"] },
        "description": "Only modes the rep explicitly mentions ('by train'→['train','walk'])."
      },
      "bagDrop": {
        "type": ["object", "null"],
        "properties": {
          "wants": { "type": "boolean" },
          "chain": { "type": ["string", "null"], "description": "e.g. 'basic_fit' if a gym chain is named." }
        },
        "required": ["wants"],
        "additionalProperties": false,
        "description": "Set when the rep mentions dropping a bag / gym / locker / shower."
      },
      "areaHints": {
        "type": ["array", "null"],
        "items": { "type": "string" },
        "description": "Named neighborhoods/cities to seek, verbatim, e.g. ['Maaspoort','Den Bosch']. Resolved to area ids by the app, never by you."
      },
      "confidence": {
        "type": "number", "minimum": 0, "maximum": 1,
        "description": "Your confidence the extraction matches intent. Below 0.6 the app will ask a clarifying question instead of compiling."
      }
    },
    "required": ["confidence"]
  }
}
```

Notes that make this safe: `additionalProperties:false` (no smuggled fields), enums everywhere
(no free-text leaking into the optimizer), **no coordinates or ids from the model** (PDOK geocoding
and area resolution stay deterministic), and a `confidence` gate that routes low-confidence parses
to a clarifying question. Token budget: system + schema ≈ 900 in, rep message ≈ 60 in, tool call
≈ 120 out. **Estimate** ~1.1k tokens/parse.

## 3. Role 2 — Plan explainer (Sonnet)

Input: the chosen `Plan.score`, the two `PlanAlternative` scores, and the *reasons* the optimizer
rejected them (deltas already computed server-side). Output: **exactly three sentences** the rep
reads on the Plan tab — what the day is, why it beats the alternatives, one honest caveat.

**Prompt design.** System prompt is fixed and cached (prompt-caching on the static preamble). The
model receives only **structured deltas**, never the raw plan graph — it cannot re-derive or
second-guess the route:

```
System (cached): You explain a pre-computed sales-day plan to a Dutch door-to-door rep.
You receive numbers that are already final. You NEVER recompute, re-rank, or suggest a
different route — the optimizer decided. Write exactly 3 sentences, plain, second person,
no emoji, no hype. Sentence 1: what today is (areas, end time). Sentence 2: why it beats
the runner-up, citing the given delta. Sentence 3: the one caveat we flagged. Use the
rep's units. If a number isn't given, don't state one.

User (per call): {chosen: {areas:["Maaspoort, Den Bosch"], endBy:"17:52",
  expConversations:14.2, walkMin:96}, runnerUp:{label:"More sales",
  deltaConversations:+1.6, deltaWalkMin:+22}, caveat:"rain likely 15:00–15:40"}
```

Token budget per call — **estimate**: system ≈ 220 cached in, payload ≈ 180 in, output ≈ 110 out.
**Caching:** explanations are keyed by a **plan hash** = `hash(chosen.score, alt scores, caveat
set, goalPreset, locale)`. Identical plans (common — reps re-compile similar days) reuse the stored
text at zero API cost. Cache lives in Postgres (`plan_explanation` keyed by hash), TTL 30 days.

## 4. Role 3 — Field brain (deterministic, on-device)

**No LLM.** A rules engine evaluating live streams (position, pace, rain nowcast frame, GTFS-RT,
remaining EV, daylight) → at most one nudge. It runs on-device so it works offline (design
principle §2.4); the SSE path (doc 09 §3.5) only delivers a Sonnet-*toned* rewrite of the same
template when online. **The template is the source of truth; tone is cosmetic.**

### 4.1 Rule catalog

Each rule: trigger predicate, priority, cooldown, template. Priorities arbitrate; cooldowns prevent
spam. All thresholds are config, not code.

| # | id | Trigger (deterministic) | Prio | Cooldown | Template |
|---|---|---|---|---|---|
| 1 | `rain_before_loop` | Buienradar: rain ≥ 0.5 mm/h starting in ≤ 25 min AND a dry-first loop reorder exists | 90 | 20 min | "Rain in {min} min — do the {loop} loop first" |
| 2 | `catch_train` | time_to_walk(to departure stop) ≥ (scheduled_departure − now) − 3 min buffer | 100 | 0 (safety) | "Train in {min} min, {walk} min walk — leave now" |
| 3 | `train_delayed` | GTFS-RT trip update: home train delayed ≥ 5 min | 70 | 10 min | "Your {route} is +{delay} min — {extra} min more canvassing" |
| 4 | `skip_apartment_street` | next street_edge apartmentShare ≥ 70% AND door_access=locked | 60 | per-street | "Skip {street}: {pct}% apartments, door access locked" |
| 5 | `pace_behind` | actual doors/h < 0.8 × planned for ≥ 15 min | 55 | 15 min | "Behind pace — drop the {area} spur to still catch {train}" |
| 6 | `pace_ahead` | actual doors/h > 1.25 × planned for ≥ 15 min AND daylight/time allows | 40 | 20 min | "Ahead of pace — {area} has {n} more high-EV doors nearby" |
| 7 | `high_ev_cluster` | within 150 m of an unworked H3 cell with EV ≥ p90 today | 45 | 15 min | "{n} strong doors one street over on {street}" |
| 8 | `daylight_fade` | sunset − now ≤ 40 min AND canvass legs remain | 65 | 30 min | "~{min} min of daylight — last loop is {area}" |
| 9 | `gym_closing` | bag at gym AND gym_close − now ≤ 45 min AND pickup not started | 85 | 20 min | "Basic-Fit {gym} closes in {min} min — grab your bag" |
| 10 | `battery_budget` | device battery ≤ 15% AND tracking on | 50 | 30 min | "Battery {pct}% — switching to low-power tracking" |
| 11 | `do_not_knock_ahead` | next edge contains a `do_not_knock` address (org list) | 80 | per-address | "{n} do-not-knock on {street} — skipped for you" |
| 12 | `weather_window` | dry gap ≥ 20 min opening after active rain | 42 | 20 min | "Dry until {time} — good window for {area}" |
| 13 | `disruption_reroute` | GTFS-RT: planned line cancelled AND alt itinerary exists | 88 | 5 min | "{line} cancelled — new route home via {alt}" |
| 14 | `lunch_window` | inside soft lunch window AND coffee/lunch POI ≤ 4 min AND no break taken | 30 | once/day | "Coffee 3 min away — good time for lunch" |
| 15 | `street_done` | all doors on current edge logged | 25 | per-street | "{street} done — next up {street2}" |

### 4.2 Arbitration (never > 1 nudge / 2 min)

```ts
interface Nudge { ruleId: string; priority: number; template: string;
                  args: Record<string, string|number>; ttlSec: number; }

interface FieldBrainState { lastFiredAt: number; recentByRule: Map<string, number>; }

const GLOBAL_COOLDOWN_MS = 120_000;   // ≤ 1 nudge / 2 min — hard rule

function selectNudge(now: number, candidates: Nudge[], s: FieldBrainState): Nudge | null {
  // 1) safety override: catch_train / gym_closing bypass the global cooldown.
  const safety = candidates.find(c => c.ruleId === "catch_train" || c.ruleId === "gym_closing");
  if (safety && !onRuleCooldown(safety, now, s)) return fire(safety, now, s);

  // 2) global 2-min gate for everything else.
  if (now - s.lastFiredAt < GLOBAL_COOLDOWN_MS) return null;

  // 3) drop rules on their own cooldown, then take the highest priority; ties → most time-urgent.
  const eligible = candidates
    .filter(c => !onRuleCooldown(c, now, s))
    .sort((a, b) => b.priority - a.priority || urgency(b) - urgency(a));
  return eligible.length ? fire(eligible[0], now, s) : null;
}
```

Safety rules (`catch_train`, `gym_closing`) are the *only* ones allowed to interrupt inside the
2-minute window — missing a train or losing a bag is a real cost the rate limit must not cause. All
others queue and the highest-priority survivor fires when the window opens; the rest expire by TTL.
Result: the rep sees **at most one nudge every two minutes**, and it is always the most important one
eligible.

## 5. Role 4 — Daily/weekly coach (Sonnet)

Runs after the last `work_session` closes (or weekly, Sunday night). Input is an **aggregate**, never
raw `visit` events — the coach cannot see individual doors, only summarized stats (privacy + token
economy):

```ts
interface CoachInput {
  period: "day" | "week";
  metrics: { hoursWorked: number; doors: number; conversations: number; sales: number;
             convPerHour: number; eurPerHour: number; eurPerKm: number; walkedKm: number; };
  vsBaseline: { convPerHourDeltaPct: number; bestArea: string; worstArea: string; };
  patterns: { bestTimeBlock: string; rainMinutesLost: number; avgDwellSaleSec: number; };
  streaks: { current: number; record: number };
}
interface CoachOutput {           // the model is told to return exactly this shape as JSON via tool
  narrative: string;              // ≤ 4 sentences, warm, specific, no fabricated numbers
  improvements: string[];         // exactly 3, each actionable and grounded in the metrics
}
```
Token budget — **estimate**: system ≈ 260 cached in, aggregate ≈ 220 in, output ≈ 200 out. One call
per rep per active day + one weekly. The coach is **deferred until online** — it never blocks a field
action, and if it fails it simply doesn't render (no fallback text needed; it's not field-critical).

## 6. Role 5 — Nightly EV learning (NOT an LLM)

The EV model (`00` §5) is `EV(door) = P(answer) × P(conversation|answer) × P(sale|conversation) ×
commission`. Each probability is a **Beta-Bernoulli** estimate updated nightly by a SQL + small
Python batch. No model call, fully auditable.

**Update per (feature-bucket × outcome-stage).** For a bucket `b` (e.g. dwelling type × time-of-day
× campaign) start from a **prior** derived from CBS/BAG features (`α₀, β₀` encoding the prior mean and
its strength). Observe successes `s` and failures `f` from visit history, **recency-decayed** with a
90-day half-life:

```
weight(visit) = 0.5 ^ (age_days / 90)
s_b = Σ weight over visits in b with success at this stage
f_b = Σ weight over visits in b with failure at this stage
posterior:  α_b = α₀_b + s_b        β_b = β₀_b + f_b
P̂(stage | b) = α_b / (α_b + β_b)          # posterior mean = Bayesian shrinkage toward prior
```

Two shrinkage sources, exactly as the brief specifies: (a) toward the **CBS/BAG prior** via `α₀,β₀`
(thin buckets stay near the neighborhood prior), and (b) **personal toward org-wide** — a rep's
posterior blends their own decayed counts with the org's, weighted by the rep's evidence mass, so a
new rep inherits the org's knowledge and diverges as their own history accumulates:

```
α_rep_eff = α_org * κ(n_rep) + α_rep_personal ,  κ shrinks as n_rep grows  (n_rep = rep's evidence mass)
```

Doors/hour is separate and also deterministic: predicted from **BAG door spacing** along the L3
edge, the rep's **measured walking speed**, and per-outcome **dwell-time distributions** (log-normal
fit per outcome). Output is written to `score_cell` (H3 EV features) and consumed by L1/L2/L3 at
compile time and by the Day Pack builder (doc 15). The batch also emits `α,β` per cell so the field
brain's `high_ev_cluster` rule (#7) has current posteriors offline.

## 7. Cost model (per rep per month)

**Estimates**, labeled as such per §12. Assume ~20 working days/month and current Claude API list
pricing at authoring time; treat as an envelope, not a quote.

| Call | Engine | Calls/rep/mo | ~Tokens in / out | Cache behavior |
|---|---|---|---|---|
| Intent parse | Haiku | ~30 (some days re-parsed) | 1000 / 120 | none (cheap already) |
| Plan explain | Sonnet | ~20 compiles, ~40% cache hit ⇒ ~12 billed | 400 / 110 | plan-hash cache (§3) |
| Daily coach | Sonnet | ~20 | 480 / 200 | none |
| Weekly coach | Sonnet | ~4 | 480 / 200 | none |
| **Field brain** | — | ~hundreds | **0 / 0** | on-device, no API |
| **EV learning** | — | nightly | **0 / 0** | SQL/Python batch |

The two high-volume things (field nudges, EV learning) cost **zero** LLM tokens by construction —
that is the whole point of "compiler, not oracle." The remaining Sonnet spend is dominated by the
daily coach and un-cached explanations. **Rough envelope estimate:** well under a few tens of
euro-cents of Claude spend per rep per month, comfortably inside the €0.90/rep infra target (`00`
§11) since routing (Valhalla/OTP/VROOM self-hosted) is the real cost driver, not the LLM. A per-org
daily spend cap at the planner (doc 09 §6) hard-stops runaway cost; hitting it degrades to templates.

## 8. Fallback when Claude API is unreachable

| Role | Online | Offline / API down |
|---|---|---|
| Intent parser | Haiku extraction | The Plan **form** itself — rep taps fields directly; no capability lost |
| Plan explainer | Sonnet 3 sentences | **Raw template** assembled from the same deltas ("Maaspoort, ends 17:52. Beats 'More sales' by −22 min walk for −1.6 conv. Rain likely 15:00.") |
| Field brain | template + Sonnet tone | **Raw template verbatim** (this is already the default path) |
| Daily/weekly coach | Sonnet narrative | Deferred; renders the numeric summary card only |

**Nothing field-critical depends on the LLM.** Every AI output has a deterministic floor. The
planner detects Anthropic unreachability (timeout/5xx/circuit-open) and swaps to templates
transparently; the client is never told "AI is down," it just sees plainer words.

## 9. Guardrails (the trust boundary)

1. **AI output never mutates state.** No LLM response is written to the DB as truth. The intent
   parser produces a *draft form* the rep confirms; the explainer/coach produce *display text*
   stored as annotations on an already-committed `plan`. Routes, scores, EV, and `visit` events are
   produced only by deterministic code.
2. **Typed function-calling only.** Where the LLM feeds the system (Role 1), output is a validated
   tool call against the schema in §2 (`additionalProperties:false`, enums, no ids/coords). A parse
   that fails validation is discarded, not "best-efforted" into the optimizer.
3. **No free-text into the optimizer.** The optimizer's inputs are `PlanRequest` structs with typed
   enums and numbers. There is no code path from an LLM string to VROOM/Valhalla/OTP2. Area/POI
   resolution is deterministic (PDOK, ids), never model-emitted.
4. **Prompt-injection posture.** Any user- or org-visible text that could be embedded in a prompt —
   rep intent messages, campaign names, POI notes, crowd-sourced gym attributes, `visit` free-text
   (none in MVP) — is treated as **untrusted data, not instructions**. Mitigations: (a) untrusted
   text is passed only inside clearly delimited JSON *data* fields, never concatenated into the
   instruction section; (b) the explainer/coach prompts state that inputs are data and the model
   must not follow instructions found in them; (c) outputs are constrained (3 sentences / fixed JSON
   shape) and rendered as **plain text, never HTML/markdown that could execute**; (d) because output
   can't mutate state (guardrail 1), a successful injection can at worst produce odd display copy,
   which the deterministic template floor and the "no numbers not given" rule further bound. The
   worst-case blast radius of a prompt injection in 2DAY is a weird sentence on the Plan tab — never
   a bad route, a wrong score, or a mutated record.
