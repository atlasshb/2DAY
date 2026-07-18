/**
 * Deterministic, offline conversation analyzer (docs/21-conversation-intelligence.md).
 *
 * "Compiler, not oracle" (docs/00 §9, docs/10): this is the offline floor — a pure
 * lexicon + duration rules engine, exactly like the field brain. No LLM, no I/O, no
 * `Date.now`, no `Math.random`. The Claude engine (claude.ts) adds nuance when online;
 * this always runs, on-device, and is what the app UI is built against.
 *
 * `analyzedAt` comes from an injectable clock (`createDeterministicAnalyzer({ clock })`).
 * The default export `deterministicAnalyzer` supplies no clock, so `analyzedAt` is the
 * conversation's own end instant (`meta.startedAt + meta.durationMs`) and the analysis
 * `id` is a ULID derived deterministically from it — identical inputs, identical output.
 *
 * Summaries are composed bilingually from per-language templates (not free-translated):
 * the same structured facts render into an NL and an EN sentence. `translatedSummary`
 * is the rep-UI-language rendering when it differs from the detected language — an
 * honest, offline "template translation", documented as such in docs/21.
 */
import type {
  CoachingTip,
  ConversationAnalysis,
  ConversationAnalyzer,
  ConversationMeta,
  Objection,
  ObjectionKind,
  TranscriptSegment,
} from "../conversation.js";
import { clamp, deterministicAnalysisId, resolveAnalyzedAt } from "./util.js";
import {
  COUNTER_SIGNALS,
  FOLLOW_UP_SIGNALS,
  INTERROGATIVE_OPENERS,
  NOT_INTERESTED_SIGNALS,
  OBJECTION_LEXICON,
  PERSON_PHRASE_RE,
  PRICE_TERMS_RECAP,
  SALE_SIGNALS,
  TIME_PHRASE_RE,
  containsAny,
  countHits,
  detectLang,
  normalize,
  primarySubtag,
} from "./lexicons.js";

type Outcome = ConversationAnalysis["outcome"];

/** Rep opening longer than this (ms) reads as a monologue → opening tip. */
const OPENING_MONOLOGUE_MS = 25_000;
/** Healthy doorstep talk ratio band (docs/21; mirrors the contract comment). */
const HEALTHY_TALK_LO = 0.4;
const HEALTHY_TALK_HI = 0.6;
/** Above this the rep dominated the conversation → discovery tip. */
const TALK_RATIO_HIGH = 0.7;

export interface DeterministicAnalyzerOptions {
  /** Epoch-ms clock for `analyzedAt`. Omit for the conversation-end default. */
  clock?: () => number;
}

const OBJECTION_KINDS = Object.keys(OBJECTION_LEXICON) as (keyof typeof OBJECTION_LEXICON)[];

function durationMs(seg: TranscriptSegment): number {
  return Math.max(0, seg.endMs - seg.startMs);
}

function segLang(seg: TranscriptSegment, fallback: string): string {
  return seg.lang ? primarySubtag(seg.lang) : detectLang(seg.text, fallback);
}

/** Dominant language by summed segment duration; ties → count, then meta.language. */
function dominantLanguage(transcript: TranscriptSegment[], meta: ConversationMeta): string {
  const fallback = primarySubtag(meta.language);
  const byDur = new Map<string, number>();
  const byCount = new Map<string, number>();
  for (const seg of transcript) {
    const lang = segLang(seg, fallback);
    byDur.set(lang, (byDur.get(lang) ?? 0) + durationMs(seg));
    byCount.set(lang, (byCount.get(lang) ?? 0) + 1);
  }
  let best = fallback;
  let bestDur = -1;
  let bestCount = -1;
  for (const [lang, dur] of byDur) {
    const count = byCount.get(lang) ?? 0;
    if (dur > bestDur || (dur === bestDur && count > bestCount)) {
      best = lang;
      bestDur = dur;
      bestCount = count;
    }
  }
  return best;
}

interface OutcomeResult {
  outcome: Outcome;
  confidence: number;
}

