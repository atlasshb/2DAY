# 2DAY — Conversation Intelligence

> Elaborates `00-design-decisions.md` §9 ("compiler, not oracle"), §10 (staging), and §11 (GDPR),
> and extends the AI roster in doc 10 with a sixth surface: a **doorstep conversation coach**. The
> canonical contracts live in `packages/core/src/conversation.ts`; this document explains the product,
> the privacy architecture those contracts encode, the two-engine design, and the staging. Like every
> `/docs` file it defers to doc 00 on any conflict, and every number here is an **estimate**, labeled.

## 1. Product framing

A rep finishes a conversation at a door in Maaspoort (Den Bosch), taps once to stop recording, and by
the time they reach the next door they see: the **classified outcome** (sale / not interested /
follow-up / conversation), a one-line **summary**, what **went well**, and up to a handful of concrete
**coaching tips** grounded in what was actually said — plus, for a follow-up, the **next step**
("Terugkomen na 19:00 — mijn vrouw beslist"). No dashboard, no homework: the review is instant and
lives next to the 1-tap outcome logging (doc 00 §2, the Log tab).

This is the same philosophy as the rest of 2DAY's AI (doc 00 §9): the LLM is never the source of truth.
An **offline, deterministic analyzer** produces the outcome, the objections, the talk ratio, and the
tips from lexicon + timing rules; the **Claude coach** is an optional online layer that adds nuance
when the network is there. The outcome the rep logs to the append-only `visit` stream (doc 14) is still
their 1-tap choice — conversation intelligence *suggests* and *coaches*, it does not silently write a
sale.

Why it matters to the primary metric (productive conversations per working hour, doc 00 §1): reps
improve fastest with specific, same-day feedback. "You did 84% of the talking on that door — ask an
open question earlier" beats a weekly aggregate they read on the train and forget.

## 2. Privacy architecture (decided)

The whole feature is built around one non-negotiable decision, encoded structurally in the
`ConversationMeta` contract: **raw audio never leaves the device, and is deleted the moment a transcript
exists.** `audioRetained` is typed `false` — a literal, not a boolean — so a payload that claims to
retain audio **cannot be constructed or validated** on the wire. This is the doc 17 §"data
minimization" posture made unforgeable by the type system.

### 2.1 The on-device pipeline

| Stage | Where | What persists |
|---|---|---|
| Capture | Device mic, only after consent (§3) | Audio buffer in memory |
| Transcription | **On-device, Whisper-class STT** (production); browser SpeechRecognition or typed fixtures (MVP) | `TranscriptSegment[]` |
| Audio disposal | On-device, immediately after transcription | **nothing** — buffer discarded |
| Analysis | On-device deterministic analyzer, or planner `/v1/conversations/analyze` | `ConversationAnalysis` |
| Sync | Outbox → Supabase, under org policy (§2.3) | transcript + analysis, never audio |

Only the transcript and the derived analysis ever sync. The transcript carries **no GPS** — the
`ConversationMeta.point` is optional and is **stripped before any Claude call** (doc 17 §Anthropic row;
the `createClaudeAnalyzer` adapter drops `point` structurally). Audio is the highest-sensitivity asset
in the system and we simply do not keep it.

### 2.2 Consent states

`ConsentState` is a two-value enum, deliberately small:

- **`resident_informed`** — the rep told the resident the conversation is being transcribed for coaching,
  and the resident did not object. This is the normal doorstep mode.
- **`notes_only`** — nothing the resident said is captured. The rep records a short **voice memo to
  themselves after the door closes** ("price objection, come back Thursday"); only the rep's own voice is
  transcribed. This is the fallback when informing the resident isn't practical or the resident declines.

There is no "record the resident silently" state, by construction. A conversation with
`consent: notes_only` that somehow contained resident-attributed segments would be a bug the reviewer
should catch, not a supported mode.

### 2.3 Org policy gates

Recording is **off unless the rep's org enables it**, and the org sets the floor:

- whether conversation capture is available to reps at all (default: off for a new org);
- the minimum consent state (an org may forbid `resident_informed` capture entirely and allow only
  `notes_only`, e.g. for charity campaigns with stricter norms);
- retention window for transcripts (§2.4), within the doc 17 schedule ceiling.

Gates are org config, checked server-side at the `/v1/conversations/analyze` boundary and at sync, the
same way the planner runs under the caller's JWT claims (doc 09 §6). A rep cannot opt themselves into a
mode their org disabled.

