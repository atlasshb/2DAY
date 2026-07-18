# 2DAY — Mobile Wireframes

> Elaborates `00-design-decisions.md` (Fieldkit tokens, §8) and `05-information-architecture.md`. Screens and data are ground-truthed against `prototype/index.html` — figures like "87 doors" or "Meidoornstraat 42" are pulled from that working build, not invented, so this document and the prototype describe the same product.

## 1. Reading the diagrams

- Each block is **40 monospace columns** — a rough phone-width unit at a 15–17 px system font. `[ Button ]` is a tappable target; the taller the box, the bigger the real touch target.
- A slim divider (─) marks a section break inside a screen; the bottom row of every full-screen diagram is the fixed 5-tab bar, current tab in `[BRACKETS]`. Sheets and nudges are drawn without the tab bar — they overlay it, per §8 ("all modals are sheets").
- Color cannot render in ASCII; annotations name the Fieldkit token in play (`00-design-decisions.md` §8) instead of relying on shading. Icons are likewise named, not drawn glyph-for-glyph, to keep box edges aligned in every terminal/font.

## 2. Global conventions annotated once

- **Touch targets / thumb zone:** minimum 48×48 px everywhere (principle 1) — even the smallest paired Log buttons meet this. The bottom ~40% of the screen is the one-handed reach zone for either hand; every primary action sits there or is a short stretch away, never a top-corner reach.
- **Sunlight (Sun) mode:** high-contrast light theme, `bg` #FFFFFF / `ink` #0B0F14 (§8) — swaps by ambient light sensor, manual toggle always in the status strip.
- **Motion:** 200 ms ease-out for in-place changes (button press, address advance, sheet content swap); 600 ms for map camera moves; sheet open/close 280 ms translate; all respect `prefers-reduced-motion` (§8).
- **One-handed reach:** diagrams assume a 6.1"-class phone held in one hand, thumb anchored near the bottom edge; the top ~15% is a two-hand/two-glance zone, used sparingly (map tools, weather detail).

## 3. Today dashboard

Canvassing-state example (mirrors `prototype/index.html` `#screen-today` exactly — same figures). Tier boundaries from `05-information-architecture.md` §5 are marked in the right margin of the annotation, not drawn as a rule in-app.

```
┌──────────────────────────────────────┐
│14:38               GPS Sync 71% [Sun]│
├──────────────────────────────────────┤
│ Tilburg · Groenewoud       Tue 18 Jul│
│                                      │
│ 21°   Partly cloudy · Wind SW 3      │
│ ☂ Rain in 52 min                     │
│                                      │
│ Workday 12:00-18:00                  │
│  2h38m in · 3h22m left            44%│
│ [##########------------------]       │
├──────────────────────────────────────┤
│   DOORS       CONVOS      SALES      │
│     87          14         4  ^      │
│                                      │
│   EARNED      STEPS         KM       │
│    €152       9,418        7.2       │
├──────────────────────────────────────┤
│ ROUTE · 3 of 7 legs done             │
│ ✓ 12:19 Sprinter Den Bosch>Tilburg   │
│ ✓ 12:46 Basic-Fit — bag in locker    │
│ ✓ 13:05 Loop A Groenewoud-West       │
│ > 14:25 Loop B Groenewoud-Oost  (now)│
│   15:40 Coffee · Anne&Max            │
│                                      │
│ IC 18:02 -> Den Bosch · Platform 2   │
│ ON TIME · walk 14m + bag pickup      │
│ leave-by in 3:07                     │
│                                      │
│ ● No disruptions · NS & Arriva live  │
├──────────────────────────────────────┤
│[TODAY]  Plan  Route   Log   Stats    │
└──────────────────────────────────────┘
```

- **Tier 1 (hero):** location, weather line, rain pill, hours bar — largest type on screen (34 px temp per §8), readable in <1 s mid-stride. **Tier 2 (stat grid):** 3×2 tabular-numeral cells, scanned in a ~2–3 s natural pause. **Tier 3 (contextual cards):** route progress, next-train, disruptions — read during a real pause (bag-drop, coffee, day start/end).
- Global status strip (top row) — clock/GPS/sync/battery/mode toggle — present on **all 5 tabs**, not Today-specific; this is where "battery" answers the brief's data-point list, not a stat-grid cell.
- Touch targets/thumb zone: only cards are tappable (weather, earnings, route, train), each well over 48 px tall; content scrolls, only the fixed tab bar needs the one-handed reach zone.
- Sunlight mode: `ink`/`bg` swap to #0B0F14/#FFFFFF; the progress-bar fill and rain pill keep `accent` #3B82F6 in both modes. Motion: stat values count up over 200 ms on a new `visit`; the hero re-labels instantly on a day-state transition (§6), only the progress-bar fill animates.

