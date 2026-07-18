# 07 · High-Fidelity UI Concepts

> Companion artifact: **`prototype/index.html`** — a self-contained, interactive, mobile-first
> high-fidelity prototype of the five tabs (open on a phone or in a ~400 px viewport). This
> document explains the visual system behind it; doc 06 holds the low-fi wireframes and
> interaction specs; doc 05 holds the IA.

## 1. Design system: `Fieldkit`

Two moods, one system (tokens in brief §8):

- **Night** (default): near-black blue `#0B0F14` ground, `#151B23` surfaces, high-chroma accents.
  Chosen because reps work into the evening, OLED battery savings are real (§2.5 of brief), and
  dark ground makes the route/heat layers read like instruments.
- **Sun**: not merely "light mode" — a **direct-sunlight mode**: pure white ground, near-black
  ink, thicker strokes (+0.5 px), one accent only, all mid-gray text promoted to full ink.
  Contrast target AAA (≥7:1) for every field-critical element. Auto-proposed via ambient light
  sensor where available; always one tap away from the Today tab.

**Type.** Inter; tabular numerals for every stat. Scale: 34/28 stats-hero, 22 section, 17 body,
15 secondary, 13 caption — nothing below 13. Weight does hierarchy before color does.

**Shape & depth.** 16 px card radius, 24 px sheet radius. No drop-shadow soup: elevation via
surface tone steps, one soft shadow level for sheets only. Hairlines at 1 px `#243040`.

**Color semantics are load-bearing.** Outcome colors (sale green, conversation blue, no-answer
slate, not-interested amber, do-not-knock red, follow-up purple) are used *identically* in log
buttons, map dots, heat layers, timeline events, and review charts — the rep learns the code
once and reads it everywhere. Accent blue is reserved for route/actions; it is never a status.

**Motion.** 200 ms ease-out for UI, 600 ms camera moves, spring only on sheet snap. Every
transition communicates causality (tap origin → sheet rises from it). `prefers-reduced-motion`
honored globally.

## 2. Screen concepts (hi-fi behavior, as built in the prototype)

### Today (home)
A **3-tier instrument panel**, not a feed:
1. **Hero strip:** big clock-adjacent facts — location chip, weather (temp, wind, rain-minutes
   countdown when rain <60 min away), work-hours progress bar.
2. **Stat grid (2×3, tabular):** doors · conversations · sales · est. earnings · steps · km.
   Numbers dominate; labels are captions. Sparkline under earnings.
3. **Contextual cards:** current/remaining route summary with mini-map, **"Train home" card**
   showing the live target train and a leave-by countdown, transport disruption card only when
   one affects today's plan.
The battery/steps row doubles as a system health strip (GPS, sync, offline badges).

### Plan (wizard)
Four sheet-steps, **zero keyboard by default**: chips, sliders, and steppers for hours,
transport, memberships, bag, pace, income tier, apartment stance; free-text intent field is
optional and parsed by AI (doc 10). Ends on a **compiled plan**: timeline of legs
(train → gym → loops → coffee → loop → station), the EV summary ("~210 doors · ~34
conversations expected"), one-paragraph AI explanation, and two alternatives as horizontal
cards. Accept = one tap, triggers Day Pack download with visible size/progress.

### Route (the instrument)
Map-first with a **snap-point bottom sheet** (peek 96 px / half / full). Peek shows the *one*
next instruction ("Meidoornstraat — even side, 23 doors") + progress ring. Half shows the
street queue with per-street door counts and EV bars. The map draws: planned loop (accent),
walked trace (dimmed), door dots colored by outcome as they're logged, heat overlay toggle,
gym/coffee/train anchors as glyphs. In sunlight mode the basemap drops to a high-contrast
grayscale style so overlays stay legible.

### Log (the money screen)
Full-screen thumb keyboard of **7 outcome buttons sized by frequency** (No answer largest, top
of thumb arc), current address auto-derived from GPS + loop position with a horizontal address
scrubber to correct ±3 doors. Tap → 80 ms haptic → 5 s undo snackbar → auto-advance to next
door. Sale opens an optional 2-field sheet (product chip + value stepper) that can be skipped.
Works with wet hands: no swipes required anywhere on this screen.

### Stats (review & game)
Day review: replayable route timeline, per-neighborhood table (doors/h, conv %, €), and the AI
coach's 3 improvements. Week: ranked cities/neighborhoods, efficiency score dial, records and
streaks. Gamification is styled as *athletics* (PRs, pace, splits) not casino — consistent with
the instrument-panel language.

## 3. Map style spec

Protomaps basemap restyled for canvassing: residential fill slightly lifted, building footprints
visible from z15, POI noise suppressed except our anchors, street labels high-priority.
Overlay stack (bottom→top): heat cells (H3, 40% alpha) → walked trace → planned loop →
door dots → anchors → rep puck (with heading cone). Heat ramps: success = blue→green,
avoid = amber→red; both colorblind-checked (no red/green adjacency without shape difference —
avoid-cells also hatch).

## 4. Accessibility & field ergonomics

- Touch targets ≥48 px; log buttons ≥64 px. All primary actions in bottom 40% of viewport.
- One-handed: no top-corner interactive elements anywhere in the field flows.
- Screen-reader labels on all stats ("34 doors visited, 6 conversations"); log buttons have
  distinct haptic patterns as a secondary non-visual channel.
- Large-type mode re-flows the stat grid to 1×6; nothing truncates.
- Offline/staleness is always visible, never modal: amber dot + "as of 14:32" captions.

## 5. Prototype notes

`prototype/index.html` is dependency-free (inline CSS/JS/SVG, stylized vector map instead of
live tiles) so it runs from a file, a phone, or a CI preview without keys. It implements: all
five tabs, Night/Sun toggle, the plan-result timeline, live-ish nudge banner (rain + train
demos), the 1-tap log flow with undo and auto-advance, and the review screen. It is a design
artifact — production uses MapLibre + real data per docs 03–16.
