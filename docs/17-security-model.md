# 2DAY — Security & Privacy Model

> Elaborates `00-design-decisions.md` §11 and the multi-tenancy stance in §3/§6. 2DAY holds
> commercially sensitive territory intelligence and legally sensitive location data about reps and
> households. The model rests on four pillars: **RLS-enforced tenancy** (org_id on every row),
> **consent-first GPS with on-device precision reduction**, **AVG/GDPR by design** (lawful bases,
> retention, crypto-shredding DSR), and **EU-only residency**. References doc 08 (RLS policy
> bodies) and doc 09 §6 (planner JWT verification).

## 1. Threat model

Assets × adversaries, with the primary control for each cell.

| Asset ↓ / Adversary → | Rival org / competitor | Automated scraping | Stolen/lost device | Malicious insider | Subpoena / data request |
|---|---|---|---|---|---|
| **Org territory intel** (`score_cell`, `area` EV, `street_edge` weights) | RLS blocks cross-org reads; no public endpoint | Rate limits + auth-required + precision-reduced sharing | Day Pack encrypted-at-rest posture (§5); remote wipe on offboard | Least-privilege roles; audit log on bulk reads | Org-scoped legal process; data minimization limits scope |
| **Rep GPS breadcrumbs** | Never cross-org; not in org aggregates at full precision | No unauth access; RLS rep-owned | Local store non-durable, wipe-on-offboard; V2 secure storage | Insider can't read another rep's raw GPS (RLS `rep_id`) | Consent record + retention limits reduce what exists to produce |
| **Household `visit` outcomes** | RLS + anonymized org aggregates only | Auth + rate limit | Append-only, minimal PII on device | Audit log; no raw export without admin+reason | do-not-knock honored; retention schedule |
| **PII** (rep email, name) | Tenant-isolated | Auth-gated | Minimal on device | RBAC; PostHog carries no PII | DSR export/delete (§4) |
| **Auth credentials / tokens** | — | — | Short-lived JWT; no long-lived secret on device | Secrets in vault, not code | N/A |
| **do-not-knock list** | Org-scoped, but treated as compliance-critical | Auth-gated | Shipped in Day Pack (needed offline); wipe on offboard | Change-audited | Legally protective; retained as compliance record |

**Trust boundaries.** (1) Browser/device — untrusted; holds only short-lived tokens and a
minimized offline store. (2) Supabase — trusted, RLS-enforced, EU. (3) Planner + routing engines —
trusted, private Fly network, act *as the caller* under RLS (doc 09 §6), no god-mode. (4) Claude
API — semi-trusted external; receives only minimized, typed data and can never mutate state (doc 10
§9).

## 2. AuthN / AuthZ

**Authentication.** Supabase Auth. MVP: **email + OTP** (magic link / 6-digit code), no passwords
to phish or leak. **Org SSO (SAML/OIDC) in V3** for enterprise (`00` §10). Sessions are short-lived
JWTs with refresh rotation; refresh tokens are revocable per device (feeds remote offboarding, §5).

**JWT claims.** The signed token carries exactly the tenancy facts every layer needs:

```ts
interface TwoDayJwtClaims {
  sub: string;            // rep id (auth.users.id)
  org_id: string;         // custom claim, stamped at signup/invite, immutable per session
  team_id: string | null;
  role: "rep" | "lead" | "admin";
  exp: number; iat: number;
}
```