## 4. Plan wizard

First-plan / "Edit inputs" path (`05-information-architecture.md` §3.2). Returning reps with unchanged inputs skip straight to a one-screen chip summary + **Compile day** — not re-drawn here, it is the `#screen-plan` "Inputs" card in the prototype verbatim.

### 4.1 Step 1 of 4 — Locations and hours

```
┌──────────────────────────────────────┐
│ Plan · Step 1 of 4                   │
│ ●●○○                                 │
├──────────────────────────────────────┤
│ START                                │
│ [ Current location: Den Bosch  ]     │
│ END (optional)                       │
│ [ Tilburg NS                    ]    │
│ WORK HOURS                           │
│ [ 12:00 ]  to  [ 18:00 ]             │
│ DATE                                 │
│ Today · Sat 18 Jul                   │
├──────────────────────────────────────┤
│                                      │
│               [ Next ]               │
│                                      │
└──────────────────────────────────────┘
```

- "Next": full width, 3 rows tall (~72 px), the only primary action, bottom third of the screen — every wizard step below repeats this geometry.
- Fields prefill from `rep` profile + last plan; editing any one is a single tap, never a nested picker screen (transient date/time wheel adds no depth, `05` §1). Progress dots replace a back button — swipe right also goes back, no top-corner chrome.

### 4.2 Step 2 of 4 — Transport and memberships

```
┌──────────────────────────────────────┐
│ Plan · Step 2 of 4                   │
│ ●●●○                                 │
├──────────────────────────────────────┤
│ TRANSPORT                            │
│    [ Train ✓ ]          [ Car ]      │
│      [ Bike ]        [ Walk only ]   │
│                                      │
│ GYM MEMBERSHIP (bag drop)        [on]│
│  [ Basic-Fit ✓ ]    [ Anytime Fit. ] │
│     [ GymOne ]       [ SportCity ]   │
├──────────────────────────────────────┤
│                                      │
│               [ Next ]               │
│                                      │
└──────────────────────────────────────┘
```

- Transport/gym choices are single-select chip pairs — never more than 2 options per row (principle 3, "never present >3 choices"). The gym toggle gates whether a bag-drop leg exists at all: off removes the whole "bag_drop" day-state (§6) from the L2 solver (`00-design-decisions.md` §5).

### 4.3 Step 3 of 4 — Bag, pace, preferences

```
┌──────────────────────────────────────┐
│ Plan · Step 3 of 4                   │
│ ●●●●                                 │
├──────────────────────────────────────┤
│ BAG                                  │
│      [ None ]          [ Small ]     │
│   [ Backpack ✓ ]    [ Rolling case ] │
│                                      │
│ PACE                                 │
│    [ Relaxed ]        [ Normal ✓ ]   │
│            [ Aggressive ]            │
│                                      │
│ PREFERENCES                          │
│ [Avoid apts ✓]   [Mid income ✓]      │
│ [Skip known DNK]   [Coffee breaks]   │
├──────────────────────────────────────┤
│                                      │
│               [ Next ]               │
│                                      │
└──────────────────────────────────────┘
```

- Bag size feeds the carry-penalty term in L1 scoring (`00-design-decisions.md` §5); pace feeds the doors/hour prediction — quiet inputs, no explanation copy needed, a 10-second tap-through. Preference chips are toggles, not radios — unlike the single-select rows above, any combination is valid.

### 4.4 Step 4 of 4 — Goal preset

