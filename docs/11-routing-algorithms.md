# 2DAY — Routing & Optimization Algorithms

> Elaborates the three-level planning engine defined in
> [`00-design-decisions.md §5`](./00-design-decisions.md). This is the deepest technical document
> in the set. It does not re-decide anything: L1/L2/L3 structure, Valhalla, VROOM, OTP2, the
> EV model, and the re-optimization triggers are all fixed upstream. Here we specify the exact
> algorithms, math, complexity, and latency budgets.

All estimates are labeled `(est.)`. Coordinates and neighborhoods are real Dutch examples per §12.

---

## 1. Notation & shared primitives

| Symbol | Meaning |
|---|---|
| `H3(r)` | H3 cell at resolution `r`; we use `r=9` (~0.10 km², ~174 m edge) for scoring, `r=10` (~0.015 km²) for micro density |
| `EV(door)` | expected commission value of knocking one door (§5 of brief) |
| `score_cell` | precomputed H3 record: door count, EV features, dwelling mix (canonical entity, §6) |
| `area` | a CBS buurt; carries aggregate scores |
| `M_walk(A,B)` | Valhalla pedestrian time (s) from A to B |
| `M_transit(A,B,t)` | OTP2 transit duration departing at wall-clock `t` |
| `W` | rep work window `[t_start, t_end]` in local time |
| `C` | commute budget (max minutes rep will travel to first productive area) |

The **EV model** (brief §5) is an input to every level. L1 aggregates it per area, L2 uses it as
job prize, L3 uses it as edge weight. We never recompute EV inside routing — it is read from
`score_cell` (server) or the Day Pack slice (device).

**`doors_per_hour(area, rep)`** — the productivity predictor — is defined in §5 below and is used by
all three levels to convert "time available" into "expected conversations."

---

## 2. L1 — Day Compiler (macro: *where* to work today)

### 2.1 Problem

Given the rep's origin `O` (home or current GPS), a required end location `D` (often a station
near home) and end-time `t_end`, work hours `W`, transport mode, and goal preset, produce the
**top plan + 2 alternatives**, where a plan fixes: arrival station, working city/cluster, the
ordered *set* of candidate areas (not yet sequenced — that is L2), and gym bag-drop POI.

L1 is **candidate enumeration + scoring**, not sequencing. It is deliberately coarse and fast so it
can enumerate hundreds of candidates and hand the winner's area-set to L2.

### 2.2 Candidate enumeration

```
enumerate_candidates(O, D, W, mode, preset):
  # Step A — reachable working anchors (stations) within commute budget
  if mode == transit:
    stations = OTP2.arrivals_from(O, depart=W.t_start, max_travel=C, max_transfers=2)
        # returns [(station, arrival_time, transit_cost_€, legs)]
  elif mode in {bike, car}:
    stations = valhalla_reachable_anchors(O, cost=mode, max_time=C)
        # park-and-walk anchors: P+R sites, free-parking POIs, bike racks
  prune stations where arrival_time > W.t_start + C
  prune stations with no return option before t_end (must be able to reach D by deadline)

  # Step B — for each anchor, shortlist nearby areas
  candidates = []
  for s in stations:
    walk_budget = W.length − commute_out(s) − commute_back(s, D) − fixed_overheads
        # fixed_overheads = bag drop + lunch + buffer (≈ 45 min est.)
    reachable_areas = areas_within_isochrone(s, valhalla_walk, minutes = min(20, walk_budget))
        # 20 min: reps will not walk >20 min between station and first door
    shortlist = top_K(reachable_areas, key = area.day_potential, K = 8)
    for area_set in bounded_subsets(shortlist, walk_budget):   # see §2.4 pruning
        candidates.append(Candidate(anchor=s, areas=area_set, gym=pick_gym(s, area_set)))
  return candidates
```

- **Station reachability** uses OTP2 (transit) or Valhalla (bike/car) — never straight-line. This is
  the single most important correctness property of L1: a station 4 km away with a direct sprinter is
  "closer" than one 1.5 km away needing two transfers.
- **Area shortlisting** uses `area.day_potential`, a cheap precomputed aggregate (nightly batch)
  so L1 never touches per-door data. See §2.3.
- **Gym selection** (`pick_gym`) filters `poi` where `poi_kind=gym`, membership matches the rep's
  `gym_membership`, opening hours cover `t_start`, and it lies roughly between anchor and the area
  centroid (minimize bag-carry detour). If none, the plan carries a `carry_penalty` (bag all day).

### 2.3 Area day-potential aggregate (precomputed nightly)

```
day_potential(area) =
    Σ_{cell ∈ area}  score_cell.door_count · score_cell.mean_EV · access_factor(cell)
```