function classifyOutcome(residentNorm: string[]): OutcomeResult {
  let sale = 0;
  let follow = 0;
  let notInterested = 0;
  for (const t of residentNorm) {
    sale += countHits(t, SALE_SIGNALS);
    follow += countHits(t, FOLLOW_UP_SIGNALS);
    notInterested += countHits(t, NOT_INTERESTED_SIGNALS);
  }
  // Sale is the strongest terminal commitment; weight it above the others.
  const weighted: Record<Exclude<Outcome, "conversation">, number> = {
    sale: sale * 1.5,
    follow_up: follow,
    not_interested: notInterested,
  };
  const raw: Record<Exclude<Outcome, "conversation">, number> = {
    sale,
    follow_up: follow,
    not_interested: notInterested,
  };

  let chosen: Exclude<Outcome, "conversation"> | null = null;
  let top = 0;
  for (const k of ["sale", "follow_up", "not_interested"] as const) {
    if (weighted[k] > top) {
      top = weighted[k];
      chosen = k;
    }
  }
  if (chosen === null || top === 0) {
    return { outcome: "conversation", confidence: 0.4 };
  }
  let second = 0;
  for (const k of ["sale", "follow_up", "not_interested"] as const) {
    if (k !== chosen && weighted[k] > second) second = weighted[k];
  }
  const margin = top - second;
  const confidence = clamp(0.55 + 0.1 * raw[chosen] + 0.08 * margin, 0.5, 0.97);
  return { outcome: chosen, confidence };
}

interface FoundObjection {
  kind: ObjectionKind;
  quote: string;
  segIndex: number;
  handled: boolean;
}

function detectObjections(
  transcript: TranscriptSegment[],
  norm: string[],
): FoundObjection[] {
  // First resident occurrence per kind wins (verbatim quote). Handled iff a LATER
  // rep segment carries a counter-signal (reassurance/answer).
  const firstByKind = new Map<ObjectionKind, { quote: string; segIndex: number }>();
  transcript.forEach((seg, i) => {
    if (seg.speaker !== "resident") return;
    for (const kind of OBJECTION_KINDS) {
      if (firstByKind.has(kind)) continue;
      if (containsAny(norm[i]!, OBJECTION_LEXICON[kind])) {
        firstByKind.set(kind, { quote: seg.text, segIndex: i });
      }
    }
  });

  const out: FoundObjection[] = [];
  for (const [kind, { quote, segIndex }] of firstByKind) {
    let handled = false;
    for (let j = segIndex + 1; j < transcript.length; j++) {
      const s = transcript[j]!;
      if (s.speaker === "rep" && containsAny(norm[j]!, COUNTER_SIGNALS)) {
        handled = true;
        break;
      }
    }
    out.push({ kind, quote, segIndex, handled });
  }
  // Stable order: by segment index of first mention.
  out.sort((a, b) => a.segIndex - b.segIndex);
  return out;
}

function isRepQuestion(norm: string): number {
  const q = (norm.match(/\?/g) ?? []).length;
  if (q > 0) return q;
  const trimmed = norm.trimStart();
  for (const opener of INTERROGATIVE_OPENERS) {
    if (trimmed === opener || trimmed.startsWith(opener + " ")) return 1;
  }
  return 0;
}

function extractNextStep(
  transcript: TranscriptSegment[],
  lang: string,
): string | undefined {
  let time: string | null = null;
  let person: string | null = null;
  for (const seg of transcript) {
    if (seg.speaker !== "resident") continue;
    if (!time) {
      const m = seg.text.match(TIME_PHRASE_RE);
      if (m) time = m[0]!.trim();
    }
    if (!person) {
      const m = seg.text.match(PERSON_PHRASE_RE);
      if (m) person = m[0]!.trim();
    }
  }
  const nl = lang === "nl";
  if (!time && !person) return nl ? "Later terugkomen" : "Come back later";
  const verb = nl ? "Terugkomen" : "Come back";
  const decides = nl ? "beslist" : "decides";
  const parts = [verb];
  if (time) parts.push(time);
  let step = parts.join(" ");
  if (person) step += ` — ${person} ${decides}`;
  return step;
}

// ---------------------------------------------------------------------------
// Localization: summary + tip/well strings composed per-language (docs/21)
// ---------------------------------------------------------------------------

const KIND_LABEL: Record<"nl" | "en", Record<ObjectionKind, string>> = {
  nl: {
    price: "prijs",
    trust: "vertrouwen",
    no_time: "tijdgebrek",
    already_has_provider: "bestaande leverancier",
    not_decision_maker: "beslisser",
    language_barrier: "taalbarriere",
    bad_experience: "eerdere ervaring",
    other: "overig",
  },
  en: {
    price: "price",
    trust: "trust",
    no_time: "time",
    already_has_provider: "existing provider",
    not_decision_maker: "decision-maker",
    language_barrier: "language",
    bad_experience: "past experience",
    other: "other",
  },
};

