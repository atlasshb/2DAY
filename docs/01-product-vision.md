# 01 · Product Vision

## The problem, honestly stated

A professional door-to-door sales rep in the Netherlands loses **30–45% of their working day to
movement that produces nothing**: walking to the wrong neighborhood, backtracking down streets
already covered, carrying a bag for hours because they didn't know there was a Basic-Fit with
lockers 400 m from the station, missing the fast train home by four minutes, and knocking on
apartment intercoms that structurally never convert. None of the tools they carry today —
Google Maps, a paper territory sheet, WhatsApp, the employer's CRM — knows anything about
*their* day: their hours, their train, their bag, their gym card, their conversion history, or
the fact that rain arrives at 15:40.

The rep's employer measures conversations and sales. The rep's tools optimize none of the
things that produce them. That gap is the product.

## The vision

**2DAY is the field operating system for door-to-door sales.** A rep opens the app at 11:30 in
Den Bosch, says they need to end in Tilburg by 18:00, and thirty seconds later has a compiled
day: which train, which station, which gym takes their bag, which neighborhoods in which order,
which streets on which sides, where to get coffee, and which train home. As the day unfolds,
the plan bends — around rain, around a cancelled Sprinter, around a rep who is running 20
minutes ahead of pace — without the rep ever making a decision bigger than a single tap.

We are not building a CRM (the employer already has one) and not building navigation (turn-by-
turn is the wrong abstraction — reps don't need directions to a destination, they need an
**optimized traversal of hundreds of destinations**). We are building the layer between the
rep's legs and the rep's targets: a real-time optimization platform whose unit of output is a
*productive conversation*.

## Why this wins

1. **The math is real and nobody ships it.** Day compilation is a scoring problem, neighborhood
   sequencing is an orienteering problem, street traversal is an arc-routing problem
   (see doc 11). These are solved literatures applied to an industry that still uses paper.
   A rep doing 6 conversations/hour who reaches 8 through eliminated dead movement gets a
   ~33% income raise for €19/month. The value equation is not subtle.
2. **The Netherlands is the perfect wedge.** BAG gives us every door in the country with
   building year and type. CBS gives income, ownership, age, and density per neighborhood.
   EP-Online gives energy labels — literally a targeting signal for energy and solar campaigns.
   OVapi gives one national realtime feed for every transit operator. KNMI gives 5-minute rain
   nowcasting. No other country hands a startup this data for free. We industrialize the NL
   pack, then template it as country packs for Belgium and Germany (doc 16, doc 20).
3. **Compounding data moat.** Every knock logged (1 tap, ≤1 s) updates the expected-value model
   for that door, street, and neighborhood — org-wide where consented, privacy-preserving by
   design (doc 17). Year two of 2DAY knows things about Dutch streets that no competitor can
   bootstrap: real answer rates by hour, real conversion by dwelling type, real doors-per-hour
   by street geometry. The product gets smarter every day reps work.
4. **Workflow, not dashboard.** The competition for the rep's phone is Google Maps plus memory.
   We win by being *operable while walking*: one thumb, sunlight-legible, offline-first,
   sub-second logging. Polish is a feature, not a garnish — it is why the data gets logged at
   all, and the data is the moat.

## What we refuse to build

- **Turn-by-turn voice navigation.** Loops and street lists, not "turn left in 200 m".
- **A CRM.** We integrate outcomes outward (CSV/API in V2+); we do not manage pipelines,
  contracts, or commissions.
- **Surveillance for employers.** Team features aggregate and anonymize (H3-truncated,
  doc 17). We sell reps a superpower, not their bosses a tracker — this is both ethics and
  churn-prevention: the product dies if reps hate carrying it.
- **An LLM that guesses routes.** AI parses intent, explains plans, and coaches; deterministic
  optimizers compute (doc 10). Reps bet their income on this output — it must be auditable.

## North-star metric & guardrails

**North star: productive conversations per working hour** (org-verified where possible).
Supporting: €/hour, doors/hour, walking-km per conversation (lower is better), % of day inside
planned loops. Guardrails: battery drain <8%/hour, plan compile <30 s p95, logging <1 s,
offline availability of all field-critical functions = 100%.

## Five-year ambition

Year 1: the indispensable personal tool for 2,500+ Dutch reps. Year 2: the default deployment
for NL/BE agencies (team seats overtake solo revenue). Year 3–5: the industry-standard field
OS across EU D2D verticals — the system every rep is onboarded onto on day one, the dataset
every campaign is planned against, and the API canvassing-adjacent industries (audits, meter
installs, census work, political canvassing under strict compliance) build upon.

The end state: **"2DAY" is what reps call the workday itself.** You don't plan a shift; you
compile one.