`access_factor` down-weights cells that are mostly apartments with locked entries (from BAG
`gebruiksdoel` + building height heuristics). This is a *ranking* quantity only; L1 scoring (§2.4)
recomputes value properly against the actual time budget.

### 2.4 Scoring function (the exact objective)

For a candidate `c = (anchor s, area-set U, gym g)`:

```
Score(c) =  w_rev   · Σ_{a ∈ U} expected_revenue(a, h_a)
          − w_travel· travel_cost(c)
          − w_carry · carry_penalty(g, U)
          − w_walk  · intra_area_walk(U)
          + w_novel · novelty_bonus(U, rep.history)
          + w_income· income_alignment(U)
          − w_risk  · weather_risk(U, forecast)
```

with the terms:

| Term | Definition |
|---|---|
| `expected_revenue(a, h_a)` | `min(h_a, saturation_h(a)) · doors_per_hour(a,rep) · conv_rate(a) · mean_commission(a)`. `h_a` = hours allocated to `a` (proportional split of `walk_budget` across `U` by potential). `saturation_h` caps at the point the area runs out of un-knocked doors given history. |
| `travel_cost(c)` | `κ_time · (commute_out + commute_back) + κ_money · fare(s,D)`. `fare` from OVapi/NS pricing table; `κ_money` converts € to the same utility unit as time via the rep's `value_of_time`. |
| `carry_penalty(g,U)` | `0` if a valid gym drop exists near the path; else `β · Σ h_a` (fatigue of canvassing with a bag all day) plus a fixed detour if `g` is off-path. |
| `intra_area_walk(U)` | straight-line MST estimate over area centroids (cheap proxy; L2 computes the real matrix). Discourages scattering across a city. |
| `novelty_bonus(U)` | rewards areas with low personal `visit` density — supports the "explore new city" preset. Decays as coverage rises. |
| `income_alignment(U)` | dot product of area CBS income distribution with campaign's target-income vector. Supports "highest income" preset. |
| `weather_risk(U)` | expected minutes of Buienradar rain overlapping `W` in `U`'s location (KNMI nowcast horizon 2 h; beyond that, KNMI daily). |

**`saturation_h`** matters: without it the optimizer piles all hours into the single best area and
proposes an impossible day. It is `remaining_doors(a, rep.history) / doors_per_hour(a,rep)`.

### 2.5 Goal-preset weight vectors

Weights are normalized so the revenue term dominates by default; presets re-tilt them. Values are
tuning defaults `(est.)`, stored in a `preset` table and A/B-tunable.

| Preset | `w_rev` | `w_travel` | `w_carry` | `w_walk` | `w_novel` | `w_income` | `w_risk` |
|---|---|---|---|---|---|---|---|
| **Max sales** | 1.00 | 0.6 | 0.3 | 0.2 | 0.0 | 0.0 | 0.5 |
| **Easy day** | 0.55 | 1.0 | 1.0 | 1.0 | 0.0 | 0.0 | 0.8 |
| **Highest income** | 0.80 | 0.6 | 0.3 | 0.3 | 0.0 | 1.0 | 0.5 |
| **Shortest walking** | 0.60 | 0.8 | 0.6 | 1.2 | 0.0 | 0.0 | 0.6 |
| **Explore new city** | 0.70 | 0.5 | 0.3 | 0.3 | 1.0 | 0.1 | 0.4 |

"Easy day" up-weights travel/carry/walk penalties so short, low-friction days win. "Max sales" is
nearly pure revenue but still fears rain (`w_risk` non-zero) because a rained-out afternoon is zero
revenue. "Shortest walking" pushes `w_walk` above 1 so compact area-sets win even at some revenue cost.

### 2.6 Output & alternatives

Rank candidates by `Score`. Emit the top candidate plus the 2 best that are *materially different*
(different anchor city OR ≥50% different area-set) so the rep sees genuine choices, not near-duplicates
(brief §2: never present >3 choices). Sonnet (brief §9) turns `(chosen, rejected[0..1])` into three
sentences; it never alters the ranking.

### 2.7 Complexity & latency

- Let `S` = candidate stations (≤ ~15 after pruning), `A` = shortlisted areas per station (`K=8`),
  and we bound area-set size to `p ∈ {2,3,4}`. Candidate count ≈ `S · Σ_{p} C(8,p)` ≈ `15 · 92 ≈ 1400`.
- Each `Score` is O(`|U|`) with all inputs precomputed → ~4 field ops. Total scoring ≈ 6k ops → sub-ms.
- The cost is the **matrix/transit lookups**, not scoring: `S` OTP2 arrival queries + `S` Valhalla
  isochrones. These are cached (§8) and parallelized.