const OUTCOME_WORD: Record<"nl" | "en", Record<Outcome, string>> = {
  nl: { sale: "verkoop", not_interested: "geen interesse", follow_up: "vervolgafspraak", conversation: "gesprek" },
  en: { sale: "sale", not_interested: "not interested", follow_up: "follow-up", conversation: "conversation" },
};

interface SummaryFacts {
  outcome: Outcome;
  confidence: number;
  objectionCount: number;
  handledCount: number;
  talkPct: number;
  questionsAsked: number;
  nextStep?: string;
}

function tmplLang(lang: string): "nl" | "en" {
  return lang === "nl" ? "nl" : "en"; // MVP: NL + EN templates; others render EN.
}

function composeSummary(lang: string, f: SummaryFacts): string {
  const L = tmplLang(lang);
  const conf = Math.round(f.confidence * 100);
  const outcome = OUTCOME_WORD[L][f.outcome];
  if (L === "nl") {
    const obj =
      f.objectionCount === 0
        ? "Geen bezwaren."
        : `${f.objectionCount} bezwaar/bezwaren, ${f.handledCount} behandeld.`;
    const q = f.questionsAsked === 1 ? "1 vraag" : `${f.questionsAsked} vragen`;
    const next = f.nextStep ? ` Vervolgstap: ${f.nextStep}.` : "";
    return `Uitkomst: ${outcome} (${conf}% zekerheid). ${obj} U sprak ${f.talkPct}% van de tijd en stelde ${q}.${next}`;
  }
  const obj =
    f.objectionCount === 0
      ? "No objections raised."
      : `${f.objectionCount} objection${f.objectionCount === 1 ? "" : "s"} raised, ${f.handledCount} handled.`;
  const q = f.questionsAsked === 1 ? "1 question" : `${f.questionsAsked} questions`;
  const next = f.nextStep ? ` Next step: ${f.nextStep}.` : "";
  return `Outcome: ${outcome} (${conf}% confidence). ${obj} You spoke ${f.talkPct}% of the time and asked ${q}.${next}`;
}

function tipText(lang: string, key: string, arg?: string | number): string {
  const L = tmplLang(lang);
  const nl = L === "nl";
  switch (key) {
    case "talk_ratio":
      return nl
        ? `U voerde ${arg}% van het gesprek — stel meer open vragen en laat de bewoner praten.`
        : `You did ${arg}% of the talking — ask more open questions and let the resident speak.`;
    case "no_questions":
      return nl
        ? "Er zijn geen vragen gesteld — begin met een ontdekkingsvraag om de behoefte te vinden."
        : "No questions were asked — open with a discovery question to surface the need.";
    case "objection_unhandled":
      return nl
        ? `Het bezwaar "${arg}" bleef onbeantwoord — oefen een geruststellend weerwoord.`
        : `The "${arg}" objection went unanswered — practice a reassuring response.`;
    case "compliance_recap":
      return nl
        ? "Verkoop afgesloten zonder de prijs en voorwaarden te herhalen — vat ze altijd hardop samen."
        : "Sale closed without recapping price and terms — always summarize them out loud.";
    case "opening_monologue":
      return nl
        ? `De opening duurde ~${arg}s als monoloog — houd het kort en stel snel een vraag.`
        : `The opening ran ~${arg}s as a monologue — keep it short and ask a question early.`;
    default:
      return "";
  }
}

function wellText(lang: string, key: string, arg?: string | number): string {
  const L = tmplLang(lang);
  const nl = L === "nl";
  switch (key) {
    case "handled_objection":
      return nl ? `Bezwaar over ${arg} goed weerlegd.` : `Handled the ${arg} objection well.`;
    case "balanced":
      return nl
        ? `Mooi in balans — u sprak ${arg}% van de tijd en luisterde net zoveel.`
        : `Nicely balanced — you spoke ${arg}% of the time and listened as much.`;
    case "answered_questions":
      return nl
        ? "U beantwoordde de vragen van de bewoner."
        : "You answered the resident's questions.";
    default:
      return "";
  }
}

