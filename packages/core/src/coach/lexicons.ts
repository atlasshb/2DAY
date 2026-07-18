/**
 * NL + EN + DE + TR + PL doorstep lexicons and the stopword-based language fallback.
 *
 * Everything here is data, not logic. The deterministic analyzer (docs/21) reads
 * these tables; keeping them in one file makes the heuristics auditable and lets
 * an org tune vocabulary without touching the classifier. All phrases are stored
 * lowercased and diacritic-folded; `normalize()` folds incoming text the same way
 * so "geïnteresseerd" matches "geinteresseerd" and casing never matters. Note that
 * a handful of letters have NO canonical diacritic decomposition (German ß, Polish
 * ł, Turkish dotless ı) — `normalize()` leaves those characters as-is, so any
 * lexicon phrase using them must spell them exactly as the transcript text does.
 * We avoid ß and ł in the added phrases below for that reason.
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

const STOPWORDS_DE = new Set([
  "der", "die", "das", "ich", "sie", "wir", "nicht", "und", "aber", "kein", "keine",
  "ja", "nein", "danke", "guten", "tag", "herr", "frau", "haben", "habe", "ist",
  "sind", "was", "fur", "mit", "auf", "kommen", "spater", "zuruck", "nach", "meine",
  "mein", "mann", "partner", "zeit", "uhr", "von", "wie", "warum", "wann", "wo",
  "wer", "konnen", "wurde", "uber", "bitte", "verstehen", "englisch", "im", "es",
  "bin", "mir", "zu",
]);

const STOPWORDS_TR = new Set([
  "ben", "sen", "siz", "biz", "degil", "evet", "tamam", "var", "yok", "bu", "su", "o",
  "ve", "ama", "cok", "az", "biraz", "zaman", "aksam", "sabah", "yarin", "sonra",
  "gelin", "gunler", "iyi", "tesekkur", "lutfen", "nasil", "ne", "nerede", "kim",
  "mi", "mu", "musait", "sorun", "anliyorum",
]);

const STOPWORDS_PL = new Set([
  "ja", "ty", "pan", "pani", "nie", "tak", "ale", "czy", "to", "jest", "mam",
  "dziekuje", "dzien", "dobry", "prosze", "pozniej", "moj", "moja", "maz", "zona",
  "czas", "partner", "kiedy", "dlaczego", "gdzie", "kto", "ktory", "jak", "co",
]);

/**
 * Stopword-vote language guess over five candidates ("nl" | "en" | "de" | "tr" | "pl").
 * Returns `fallback`'s primary subtag on a tie / no signal. Deliberately tiny — real
 * production STT emits per-segment language tags (docs/21 §multi-language); this is
 * the MVP floor for untagged text and for the fixtures' fallback-detection tests.
 * Generalizes the original two-way (NL/EN) vote: the language with the strictly
 * highest hit count wins; any tie for the top spot falls back.
 */
export function detectLang(text: string, fallback: string): string {
  const tokens = normalize(text).split(/[^a-z]+/).filter(Boolean);
  const counts: Record<string, number> = { nl: 0, en: 0, de: 0, tr: 0, pl: 0 };
  for (const t of tokens) {
    if (STOPWORDS_NL.has(t)) counts.nl! += 1;
    if (STOPWORDS_EN.has(t)) counts.en! += 1;
    if (STOPWORDS_DE.has(t)) counts.de! += 1;
    if (STOPWORDS_TR.has(t)) counts.tr! += 1;
    if (STOPWORDS_PL.has(t)) counts.pl! += 1;
  }
  let best: string | null = null;
  let bestCount = 0;
  let tie = false;
  for (const [lang, count] of Object.entries(counts)) {
    if (count === 0) continue;
    if (count > bestCount) {
      best = lang;
      bestCount = count;
      tie = false;
    } else if (count === bestCount) {
      tie = true;
    }
  }
  return best && !tie ? best : primarySubtag(fallback);
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
  // de
  "ja, machen wir das", "wo muss ich unterschreiben", "ich mache mit",
  "geben sie mir den vertrag", "kontonummer", "meine kontonummer",
  // tr
  "nereye imzalayacagim", "hemen kaydolun", "ben varim", "tamam yapalim",
  "hesap numaram", "iban numaram",
  // pl
  "gdzie mam podpisac", "zapisuje sie", "jestem za", "zgadzam sie", "numer konta",
  "moj numer konta",
];

