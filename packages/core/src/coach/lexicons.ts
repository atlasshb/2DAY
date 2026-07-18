/**
 * NL + EN doorstep lexicons and the stopword-based language fallback.
 *
 * Everything here is data, not logic. The deterministic analyzer (docs/21) reads
 * these tables; keeping them in one file makes the heuristics auditable and lets
 * an org tune vocabulary without touching the classifier. All phrases are stored
 * lowercased and diacritic-folded; `normalize()` folds incoming text the same way
 * so "geïnteresseerd" matches "geinteresseerd" and casing never matters.
 */
import type { ObjectionKind } from "../conversation.js";

/** Lowercase + strip diacritics (NFD) so lexicon matching is accent-insensitive. */
export function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

/** Substring match of any phrase (phrases are pre-normalized). */
export function containsAny(normText: string, phrases: readonly string[]): boolean {
  return phrases.some((p) => normText.includes(p));
}

/** First phrase that hits, or null (used to surface a verbatim cue). */
export function firstHit(normText: string, phrases: readonly string[]): string | null {
  for (const p of phrases) if (normText.includes(p)) return p;
  return null;
}

/** Count how many of the phrases appear at least once. */
export function countHits(normText: string, phrases: readonly string[]): number {
  let n = 0;
  for (const p of phrases) if (normText.includes(p)) n += 1;
  return n;
}

// ---------------------------------------------------------------------------
// Language detection (per-segment fallback when no BCP-47 `lang` tag is set)
// ---------------------------------------------------------------------------

const STOPWORDS_NL = new Set([
  "de", "het", "een", "ik", "je", "u", "we", "wij", "niet", "en", "maar", "geen",
  "ja", "nee", "dank", "goedemiddag", "goedemorgen", "meneer", "mevrouw", "hebben",
  "heb", "ben", "bent", "is", "dat", "wat", "voor", "met", "op", "aan", "moet",
  "kom", "later", "terug", "na", "mijn", "vrouw", "man", "partner", "tijd", "uur",
  "van", "hoe", "waarom", "wanneer", "waar", "wie", "kunt", "zou", "over",
]);

const STOPWORDS_EN = new Set([
  "the", "a", "an", "i", "you", "we", "not", "and", "but", "no", "yes", "thanks",
  "thank", "sir", "madam", "have", "has", "is", "are", "that", "what", "for",
  "with", "on", "come", "back", "my", "wife", "husband", "partner", "time",
  "of", "how", "why", "when", "where", "who", "can", "would", "about", "do",
  "does", "please", "sorry", "understand", "english",
]);

/**
 * Stopword-vote language guess. Returns a BCP-47 primary subtag ("nl" | "en"),
 * or `fallback` on a tie / no signal. Deliberately tiny — real production STT
 * emits per-segment language tags (docs/21 §multi-language); this is the MVP
 * floor for untagged text and for the fixtures' fallback-detection test.
 */
export function detectLang(text: string, fallback: string): string {
  const tokens = normalize(text).split(/[^a-z]+/).filter(Boolean);
  let nl = 0;
  let en = 0;
  for (const t of tokens) {
    if (STOPWORDS_NL.has(t)) nl += 1;
    if (STOPWORDS_EN.has(t)) en += 1;
  }
  if (nl > en) return "nl";
  if (en > nl) return "en";
  return primarySubtag(fallback);
}

/** "nl-NL" → "nl"; defensive lowercase of the primary subtag. */
export function primarySubtag(lang: string): string {
  return (lang.split("-")[0] ?? lang).toLowerCase();
}

// ---------------------------------------------------------------------------
// Outcome signals (scanned in RESIDENT segments — the resident owns the outcome)
// ---------------------------------------------------------------------------

export const SALE_SIGNALS: readonly string[] = [
  // nl
  "ja, doe maar", "ja doe maar", "doe maar", "waar moet ik tekenen", "waar teken ik",
  "ik doe mee", "prima, ik doe het", "ik doe het", "meld me aan", "iban", "rekeningnummer",
  "mijn rekeningnummer", "contract",
  // en
  "sign me up", "where do i sign", "i'm in", "im in", "count me in", "let's do it",
  "lets do it", "sounds good, let's", "yes, sign", "account number",
];

export const NOT_INTERESTED_SIGNALS: readonly string[] = [
  // nl
  "geen interesse", "geen belangstelling", "niet geinteresseerd", "ik hoef niets",
  "ik hoef niks", "we doen niet mee", "nee bedankt", "nee, bedankt", "doei", "fijne dag",
  "prettige dag", "hoeft niet",
  // en
  "not interested", "no thanks", "no thank you", "no, thank you", "we're all set",
  "were all set", "not today", "have a good day", "have a nice day", "go away",
];

