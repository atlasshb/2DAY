# 2DAY — User Journeys

> Consistent with `00-design-decisions.md`. Screens referenced are the five Fieldkit tabs (§8):
> **Today · Plan · Route · Log · Stats**. Journeys 1–3 are MVP (V1) behavior. Journey 4 is
> explicitly V2 and marked throughout — it depicts org/team features not built in V1 (§10).

---

## Journey 1 (hero) — Sanne's Den Bosch → Tilburg day

**Persona:** Sanne de Vries (Persona A). **Inputs to the plan:** start Maaspoort, ’s-Hertogenbosch
→ end Tilburg; window 12:00–18:00; transport train; bag backpack; membership Basic-Fit; pace
normal; area preference middle income; goal **max sales**. This is the single most detailed
journey in this document because it is the core loop (§2) end to end.

### Step 1 — Open the wizard
**[Plan]** · **Rep action:** at 11:32, on the sofa, Sanne opens the Plan tab and taps "Plan my
day." She types one line of free text: *"max sales, end in Tilburg by 6."* · **System behavior:**
Haiku parses the free-form intent into a typed `PlanRequest` (§9.1) — goal preset `max_sales`,
end destination `Tilburg`. Everything else (start location, transport, bag, membership, pace) is
pre-filled from her saved profile defaults, shown as tappable chips she can confirm or change with
one tap each. · **Design principle:** minimal typing — the only free text in her whole day is this
one optional sentence.

### Step 2 — Confirm the inputs
**[Plan]** · **Rep action:** she taps through four pre-filled chips: start "Maaspoort," window
"12:00–18:00," transport "Train," bag "Backpack," gym "Basic-Fit." All already correct; she
confirms without editing. · **System behavior:** the wizard has now assembled a complete
`PlanRequest` in under 30 seconds total. · **Design principle:** one thumb, no scrolling required —
every input is a single tap.

### Step 3 — The Day Compiler runs
**[Plan]** · **Rep action:** she taps "Generate plan" and watches a short loading state. ·
**System behavior:** L1 (Day Compiler) enumerates feasible (city, station, area-set) combinations
given her start, end, and window; scores each against the `expected_value` function (§5); L2
sequences the winning candidate as an orienteering problem with Valhalla walking-time costs and
the Tilburg departure train as a hard deadline; L3 pre-computes the first neighborhood loop.
Output: one recommended plan plus two alternatives. · **Design principle:** the app decides —
Sanne never sees or needs to understand the optimization, only the result.

### Step 4 — Plan presented, with explanation
**[Plan]** · **Rep action:** she reads the plan card and the three-sentence summary. ·
**System behavior:** Sonnet turns the optimizer's output into: *"This plan starts you in Maaspoort
where early-afternoon answer rates are highest, then rides the 12:47 IC to Tilburg where your
Basic-Fit is four minutes from two solid middle-income loops. You're back at Tilburg CS by 18:04,
with rain risk staying low until at least 16:00."* Two alternatives sit one tap away ("Easy day" —
fewer areas, less walking; "Highest income" — further apart, better yield per door). Projected
outcome is shown as a labeled estimate: *"~34 doors answered, 6–9 conversations, est. €180–260
commission."* · **Design principle:** never present more than 3 choices; the AI explains, it does
not decide.

### Step 5 — Day Pack download
**[Plan]** · **Rep action:** she taps "Start day." · **System behavior:** the Day Pack begins
downloading over her home Wi-Fi — PMTiles map extract for the Maaspoort + Tilburg-West + Reeshof
bounding box, address/door data, H3 score cells, the ’s-Hertogenbosch–Tilburg transit timetable
slice, and POIs (gym, coffee, water, toilet). Progress bar shows real size (target <25 MB); a
checkmark confirms completion before she leaves the house. · **Design principle:** offline is a
mode, not a failure — everything field-critical is local before she steps outside; sync status is
never faked.