- **Target latency: < 800 ms p50, < 1.5 s p95** for L1 alone `(est.)`. The full "Plan (30 s)" budget
  in the core loop (brief §2) is dominated by the rep reading, not compute.

---

## 3. L2 — Orienteering with Time Windows (meso: *in what order*)

### 3.1 Formal problem (OPTW)

L1 hands L2 a fixed set of areas, each collapsed to one or more **visit nodes** (a node = an
entry/exit point of an area's L3 loop) plus anchors. We solve an **Orienteering Problem with Time
Windows (OPTW)** — select a subset and order it to maximize collected prize under a hard time budget.

**Sets**

- `V = {0} ∪ N ∪ {n+1}` — node 0 = start anchor (arrival station), node `n+1` = end anchor (departure
  station); `N` = candidate visit nodes (area loops, plus optional lunch/coffee POIs).
- `A = {(i,j) : i,j ∈ V}` — arcs.

**Parameters**

- `p_i` — prize of node `i` = expected conversations from that area's loop within its planned dwell.
- `s_i` — service time at `i` = planned canvassing duration (L3 loop time) or break duration.
- `t_ij = M_walk(i,j)` — walking travel time (Valhalla matrix).
- `[e_i, l_i]` — time window: gym `[open, close]`; lunch `[11:30, 13:30]`; areas typically `[t_start, t_end]`.
- `T_max` — hard end: latest arrival at node `n+1` = **train departure − platform buffer**.

**Decision variables**

- `x_ij ∈ {0,1}` — arc `(i,j)` used.
- `y_i ∈ {0,1}` — node `i` visited.
- `a_i ≥ 0` — arrival time at node `i`.

**Objective**

```
maximize   Σ_{i ∈ N}  p_i · y_i
```

**Constraints**

```
(1) Σ_j x_0j = Σ_i x_{i,n+1} = 1                       # start at 0, end at n+1
(2) Σ_j x_ij = Σ_j x_ji = y_i          ∀ i ∈ N          # flow conservation = visited
(3) a_i + s_i + t_ij − T_max·(1 − x_ij) ≤ a_j   ∀(i,j)  # time propagation (MTZ-style, kills subtours)
(4) e_i · y_i ≤ a_i ≤ l_i · y_i         ∀ i ∈ V          # time windows
(5) a_{n+1} ≤ T_max                                     # hard train deadline
(6) y_g = 1 for the chosen gym g, with a_g before first canvass node   # bag-drop precedence
(7) Σ_{i∈lunch} y_i ≥ 1  (soft — see §3.4)              # eat once
(8) x_ij, y_i ∈ {0,1}
```

Prizes accrue from `N` only; anchors, gym, lunch carry `p=0`. Constraint (6) forces the gym drop
early and before canvassing (you drop the bag *then* work). This is the mathematically exact form;
we do not solve it exactly — see §3.2.

### 3.2 Mapping onto VROOM (first pass)

VROOM does not natively maximize prize, but its **priority + unassigned** mechanics approximate OPTW
well. Mapping:

| OPTW element | VROOM encoding |
|---|---|
| visit node `i` | a **job** with `service = s_i`, `location = i` |
| prize `p_i` | job `priority` = `round(scale · p_i)` (0–100). VROOM maximizes assigned priority, drops low-priority jobs when time-constrained → exactly the orienteering "leave prize on the table" behavior |
| time window `[e_i,l_i]` | job `time_windows` |
| work window `W` | single **vehicle** with `time_window = [t_start, t_end]` |
| start/end anchors | vehicle `start` = arrival station, `end` = departure station |
| hard train deadline `T_max` | vehicle `time_window` upper bound = `T_max` |
| gym bag-drop | a job with high priority + early `time_window` `[open, first_area_e]`, service = drop time |
| lunch | a job with a `[11:30,13:30]` window and moderate priority (droppable) |
| walking costs `t_ij` | **Valhalla matrix** supplied as VROOM's custom `matrix` (we do not use VROOM's built-in routing) |

We call VROOM with the pedestrian duration matrix from Valhalla (`/sources/matrix`). VROOM returns
an ordered route with some jobs unassigned (the dropped prizes). This is our warm start.

**Why not stop at VROOM?** VROOM's priority is integer and its objective is lexicographic
(minimize unassigned priority, then cost). Our prize is continuous and we want to trade a small
prize loss for a large walking saving in ways VROOM's cost term underweights. Hence the ILS pass.

### 3.3 Custom ILS refinement