export const FOLLOW_UP_SIGNALS: readonly string[] = [
  // nl
  "kom later terug", "kom straks terug", "kom terug", "een andere keer", "een ander moment",
  "vanavond", "morgen", "na zeven", "na 7", "mijn partner", "mijn vrouw", "mijn man",
  "moet ik overleggen", "terugkomen",
  // en
  "come back", "come by later", "another time", "some other time", "later today",
  "tonight", "tomorrow", "after 7", "after seven", "my wife", "my husband", "my partner",
  "she decides", "he decides", "talk to my",
];

// ---------------------------------------------------------------------------
// Objection lexicons per ObjectionKind + the rep counter-signal (reassurance)
// ---------------------------------------------------------------------------

export const OBJECTION_LEXICON: Record<Exclude<ObjectionKind, "other">, readonly string[]> = {
  price: [
    "te duur", "best duur", "duur", "kost te veel", "geen geld", "de prijs", "prijs is",
    "goedkoper", "too expensive", "expensive", "cost too much", "the price", "can't afford",
    "cant afford", "afford",
  ],
  trust: [
    "vertrouw", "oplichting", "nep", "niet betrouwbaar", "wie bent u", "wie ben jij",
    "scam", "trust you", "who are you", "not legit", "is this real",
  ],
  no_time: [
    "geen tijd", "ik heb het druk", "beetje druk", "sta op het punt", "haast",
    "no time", "i'm busy", "im busy", "a bit busy", "in a hurry", "no time right now",
  ],
  already_has_provider: [
    "heb al", "al een contract", "zit al bij", "al klant", "andere leverancier",
    "already have", "already with", "another provider", "current provider", "we're with",
  ],
  not_decision_maker: [
    "mijn partner", "mijn vrouw", "mijn man", "moet overleggen", "niet mijn beslissing",
    "beslis ik niet", "my wife", "my husband", "my partner", "not my decision",
    "have to ask", "she decides", "he decides", "she handles", "he handles",
  ],
  language_barrier: [
    "versta u niet", "spreek geen", "spreek niet zo goed", "begrijp niet", "snap het niet",
    "don't understand", "dont understand", "no english", "don't speak", "dont speak",
    "speak english", "speak slower", "not so good",
  ],
  bad_experience: [
    "slechte ervaring", "vorige keer", "nooit meer", "eerder problemen",
    "bad experience", "last time", "never again", "had problems",
  ],
};

/** Rep reassurance / answer phrases — presence AFTER an objection ⇒ handled. */
export const COUNTER_SIGNALS: readonly string[] = [
  // nl
  "geen zorgen", "ik begrijp", "begrijpelijk", "ik snap het", "juist daarom", "kost u niets",
  "bespaart", "goedkoper", "betrouwbaar", "geen verplichting", "ik leg het uit",
  "altijd opzeggen", "maandelijks opzeggen", "geen probleem", "ik stuur u",
  // en
  "no worries", "i understand", "that's exactly why", "thats exactly why", "it's free",
  "its free", "you'll save", "youll save", "cheaper", "no obligation", "let me explain",
  "i can explain", "cancel anytime", "no problem",
];

// ---------------------------------------------------------------------------
// Rep-side signals: interrogatives (questions) and price/terms recap (compliance)
// ---------------------------------------------------------------------------

/** Interrogative sentence openers — a rep segment starting with one counts as a question. */
export const INTERROGATIVE_OPENERS: readonly string[] = [
  // nl
  "wat", "hoe", "waarom", "wanneer", "waar", "wie", "welke", "heeft u", "heb je",
  "bent u", "kunt u", "mag ik", "zou u", "weet u", "hoeveel", "klopt het", "zal ik",
  // en
  "what", "how", "why", "when", "where", "who", "which", "do you", "did you",
  "are you", "can you", "may i", "would you", "have you", "is it", "shall i",
];

/** Price/terms recap vocabulary — a sale with NONE of these from the rep ⇒ compliance gap. */
export const PRICE_TERMS_RECAP: readonly string[] = [
  "per maand", "per month", "de prijs", "prijs is", "price is", "kost", "cost",
  "voorwaarden", "terms", "opzegtermijn", "opzeggen", "cancel", "euro", "€",
  "per jaar", "per year", "korting", "discount",
];

/** Time-phrase capture for follow-up next-step extraction (NL + EN). */
export const TIME_PHRASE_RE =
  /\b(?:na|after|around|rond|om|op)\s+(?:zeven|seven|acht|eight|[0-9]{1,2}(?:[:.][0-9]{2})?)\s*(?:uur|pm|am|o'clock)?\b|\b(?:vanavond|tonight|morgen|tomorrow|straks|later vandaag|later today)\b/i;

/** Person / decision-maker capture for follow-up next-step extraction. */
export const PERSON_PHRASE_RE = /\b(?:mijn|my)\s+(?:vrouw|man|partner|wife|husband)\b/i;