### 2.4 Retention + DSR alignment with doc 17

Transcripts and analyses are **rep-owned personal-scope data**, so they inherit doc 17's machinery
exactly:

| Entity | Retention | Mechanism |
|---|---|---|
| audio | **0 (never persisted)** | discarded on-device post-transcription |
| `transcript` | org-configured, **≤ 90 days** default | rolling nightly job (doc 17 §3.5 window) |
| `conversation_analysis` | tracks its transcript | deleted with the transcript |

Because transcript payloads are personal-scope, they are **encrypted at rest under the rep's DEK** and a
**delete DSR crypto-shreds** them for free (doc 17 §3.6): destroy the rep's key and every transcript
ciphertext — in the append log and in backups — becomes unrecoverable in O(1), no row-by-row scrubbing.
An **export DSR** decrypts and renders the transcripts + analyses into the portable bundle alongside the
rep's other data. Conversation intelligence adds **no new erasure problem**; it rides the decided one.

## 3. Netherlands legal context

Two distinct legal questions, two distinct answers — and the design is shaped by keeping them apart.

**Can the rep record?** Under Dutch law a participant to a conversation may record it; one-party
consent covers the rep recording a conversation they are part of (the *gespreksdeelnemer* exception).
That is necessary but **not sufficient**, because:

**May 2DAY process the resident's voice as a controller/processor?** The resident's spoken words are
**personal data**, and voice is potentially biometric. Processing it engages the AVG/GDPR in full. Our
answer is to **minimize the processing to the point where the sensitive artifact never exists at rest**:

- the **audio** (the biometric-rich artifact) is transcribed on-device and **immediately deleted** — it
  is never a processed, stored asset, so the highest-risk category is designed out;
