# 2DAY — Monetization

> Elaborates doc 00 §11 (business posture). All market-sizing figures, churn rates, and unit
> economics below are **estimates** built from labeled assumptions, not measured data — 2DAY has
> no paying customers as of this writing (July 2026). Where doc 18 (cost estimates) is referenced,
> figures there are equally estimate-labeled.

## 1. Pricing architecture

| Tier | Price | Buyer | Includes |
|---|---|---|---|
| **Solo** | €19/mo per rep | Individual rep (self-pay) | Full L1/L2/L3 planning, Day Pack offline, 1-tap logging, live train times + rain nowcast, gym POIs, personal history heatmap, daily review |
| **Team** | €39/seat/mo | Agency/employer | Everything in Solo, plus org-wide heatmaps, territory management, do-not-knock sharing, team analytics/leaderboards |
| **Enterprise** | Custom | Large agency / utility / franchise network | Everything in Team, plus SSO/SAML, API access, custom country pack priority, white-label option, dedicated support/SLA, predictive staffing (V3) |

- **Annual billing: −20%** on any tier (Solo effective €15.20/mo billed €182.40/yr; Team effective
  €31.20/seat/mo billed €374.40/seat/yr). Annual is pushed hardest on Solo specifically because it
  pre-collects revenue through the seasonal churn window modeled in §4 — see the note there.
- **14-day free trial. No free tier.**

### Why no free tier

Three reasons, argued directly rather than asserted:

1. **Data costs are real and per-active-user, not amortized fixed cost.** Doc 18 §2.10 shows infra
   cost per active rep of roughly €0.53–3.17/month depending on scale, driven by routing-stack
   compute, Claude API calls, and Day Pack bandwidth that all fire regardless of whether that rep
   ever pays. A free tier is a standing subsidy with no offsetting revenue, in a business whose
   entire cost-structure thesis (doc 00 §11) is built on keeping that number small — undermining it
   with unlimited free usage defeats the point.
2. **14 days is enough to prove the value proposition.** The primary metric (doc 00 §1, productive
   conversations/hour) is measurable within a single working week for an active rep — a trial does
   not need to be open-ended to demonstrate uplift, unlike, say, a collaboration tool that needs a
   whole team onboarded before value appears.
3. **Free tiers in prosumer/vertical B2B-adjacent tools attract low-intent, high-support-cost
   users.** D2D reps are professionals with real expense capacity — commission-based income and
   employer expense reimbursement are both common in this workforce — so this isn't a
   price-sensitive-hobbyist market where a free tier drives durable top-of-funnel growth; it mostly
   invites signups that churn immediately and consume support/infra without ever converting.

## 2. Feature gating by tier

| Feature | Solo | Team | Enterprise |
|---|:---:|:---:|:---:|
| L1/L2/L3 planning, Day Pack offline, 1-tap logging | ✅ | ✅ | ✅ |
| Live train times + rain nowcast, gym POIs | ✅ | ✅ | ✅ |
| Personal history heatmap, daily review | ✅ | ✅ | ✅ |
| Org-wide heatmaps | — | ✅ | ✅ |
| Territory management, do-not-knock sharing | — | ✅ | ✅ |
| Team analytics / leaderboards | — | ✅ | ✅ |
| SSO / SAML | — | — | ✅ |
| API access | — | — | ✅ |
| White-label | — | — | ✅ |
| Custom/priority country pack | — | — | ✅ |
| Predictive staffing (V3) | — | — | ✅ |
| Dedicated support / SLA | — | — | ✅ |

## 3. TAM / SAM / SOM

### NL, bottom-up estimate

There is no authoritative public census of the Dutch door-to-door sales workforce; the estimate
below is built bottom-up from the verticals doc 00 §2 names and should be read as a rough order of
magnitude, not a researched figure.

| Vertical | Estimated active reps (NL, at any time) | Basis |
|---|---|---|
| Energy switching campaigns | ~2,000–3,000 | Agency-run campaigns cluster around contract-renewal seasons |
| Charity/NGO street & door fundraising | ~2,000–3,000 | Large F2F fundraising agencies operate nationally, high turnover |
| Telecom (KPN, Odido, Delta, resellers) | ~1,500–2,500 | Door sales alongside appointment-setting |
| Solar, home security, insurance, home services | ~2,000–3,500 | Mix of pure door-knocking and lead-gen-to-appointment models |
| **Total NL estimate (point estimate used below)** | **~10,000** | Sum of midpoints, rounded |