`role` semantics: **rep** sees own `visit`/`plan` + org-shared *anonymized* aggregates; **lead**
adds team-scoped visibility (team reps' sessions, team heatmaps) still under org_id; **admin** adds
member management, campaign config, DSR execution, offboarding. Role is a claim, checked by RLS, not
by client code.

**RLS policy patterns** (bodies in doc 08; the shapes we rely on):

```sql
-- every tenant table carries org_id; the baseline policy:
create policy org_isolation on visit
  using (org_id = (auth.jwt() ->> 'org_id')::uuid);

-- reps own their own visit stream (write + read); leads read team, admins read org:
create policy rep_owns_visits on visit for all
  using ( org_id = (auth.jwt() ->> 'org_id')::uuid
          and ( rep_id = auth.uid()
                or (auth.jwt() ->> 'role') in ('lead','admin') ) );

-- org-shared aggregates are exposed only through a view that H3-truncates + k-anonymizes (§3),
-- never by granting SELECT on raw visit to other reps.
```

Two invariants: **no table without `org_id` + an isolation policy**, and **the planner runs under
the caller's claims** (`SET LOCAL request.jwt.claims`, doc 09 §6) so it inherits, never bypasses,
RLS. There is no service path that reads raw tenant `visit`/GPS in bulk without an audited admin
role.

## 3. GDPR / AVG deep-dive

### 3.1 Lawful basis per data category

| Data category | Lawful basis (AVG art. 6) | Notes |
|---|---|---|
| Rep account (email, name) | **Contract** (6.1.b) | Needed to provide the service |
| Rep **GPS breadcrumbs** | **Consent** (6.1.a), granular + revocable | Explicit opt-in; tracking off by default (§3.2) |
| `visit` outcomes (household-level) | **Legitimate interest** (6.1.f) — sales record | Balancing test documented; no special-category data collected |
| Org territory analytics | **Legitimate interest** (6.1.f) | Org is controller for its reps' work data |
| do-not-knock entries | **Legal obligation / legitimate interest** | Compliance feature (§3.4) |
| Billing | **Contract** + **legal obligation** (tax retention) | Processor: EU payment provider |
| Product telemetry (PostHog) | **Consent** / legitimate interest, no PII | Self-hosted EU; sync *health* not *content* (doc 15) |

**Controllership:** for a B2B org, the org is the **controller** of its reps' work data and 2DAY is
the **processor** (DPA in place); for B2C-prosumer reps, 2DAY is controller. This split drives who
executes DSRs (§4).

### 3.2 GPS consent flow

GPS is **off by default**. First plan prompts a **layered consent**: what we collect (coarse vs
precise), why (live re-optimization, breadcrumb history for personal EV), retention (§3.5), and how
to revoke. The rep picks a **precision level** they can change any time:

- **Off** — no breadcrumbs; planning uses manually-entered start/end only.
- **Coarse** — H3 res-8 (~0.7 km) breadcrumbs; enough for pace/rain nudges, weak for micro-routing.
- **Precise** — full-resolution breadcrumbs on device, used for on-device L3 and personal history.

Consent is versioned and recorded (`consent_record`: rep_id, purpose, level, version, granted_at,
revoked_at). Revoking precise → coarse stops new precise capture immediately and schedules
truncation of retained points (§3.5). The Capacitor V2 background-GPS capability re-prompts with its
own OS-level permission and the same in-app layer.

### 3.3 Precision reduction for org-shared data (H3 truncation)

A rep's **precise** location never leaves their control at full precision. Anything shared to the
org — heatmaps, org-wide EV, do-not-knock density — is **truncated on-device before upload** to a
coarser H3 resolution and **k-anonymized** at the aggregation view:

```ts
// on-device, before any org-shared write:
function toOrgShared(cell: H3Index): H3Index { return h3ToParent(cell, 8); } // res9/10 → res8
// server view enforces k-anonymity: suppress any shared cell backed by < k distinct reps.
const K_ANON = 5;
```

So the org sees "Maaspoort-Zuid is hot" at ~res-8 granularity, aggregated across ≥5 reps — never
"rep X stood at door Y at 14:32." Personal precise history stays rep-owned under RLS (`rep_id =
auth.uid()`). This is the concrete mechanism behind `00` §11's "on-device precision reduction for
org sharing."

### 3.4 do-not-knock as a compliance feature

do-not-knock is a first-class outcome (`visit.outcome = do_not_knock`) and an org list, treated as a
**compliance control**, not a UX nicety: it encodes AVG objections, the *Recht van verzet* / opt-out
under Dutch canvassing norms, and local municipal ordinances (some gemeenten restrict door-to-door
hours/areas). Entries ship in the Day Pack so they're honored **offline** (the field brain rule #11,
doc 10, silently skips them), are **change-audited**, and are **retained as a compliance record**
even when other data is minimized — deleting a household's other data must not resurrect knocking on
them. A do-not-knock entry is the one place we *keep* an address association deliberately, justified
by the legal obligation to honor the objection.

### 3.5 Retention schedule per entity

| Entity | Retention | Trigger | Rationale |
|---|---|---|---|
| `breadcrumb` (precise GPS) | **90 days**, then truncate to res-8 or delete | rolling | Beyond the EV recency half-life; minimize precise location |
| `breadcrumb` (coarse) | 180 days | rolling | Pace/history value, low sensitivity |
| `visit` events | Duration of org contract + 12 mo | contract end | Sales record; org is controller |
| `sale` | 7 years | creation | Dutch tax/accounting obligation |
| `plan` / `plan_leg` | 90 days | creation | Ephemeral operational data |
| `do_not_knock` | Indefinite (until objection withdrawn) | withdrawal | Legal obligation to honor |
| Billing records | 7 years | invoice | Tax law |
| PostHog telemetry | 180 days, no PII | rolling | Product health |
| Auth logs / audit log | 400 days | rolling | Security investigation window |

Retention runs as a nightly job (same batch window as EV learning, doc 10 §6) that truncates or
tombstones per this table.

### 3.6 DSR (export / delete) over an append-only event store — crypto-shredding

The hard problem: writes are **append-only immutable events** (doc 15), yet a rep has a **right to
erasure**. You cannot `DELETE` from an audit-grade append log without breaking its integrity, and
scrubbing individual rows across replicas/backups is slow and error-prone. **Decision:
per-rep crypto-shredding.**

Mechanism:
1. Each rep has a **per-rep data encryption key (DEK)**. Personal-scope event payloads (breadcrumbs,
   the sensitive fields of `visit`) are stored **encrypted at rest under that rep's DEK**; the DEK is
   wrapped by a KMS master key and stored in a `rep_key` row.
2. **Export DSR:** decrypt the rep's events with their DEK, render to a portable JSON/CSV bundle
   (schema-documented), deliver over a short-TTL signed URL. Scoped by RLS to that rep.