/** Factory — bind a clock (or none) to produce a `ConversationAnalyzer`. */
export function createDeterministicAnalyzer(
  opts: DeterministicAnalyzerOptions = {},
): ConversationAnalyzer {
  return {
    async analyze(meta, transcript, context): Promise<ConversationAnalysis> {
      const norm = transcript.map((s) => normalize(s.text));
      const language = dominantLanguage(transcript, meta);

      // --- talk ratio + questions -----------------------------------------
      let repMs = 0;
      let totalMs = 0;
      let questionsAsked = 0;
      transcript.forEach((seg, i) => {
        const d = durationMs(seg);
        totalMs += d;
        if (seg.speaker === "rep") {
          repMs += d;
          questionsAsked += isRepQuestion(norm[i]!);
        }
      });
      const talkRatio = totalMs > 0 ? Math.round((repMs / totalMs) * 1000) / 1000 : 0;
      const talkPct = Math.round(talkRatio * 100);

      // --- outcome + objections -------------------------------------------
      const residentNorm = transcript
        .map((s, i) => (s.speaker === "resident" ? norm[i]! : null))
        .filter((t): t is string => t !== null);
      const { outcome, confidence } = classifyOutcome(residentNorm);
      const found = detectObjections(transcript, norm);
      const objections: Objection[] = found.map((o) => ({
        kind: o.kind,
        quote: o.quote,
        handled: o.handled,
      }));
      const handledCount = found.filter((o) => o.handled).length;

      const nextStep = outcome === "follow_up" ? extractNextStep(transcript, language) : undefined;

      // --- coaching tips (grounded) ---------------------------------------
      const improvements: CoachingTip[] = [];
      const first = transcript[0];
      if (first && first.speaker === "rep" && durationMs(first) > OPENING_MONOLOGUE_MS) {
        improvements.push({
          area: "opening",
          tip: tipText(language, "opening_monologue", Math.round(durationMs(first) / 1000)),
          evidenceSegment: 0,
        });
      }
      if (talkRatio > TALK_RATIO_HIGH) {
        improvements.push({ area: "discovery", tip: tipText(language, "talk_ratio", talkPct) });
      }
      if (questionsAsked === 0) {
        improvements.push({ area: "discovery", tip: tipText(language, "no_questions") });
      }
      for (const o of found) {
        if (!o.handled) {
          improvements.push({
            area: "objection_handling",
            tip: tipText(language, "objection_unhandled", KIND_LABEL[tmplLang(language)][o.kind]),
            evidenceSegment: o.segIndex,
          });
        }
      }
      const recapPresent = transcript.some(
        (s, i) => s.speaker === "rep" && containsAny(norm[i]!, PRICE_TERMS_RECAP),
      );
      if (outcome === "sale" && !recapPresent) {
        improvements.push({ area: "compliance", tip: tipText(language, "compliance_recap") });
      }

      // --- what went well (mirrors the positives) -------------------------
      const whatWentWell: string[] = [];
      for (const o of found) {
        if (o.handled) {
          whatWentWell.push(wellText(language, "handled_objection", KIND_LABEL[tmplLang(language)][o.kind]));
        }
      }
      if (talkRatio >= HEALTHY_TALK_LO && talkRatio <= HEALTHY_TALK_HI) {
        whatWentWell.push(wellText(language, "balanced", talkPct));
      }
      const residentAskedAndAnswered = transcript.some((s, i) => {
        if (s.speaker !== "resident" || !norm[i]!.includes("?")) return false;
        for (let j = i + 1; j < transcript.length; j++) {
          if (transcript[j]!.speaker === "rep") return true;
        }
        return false;
      });
      if (residentAskedAndAnswered) {
        whatWentWell.push(wellText(language, "answered_questions"));
      }

      // --- summary (bilingual template composition) -----------------------
      const facts: SummaryFacts = {
        outcome,
        confidence,
        objectionCount: objections.length,
        handledCount,
        talkPct,
        questionsAsked,
        nextStep,
      };
      const summary = composeSummary(language, facts);
      const uiLang = primarySubtag(context.repUiLanguage);
      const translatedSummary = uiLang !== language ? composeSummary(uiLang, facts) : undefined;

      // --- id + timestamp (deterministic) ---------------------------------
      const analyzed = resolveAnalyzedAt(meta, opts.clock);
      const id = deterministicAnalysisId(meta.id, analyzed.epochMs);

      return {
        id,
        conversationId: meta.id,
        outcome,
        confidence,
        summary,
        whatWentWell,
        improvements,
        objections,
        talkRatio,
        questionsAsked,
        ...(nextStep ? { nextStep } : {}),
        language,
        ...(translatedSummary ? { translatedSummary } : {}),
        analyzedAt: analyzed.iso,
        engine: "deterministic",
      };
    },
  };
}

/**
 * Default offline analyzer used by the app UI and the planner endpoint.
 * No clock → `analyzedAt` is the conversation's end instant (fully deterministic).
 */
export const deterministicAnalyzer: ConversationAnalyzer = createDeterministicAnalyzer();