Iterated Local Search over the VROOM solution, optimizing the *true* OPTW objective
`Σ p_i y_i − λ·(walk time)` with feasibility (train deadline, windows, gym precedence) checked exactly
via forward time propagation (constraint 3).

```
ILS(route0):
  best = local_search(route0)
  s = best
  for iter in 1..I_max (or until time budget):
    s' = perturb(s)                      # double-bridge on the visited sequence
    s' = local_search(s')                # descend to local opt
    if accept(s', s):  s = s'            # accept if better, or slightly worse (RRT threshold)
    if f(s) > f(best): best = s
  return best

local_search(s):  repeat until no improving move:
    apply best of { relocate, swap, 2-opt, prize-drop, prize-add }
```

**Neighborhood moves** (each evaluated by delta-cost + feasibility check):

- **relocate** — move one visited node to a better position (intra-route). Fixes ordering.
- **swap** — exchange positions of two visited nodes.
- **2-opt** — reverse a subsequence; classic tour-length reducer. Reversal must re-check time
  windows because arrival times shift.
- **prize-drop** — remove the visited node with the worst `p_i / marginal_time` ratio when the route
  is time-infeasible or when dropping it frees enough time to add two better nodes.
- **prize-add** — insert a currently-unassigned node into its cheapest feasible slot if
  `p_i > λ · insertion_cost`. This is where ILS beats VROOM: it re-adds prizes VROOM dropped once
  slack appears after a 2-opt.

**Acceptance**: Record-to-Record Travel — accept `s'` if `f(s') > f(best) − ρ·f(best)` (`ρ ≈ 0.02`
`(est.)`); escapes local optima without full simulated-annealing bookkeeping.

**Feasibility on every move** — maintain per-node earliest-arrival `a_i` incrementally. A move is
rejected immediately if it pushes `a_{n+1} > T_max`. The **train deadline is never soft**: a plan that
misses the train home is worthless. Gym opening hours and daylight are likewise hard (constraint 4,6).

### 3.4 How the special anchors enter

- **Gym bag-drop** — a mandatory node (`y_g=1`) with an early window and a precedence constraint
  (must precede any canvass node). If L1 found no valid gym, L2 omits it and the plan inherits L1's
  `carry_penalty`; downstream nudges warn "no locker today."
- **Lunch window** — a *soft* droppable node with window `[11:30,13:30]`. Modeled as prize
  `p_lunch = w_break` so ILS keeps it unless the day is so tight that skipping lunch buys a whole extra
  area; then it drops with a visible "no lunch break in this plan" flag for the rep to veto.
- **Hard train deadline** — the vehicle time-window upper bound = `train_departure − platform_buffer`
  (buffer `≈ 4 min` `(est.)`, longer at large stations like Utrecht Centraal). Feeds constraint (5).
  When GTFS-RT reports the train delayed/cancelled, this bound moves and triggers re-plan (§6, and
  [doc 13 §4](./13-public-transport-integration.md)).

### 3.5 Complexity & latency

- OPTW is NP-hard; ILS is anytime. Per iteration: local search is `O(n²)` for 2-opt scan with `n` =
  visited nodes (typically `n ≤ 12` for a realistic day). Each candidate area contributes ~1–2 nodes.
- With `n ≤ 12`, a full local-search sweep is ~hundreds of delta evaluations; we run `I_max ≈ 300`
  perturbations comfortably.
- **Target latency: < 1.2 s p95** given a warm Valhalla matrix. The dominant cost is the matrix
  build (`(n+anchors)²` Valhalla calls), mitigated by the H3 matrix cache (§8).

---

## 4. L3 — Rural Postman (micro: *which streets, which side*)

### 4.1 Productive subgraph & formal RPP

Within one area we build the **productive subgraph** `G = (V, E)` from `street_edge` entities:

- `V` — routable junction nodes (OSM intersections) inside/adjacent to the area.
- `E` — walkable street segments. A physical street with doors on both sides that must be canvassed
  separately is modeled as **two directed side-edges** (see §4.7). A street we merely pass through is
  a single traversal edge.
- Each side-edge `e` carries: `len(e)` (m), `doors(e)` (from BAG units fronting that side),
  `EV(e) = Σ_{door∈e} EV(door)`, and `t(e)` = time to *canvass* that side (walk + knock), distinct
  from `t_pass(e)` = time to merely walk it.

Let `E_R ⊆ E` be **required edges** (must be canvassed). The **Rural Postman Problem**: find a
minimum-cost closed walk that traverses every edge in `E_R` at least once (may reuse any edge in `E`
to connect them). Because we also *choose* `E_R` under a time budget, our problem is really a
**prize-collecting / budgeted RPP**:

```
maximize    Σ_{e ∈ E_R}  EV(e)
subject to  cost(closed_walk covering E_R)  ≤  B          # B = area time budget from L2 (= s_i)
            walk starts and ends at the L2-chosen entry/exit node  (loop closure)
```

RPP is NP-hard even with `E_R` fixed; with selection it is harder. We use the staged heuristic below.
It has five stages; pseudocode for the whole pipeline is in §4.6.

### 4.2 Edge scoring

```
score(e) =  EV(e)  /  t(e)              # prize density: expected € per second of canvassing
t(e)     =  len(e)/v_walk  +  doors(e)·E[dwell]    # see §5 for v_walk, dwell
```

`score(e)` is *prize per unit time*, the right currency for a budgeted problem: we want the edges that
buy the most expected value per second spent. `EV(e)` already folds in BAG dwelling type and CBS
demographics (brief §5). A luxury single-family street with 40 doors on a short segment scores far
above a long boulevard of locked apartment lobbies.

### 4.3 Required-edge selection (knapsack-flavored greedy + connectivity)

Pure "take highest `score(e)` until budget" scatters the required set across the area, exploding the
connective (deadhead) walking. We add a **connectivity bonus** so the greedy prefers edges adjacent to
what is already selected:

```
select_required(G, B):
  E_R = ∅ ;  used_time = 0
  # seed with the globally best edge
  E_R = { argmax_e score(e) } ;  used_time = t(e_seed)
  loop:
    for each candidate e ∉ E_R:
        conn = 1 + γ · adjacency(e, E_R)         # γ ≈ 0.4 (est.); adjacency ∈ {0,1,2 shared endpoints}
        gain(e) = score(e) · conn
        Δtime(e) = t(e) + est_deadhead(e, E_R)   # marginal canvass + connect cost
    e* = argmax gain(e) / Δtime(e)
    if used_time + Δtime(e*) > B: break
    E_R.add(e*) ;  used_time += Δtime(e*)
  return E_R
```

- `adjacency(e, E_R)` counts endpoints `e` shares with the current required set → clustering pressure.
- `est_deadhead` uses the current partial route's nearest node to `e` (cheap, updated incrementally).
- This is the classic **greedy knapsack ratio** (`gain/Δtime`) with a spatial regularizer. Not optimal,
  but within a few percent of tuned optima on grid-like Dutch residential layouts `(est.)`.

### 4.4 Serpentine sweep within street clusters

Dutch residential neighborhoods (e.g. Den Bosch **Maaspoort**, Eindhoven **Woensel**) are laid out as
near-grids or comb patterns. Within a cluster of parallel/looping streets we order traversal as a
**boustrophedon (serpentine) sweep**: go up one street, cross to the adjacent street, come back down,
so consecutive streets are physically adjacent and turn-around deadheading is minimized.

```
serpentine(cluster):
  project side-edges onto the cluster's principal axis (PCA of node coords)
  sort streets by projected position
  walk street 1 forward, street 2 backward, street 3 forward, … (alternate)
  within a street, canvass the near side on the way out, far side on the way back (if both required)
```

The sweep gives the near-Eulerian augmentation (§4.5) a well-ordered starting sequence, so matching has
little to fix.

### 4.5 Near-Eulerian augmentation (greedy odd-vertex matching)

A connected graph has an Eulerian *circuit* iff every vertex has even degree. The required set `E_R`
(plus forced deadheads) generally has odd-degree vertices. Classic RPP would solve a **minimum-weight
perfect matching** on odd vertices (Christofides-style, `O(V³)`). We use a **greedy matching** for
speed since `|odd|` is small per area:

```
make_eulerian(E_R, G):
  ensure connectivity: connect components of E_R via shortest deadhead paths (Valhalla/Dijkstra on G)
  odd = { v : deg(v) is odd }
  while odd not empty:
    u = pop(odd)
    v = argmin_{w ∈ odd} shortest_path_len(u, w, G)     # greedy nearest odd partner
    add shortest_path(u, v) edges as deadhead duplicates
    remove u, v from odd
  # graph is now even-degree & connected → Eulerian circuit exists
  circuit = hierholzer(augmented_graph, start = entry_node)
  return circuit
```

- **Greedy** vs optimal matching: greedy nearest-neighbor matching is `O(odd² · log)` and typically
  within ~10% of optimal matching weight on sparse street graphs `(est.)`; the exact `O(V³)` blossom
  algorithm is not worth the latency at L3's <500 ms device budget.
- **Hierholzer** produces the Eulerian circuit in `O(E)` once degrees are even.

### 4.6 Full L3 pipeline (pseudocode)