3. **Delete DSR:** **destroy the rep's DEK** (KMS `ScheduleKeyDeletion` + delete the wrapped
   `rep_key`). The ciphertext remains in the append log and backups but is now **cryptographically
   unrecoverable** — a tombstone marks the events shredded. This satisfies erasure *and* preserves
   the log's structural integrity and the immutability guarantee the whole sync design depends on.

Justification for crypto-shredding over row-deletion: it makes erasure **O(1)** (destroy one key)
instead of O(events × replicas × backups); it covers **backups automatically** (encrypted snapshots
become undecryptable without the key) which row-deletion cannot; and it keeps the append-only
invariant intact so §3.1's sales-record and audit obligations aren't broken by a deletion. The
carve-outs that survive a delete are the **legally-required minimum**: aggregated, already
k-anonymized org stats that contain no recoverable individual data, `sale` rows required for tax
(pseudonymized), and the `do_not_knock` association (legal obligation, §3.4) — each documented in the
DSR response so the request is answered honestly.

### 3.7 EU data residency per vendor

| Vendor | Role | Residency |
|---|---|---|
| Supabase | DB/Auth/Realtime/Storage | EU region (eu-central) — all tenant data |
| Fly.io | Planner, Valhalla, VROOM, OTP2 | EU machines (ams/cdg); no tenant data at rest (stateless) |
| Vercel | Web app | EU edge; static/SSR, no tenant data persisted |
| PostHog | Telemetry | **Self-hosted EU** (`00` §3) — no US transfer |
| Anthropic (Claude API) | Intent parse / explain / coach | External; minimized, typed data only, no PII, zero-retention posture where offered; covered by DPA. Only non-EU-resident processor, and it receives the least data — no GPS, no household PII, no raw events (doc 10 §5, §9) |
| Payment provider | Billing | EU |

The only cross-border processing is Claude API calls, and they are the most minimized data flow in
the system by design. Everything with GPS, household, or tenant data stays in the EU.

## 4. Device security

**Offline store encryption — honest posture.** IndexedDB/Cache Storage are **not encrypted at rest
by the browser** beyond the OS's full-disk encryption. We therefore **do not promise** app-level
encryption of the Dexie store in the **PWA MVP**; we instead **minimize** what lands there: no
passwords (OTP auth), short-lived tokens only, `visit` payloads carry the minimum household
association needed for the day, and precise GPS stays only as long as the plan needs it. We are
explicit about this in the privacy notice rather than overclaiming. **Capacitor V2** adds native
**secure storage** (iOS Keychain / Android Keystore) for tokens and the DEK, and app-level
encryption of the sensitive slices of the offline store — the decided answer (`00` §3) to the
IndexedDB limitation.

**Remote wipe of Day Packs on offboarding.** When a rep is offboarded (or a device is reported
lost), an admin triggers offboarding: (1) **revoke** the rep's refresh tokens (kills future auth);
(2) invalidate outstanding Day Pack **signed URLs** and delete the Storage artifacts; (3) push a
**wipe directive** — on next app open (or via Capacitor V2 push/background), the client clears Dexie
+ Cache Storage (Day Pack, tokens, outbox) and hard-logs-out. Because tokens are short-lived, a
stolen device loses server access within the token TTL regardless; the wipe removes the local
snapshot (addresses, do-not-knock, scores). For full offboarding we optionally **crypto-shred** the
rep's DEK (§3.6), making any residual on-device ciphertext undecryptable too.

## 5. Secrets, supply chain, dependencies, audit logging

**Secrets.** All secrets (Anthropic key, Supabase service key, KMS master, routing-engine service
token) live in **Fly secrets / a managed vault**, never in the client bundle or the repo. The
browser never holds a service key — Day Packs come via short-TTL signed URLs (doc 09 §6),
never a raw Storage key. Secrets rotate on a schedule and on any suspected exposure; JWT signing keys
rotate with JWKS (planner caches + refreshes, doc 09 §6).

**Supply chain & dependency policy.** Lockfiles committed; **pinned** versions; CI runs
`npm audit` / SCA on every PR and blocks on known-high CVEs. Dependency updates land via reviewed PRs
(Renovate), never auto-merged for anything in the auth/crypto/sync path. Build provenance
(SLSA-style) on the planner and web artifacts; container images scanned before deploy to Fly. The
routing engines (Valhalla/VROOM/OTP2) are self-hosted from pinned, verified images — no third-party
routing SaaS in the data path.

**Audit logging.** A dedicated, append-only `audit_log` (separate from the field event log) records
security-relevant actions: sign-in / token refresh / revoke, role changes, DSR export & delete
(with the operator and justification), do-not-knock edits, bulk reads of org intel, offboarding /
remote wipe, and admin campaign changes. Entries carry `actor_id, org_id, action, target, at,
request_id` and are retained 400 days (§3.5). Bulk-read and export actions additionally alert, since
those are the insider-exfiltration and scraping signals in the threat model (§1). The audit log is
itself RLS-scoped (admins see their org) and immutable — the one log we never crypto-shred, because
it is the record of who touched what.