### Step 6 — Loop 1: Maaspoort (12:00–13:25)
**[Route]** · **Rep action:** she walks the first loop, glancing at turn cues only ("next: 40 m,
turn right onto Aa-laan"). · **System behavior:** the L3 arc-routing output is a closed loop —
start ≈ end at the same corner — never an out-and-back, so she's never retracing a covered
street. · **Design principle:** minimum 48 px touch targets, primary actions in the bottom 40% of
the screen, readable in direct sun (Sun theme auto-engaged).

### Step 7 — 1-tap logging
**[Log]** · **Rep action:** at each door she taps one outcome button from the bottom sheet —
sale, conversation, no-answer, not-interested, do-not-knock, follow-up — without stopping or
looking down for more than an instant. · **System behavior:** each tap writes a `visit` event
locally (append-only, client ULID, device clock, monotonic counter) and auto-advances to the next
address in loop order; a short haptic buzz confirms the write. Fourteen doors logged in this loop:
1 sale, 3 conversations, rest no-answer/not-interested. · **Design principle:** ≤1 tap, ≤1 second,
without looking (core loop non-negotiable #2).

### Step 8 — Background pace check
**[Today]** · **Rep action:** none — a quiet strip at the top of the Today tab updates itself. ·
**System behavior:** the field brain (a deterministic rules engine, not an LLM, §9.3) checks her
logging pace against the remaining loop and upcoming train options, and shows *"On pace — 13:07
train works"* without interrupting her. · **Design principle:** nudges are ambient by default;
only genuine decisions interrupt.

### Step 9 — Loop 1 complete, quick glance
**[Stats]** · **Rep action:** she checks the Stats tab for ten seconds while walking toward the
train. · **System behavior:** running totals — doors/hour, €/hour estimate, conversion % versus
her personal 30-day average badge. · **Design principle:** stats are glanceable, tabular numerals,
no analysis required mid-shift.

### Step 10 — "Leave now" nudge
**[Today]** · **Rep action:** she gets moving the moment the banner appears. · **System
behavior:** field brain fires: *"13:07 train in 9 min, 6 min walk — leave now."* The loop's exit
point was chosen by L2 specifically because it sits on the walking path to the station. ·
**Design principle:** the app decides the moment, not just the destination.

### Step 11 — Commute leg
**[Route]** · **Rep action:** she boards, phone in her pocket. · **System behavior:** Route tab
switches to transit mode with live platform and delay data (OVapi GTFS-RT); the app drops into a
low-power background-tracking profile to hold the <8%/hour battery budget. No disruption today. ·
**Design principle:** battery is budgeted like a resource, not an afterthought.

### Step 12 — Gym bag drop in Tilburg
**[Route] → [Plan]** · **Rep action:** she walks four minutes from Tilburg CS to Basic-Fit,
drops her backpack in a locker, grabs water. · **System behavior:** the gym POI card confirms her
Basic-Fit membership is valid at this branch and surfaces locker/shower attributes (curated seed
data, §4). This anchor was chosen by L2 specifically to minimize backtrack distance from the
station to the first Tilburg loop. · **Design principle:** carry constraints (bag, membership) are
first-class planning inputs, not an afterthought bolted onto the route.

### Step 13 — Loop 2: Tilburg-West (14:00–15:45 planned)
**[Route] → [Log]** · **Rep action:** she works a new middle-income loop, logging as she goes,
same 1-tap pattern as Step 7. · **System behavior:** this loop's L3 subgraph was computed
specifically for Tilburg-West's door layout and score cells shipped in the Day Pack. ·
**Design principle:** consistency of interaction regardless of which city she's in.

### Step 14 — Rain re-plan
**[Today]** · **Rep action:** a banner appears: *"Rain in 22 min over Tilburg-West — shift to
Reeshof first?"* with exactly two choices, **[Yes]** / **[Keep plan]**. She taps **Yes**. ·
**System behavior:** the KNMI/Buienradar nowcast detected a rain cell arriving over her current
area; this is a sequencing change (L2, area order), triggered because it exceeds the >15 min
deviation threshold for a meso re-plan (§5). The server returns the reordered plan in under the
3-second SLA. · **Design principle:** the app decides; the rep can override — never more than 3
choices, ever.

### Step 15 — Reeshof loop, ahead of the rain
**[Route] → [Log]** · **Rep action:** she walks to Reeshof and resumes logging before the rain
starts. · **System behavior:** map camera transitions to the new loop with a 600 ms eased pan; Day
Pack data for Reeshof was already downloaded in Step 5, so no new download is needed mid-shift. ·
**Design principle:** re-optimization is instant from the rep's point of view — no re-download,
no interruption to logging.

### Step 16 — Rain arrives, short shelter break
**[Today]** · **Rep action:** at 15:40, rain starts as predicted; she takes a 12-minute break at
a nearby café POI suggested by the plan's soft rain window. · **System behavior:** the live radar
overlay shows "rain until ~16:15"; the break is absorbed inside the day's soft constraints (§5)
without threatening the hard end-station deadline. · **Design principle:** soft constraints (rain,
lunch) flex; hard constraints (the train deadline) never do.

### Step 17 — Resume, then a deadline-protecting skip
**[Route] → [Today]** · **Rep action:** she finishes the Reeshof loop around 17:20 and starts the
last few doors of the original Tilburg-West loop. · **System behavior:** field brain evaluates
remaining expected value against remaining time and the train deadline, and proactively nudges:
*"Skipping the last 6 doors on Tilburgseweg — keeps you on pace for the 17:53 train. [Keep going
instead]."* · **Design principle:** the deadline is protected automatically, but the rep can always
override and accept the consequence.

### Step 18 — "Train in 11 min"
**[Today]** · **Rep action:** she stops logging and heads for Tilburg CS the moment the banner
appears. · **System behavior:** the canonical field-brain nudge from §9.3: *"Train in 11 min, 8
min walk — leave now."* · **Design principle:** the deterministic rules engine, not an LLM, drives
every time-critical nudge — auditable, fast, works offline.

### Step 19 — Journey home
**[Route]** · **Rep action:** boards the 17:53 IC back toward ’s-Hertogenbosch. · **System
behavior:** any queued `visit` events not yet synced (there may be a few from the Reeshof dead
spot) sync silently in the background the moment connectivity is stable; the sync indicator only
ever shows true state. · **Design principle:** offline writes are conflict-free by construction
(append-only events, client ULIDs) — nothing is lost, nothing double-counted.

### Step 20 — Daily review
**[Stats]** · **Rep action:** at home, she opens the Stats tab. · **System behavior:** end-of-day
totals — doors, conversations, sales, €, doors/hour, distance walked, battery used (~6.5%/hour,
within budget) — plus one short auto-generated highlight sentence reusing the same lightweight
Sonnet capability as the plan explainer (Step 4): *"Best day this month in Tilburg-West — your
conversation rate there ran 40% above your average."* This is **not** the full weekly AI coach
narrative (V2, doc 04) — just stats plus one line. Her personal history heatmap (MVP, entirely
private to her) updates with today's density. · **Design principle:** the review closes the loop
("review + learn," §2) without requiring any typing or manual reconciliation — the exact pain
Sanne had with her old paper tally.

---

## Journey 2 — First-run onboarding

**Goal:** get a new rep from install to a running first plan with as little typing as possible,
and with GDPR-consistent, consent-first location permissioning (§11).

| # | [Screen] | [Rep action] | [System behavior] | [Design principle] |
|---|---|---|---|---|
| 1 | Install | Adds the PWA to their home screen from a shared link or QR code | No app-store step in V1 (PWA-first, §3) | Fast to first value |
| 2 | Welcome | Reads one screen: "This is not a CRM — it's your field operating system" | Sets expectations against the positioning in §1 | No marketing fluff |
| 3 | Account | Taps "Continue with email" or "Continue with Google/Apple," or enters an agency invite code | Invite-code path (for agency-provisioned reps) skips straight to org membership, campaign, and commission model — all pre-set by their team lead | Zero typing for agency-provisioned reps |
| 4 | Consent | Reads a plain-language location screen: why GPS is needed (route optimization only), "while using the app" recommended over "always," background tracking called out as a V2/Capacitor feature not requested here | Consent is captured before any GPS read; refusal degrades gracefully (manual area entry still works) rather than blocking the app | Consent-first GPS (§11); nothing silently assumed |
| 5 | Consent | One tap to allow notifications (for train/rain nudges) | — | Minimal, single-purpose asks |
| 6 | Home base | Types 3–4 characters of a postcode or street; taps the right suggestion | PDOK Locatieserver typeahead resolves to an exact address in one or two keystrokes | The only real typing in the whole flow |
| 7 | Transport & bag | Taps one icon each: Train / Car / Bike / Walk, then Backpack / Trolley / None | Stored as rep profile defaults, pre-filled into every future plan wizard | Minimal typing — icon taps only |
| 8 | Gym membership | Taps a chain logo (Basic-Fit, Anytime Fitness, GymOne, SportCity) or "None" | Creates a `gym_membership` record; optional tier selection is a single tap | No manual form-filling |
| 9 | Walking pace | Picks Slow / Normal / Brisk (Normal pre-selected), or skips | Pace calibrates further from real walking data on the first live day (Bayesian shrinkage, same philosophy as the EV model, §5) | Defaults are good enough to start; the app learns instead of asking |
| 10 | Campaign | Solo reps tap one industry icon (Energy, Telecom, Solar, Insurance, Charity, Internet, Home services), setting a default commission template; agency-provisioned reps skip — already assigned | — | Skip entirely when the org already knows the answer |
| 11 | Work pattern | Optional day-of-week × time-block grid, tap to toggle, or skipped entirely (set ad hoc later via the Plan wizard) | — | Optional, never blocking |
| 12 | Theme | Auto (ambient-light sensor) is the default; manual Sun/Night toggle always available | — | Sunlight-readability is assumed, not configured |
| 13 | Ready | Taps "Let's plan your first day" | Drops directly into the Plan wizard (Journey 1, Step 1) | Onboarding ends at the core loop, not a dashboard tour |

**Typing tally:** one postcode/street lookup (3–4 characters). Every other input in the entire
flow is a tap.

---

## Journey 3 — The offline day

**Scenario:** a rep (any of Persona A/B/C) is mid-afternoon in a low-signal pocket — a basement-
heavy stretch of Tilburg-Reeshof, a rural edge of a buurt, or simply a bad carrier day — and loses
connectivity for roughly 40 minutes. Offline is a mode, not a failure (§2, principle 4); this
journey shows exactly what keeps working and what visibly degrades.

| # | [Screen] | [Rep action] | [System behavior] | [Design principle] |
|---|---|---|---|---|
| 1 | Today | Notices nothing at first — keeps walking and logging | Connectivity silently drops | — |
| 2 | Today | Glances at the status strip | Sync indicator flips from a green "synced" dot to an amber "3 pending" badge | Never lie about sync status — the badge is honest the instant state changes |
| 3 | Log | Keeps logging doors exactly as before, 1 tap each | Each `visit` writes locally to Dexie/IndexedDB with a client ULID; nothing about logging changes | Field-critical work is fully local by design |
| 4 | Route | Keeps following the current loop | PMTiles map pack and the L3 loop for this area were already in the Day Pack — rendering is unaffected | Offline map is not a degraded map |
| 5 | Today | Sees a rain-radar tile with a small "last updated 14 min ago" badge | Buienradar nowcast is frozen on its last received frame rather than silently going stale | Visible staleness, never a silent guess presented as live |
| 6 | Route | Checks the next scheduled train | Timetable falls back to the static GTFS slice in the Day Pack; a "schedule (offline)" badge replaces the live indicator, since GTFS-RT delay/platform data needs a connection | Degrade visibly, never pretend precision that isn't there |
| 7 | Today | Tries to ask for a full re-plan after a bad street | App responds: "Full re-plan needs a connection — a reduced on-device re-order was applied instead" | L1 (macro) and full L2 (meso) re-plans need the Fly.io planner service; the on-device fallback re-orders the *current* loop's remaining streets using cached score cells (a degraded L3 only) | A real, if smaller, re-optimization still runs offline — never a dead end |
| 8 | Stats | Glances at running totals | Doors/hour, €/hour, and conversion stats are computed entirely on-device from local events | Core stats never depend on connectivity |
| 9 | Stats | Opens the end-of-day review after the shift, still offline | Numeric totals appear immediately; the Sonnet-generated highlight sentence shows "Insight will appear once you're back online" instead of a stale or fabricated line | Degrade the AI layer honestly; never fabricate a coach comment offline |
| 10 | Today | Reaches signal again (e.g., Tilburg CS Wi-Fi) | Service worker background-syncs all queued events; idempotent upsert via ULID + monotonic counter means nothing double-counts even if a partial sync happened earlier; sync badge flips back to green; the deferred plan-explainer sentence populates retroactively | Reconnection is invisible and safe — no manual "resolve conflicts" step exists because none can occur |

**What degrades:** live transit delay/platform info, live rain nowcast frames, full L1/L2
re-plans, the Sonnet daily highlight. **What never degrades:** the map, the current loop, 1-tap
logging, on-device L3 reordering, and all local stats.

---

## Journey 4 — Team lead: territory assignment and weekly analytics *(V2)*

> **Everything in this journey is V2.** None of it exists in the MVP described in Journeys 1–3;
> it depends on org/team features, org-wide heat maps, weekly analytics, and the AI coach, all
> explicitly staged to V2 in `00-design-decisions.md` §10 and `04-feature-prioritization.md`.
> Shown here for completeness of the product narrative, not as MVP scope.

**Persona:** Ruben Aksoy (Persona D), agency owner, 12 reps across Den Bosch, Tilburg, Eindhoven,
Breda, and Nijmegen. Monday morning territory planning, Friday afternoon weekly review.

| # | [Screen] | [Rep action] *(V2)* | [System behavior] *(V2)* | [Design principle] |
|---|---|---|---|---|
| 1 | Org dashboard | Logs into the org admin view (desktop-oriented, same product, org-level role) | Loads the 12-rep roster with current city and campaign assignments | Same underlying entities (`org`, `team`, `rep`), a different lens on them |
| 2 | Territory map | Selects buurten per rep for the coming week by drawing on the map | System checks proposed assignments against every other rep's proposed area for the same week | Conflict prevention is structural, not manual, once org data exists |
| 3 | Territory map | Reviews a flagged conflict — two reps assigned overlapping streets | System highlights the overlapping H3 cells and suggests a boundary split | The app decides the split; Ruben can override |
| 4 | Territory map | Toggles the org-wide heat map layer while assigning | Aggregated, anonymized density/conversion overlay across all reps' history informs which buurten are worth assigning at all; precision-reduced per the org-sharing GDPR posture (§11) | Anonymization is structural, not a settings checkbox reps must trust blindly |
| 5 | Territory map | Confirms the week's assignments | Each rep's own Plan wizard (Journey 1, Step 1) now shows "org-assigned area" chips that constrain their personal L1 candidate set — reps still run their own 30-second plan within that boundary | Territory assignment narrows options; it does not remove the rep's own planning agency |
| 6 | Weekly analytics | Opens the team dashboard on Friday | Aggregated KPIs per rep and team-wide: conversion %, €/hour, doors/hour, distance, trend lines; optional leaderboard (gamification, opt-in per rep) | Weekly, not daily — this is explicitly the slower cadence view |
| 7 | Weekly analytics | Drills into an underperforming rep's week | AI coach (Sonnet over that rep's session aggregates) surfaces a pattern: "Conversion drops sharply after 15:00 — consider shorter afternoon loops" | AI coach is a narrative layer over deterministic stats, same "compiler, not oracle" posture as the rest of the AI architecture (§9) |
| 8 | Weekly analytics | Reviews team-wide follow-up backlog | Follow-up visits (`visit.outcome = follow_up`) logged across the whole team surface in one place for scheduling/callback assignment | Aggregating an existing MVP entity (`visit`) is what makes this V2 feature possible without new field-side work |
| 9 | Weekly analytics | Exports a coverage/results summary for a client | System generates a shareable report from the same aggregates | Client reporting reuses internal data rather than a separate manual deck |
| 10 | Territory map | Adjusts next week's assignments based on this week's data | Cycle repeats | Weekly analytics closes the loop for the org the same way daily review closes it for a rep |