```
┌──────────────────────────────────────┐
│ Plan · Step 4 of 4                   │
│ ●●●●                                 │
├──────────────────────────────────────┤
│           ( ◉ ) Max sales            │
│     Chases highest expected convos   │
│            (   ) Easy day            │
│     Shorter walk, gentler pace       │
│         (   ) Highest income         │
│     Optimizes euros, not door count  │
│        (   ) Shortest walking        │
│     Minimizes km for the same hours  │
│        (   ) Explore new area        │
│     Trades EV for fresh streets      │
├──────────────────────────────────────┤
│                                      │
│           [ Compile day ]            │
│                                      │
└──────────────────────────────────────┘
```

- 5 radio cards, single-select, one-line rationale each — the weight vector for the L1 scoring function (`00-design-decisions.md` §5), never exposed as raw numbers. "Compile day" replaces "Next" here, same geometry, signaling the wizard's terminal action — it moves to the Compiling screen (server L1+L2, ~1–2 s, a single spinner + "Scoring 14 areas…", per the prototype's `#compilebtn` state, not separately diagrammed).

### 4.5 Plan result

```
┌──────────────────────────────────────┐
│ Your plan for today · Tilburg        │
│ ~210 doors ~34 convos ~6 sales 9.8km │
├──────────────────────────────────────┤
│ 12:04 Walk to Den Bosch Ctrl · 11m   │
│ 12:19 Sprinter -> Tilburg · 27m      │
│ 12:46 Basic-Fit Spoorlaan · bag drop │
│ 13:05 Loop A Groenewoud-West · 62drs │
│ 14:25 Loop B Groenewoud-Oost · 58drs │
│ 15:40 Coffee · Anne&Max              │
│ 16:00 Loop C Stappegoor-Noord · 54drs│
│ 17:45 Bag pickup -> IC 18:02 home    │
├──────────────────────────────────────┤
│ WHY THIS PLAN                        │
│ Groenewoud beats Breda-Noord today:  │
│ 84% terraced housing, middle-income  │
│ fit, your history here converts 1.7x │
│ average. Loops finish 14 min from    │
│ the station.                         │
├──────────────────────────────────────┤
│ ALTERNATIVES                         │
│ Breda · Haagse Beemden               │
│   ~29 convos · 1 change · score 87   │
│ Eindhoven · Achtse Barrier           │
│   ~31 convos · longer ride · score 84│
├──────────────────────────────────────┤
│                                      │
│[ Accept · download Day Pack (18MB) ] │
│                                      │
│          [ Adjust inputs ]           │
└──────────────────────────────────────┘
```

- Matches `prototype/index.html` `#planresult` field-for-field (EV pill row, leg list, explain paragraph, 2 alternative cards, Accept + Adjust). "Why this plan" is Sonnet-generated (`00-design-decisions.md` §9.2) — always the 3-sentence budget the brief specifies, wrapped here to fit 38 columns.
- "Accept" is the only tall/primary button; alternatives are tap-to-preview (→ D2 Alternative detail, `05` §3.2), not swipeable cards — gesture-free survives gloves and rain better than a horizontal swipe. Motion: accepting triggers the 600 ms map-camera token as Route opens already centered on the first leg.

## 5. Route tab — canvassing state

Map fills the full screen; the bottom sheet is the only chrome. Two states of the same sheet are shown — collapsed peek (default) and expanded queue (drag up).

### 5.1 Collapsed sheet (default)

```
┌──────────────────────────────────────┐
│                          [HEAT] [CTR]│
│   .   .   .  Meidoornstraat  .   .   │
│   |   |   ●  |   |   ●   |   |       │
│  -+---+---+---+---+---+---+---+-     │
│   |   ●   | (Y) |[GYM]  |   |        │
│  -+---+---+---+---+---+---+---+-     │
│   .   .   .   .   .[TRAIN]  .        │
├──────────────────────────────────────┤
│                  ――                  │
│ (60%)  Meidoornstraat — even side    │
│        23 doors · high EV · then left│
│        into Lijsterbeslaan           │
│ Today   Plan [ROUTE]  Log   Stats    │
└──────────────────────────────────────┘
```

- Peek height ≈118 px (matches `prototype/index.html` `.sheet` closed transform) — always shows ring-progress-to-plan (60%) and the very next street, never zero information. `(Y)` = rep's live position; door dots colored by outcome once logged (§8 palette, not renderable here).
- `[HEAT]`/`[CTR]` (heat overlay, center-on-me) are 42×42 px floating buttons over the map canvas — map-utility chrome, not corner *navigation*, so §8's "no top-corner actions" is not violated (`05` §1). Sunlight mode: land/street fills swap to light tints; the route-remaining line stays `accent` #3B82F6 dashed in both modes.