```
L3_plan(area, entry_node, exit_node, budget B, rep):
  # 1. build productive subgraph from street_edge (both sides where applicable)
  G = build_subgraph(area)                             # §4.1, §4.7 side decision per edge
  annotate each side-edge with doors, EV, t(e), t_pass(e)   # §4.2, §5

  # 2. select required edges under time budget
  E_R = select_required(G, B')                         # §4.3; B' = B − reserve for deadhead (≈15%)

  # 3. cluster & order via serpentine sweep
  clusters = cluster_streets(E_R)                      # connected components / DBSCAN on midpoints
  seq = concat(serpentine(c) for c in order_clusters(clusters, entry_node))   # §4.4

  # 4. make near-Eulerian (connect + greedy odd matching) and build circuit
  circuit = make_eulerian(edges_of(seq) ∪ forced_connectors, G)              # §4.5

  # 5. cleanup: 2-opt on the deadhead segments + shortcut removal
  circuit = twoopt_deadheads(circuit)                  # only reorders non-required passes
  circuit = remove_shortcuttable_detours(circuit)      # drop a duplicated edge if a shorter connector exists

  # 6. loop-closure guarantee
  circuit = close_loop(circuit, entry_node, exit_node) # if entry≠exit, append shortest_path(last, exit)
  assert circuit.start == entry_node and circuit.end == exit_node
  assert covers(circuit, E_R)                          # every required edge canvassed ≥ once
  return to_plan_legs(circuit)                          # emit ordered walk/canvass plan_leg records
```

- **Loop-closure guarantee (step 6):** L2 chooses `entry_node`/`exit_node` for the area. If they are
  equal, the Eulerian circuit already closes. If different (L2 wants to exit toward the next area or
  the station), we append the shortest connecting path so the output is a *walk* from entry to exit
  that still covers `E_R`. We never emit an out-and-back (brief §5): the serpentine + Eulerian
  structure inherently produces a loop/through-walk, and the assertion enforces it.
- **2-opt cleanup (step 5)** only touches deadhead (non-canvass) passes — reordering canvass edges is
  already handled by selection/serpentine, and we must not drop a required edge.

### 4.7 Both-sides vs single-side traversal — decision rules

Whether a street is canvassed as one pass (cross the street as you go) or two separate side-edges
depends on how costly/annoying crossing is, read from OSM tags on the `street_edge`:

| Signal (OSM tag) | Rule |
|---|---|
| `highway=residential` or `living_street`, no `lanes` or `lanes≤2`, `maxspeed≤30` | **Both sides in one pass** (zig-zag): rep crosses freely; model as single edge, `doors` = both sides, `t(e)` includes crossings. |
| `highway=tertiary/secondary`, `lanes≥2`, `maxspeed≥50`, or `dual_carriageway=yes` | **Two side-edges**: crossing is unsafe/slow; each side canvassed as its own directed edge, connected only at signalized crossings (`highway=crossing`). |
| `sidewalk=both` present, road narrow | one pass. `sidewalk=separate` + wide → two edges. |
| Tram tracks (`railway=tram` on street, e.g. HTM in Den Haag) | two edges; crossing only at marked points. |
| Very high door density both sides + quiet street | one pass, but slower `v_walk` (more crossing). |

The default for Dutch `woonwijk` (residential quarters) is **one pass** — most target streets are
30 km/h `living_street`s where zig-zag canvassing is normal. Two-sided modeling is the exception for
arterials.

### 4.8 Complexity & latency

- `select_required`: `O(|E| · |E_R|)` worst case; with incremental adjacency ≈ `O(|E| log|E|)`.
- `make_eulerian`: `O(|odd|² log V)` greedy matching + `O(E)` Hierholzer.
- Typical area: `|E| ≈ 150–400` side-edges, `|odd| ≈ 20–40`.
- **Target latency: < 400 ms server p95** per area; **< 500 ms on-device** for the degraded re-order
  (§6.3). L3 is the level re-run most often, so it must stay cheap.

---

## 5. Doors/hour prediction model

Converts "time in an area" into "doors knocked" and (via EV) "conversations." Used by all levels.

### 5.1 Door spacing from BAG geometry

For a side-edge `e`:

```
spacing(e) = len(e) / max(1, doors(e))          # meters between consecutive doors on that side
```

`doors(e)` counts BAG `verblijfsobject` points whose access geometry fronts `e`. For row houses
(typical NL terraced `rijtjeshuis`), spacing ≈ 5–6 m; for detached (`vrijstaand`), 15–25 m; for an
apartment block, one street door may front dozens of units (handled by `access_factor`, §2.3 — you
knock one buzzer panel, not 30 doors).