---

## Cross-journey notes

**Design principles exercised, by journey:**

| Design principle (§2) | J1 hero | J2 onboarding | J3 offline | J4 team lead (V2) |
|---|---|---|---|---|
| 1. One thumb, sunlight, 48 px targets | Throughout Route/Log | Icon-tap inputs | Route/Log unaffected | Not applicable (desktop) |
| 2. Log a door in ≤1 tap, ≤1 s | Steps 7, 13, 15 | — | Step 3 | — |
| 3. App decides, ≤3 choices, rep overrides | Steps 4, 14, 17 | — | Step 7 | Steps 3, 5 |
| 4. Offline is a mode, not a failure | Step 5 (Day Pack) | — | Entire journey | — |
| 5. Battery budgeted like a resource | Step 11 | — | Implicit (no extra polling) | Not applicable |

**Why the hero journey carries the most detail:** Journey 1 is the only path that touches all
five Fieldkit tabs, all three planning levels (L1/L2/L3), both re-optimization triggers named in
§5 (rain nowcast, pace-driven deviation), and both categories of AI use permitted by §9 (plan
compiler/explainer, deterministic field brain). Journeys 2–4 each isolate one concern —
first-run friction, connectivity loss, and org-level oversight — against that same shared spine,
rather than re-deriving it.

**Staging discipline:** Journeys 1–3 use only MVP-staged features (doc 04). Journey 4 is V2 in
full; where a V2 concept overlaps an MVP entity (e.g., `visit`, `plan`), the table calls out that
reuse explicitly rather than implying new field-side scope.