- only the **transcript** — text, the minimum needed for coaching — is processed, under the org's role
  (controller for its reps' work data; 2DAY processor, doc 17 §3.1, DPA in place), on a **legitimate
  interest** basis (rep training and sales-record quality) with a documented balancing test;
- **transparency** to the resident is the consent gate (§2.2): `resident_informed` means they were told;
- **no special-category inference** — we do not run sentiment/biometric profiling on the voice; the
  analyzer reads words, not vocal characteristics.

This is why the architecture is transcript-only-plus-immediate-deletion rather than "store the audio,
we're allowed to record": being *allowed to record* does not make *storing resident voice data*
proportionate. Deleting the audio is the proportionality argument, in code.

## 4. Multi-language strategy

Dutch doorsteps code-switch. A single conversation in a Rotterdam or Eindhoven neighborhood may run
NL → EN → back, and the resident may speak Turkish, Arabic, or Polish (doc 00 §4's demographics). The
contracts assume this: `TranscriptSegment.lang` is **per-segment** BCP-47, and `ConversationMeta.language`
is the dominant one. The deterministic analyzer ships with **five language packs**: NL, EN, DE, TR, PL.

- **Detection.** Production STT emits a language tag per segment. The analyzer prefers **per-segment lang tags** from
  the STT. For untagged text, a tiny **stopword-vote fallback** (`detectLang`) counts NL vs EN stopwords and picks the
  higher; tie → the meta's language. It is intentionally small — a floor for untagged input, not a language ID system.
- **Dominant language.** Computed by **summed segment duration** per language, not segment count, so a
  long English explanation outweighs a short Dutch greeting.
- **Summary templates & composition.** The summary is **composed from per-language templates** over the same structured facts
  (outcome, objection count, talk ratio, questions), never free-translated. Templates exist for **NL, EN, DE**. For TR and PL,
  the analyzer composes an EN summary and populates `translatedSummary` when the rep's UI language is in {NL, EN, DE},
  rendering a template-derived translation. `translatedSummary` is also populated when the rep's UI language differs from the
  detected dominant language in any other case (e.g., a Turkish-UI rep reviewing an NL-dominant conversation gets a TR rendering).
  Coaching tips and "what went well" strings are emitted in the dominant language from templates.

| Language | Signals | Objections | Counter-signals | Stopwords | Summary template |
|---|---|---|---|---|---|
| NL | ✓ | ✓ | ✓ | ✓ | NL |
| EN | ✓ | ✓ | ✓ | ✓ | EN |
| DE | ✓ | ✓ | ✓ | — | DE |
| TR | ✓ | ✓ | ✓ | — | EN → TR |
| PL | ✓ | ✓ | ✓ | — | EN → PL |

## 5. Two engines behind one seam

`ConversationAnalyzer` is a single interface (`analyze(meta, transcript, context) → ConversationAnalysis`)
with two implementations — the same offline-first pattern as the field brain (doc 10 §4) and the planner's
mock adapters.

### 5.1 The deterministic engine (offline floor)

`deterministicAnalyzer` is **pure**: no `Date.now`, no `Math.random`, no I/O. Identical inputs produce a
byte-identical analysis, including the `id` and `analyzedAt` (see §5.3). It is what the app UI is built
against, and it is the whole feature offline (doc 00 §2.4: offline is a mode, not a failure). Its
heuristics, all auditable:

| Signal | How |
|---|---|
| **outcome** | Lexicon vote over **resident** segments: sale cues ("ja, doe maar", "waar teken ik", IBAN/`sign me up`), not-interested cues ("geen interesse", door-close phrases), follow-up cues ("kom later terug", "na zeven uur", "my wife"). Sale is weighted above the rest as the strongest terminal commitment; no cue → `conversation`. |
| **confidence** | From winning signal strength and its margin over the runner-up (0.5–0.97); a bare `conversation` sits at 0.4. |
| **objections** | Per-`ObjectionKind` lexicon (price / trust / no_time / already_has_provider / not_decision_maker / language_barrier / bad_experience), first resident mention wins with the **verbatim quote**. `handled = true` iff a **later rep segment** carries a counter-signal (reassurance/answer lexicon). |
| **talkRatio** | Summed rep segment duration / total segment duration. |
| **questionsAsked** | Rep segments containing `?`, plus rep segments opening with an NL/EN interrogative ("hoe", "wat", "would you", …). |
| **nextStep** | For follow-ups, a time phrase ("na 7", "after seven", "vanavond") and/or person phrase ("mijn vrouw", "my wife") extracted and templated. |

Coaching tips are **grounded in evidence**, never generic: talk ratio > 0.7 → a discovery tip; zero
questions → discovery; an **unhandled** objection → an `objection_handling` tip carrying the
`evidenceSegment` index; a sale that never recapped price/terms → a `compliance` tip; a rep opening
monologue > 25 s → an `opening` tip. `whatWentWell` mirrors the positives: handled objections, a healthy
0.4–0.6 talk ratio, resident questions that got answered.

### 5.2 The Claude engine (online nuance)

`createClaudeAnalyzer(transport)` implements the same interface over an **injected transport** — the real
Anthropic tool-use call lives in the service layer (doc 09), never in `@2day/core`, and there is **no real
API call anywhere in the package**. The adapter is the trust boundary (doc 10 §9):

1. builds **one tool-use request** — a fixed system prompt plus a JSON tool schema mirroring
   `ConversationAnalysis` minus the fields the model must not mint (`id`, `analyzedAt`, `engine`,
   `conversationId`), with `additionalProperties:false` and enums throughout;
2. sends the **least data** — transcript + meta **minus GPS**, never audio (which does not exist on the
   contract);
3. treats the transcript as **data, not instructions** (prompt-injection posture, doc 10 §9.4) and
   **validates the reply with a zod schema**. A reply that fails validation is **discarded (thrown)**,
   never coerced into the app — the deterministic engine is the floor it falls back to;
4. stamps `id` / `analyzedAt` / `engine:"claude"` deterministically, exactly like the offline engine.

When Claude is unreachable, or the org's daily Claude spend cap trips (doc 10 §7), the endpoint simply
serves the deterministic analysis — the same graceful degradation as the plan explainer (doc 10 §8).
Nothing about conversation intelligence is field-critical enough to block on the network.

### 5.3 Determinism of `id` and `analyzedAt`

`analyzedAt` comes from an **injectable clock** (`createDeterministicAnalyzer({ clock })`). The default
`deterministicAnalyzer` injects **no clock**, so `analyzedAt` is the conversation's own end instant
(`meta.startedAt + meta.durationMs`) rendered in the meta's UTC offset. The analysis `id` is a **valid
ULID** derived from that instant (48-bit ms → 10 Crockford chars) plus an 80-bit splitmix64 hash of the
`conversationId` — no entropy source, so identical inputs yield an identical, contract-shaped id. This is
what lets the tests deep-equal a repeated analysis and lets the endpoint be reproducible under a fixed
clock, matching the planner's determinism rule.

## 6. API surface

### 6.1 On-device (primary path)

The app calls `deterministicAnalyzer.analyze(...)` **locally** on the transcript it just produced. This is
the default, works offline, sends nothing off-device, and renders the review card immediately. Most
analyses never touch the server.

### 6.2 `POST /v1/conversations/analyze` (planner)

For clients that prefer server-side analysis (or to re-analyze a synced transcript), the planner exposes a
new route (`services/planner/src/conversations.ts`):

| | |
|---|---|
| Request | `analyzeConversationRequest` from `@2day/core` — `{ meta, transcript, context }` |
| 200 | `ConversationAnalysis` (deterministic engine, `engine:"deterministic"`) |
| 400 | `{error:{code:"CONVERSATION_REQUEST_INVALID", message, details}}` — the same envelope as every other planner route |

The route validates with the canonical zod schema, runs the deterministic analyzer, and returns. The
analyzer is injectable (so the Claude engine can be wired once a network transport and the org spend cap
are in place, doc 09 §6), but the default and the MVP wiring is the deterministic engine. The server.ts
change is one import and one `registerConversationRoutes(app)` call — the route logic lives in its own
module.

## 7. Cost

The deterministic engine costs **zero** Claude tokens — like the field brain and EV learning (doc 10 §7),
it is on-device rules, by construction. The Claude engine, when enabled, is one **daily-coach-class Sonnet
call per analyzed conversation the org opts to send** — and orgs will send a **sample**, not every door,
so it is not a per-door cost.

**Estimate** (doc 18 §2.6 style, same list pricing and €1≈$1.08 assumption, **not** a bill): the tool-use
request is a cacheable system + schema preamble of ~700 tokens, a variable transcript of ~700–1,400 tokens
for a real doorstep conversation, and ~300 output tokens. At Sonnet-tier list pricing that is on the order
of **€0.004–0.008 per analyzed conversation** — meaningful only if an org routes a large fraction of doors
through Claude, which the sampling default avoids. Doc 18's Claude table (§2.6) should gain a
**"Conversation coach (Sonnet)"** row in a future revision once a sampling rate is chosen; until then this
estimate is the placeholder, and the doc 10 §7 per-org daily spend cap is the hard stop that degrades to
the deterministic floor.

## 8. Staging

Consistent with doc 00 §10 and the roadmap (doc 20):

- **MVP-lite (now).** The contracts, the **deterministic offline analyzer** (the app UI's target), the
  Claude adapter behind an injected transport (no live wiring), the planner endpoint, and typed fixtures.
  Transcription in MVP is the browser speech API where available, or typed/imported transcripts — the
  intelligence layer is real and testable without production STT.
- **V2.** Production **on-device Whisper-class STT** (Capacitor shell, doc 00 §3), **speaker diarization**
  to attribute segments to rep vs resident reliably, live Claude wiring with per-org sampling + the spend
  cap, and the review surface promoted into the daily coach (doc 10 §5) so a rep's day narrative can cite
  specific conversations.
- **V3.** **Team-level pattern mining** — which objections dominate a campaign, which handled-objection
  phrasings correlate with sales — computed over transcripts that are **anonymized and opt-in**, k-anonymized
  the same way org heatmaps are (doc 17 §3.3). No lead or admin ever browses an individual rep's raw
  conversations to build these patterns; the aggregate is the product, the transcript stays rep-owned.

## 9. Guardrails recap

The trust boundary is doc 10 §9, applied to conversations:

1. **AI output never mutates state.** The logged `visit` outcome is the rep's 1-tap choice; the analysis is
   display + coaching, stored as an annotation, never written as a sale.
2. **Typed, validated model output only.** The Claude reply is a schema-validated tool call; a malformed
   reply is discarded, not best-efforted.
3. **Least data, no audio, no GPS.** The Claude call sees transcript + de-GPS'd meta and nothing else; audio
   never persists to send.
4. **Deterministic floor.** Every field the Claude engine can produce, the offline engine also produces —
   so the feature works, and is auditable, with no LLM at all.

The worst case of a prompt injection hidden in a resident's transcript is a **weird sentence on a review
card** — never a mutated record, a wrong outcome logged, or audio retained.
