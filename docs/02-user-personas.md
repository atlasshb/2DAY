# 2DAY — User Personas

> Consistent with `00-design-decisions.md` §1–§2, §10–§12. Four primary personas span the
> segment spread named in that brief (energy/telecom, solar/insurance, charity, agency B2B buyer).
> All reps use they/them pronouns. Names are representative, not real individuals.

---

## Persona A — The Commuter Closer

**Sanne de Vries, 22 — energy & telecom rep, Noord-Brabant**

| Field | Detail |
|---|---|
| Base | ’s-Hertogenbosch (Den Bosch), lives near Maaspoort |
| Segment / campaign | Energy-contract switching + SIM-only telecom, contracted through a regional canvassing agency (hourly floor + per-sale commission) |
| Experience | 8 months, part-time alongside HBO studies |
| Schedule | 12:00–18:00, four afternoons/week, fitted around lectures |
| Transport | NS train (student OV-card) |
| Equipment | Backpack only — no physical samples, contracts are signed on her phone in the employer's CRM |
| Memberships | Basic-Fit (uses branches near her start/end points as a locker and shower) |
| Device | Mid-range Android, limited mobile data plan |

**A realistic day today (pre-2DAY):**
- 11:30 — leaves home, checks weather in one app and train times in another.
- 12:00 — starts knocking wherever "felt right," or per a vague WhatsApp voice note from her team lead that morning.
- Improvises her route street by street; regularly retraces the same block without realizing it.
- No way to know which streets are worth her time — she's going on instinct and eight months of tenure.
- ~15:00 — loses 20 minutes at a slow street with a low answer rate she had no way to see coming.
- Loses track of time mid-doorbell and misses the train she meant to catch, waits for the next one.
- 18:00 — home, re-keys a paper tally into the agency CRM for her commission record.

**Tools today:**

| Task | Tool | Pain |
|---|---|---|
| Route planning | Google Maps, manual pins | No loop logic; easy to backtrack; no sense of street value |
| Team coordination | WhatsApp voice notes | Assignments are vague and unrecorded; risk of doubling up with a teammate |
| Weather | Separate weather app | Not canvassing-aware; warns too late to matter |
| Train times | NS app | Fine alone, but breaks her attention away from the walking view |
| Logging outcomes | Paper tally, memory | Re-entered twice (paper → CRM); no timestamp or location proof for disputed commission |
| Gym / locker | Basic-Fit app | Not linked to her route; she doesn't know if the nearest branch is even on her way |

**Top frustrations → 2DAY feature:**

| Frustration | 2DAY answer |
|---|---|
| "I don't know which streets are worth my time" | Door density + sales intelligence scoring (L3 productive subgraph, EV model) |
| "I retrace my steps and lose 20 minutes an hour" | Route optimization — L3 loop, start ≈ end, never out-and-back |
| "I miss trains because I lose track of time under a doorbell" | Live transit integration + field-brain nudge ("train in 11 min, 8 min walk — leave now") |
| "Rain ruins an afternoon and I find out too late" | Rain nowcast re-plan |
| "I forget half my doors by the time I write them down" | 1-tap logging, no typing |
| "My commission numbers never quite match what I remember" | Append-only visit log + daily review stats |

**Jobs-to-be-done:**
- When I have a fixed window between lectures, get me the most conversations without making me think about the route.
- When it starts raining mid-street, warn me before I'm soaked and re-route me.
- When my shift ends, get me to the right train without me watching the clock.

**Success metrics:** conversations/hour, doors/hour, €/hour, missed-train incidents → 0, zero double-entry of outcomes (estimates until pilot data exists).

**Willingness to pay:** Marginal on her own income — €19/mo prosumer subscription is a real line item against a part-time wage. Most likely path: her agency subsidizes it once trial data shows ROI, or she expenses it against commission. Price-sensitive; needs the 14-day trial to prove itself fast.

**Device / context constraints:** Direct afternoon sunlight most of her shift (Sun theme). One-handed use — backpack on both shoulders, phone in the free hand or pocket. Doorbell moments demand sub-1-second logging without looking down. No car charger; battery must survive a full unplugged shift, making the <8%/hour drain budget non-negotiable for her segment specifically.

---

## Persona B — The Income-Targeted Veteran

**Twan Verhoeven, 41 — solar & insurance rep, Zuidoost-Brabant**

| Field | Detail |
|---|---|
| Base | Eindhoven region, canvasses Waalre, Best, Genneperzijde, and Eindhoven's higher-income buurten |
| Segment / campaign | Solar-panel installer campaign + home-insurance cross-sell |
| Experience | 8 years, full-time, self-employed via the agency's freelance model |
| Schedule | 09:00–17:00, five days/week |
| Transport | Own car (Volkswagen Caddy) |
| Equipment | Trolley with laminated brochures, a solar-cell demo panel, tablet for on-the-spot insurance quotes |
| Memberships | None — car-based, no gym-as-locker need |
| Device | iPhone dashboard-mounted in the car, plus a separate tablet for quoting |