### 5.2 Expanded sheet (drag up)

```
┌──────────────────────────────────────┐
│                  ――                  │
│ (60%)  Meidoornstraat — even side    │
│        23 doors · high EV            │
├──────────────────────────────────────┤
│ 1 Meidoornstraat (even) [====>] 23   │
│ 2 Lijsterbeslaan (both) [===> ] 31   │
│ 3 Esdoornstraat (odd)   [==>  ] 17   │
│ ✕  Beethovenlaan — skipped:          │
│     78% apartments, gate locked      │
└──────────────────────────────────────┘
```

- Expanded via a 280 ms translate on the grab handle (§8) — the map stays visible above, never a full-screen takeover. EV bars use fill-width, not color alone, so ranking reads in Sun mode and for color-blind reps alike.
- The skipped row ("Beethovenlaan") is exactly the Field Brain example nudge text from `00-design-decisions.md` §9.3, logged here for auditability. Touch target: each queue row is a full-width 48 px+ tap that re-centers the map — no swipe-to-delete/reorder (unreliable wet/gloved); reordering happens through Plan's "Adjust leg" instead.

## 6. Log — the 1-tap outcome screen

The single most important screen in the product. Layout matches `prototype/index.html` `#screen-log` exactly: one giant primary button, two large secondary buttons, then two rows of paired compact buttons — sized and ordered by estimated real-world frequency (labeled as an estimate; this is a presentation order, it does not reorder the `visit.outcome` enum in `00-design-decisions.md` §6).

### 6.1 Default state

```
┌──────────────────────────────────────┐
│ ‹   Meidoornstraat 42            ›   │
│     Terraced · built 1978 · label C  │
│     door 8 of 23                     │
├──────────────────────────────────────┤
│                                      │
│[ No answer ]                   ~62%  │
│                                      │
│                                      │
│                                      │
│           [ Conversation ]           │
│                                      │
│                                      │
│[ Sale ]                        +€38  │
│                                      │
│ [ Not interested ]   [ Follow-up ]   │
│  [ Do not knock ]   [ Inaccessible ] │
│                                      │
│       One tap logs & advances        │
│       hold a button for a note       │
│ Today   Plan  Route  [LOG]  Stats    │
└──────────────────────────────────────┘
```