### 5.2 Dwell-time distribution per outcome

Time at a door = walk-to-next + interaction. Interaction time depends on `visit.outcome`:

| Outcome | `E[dwell]` (est.) | Notes |
|---|---|---|
| `no_answer` | 25 s | ring, wait, note, leave |
| `not_interested` | 40 s | brief exchange |
| `conversation` | 180 s | real pitch |
| `sale` | 420 s | pitch + paperwork/app signup |
| `follow_up` | 150 s | schedule, capture contact |
| `do_not_knock` / `inaccessible` | 5 s | skip |

Model interaction time as a mixture weighted by the area's outcome probabilities (from the EV model):

```
E[dwell | area] = Σ_o  P(outcome = o | area, time_of_day) · E[dwell_o]
```

Dwell distributions are lognormal per outcome (long right tail on `sale`); we carry mean + variance so
the plan can show a p50 and p80 finish time, not just a point estimate.

### 5.3 Walking speed presets

```
v_walk = v_base · k_terrain · k_load · k_weather
```

| Factor | Values (est.) |
|---|---|
| `v_base` | 1.35 m/s (≈ 4.9 km/h) default; rep-calibrated (§5.4) |
| `k_terrain` | 1.0 flat NL; 0.95 with steps/canal bridges |
| `k_load` | 1.0 no bag; 0.9 carrying bag (no gym drop) |
| `k_weather` | 1.0 dry; 0.85 rain (KNMI/Buienradar) |

### 5.4 Doors/hour formula & calibration

```
doors_per_hour(area, rep) =
    3600 / ( spacing_bar(area)/v_walk(rep)  +  E[dwell | area] )
```

where `spacing_bar` is the door-count-weighted mean spacing across the area's required edges.

**Calibration:** each rep's `v_base` and their personal dwell multipliers are estimated from their own
`visit` + GPS breadcrumb stream. We fit `v_base` by regressing observed inter-door times on BAG
spacing (robust/Huber loss to reject outliers — coffee breaks, phone calls). Personal dwell scale is a
multiplier over org priors with **Bayesian shrinkage** (brief §5): a new rep uses org priors; as their
event count grows the posterior moves toward their observed times, with a **90-day recency half-life**
so a rep who got faster is tracked. This is the same shrinkage machinery as the EV posteriors, run in
the nightly batch (brief §9.5), never in the LLM.

---

## 6. Live re-optimization

### 6.1 Triggers → which level re-runs

Per brief §5, re-optimization is incremental: cheapest level that can absorb the change.

| Trigger (from Field Brain, brief §9.3) | Re-plan level | Rationale |
|---|---|---|
| Rain nowcast: rain in `<T` min over current area | **L3** always (reorder to dry streets first); **L2** if a whole area should be resequenced | keep working, chase dry windows |
| Transit disruption (GTFS-RT: delay/cancel of the planned train) | **L2** (deadline moves) → possibly **L1** if the return itinerary breaks | deadline is a hard constraint |
| Pace ahead/behind > 15 min vs plan | **L2** (add/drop an area) — see brief §5 threshold | more/less time than assumed |
| Street closed / mass `do_not_knock` / `inaccessible` cluster | **L3** (drop those edges, reselect) | local, cheap |
| Doors exhausted early (area saturated) | **L2** (pull in next area) | |
| Rep taps "re-plan the day" | **L1** (full recompute) — only on explicit request | expensive; user-initiated per brief |

**Rule of thumb (brief §5):** L3 on almost any signal; L2 only when deviation > 15 min or a hard
constraint (train/gym) moves; L1 only on user request.

### 6.2 Incremental algorithms

- **L3 incremental** — do *not* rebuild the subgraph. Mark newly-dead edges (rain-exposed, closed,
  do-not-knock) as removed from `E_R`, re-run `select_required` only on the *remaining budget from the
  current position*, and re-thread the Eulerian circuit from the rep's current node. Warm-starts from
  the existing circuit; usually a few local moves.
- **L2 incremental** — keep the completed prefix of the route fixed (already-visited nodes), re-solve
  OPTW on the *suffix* from current position with the updated `T_max` (new train time) and updated
  remaining prizes (visited areas removed). This is a smaller OPTW → ILS converges in a handful of
  iterations. VROOM is skipped on incremental L2 (warm start is the current suffix).
- **L1 incremental** — full re-enumeration but seeded: reuse cached OTP2 arrivals and Valhalla
  isochrones from the morning compile (still valid unless transit changed), so only scoring re-runs.

### 6.3 On-device degraded L3 (offline)

