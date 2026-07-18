# E2E user stories — the journeys the suite must prove

Every story below is exercised against the **production build** of the app on a phone-sized
viewport (390×844), the way a rep would actually use it on the doorstep. Spec files live in
`e2e/tests/`; story IDs appear in test titles so CI output reads as a user-journey checklist.

| ID | Story (as the rep) | Spec file |
|---|---|---|
| US-01 | I open the app mid-shift and see my day at a glance: doors, convos, sales, earnings, work-hours progress, weather, and my train home. | `today.spec.ts` |
| US-02 | I compile my day in the Plan tab: my inputs are visible as chips, compilation shows progress, and I get a legged plan with expected value, an explanation, and 2 alternatives. | `plan.spec.ts` |
| US-03 | I accept the plan and land on the Route tab; I see the next street instruction and can expand the street queue with per-street door counts. | `plan.spec.ts` |
| US-04 | I log a door in one tap; my stats update instantly, the address auto-advances, and a 5-second Undo restores everything if I fat-finger it. | `log.spec.ts` |
| US-05 | The app nudges me (rain / train) without burying my screen; I can act on the nudge or dismiss it. | `today.spec.ts` |
| US-06 | In direct sunlight I flip to Sun mode and every tab stays legible; the toggle persists as I navigate. | `theme.spec.ts` |
| US-07 | At day's end the Stats tab shows my timeline, per-neighborhood performance, coach improvements, and my streak/records. | `stats.spec.ts` |
| US-08 | At the door I record the conversation (with the consent state I choose); the moment I stop, I see the detected outcome with confidence, what went well, what to improve, and the objections I faced. | `record.spec.ts` |
| US-09 | I sell in more than one language: a conversation that isn't in my UI language still classifies correctly, shows a language badge, and gives me a summary I can read. | `record.spec.ts` |
| US-10 | I log the recorded outcome in one tap from the analysis card — it counts exactly like a manual log. | `record.spec.ts` |
| US-11 | I can open any tab directly by URL (app-shell routing works cold). | `shell.spec.ts` |
| US-12 | The app installs to my home screen (PWA manifest served and well-formed). | `shell.spec.ts` |
| US-13 | Tab bar and primary actions are accessible: proper roles/names, and every interactive target meets the 48 px minimum. | `shell.spec.ts` |

Conventions: use the `data-testid` hooks documented in the components (`record-toggle`,
`consent-chip`, `stop-record`, `sample-transcript-btn`, `analysis-card`, `analysis-outcome`,
`analysis-language`, `log-outcome-btn`); no arbitrary sleeps — wait on UI state; each spec
independent (fresh page).