**A realistic day today (pre-2DAY):**
- Pre-selects "good" postcodes each morning from memory — years of tribal knowledge about which streets pay, none of it written down anywhere transferable.
- Parks centrally, wheels the trolley street to street; re-parks the car several times a day hunting for a spot near the next street, losing real time to it.
- Keeps a personal spreadsheet of "streets that work" — his real edge, but brittle: if his phone breaks or he changes agencies, it's gone.
- WhatsApps his handler photos of signed contracts; no time or path logging at all.
- Judges productivity by feel, not by measured €/hour.

**Top frustrations → 2DAY feature:**

| Frustration | 2DAY answer |
|---|---|
| "I don't know if an unfamiliar postcode is worth trolleying through" | Sales intelligence + door density scoring, built on CBS income/ownership data — extends his gut instinct to streets he's never tried |
| "I re-park the car constantly" | Route optimization aware of car + trolley as the carry mode, sequencing loops around fewer parking moves |
| "My years of street knowledge live in my head and a spreadsheet" | Personal history heatmap — digitizes and keeps his own performance data as *his*, portable across engagements |
| "I don't actually know my €/hour" | Daily review + session tracking, €/hour as a first-class stat |

**Jobs-to-be-done:**
- When I arrive in an unfamiliar but promising postcode, tell me instantly whether it's worth the walk.
- Help me stop re-parking six times a day.
- Let me keep my own performance history instead of losing it if I change agencies.

**Success metrics:** €/hour (his primary KPI — income-targeted work), conversion % in higher-income deciles, parking-relocation count, sales per km driven (estimates).

**Willingness to pay:** High. Treats it as a business tool and a deductible expense; would pay the full €19/mo prosumer rate immediately. If his agency adopts 2DAY org-wide, he's the rep who'd push for the €39/seat B2B tier specifically for the territory-overlap protection it gives the team.

**Device / context constraints:** Phone dashboard-mounted between stops; less sun/rain exposure than walkers, and a car charger removes his battery pressure — but all-day reliability still matters since the car mount is his only screen while driving between streets. Carries a second device (tablet) for quotes; 2DAY must stay a lightweight routing/logging layer and not try to be his CRM.

---

## Persona C — The Charity Duo Canvasser

**Fenna Bakker, 24 — donor-recruitment fundraiser, works in pairs**

| Field | Detail |
|---|---|
| Base | Utrecht, student; assigned to a different Dutch city most weeks (this week Zwolle, next week Nijmegen) |
| Segment / campaign | Face-to-face donor recruitment for an outsourced fundraising agency working NGO campaigns (UNICEF-, MSF-, Greenpeace-style) |
| Experience | 10 months, part-time, always paired with a fixed buddy (Joris) |
| Schedule | 16:00–20:00 evenings (when people are home) plus Saturday daytime |
| Transport | Agency van/carpool to the assigned city; on foot once there |
| Equipment | Employer-issued iPad for SEPA direct-debit sign-up forms |
| Memberships | None assumed — gym-as-locker is not part of her routine |
| Device | Personal phone for 2DAY, alongside the employer iPad for sign-ups |