When offline, the Field Brain re-orders the *current area's remaining loop* on-device with no server
call, no fresh matrix:

```
device_L3_reorder(remaining_edges, current_node, dead_edges, budget_left):
  drop dead_edges from remaining_edges
  # greedy nearest-productive first, using cached pairwise walk times from the Day Pack
  route = [current_node]
  while remaining_edges and budget_left > 0:
    e = argmax_{e}  score(e) / (cached_walk(current_node, e.near_endpoint) + t(e))
    if budget_left − (cached_walk(...) + t(e)) < 0: break
    route.append(e); advance current_node; budget_left −= …
  return route     # not Eulerian-optimal, but valid, connected, deadline-aware
```

- Uses only the **Day Pack** cached walk-time slice (brief §7) and cached EV — zero connectivity.
- Greedy, not full RPP — correctness (valid, covers what it can, respects `budget_left`) over
  optimality. Deliberately the same greedy ratio as §4.3 so behavior is predictable to the rep.
- Shows a "offline — simplified route" staleness badge (brief §7).

### 6.4 Latency budgets

| Path | Budget | Source |
|---|---|---|
| Server re-plan (L2/L3) | **< 3 s** | brief §5 hard requirement |
| Server L3-only | < 1 s p95 `(est.)` | §4.8 |
| On-device degraded L3 | **< 500 ms** | brief §5; §4.8 |
| Field Brain nudge decision (rules only) | < 50 ms `(est.)` | pure on-device rules |

---

## 7. Failure modes & fallbacks

The optimizer must always return *a* usable plan. Degradations are visible to the rep (staleness /
"simplified" badges), never silent.

| Failure | Detection | Fallback |
|---|---|---|
| **VROOM timeout / no solution** (L2) | wall-clock > 1.5 s or empty result | **Greedy insertion heuristic**: seed with start anchor, repeatedly insert the highest `prize/insertion-cost` unassigned job at its cheapest feasible slot until deadline; skip infeasible. Then run ILS on the result if time remains. Always yields a feasible route. |
| **Valhalla matrix too large** (L1/L2) | node count `n` such that `n²` calls exceed budget (e.g. dense L1 candidate expansion) | **H3-cluster centroids first**: collapse nodes to their `H3(r=9)` cell centroids, build the small centroid matrix, solve at cluster level, then refine only the chosen clusters with the full per-node matrix. Two-stage, bounds matrix size. |
| **Valhalla down** | health check / timeout | serve last cached matrix for the H3 pair set (§8); if none, fall back to great-circle distance × 1.3 detour factor `(est.)` with a "estimated distances" badge; L3 defers to device greedy. |
| **OTP2 down / no itinerary** (L1) | timeout / empty plan | fall back to bike/car mode enumeration (Valhalla), or nearest-station heuristic using cached timetable slice; flag "transit times unverified." |
| **score_cell stale / missing** | nightly batch failed | use `area`-level CBS/BAG priors only (no personal posteriors); flag lower confidence. |
| **Device offline at plan time** | no connectivity | run entirely off the last Day Pack; L1 is not available offline (needs transit), L2/L3 run on cached data; rep works the already-compiled plan with device-side re-ordering (§6.3). |
| **ILS over budget** | time budget hit | return best-so-far (ILS is anytime); VROOM/greedy warm start guarantees the returned solution is already feasible. |

**Design invariant:** every level has a deterministic, fast, feasibility-preserving fallback. The AI
layer (brief §9) is never in any of these paths — it explains plans, it does not produce them.

---

## 8. Caching (routing-relevant; full strategy in doc 16)

- **Matrix cache** keyed by unordered `H3(r=9)` cell pair → pedestrian time; snaps node coords to
  cell centroid for the key. Hit rate is high because reps re-work the same neighborhoods. See
  [doc 16 §3](./16-scalability.md).
- **OTP2 arrivals** cached per `(origin H3, station, departure 5-min bucket)` — timetables are stable
  intra-day; invalidated by GTFS-RT disruptions (doc 13 §4).
- **score_cell prebake** — nightly; L1/L2/L3 read, never compute, EV.
- **Plan template reuse** — a rep's recurring "Tuesday: Tilburg" plan seeds L1 candidate enumeration
  to skip cold enumeration.

---

## 9. Cross-references

- EV model, entity names, re-opt thresholds → [`00-design-decisions.md`](./00-design-decisions.md) §5–6.
- Transit data flow, "leave now" nudges, disruption classes → [doc 13](./13-public-transport-integration.md).
- Component scaling, matrix cache sizing, SLOs → [doc 16](./16-scalability.md).
- Offline Day Pack contents & sync → `00-design-decisions.md` §7.