export const NOT_INTERESTED_SIGNALS: readonly string[] = [
  // nl
  "geen interesse", "geen belangstelling", "niet geinteresseerd", "ik hoef niets",
  "ik hoef niks", "we doen niet mee", "nee bedankt", "nee, bedankt", "doei", "fijne dag",
  "prettige dag", "hoeft niet",
  // en
  "not interested", "no thanks", "no thank you", "no, thank you", "we're all set",
  "were all set", "not today", "have a good day", "have a nice day", "go away",
  // de
  "kein interesse", "nein danke", "wir brauchen das nicht", "einen schonen tag noch",
  "keine zeit dafur",
  // tr
  "ilgilenmiyorum", "hayir tesekkurler", "ihtiyacimiz yok", "iyi gunler", "gerek yok",
  // pl
  "nie jestem zainteresowany", "nie jestem zainteresowana", "nie dziekuje",
  "milego dnia", "nie potrzebuje tego",
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
  // de
  "kommen sie spater wieder", "kommen sie morgen wieder", "heute abend",
  "mein mann entscheidet", "meine frau entscheidet", "ich muss das besprechen",
  // tr
  "aksam gelin", "yarin gelin", "baska bir zaman", "esim karar verir",
  "kocam karar verir", "sormam lazim",
  // pl
  "prosze przyjsc pozniej", "prosze wrocic pozniej", "innym razem",
  "moj maz decyduje", "moja zona decyduje", "musze to omowic",
];

// ---------------------------------------------------------------------------
// Objection lexicons per ObjectionKind + the rep counter-signal (reassurance)
// ---------------------------------------------------------------------------