**A realistic day today (pre-2DAY):**
- The agency assigns "you're doing Zwolle-Aalanden this week" via a shared spreadsheet, with no street-level detail.
- She and Joris split streets ad hoc on arrival — sometimes overlapping, sometimes leaving whole blocks untouched.
- No visibility into which buurten are donor-friendly versus "door-fatigued" from other charities rotating through the same streets.
- Only sign-ups get recorded (what the employer's system cares about); no record of no-answers or rejections for her own learning.
- Evening low-light hours; pairing is partly a safety measure, not just a productivity one.
- Van pickup time at the end of the shift is a guess — she either waits around or rushes to make it.

**Top frustrations → 2DAY feature:**

| Frustration | 2DAY answer |
|---|---|
| "My buddy and I double up on some streets and miss others" | Personal route loops with 1-tap logging reduce accidental overlap even without a shared team view (org-level do-not-knock sharing is V2, see doc 04) |
| "I can't tell if a street is fatigued from other canvassers" | Door density scoring; personal do-not-knock marking in MVP |
| "It's dark and hard to read my phone" | Fieldkit Night theme (dark-first, high-contrast) |
| "I don't know when to head back to the van" | Transit/anchor-deadline logic generalizes to any fixed departure point, not just trains |
| "I only see sign-ups, never my real conversion rate" | Personal daily review stats (doors, conversations, sign-ups, doors/hour) |

**Jobs-to-be-done:**
- When I'm dropped into an unfamiliar city for a week, help my buddy and I split streets without doubling up.
- Track my own conversion so I can see if I'm improving, not just what the agency dashboard shows.
- Get me back to the pickup point on time without guessing.

**Success metrics:** sign-ups/hour, doors/hour, repeat-knock incidents on the same address → 0, on-time pickup rate (estimates).

**Willingness to pay:** Low, personally — the tool is "nice to have," not essential, since her employer already issues the sign-up device. Realistic monetization runs through the agency itself buying seats (the B2B €39/seat tier, same purchase decision as Persona D), not Fenna paying €19/mo out of pocket.

**Device / context constraints:** Runs 2DAY on her own phone *alongside* the employer iPad, so it must stay lightweight and never compete for attention with the primary work device. Low-light evening use demands the Night theme's contrast. Battery must stretch across a four-hour outdoor shift plus travel. One-handed use is harder than for solo reps — she often has the iPad in one hand already, so 2DAY's single-tap interactions need to be even faster and more forgiving.

---

## Persona D — The Agency Owner (B2B buyer)

**Ruben Aksoy, 38 — team lead / agency owner, Tilburg**

| Field | Detail |
|---|---|
| Base | Tilburg, runs a field-sales bureau contracting reps to energy retailers, telecom brands, and solar installers |
| Team | 12 reps across Den Bosch, Tilburg, Eindhoven, Breda, and Nijmegen |
| Role | Territory assignment, commission tracking, coaching, client reporting — not knocking doors day-to-day anymore |
| Schedule | Office hours, plus WhatsApp reachability all day |
| Device | Desktop/tablet for admin and analytics views; phone for day-to-day coordination |
| Buyer role | Budget holder for any team tooling; expects a trial before committing all 12 seats |

**A realistic week today (pre-2DAY):**
- Territory assignment lives in a shared Google Sheet — manual, stale by Wednesday, no conflict detection.
- Coordinates day-to-day over per-city WhatsApp groups.
- Uses the agency's own CRM for commission/payroll only — no route or field intelligence in it at all.
- Eyeballs Google Maps to guess whether two reps' assigned postcodes overlap.
- Learns which streets are "good" the same way his reps do — tenure and gut feel, undocumented at the org level.
- No early signal on an underperforming or burning-out rep before commission day makes it obvious.
- Client reporting on coverage and results is a manual slide deck, assembled by hand.

**Top frustrations → 2DAY feature (V2 — org/team features, see doc 04 for staging):**

| Frustration | 2DAY answer |
|---|---|
| "Two reps burn the same streets without knowing it" | Org-wide heat maps + do-not-knock sharing *(V2)* |
| "I can't see who's actually productive per hour, only per sale" | Weekly analytics *(V2)* |
| "New hires take months to learn which streets are good" | Org-level score-cell heatmaps accelerate ramp-up *(V2)* |
| "I find out a rep is struggling only at commission time" | AI coach flags + weekly trend view *(V2)* |
| "Client reporting is a manual slide deck" | Exportable team analytics *(V2; API access is V3)* |

**Jobs-to-be-done:**
- When I assign next week's territories, make sure no two reps burn the same streets.
- When a rep is underperforming, show me why — pace, timing, or area quality — before commission day.
- When a client asks for proof of coverage, hand them a report in minutes, not hours.

**Success metrics:** team-wide €/hour, rep ramp-time to productivity, territory-overlap incidents/week → 0, rep retention, client report turnaround time (estimates).

**Willingness to pay:** He is the actual budget holder. €39/seat/month × 12 reps (~€468/mo, estimate) evaluated against measurable ramp-time and overlap reduction. Expects to pilot with 2–3 reps before committing the full team — the B2B sale is won on the territory-conflict and weekly-analytics story, not the individual rep's day-to-day convenience.

**Device / context constraints:** None of the field constraints (sunlight, one hand, battery) apply to him directly — his views are desktop/tablet, office-based. His real constraint is organizational: any perceived surveillance angle (precise location sharing, performance ranking) creates adoption resistance among his reps, so the product's GDPR-forward framing (§11 of the brief) is itself part of his sales pitch to his own team.

---

## Anti-persona: who 2DAY is not for

- **Telesales / call-center agents.** No physical movement, no route problem to solve — the entire planning engine (§5 of the brief) has nothing to optimize.
- **Inside/retail sales staff.** Fixed location, no commute or walking loop.
- **Appointment-based field service (technicians, locksmiths, installers).** Their stops are pre-scheduled by a dispatcher, not discovered by canvassing density — a very different optimization problem (fixed jobs + travel-time minimization, not orienteering over unknown-value doors).
- **Long-haul B2B reps with pre-booked meetings across regions.** No door density, no walking loops, no gym-as-locker pattern; a calendar/travel tool serves them better.
- **One-off or single-event volunteers.** Someone canvassing for a single Saturday charity drive doesn't need a recurring "field operating system" — the value compounds with repeated days and personal history.
- **Reps outside the Netherlands in V1.** Country-pack architecture is designed in from day one (§6), but only the NL pack ships in MVP; BE/DE are V3.
- **Anyone expecting 2DAY to replace their employer's CRM or contract-signing system.** 2DAY plans, routes, and logs outcomes — it is explicitly not a CRM (§1) and does not manage contracts, commissions, or payroll.
- **Network marketers selling to their personal contacts.** The core loop assumes canvassing strangers' doors in a geographic area, not working a personal network.