**NL TAM:** 10,000 reps × €35/mo blended ARPU (weighted toward Team pricing since most reps work
for agencies, not solo) × 12 = **≈ €4.2M/yr**.
**NL SAM** (realistically reachable via the GTM motion in §6 — excludes very small/informal
operations and in-house teams resistant to new tooling): estimate ~55% of TAM = **≈ €2.3M/yr**.
**NL SOM** (3-year realistic capture, proof-of-concept scale — not the venture-scale story, see
below): estimate 10–15% of SAM by year 3 = **≈ €230,000–345,000 ARR NL-only**.

NL is explicitly a **beachhead market**, not the ceiling — the honest read of these numbers is that
a single-country, per-seat SaaS in this vertical does not alone justify venture-scale outcomes;
doc 00 §10's V3 country-pack expansion and §5 below (expansion revenue) are where the larger
opportunity has to come from.

### EU, multiplier estimate

Extending to the V3 first-expansion markets (BE/DE per doc 00 §10), rather than all 27 EU states —
population ratio alone (NL ~18M vs. EU ~450M, a 25× multiple) overstates addressable market
because D2D sales intensity and consumer-protection regimes vary enormously by country (Germany's
energy-transition-driven door-to-door solar/switching market is large; France's consumer-protection
rules constrain unsolicited-sales D2D much more than NL/DE). This document uses a **6–10× NL
multiplier** (midpoint 8×) reflecting a realistic reachable set of markets, not full-EU coverage.

| Metric | Estimate |
|---|---|
| EU (initial expansion markets) workforce | ~80,000 reps |
| EU TAM | 80,000 × €35/mo × 12 ≈ **€33.6M/yr** |
| EU SAM (~55%) | **≈ €18.5M/yr** |
| EU SOM (5-year, post-Series-A capture, 10–15% of SAM) | **≈ €1.85M–2.75M ARR** |

## 4. Unit economics

### CAC channels

| Channel | Motion | Notes |
|---|---|---|
| Agency partnerships | B2B — sell into agency owners, roll out to their rep workforce | Primary motion (see §6) |
| Rep word-of-mouth / referral | Organic | D2D reps cluster socially (shared WhatsApp groups, shared commute/gym routines per doc 00 §2) |
| Gym/field communities | Local partnership/sponsorship | Basic-Fit and similar gyms near commuter hubs (Den Bosch, Eindhoven, Tilburg) are literal rep gathering points per doc 00's core-loop description |
| Content/SEO | Self-serve | Targets the Solo self-pay segment |
| Trade shows / sector events | B2B | Energy-switching and F2F-fundraising industry conferences, where agency owners congregate |

| Segment | Estimated blended CAC | Basis |
|---|---|---|
| Solo (self-serve) | €40–80 (midpoint €60) | Paid social/content/referral-driven, no sales cycle |
| Team (agency-sourced) | €150–250 (midpoint €200) | Sales/BD time to close a multi-seat agency deal, amortized across seats in that deal |

### LTV — modeling seasonal churn honestly

D2D is a genuinely seasonal, high-turnover workforce (doc 00 §2's own target-user description —
commuting reps, often students/gig workers). A flat monthly churn assumption would understate the
real revenue volatility. This model uses a **seasonally weighted average** rather than a single
number:

| Segment | Peak-season monthly churn (est.) | Low-season monthly churn (est., summer/Dec) | Blended average |
|---|---|---|---|
| Solo (individual rep pays) | ~4–5% | ~12–15% | **~9%** |
| Team (agency pays; seat persists even as which rep uses it turns over) | ~2–3% | ~2.5–3.5% | **~2.5%** |

The Team/Enterprise number is deliberately much smoother: the **paying entity is the agency**, and
agency-level "logo churn" is far lower than individual-rep usage turnover inside that agency — a
seat survives an agency swapping which specific rep sits in it. This distinction is the single
biggest driver of why §6 recommends B2B as the primary motion.

| Segment | ARPU | Blended monthly churn | Avg. lifetime | LTV (pre-margin) |
|---|---|---|---|---|
| Solo | €19/mo | 9% | ~11 months | **≈ €209** |
| Team (per seat) | €39/mo | 2.5% | ~40 months | **≈ €1,560** |

Infra cost per rep (doc 18: ~€1.10/rep/month at 1k reps falling to ~€0.58 at 10k) is small relative to either ARPU, so
gross contribution margin is high (~95–97%) at the unit level before CAC and support cost
amortization.

### Payback and LTV:CAC