export const OBJECTION_LEXICON: Record<Exclude<ObjectionKind, "other">, readonly string[]> = {
  price: [
    "te duur", "best duur", "duur", "kost te veel", "geen geld", "de prijs", "prijs is",
    "goedkoper", "too expensive", "expensive", "cost too much", "the price", "can't afford",
    "cant afford", "afford",
    // de
    "zu teuer", "zu viel geld", "das ist teuer", "kein geld dafur", "der preis ist",
    // tr
    "cok pahali", "cok fazla para", "fiyat cok yuksek", "param yok", "fiyati",
    // pl
    "za drogie", "to za duzo pieniedzy", "cena jest zbyt wysoka", "nie stac mnie",
    "jaka jest cena",
  ],
  trust: [
    "vertrouw", "oplichting", "nep", "niet betrouwbaar", "wie bent u", "wie ben jij",
    "scam", "trust you", "who are you", "not legit", "is this real",
    // de
    "vertraue ihnen nicht", "ist das serios", "wer sind sie uberhaupt",
    "das klingt nach betrug",
    // tr
    "size guvenmiyorum", "bu bir dolandiricilik mi", "siz kimsiniz", "gercek mi bu",
    // pl
    "nie ufam", "czy to nie jest oszustwo", "kim pan jest", "kim pani jest",
    "to brzmi jak oszustwo",
  ],
  no_time: [
    "geen tijd", "ik heb het druk", "beetje druk", "sta op het punt", "haast",
    "no time", "i'm busy", "im busy", "a bit busy", "in a hurry", "no time right now",
    // de
    "keine zeit", "ich habe es eilig", "gerade keine zeit", "bin gerade beschaftigt",
    // tr
    "vaktim yok", "biraz mesgulum", "acelem var", "simdi musait degilim",
    // pl
    "nie mam czasu", "jestem zajety", "jestem zajeta", "spieszy mi sie",
  ],
  already_has_provider: [
    "heb al", "al een contract", "zit al bij", "al klant", "andere leverancier",
    "already have", "already with", "another provider", "current provider", "we're with",
    // de
    "habe schon einen vertrag", "bin schon kunde", "bei einem anderen anbieter",
    "mein aktueller anbieter",
    // tr
    "zaten bir saglayicim var", "baska bir firmadayim", "mevcut saglayicim",
    "zaten musteriyim",
    // pl
    "mam juz dostawce", "korzystam z innej firmy", "mam juz umowe",
    "jestem juz klientem",
  ],
  not_decision_maker: [
    "mijn partner", "mijn vrouw", "mijn man", "moet overleggen", "niet mijn beslissing",
    "beslis ik niet", "my wife", "my husband", "my partner", "not my decision",
    "have to ask", "she decides", "he decides", "she handles", "he handles",
    // de
    "mein mann entscheidet", "meine frau entscheidet", "das entscheidet mein partner",
    "ich entscheide das nicht allein",
    // tr
    "esim karar verir", "kocam karar verir", "benim kararim degil", "sormam lazim",
    // pl
    "moj maz decyduje", "moja zona decyduje", "to nie moja decyzja", "musze zapytac",
  ],
  language_barrier: [
    "versta u niet", "spreek geen", "spreek niet zo goed", "begrijp niet", "snap het niet",
    "don't understand", "dont understand", "no english", "don't speak", "dont speak",
    "speak english", "speak slower", "not so good",
    // de
    "ich verstehe sie nicht", "ich spreche nicht gut deutsch", "sprechen sie langsamer",
    "kein deutsch",
    // tr
    "sizi anlamiyorum", "turkce bilmiyorum", "iyi turkce konusamiyorum",
    "yavas konusabilir misiniz",
    // pl
    "nie rozumiem", "nie mowie dobrze po polsku", "prosze mowic wolniej",
    "nie mowie po angielsku",
  ],
  bad_experience: [
    "slechte ervaring", "vorige keer", "nooit meer", "eerder problemen",
    "bad experience", "last time", "never again", "had problems",
    // de
    "schlechte erfahrung gemacht", "letztes mal war es schlecht", "nie wieder",
    // tr
    "kotu bir deneyim yasadim", "gecen sefer sorun oldu", "bir daha asla",
    // pl
    "mielismy zle doswiadczenie", "poprzednim razem byl problem", "nigdy wiecej",
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
  // de
  "keine sorge", "ich verstehe", "genau deshalb", "das kostet nichts", "sie sparen",
  "gunstiger", "keine verpflichtung", "ich erklare es ihnen", "jederzeit kundbar",
  "kein problem", "ich schicke ihnen",
  // tr
  "merak etmeyin", "anliyorum", "tam da bu yuzden", "ucretsiz", "tasarruf edersiniz",
  "daha ucuz", "hicbir taahhut yok", "size aciklayayim", "istediginiz zaman iptal",
  "sorun degil", "size gonderiyorum",
  // pl
  "prosze sie nie martwic", "rozumiem", "wlasnie dlatego", "to nic nie kosztuje",
  "pani zaoszczedzi", "taniej", "bez zobowiazan", "wytlumacze to",
  "moze pani zrezygnowac w kazdej chwili", "nie ma problemu", "wysle pani",
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
  // de
  "was", "wie", "warum", "wann", "wo", "wer", "welche", "haben sie", "konnen sie",
  "durfte ich", "wurden sie", "wissen sie", "ist es", "soll ich",
  // tr
  "ne", "nasil", "neden", "ne zaman", "nerede", "kim", "hangi", "var mi", "misiniz",
  "olur mu", "mi", "yapabilir miyim",
  // pl
  "co", "jak", "dlaczego", "kiedy", "gdzie", "kto", "ktory", "czy ma pan",
  "czy ma pani", "moge", "czy pan", "czy pani",
];

/** Price/terms recap vocabulary — a sale with NONE of these from the rep ⇒ compliance gap. */
export const PRICE_TERMS_RECAP: readonly string[] = [
  "per maand", "per month", "de prijs", "prijs is", "price is", "kost", "cost",
  "voorwaarden", "terms", "opzegtermijn", "opzeggen", "cancel", "euro", "€",
  "per jaar", "per year", "korting", "discount",
  // de
  "pro monat", "pro jahr", "kundigen", "keine kundigungsfrist",
  // tr
  "ayda", "yilda", "iptal", "taahhut suresi",
  // pl
  "miesiecznie", "rocznie", "zrezygnowac", "okres wypowiedzenia",
];

/**
 * Time-phrase capture for follow-up next-step extraction (NL + EN + a TR addition).
 * Matched against RAW (non-normalized) segment text, so any non-ASCII entry must be
 * spelled exactly as the transcript would render it (diacritics included).
 */
export const TIME_PHRASE_RE =
  /\b(?:na|after|around|rond|om|op)\s+(?:zeven|seven|acht|eight|[0-9]{1,2}(?:[:.][0-9]{2})?)\s*(?:uur|pm|am|o'clock)?\b|\b(?:vanavond|tonight|morgen|tomorrow|straks|later vandaag|later today|akşam)\b/i;

/** Person / decision-maker capture for follow-up next-step extraction. */
export const PERSON_PHRASE_RE = /\b(?:mijn|my)\s+(?:vrouw|man|partner|wife|husband)\b/i;