- **Sizing/order rationale (estimated D2D distribution, labeled as such):** No answer (~60%+ of doors) is the tallest target (~110 px) — highest-frequency, lowest-stakes, needs least precision. Conversation/Sale (~85 px each) get equal weight; Sale sits beside Conversation despite its true ~2–5% share because a sale usually follows a logged conversation, so spatial adjacency compensates for size. Not interested/Follow-up/Do not knock/Inaccessible are least frequent, sharing paired ~52 px rows.
- **Touch targets/thumb zone:** every button, including the smallest paired ones, is ≥48 px tall × ≥160 px wide; the two largest occupy the bottom ~45% of the screen. No answer sits lowest above the tab bar — the single easiest reach for the single most frequent tap.
- **Sunlight mode:** each button keeps its outcome-palette fill (§8: sale #22C55E, conversation #3B82F6, no-answer #64748B, not-interested #F59E0B, do-not-knock #EF4444, follow-up #A855F7, inaccessible #475569 — this last value fills a gap §8 left open, matching `prototype/index.html`) at full saturation with white text in both Night and Sun.
- **One-handed reach:** the ‹ › stepper sits at the very top, deliberately the *harder*-to-reach control here — it's a rare correction, not the common path. **Motion:** button press = 100 ms scale + brightness flash (`.lb:active`); address context swaps 200 ms ease-out the instant a tap registers, without waiting for the undo window.

### 6.2 Immediately after a tap — optimistic advance + undo

```
┌──────────────────────────────────────┐
│ ‹  Meidoornstraat 44                ›│
│     Terraced · built 1978 · label C  │
│     door 9 of 23   (was: door 8)     │
├──────────────────────────────────────┤
│  · · · same 7 buttons as 6.1 · · ·   │
├──────────────────────────────────────┤
│ No answer — Meidoornstr. 42    [Undo]│
│ Today   Plan  Route  [LOG]  Stats    │
└──────────────────────────────────────┘
```

- **Interaction spec:** tap → haptic (30 ms `navigator.vibrate`, matches the prototype) → stat counters increment optimistically → address context advances to the next door **in the same frame** (no artificial delay) → a snackbar for the door just logged floats for **5 s** above the tab bar.
- **Undo:** tapping "Undo" within the 5-s window reverts both the counted stat and the address pointer to the door just logged — the write and advance already happened optimistically (append-only event model, `00-design-decisions.md` §7), so undo is a real reversal, not a cancel. Itself a single tap, no confirmation.
- **Auto-advance:** always moves forward through the planned sequence (`plan_leg` order), never guesses — if the rep is out of GPS sequence, the ‹ › stepper or "Jump to another address" (`05` §3.4) corrects it without touching undo state.
- **Long-press for a note:** holding any outcome button (~500 ms) opens a free-text field pre-tagged with that outcome ("asked to return after 18:00", a gate code) — does not block the optimistic advance, which has already happened.
- **Glove/rain:** taps only, no swipe gestures; buttons carry an internal 8–10 px dead-zone margin so a raindrop or gloved fingertip landing off-center still resolves to the intended button; haptic (not sound) is the primary confirmation since wind/rain defeats audio cues.

## 7. Door detail sheet

Reached by tapping a door pin on the Route map (`05` §3.3, D1). Read-only context before deciding whether to log now, detour to it, or mark it a deliberate skip.

```
┌──────────────────────────────────────┐
│                  ――                  │
│ Lijsterbeslaan 17                    │
│ Apartment · built 2005 · label B     │
├──────────────────────────────────────┤
│ EV  71 · high  (for a mid-week 14:00 │
│     window, this address type)       │
├──────────────────────────────────────┤
│ HISTORY                              │
│ 3 visits · 2x no answer, 1x          │
│ conversation (12 Mar 2026)           │
├──────────────────────────────────────┤
│                                      │
│          [ Log this door ]           │
│                                      │
│                                      │
│   [ Directions ]     [ Mark skip ]   │
└──────────────────────────────────────┘
```

- Touch targets/thumb zone: "Log this door" is the tall primary (deep-links into Log pre-loaded with this address, resetting the depth counter per `05` §1); Directions/Mark skip are equal-weight secondaries. Sheet rises to roughly the middle third — the map stays visible above so orientation is never lost.
- Sunlight mode: EV badge uses the same green-to-slate scale as the queue EV bars (§5.2), one consistent "how good is this" language app-wide. Offline: BAG/CBS facts and prior `visit` history are in the Day Pack and always available — nothing here needs connectivity.

## 8. Rain re-plan interruption

Default channel is the **banner** (`05` §7) — matches `prototype/index.html`'s `.nudge.warn` component exactly, single action, auto-dismiss. The **sheet** below is the escalation, reached by tapping the banner body (not its action button), used only when there is a genuine choice between concrete alternatives.

### 8.1 Banner (default)

```
┌──────────────────────────────────────┐
│| ☂ Rain starts in 22 min             │
│|   Zuid loop first keeps you dry —   │
│|   saves 9 wet minutes.     [Re-plan]│
└──────────────────────────────────────┘
```

- Bottom-anchored, 12 px side margins, above the tab bar; left border in `warn` #F59E0B (rain = weather caution, not a route error). Auto-dismisses after **9 s** if ignored (matches the prototype's `showNudge` timer) — ignoring is a valid, silent "not now," still logged to the Notification inbox (`05` §7).
- One button only: "Re-plan" executes immediately — principle 3's ≤3-choice ceiling is satisfied trivially by offering exactly one.

### 8.2 Escalated sheet (tap banner body for detail)

```
┌──────────────────────────────────────┐
│                  ――                  │
│ Rain in 22 min, ~40 min duration     │
├──────────────────────────────────────┤
│ NOW: Loop B (Groenewoud-Oost) next   │
│   — open porches, gets wet           │
│ INSTEAD: Loop C (Zuid) next          │
│   — covered stoops, then Loop B      │
│   after the rain passes              │
├──────────────────────────────────────┤
│           [ Re-plan now ]            │
│  [ Keep current ]  [ Remind in 10m ] │
└──────────────────────────────────────┘
```

- Exactly 3 buttons, the principle-3 ceiling — this sheet only appears when the choice is non-trivial (an L2 re-sequence reordering which loop is next), never for a simple accept/ignore. Before/after framing (NOW vs INSTEAD) lets a rep decide from the sheet alone, without checking the map first.
- Motion: sheet rises 280 ms (§8); the banner beneath it dismisses immediately, no double chrome stacked.

## 9. Leave-for-train nudge

Two variants of the same banner component (`05` §7), differing only in urgency framing and left-border color — both single-action, both matches of `prototype/index.html`'s `showNudge` calls.

### 9.1 Calm — margin exists

```
┌──────────────────────────────────────┐
│| IC 18:02 -> leave by 17:45          │
│|   Walk 14 min + bag pickup. You have│
│|   margin: 43 doors left fit.    [OK]│
└──────────────────────────────────────┘
```

### 9.2 Urgent — leave now

```
┌──────────────────────────────────────┐
│! Leave now — IC 18:02                │
│!   8 min walk, train in 11 min.      │
│!   No margin left.       [Directions]│
└──────────────────────────────────────┘
```

- 9.1 uses `accent` #3B82F6 border, action "OK" (acknowledge only) — P2/informational per the `05` §7 priority table. 9.2 uses a `danger`-leaning `warn` border, action "Directions" — this is P0: also pushed as an OS notification if backgrounded, and it preempts any lower-priority nudge on screen.
- Both auto-dismiss at 9 s, but 9.2 additionally repeats via push if the rep has not started moving within ~2 min (Field Brain pace check, `00-design-decisions.md` §9.3).

## 10. Daily review (Stats tab, D0)

Stats tab's root screen **is** the daily review — not a separate sheet behind a summary card (`05` §3.5) — matching `prototype/index.html` `#screen-stats` structure and figures.

```
┌──────────────────────────────────────┐
│ Today's Review                       │
├──────────────────────────────────────┤
│ TIMELINE                             │
│ 12:19 Sprinter to Tilburg — on plan  │
│ 13:05 Loop A start · first sale 13:22│
│ 14:25 Loop B · pace +9 doors vs plan │
│ 14:31 2 sales in Wilgenstraat        │
├──────────────────────────────────────┤
│ BY NEIGHBORHOOD                      │
│ Loop             Doors/h Conv%  EUR  │
│ A Groenewoud-W       44   17%   76   │
│ B Groenewoud-O       51   15%   76   │
├──────────────────────────────────────┤
│ COACH · 3 IMPROVEMENTS               │
│ 1 13:00-14:00 converts 2.1x your     │
│   late afternoon — start 30m earlier │
│ 2 4 min lost re-crossing Ringbaan    │
│ 3 3 warm follow-ups 400m from Loop C │
├──────────────────────────────────────┤
│ 6-day streak · best 11         #3 wk │
│ 21 best doors/h   23% best conv      │
│ €41/h record    4.1 km/sale          │
│ Today   Plan  Route   Log  [STATS]   │
└──────────────────────────────────────┘
```

- Touch target: each card drills into its own D1/D2 (Timeline → Today's log list on Log; By-neighborhood row → that day's Week/month stats, `05` §3.5); otherwise read-only. Thumb zone matters less here — read at day's end, standing or seated, not mid-stride, so type runs smaller and denser than Log or Route.
- Sunlight mode: unlike Log, no outcome-color fill is load-bearing here except the streak flame and record numbers — the least sunlight-sensitive screen in the app. Motion: Coach copy (Sonnet, `00-design-decisions.md` §9.4) fades in over 200 ms once generated; nothing else animates.

## 11. Stats — week view and gamification (V2)

Reached from the daily review via the period chip or the streak card (`05` §3.5, D1). Week bars and the leaderboard are V2 (`00-design-decisions.md` §10).

```
┌──────────────────────────────────────┐
│ [Today] [Week] [Month]               │
├──────────────────────────────────────┤
│ DOORS/DAY — THIS WEEK                │
│ Mo ██████       52                   │
│ Tu █████         41                  │
│ We ███████      61                   │
│ Th ████           33                 │
│ Fr ██████        48                  │
│ Sa ████████     87  <- today         │
├──────────────────────────────────────┤
│ ACHIEVEMENTS                         │
│ [7-day streak] [100 sales] [ ??? ]   │
├──────────────────────────────────────┤
│ LEADERBOARD · Team Zuid              │
│ 1  Femke v.d. Berg      312 convos   │
│ 2  Daan Willems         289 convos   │
│ 3  You                  276 convos   │
│ Today   Plan  Route   Log  [STATS]   │
└──────────────────────────────────────┘
```

- Period chips (Today/Week/Month) swap this screen's content in place — no added navigation depth (`05` §1). Bar chart uses block-character length, not color alone, as the primary encoding — legible in Night and Sun alike without relying on hue.
- Achievements: locked badges show as `[ ??? ]` rather than a greyed icon, to keep sunlight-mode contrast simple (text only). Leaderboard is org/team-scoped only (V2, `00-design-decisions.md` §10), never cross-org, consistent with the multi-tenant model (§6).

## 12. Onboarding — key screens

3 of 8 linear screens (`05` §2); the other 5 (profile basics, home base, transport/gym, bag/pace, notification prefs) reuse the same field patterns as the Plan wizard (§4).

### 12.1 Welcome

```
┌──────────────────────────────────────┐
│                                      │
│                 2DAY                 │
│                                      │
│      The field operating system      │
│       for door-to-door sales.        │
│                                      │
│                                      │
│           [ Get started ]            │
│                                      │
│   Already have an account? Sign in   │
└──────────────────────────────────────┘
```

### 12.2 Permissions primer

```
┌──────────────────────────────────────┐
│ Three permissions, three reasons     │
├──────────────────────────────────────┤
│ LOCATION                             │
│ Routes and doors, and lets us nudge  │
│ you before rain or a missed train.   │
│          [ Allow location ]          │
├──────────────────────────────────────┤
│ NOTIFICATIONS                        │
│ Rain and train nudges only — never   │
│ marketing.                           │
│       [ Allow notifications ]        │
├──────────────────────────────────────┤
│ MOTION AND FITNESS                   │
│ Steps and pace, to predict doors/h.  │
│           [ Allow motion ]           │
└──────────────────────────────────────┘
```

### 12.3 Handoff to first plan

```
┌──────────────────────────────────────┐
│                                      │
│            You're all set            │
│                                      │
│    Let's compile your first day —    │
│      it takes about 30 seconds.      │
│                                      │
│                                      │
│          [ Start planning ]          │
│                                      │
└──────────────────────────────────────┘
```

- Permissions primer states the *reason* before the OS prompt fires — each "Allow" triggers the native dialog, never a silent background request. No skip option on Location (load-bearing for the whole product); Notifications/Motion can be declined and re-enabled later from Settings (`05` §3.5).
- Handoff deliberately does not show an empty dashboard first — the first thing a new rep does is plan a real day (`05` §4).

## 13. Offline banner states

Top-anchored strip, present across all 5 tabs when relevant — distinct from the bottom-anchored nudge banner (§8–9). Matches `prototype/index.html`'s `.offline` component and copy style: terse, uppercase, neutral tone — offline is a mode, not an error (`00-design-decisions.md` principle 4).

### 13.1 Fully offline

```
┌──────────────────────────────────────┐
│OFFLINE — 12 EVENTS QUEUED            │
└──────────────────────────────────────┘
```

### 13.2 Back online, syncing

```
┌──────────────────────────────────────┐
│SYNCING — 3 EVENTS REMAINING          │
└──────────────────────────────────────┘
```

### 13.3 Online, one layer stale

```
┌──────────────────────────────────────┐
│RAIN RADAR — LAST FRAME 14M AGO       │
└──────────────────────────────────────┘
```

- All three use `warn` #F59E0B text on a low-opacity warn background — never `danger` #EF4444 red, reserved for things actually broken (`05` §8). 13.1: map, doors, and on-device L3 re-ordering all keep working; informational, not blocking — no modal, no retry, it persists until connectivity returns.
- 13.2: shown for the few seconds a queued batch flushes after reconnecting, then disappears on its own. 13.3: appears only for a live-only layer (rain radar, transit position) whose last frame is aging — the rest of the app is unaffected.
- Touch target: none of the three strips are tappable in the MVP — status, not a screen.