| Segment | CAC | Monthly gross profit/customer (≈ARPU × 97%) | Payback | LTV:CAC |
|---|---|---|---|---|
| Solo | €60 | €18.4 | **~3.3 months** | **≈ 3.5:1** |
| Team (per seat) | €200 | €37.8 | **~5.3 months** | **≈ 7.8:1** |

Both clear the conventional SaaS health bar (payback <12 months, LTV:CAC >3:1); Team clears it by
a wide margin, which is the core argument in §6.

**Cash-flow implication of seasonality:** low-season churn spikes (summer, December) hit MRR
predictability directly, especially on Solo. The 20% annual discount is not just a pricing lever —
it front-loads cash collection through the low season and removes mid-season churn risk for
subscribers who prepay, which is why annual is pushed harder on Solo (the more seasonally volatile
segment) than on Team (already smooth).

**Worked example (Team, concrete):** a mid-size energy-switching agency running door-to-door
campaigns out of Den Bosch and Tilburg with 40 active reps, on the Team tier at €39/seat/mo, is
€1,560/mo (€18,720/yr) in ARR from a single agency logo — before annual discount. At the blended
7.8:1 LTV:CAC and ~40-month average seat lifetime modeled above, that single deal is worth an
estimated €62,400 in lifetime seat revenue (40 seats × €1,560 LTV/seat), against an estimated CAC
of €8,000 (40 seats × €200/seat blended). This is the shape of deal the agency-partnership channel
in §6 is built to close repeatedly, rather than chasing a small number of much larger accounts.

## 5. Expansion revenue

| Stream | Timing | Description | Revenue potential |
|---|---|---|---|
| **Country packs** (BE, DE first — doc 00 §10) | V3 | Each new country pack repeats the NL data-pipeline investment (open building/address registry, demographic data, OSM, transit feed) adapted to that country's data landscape — estimated **€80,000–150,000 engineering cost per country**, cheaper than NL's original build since the `country_pack` abstraction (doc 00 §3) is already proven | Unlocks the EU TAM in §3 |
| **Campaign data marketplace** | V3 | Aggregated, anonymized area-level performance data (conversion rates by demographic/area type, time-of-day patterns) sold to campaign owners/agencies beyond what their own org history reveals; must respect the anonymization posture in doc 00 §11 | Speculative — not counted in the SOM figures in §3; flagged as a long-range option |
| **White-label** | V3, Enterprise tier | Large agencies present the platform under their own brand to their own reps/clients | Premium custom Enterprise pricing |

## 6. Pricing risk: employer-pays vs. rep-pays

The tension: should GTM primarily target **individual reps** (Solo, rep-pays) or **agency owners**
(Team/Enterprise, employer-pays)?

| | Rep-pays (Solo) | Employer-pays (Team/Enterprise) |
|---|---|---|
| For | Faster GTM (no enterprise sales cycle), rep keeps a portable career tool across employer changes, aligns with an individual-productivity value prop | Agency captures the productivity uplift value directly (more sales for the agency), much better LTV:CAC (§4: 7.8:1 vs 3.5:1), bulk-seat deals lower per-seat CAC, smoother churn (agency-level, not rep-level) |
| Against | High price sensitivity for seasonal/precarious income, individual churn is high and hard to smooth (§4) | Longer sales cycles, requires proving ROI to a buyer who is often not tech-forward, concentration risk if a handful of large agencies each hold many seats |

**Primary motion: employer-pays (Team), with Solo as a secondary wedge, not the main engine.**
Three reasons:

1. **The unit economics say so plainly.** Team's LTV:CAC (7.8:1) and churn profile are
   substantially better than Solo's (3.5:1) — §4's numbers aren't close.
2. **Industry structure favors it.** Many D2D reps work under agency scripts and campaign rules;
   agency owners often control which tools their reps are permitted to use operationally. A
   bottom-up-only motion risks the tool being informally banned or simply ignored at the agency
   level, no matter how good individual-rep adoption looks.
3. **Solo still earns its keep as a wedge, not a dead end.** A rep who adopts Solo independently
   and later moves to (or already works at) an agency becomes an internal advocate for the agency
   to upgrade to Team — a bottom-up-then-top-down hybrid common in productivity SaaS, and cheap
   insurance against agency-channel concentration risk (doc 20 risk register item 8) by keeping a
   second, uncorrelated acquisition channel alive.

The mitigation for Team's concentration risk is explicit in the GTM plan (doc 20): diversify across
many small-to-mid agencies rather than a few large "whale" accounts, and treat any single agency
relationship — including the Noord-Brabant beta partner — as a reference case, not a revenue
dependency.
