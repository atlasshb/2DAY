/**
 * Realistic doorstep-conversation fixtures, typed against the canonical contracts
 * (conversation.ts). Shared by the coach tests and reusable by the planner endpoint
 * tests / the app's demo mode. Every meta id is a valid ULID and every meta is
 * `audioRetained: false` (docs/17 — audio never leaves the device).
 *
 * The seven cover the classifier's branches:
 *   1. NL energy sale (14 segments, a handled price objection)
 *   2. NL not-interested (opening monologue)
 *   3. EN follow-up ("come back after 7, my wife decides")
 *   4. Mixed NL/EN language barrier (code-switching)
 *   5. DE not-interested, an unhandled price objection ("zu teuer")
 *   6. TR follow-up with a concrete return time ("akşam gelin")
 *   7. PL sale, a handled trust objection (counter-signal "rozumiem")
 */
import type {
  ConversationAnalysis,
  ConversationMeta,
  Speaker,
  TranscriptSegment,
} from "../conversation.js";

export interface ConversationFixture {
  name: string;
  meta: ConversationMeta;
  transcript: TranscriptSegment[];
  context: { campaignVertical: string; repUiLanguage: string };
  /** The outcome the deterministic analyzer is expected to classify. */
  expectedOutcome: ConversationAnalysis["outcome"];
}

/** Deterministic valid ULID (26 Crockford chars) for fixture ids — test data only. */
function vulid(seed: number): string {
  const CH = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
  let v = (BigInt(seed) * 0x9e3779b97f4a7c15n) & ((1n << 130n) - 1n);
  let s = "";
  for (let i = 0; i < 26; i++) {
    s = CH[Number(v & 31n)]! + s;
    v >>= 5n;
  }
  return s;
}

const ORG = vulid(1);
const REP = vulid(2);
const CAMPAIGN = vulid(3);

type SegSpec = [speaker: Speaker, text: string, durSec: number, lang: string];

function timeline(specs: SegSpec[]): { segments: TranscriptSegment[]; durationMs: number } {
  let t = 0;
  const segments = specs.map(([speaker, text, durSec, lang]) => {
    const startMs = t;
    const endMs = t + durSec * 1000;
    t = endMs;
    return { speaker, text, startMs, endMs, lang };
  });
  return { segments, durationMs: t };
}

function meta(id: string, language: string, durationMs: number): ConversationMeta {
  return {
    id,
    orgId: ORG,
    repId: REP,
    campaignId: CAMPAIGN,
    startedAt: "2026-07-15T15:30:00+02:00",
    durationMs,
    consent: "resident_informed",
    audioRetained: false,
    language,
  };
}

// --- 1. NL energy sale, handled price objection -----------------------------
const sale = timeline([
  ["rep", "Goedemiddag! Ik ben Sanne van GreenPower. Heeft u een momentje?", 7, "nl"],
  ["resident", "Ja hoor, waar gaat het over?", 5, "nl"],
  ["rep", "We helpen mensen in deze buurt overstappen naar groene stroom. Wat betaalt u nu ongeveer per maand?", 10, "nl"],
  ["resident", "Ongeveer honderdveertig euro denk ik.", 6, "nl"],
  ["rep", "En bent u tevreden met uw huidige leverancier?", 5, "nl"],
  ["resident", "Het is eigenlijk best duur, ja.", 5, "nl"],
  ["rep", "Dat snap ik. Juist daarom kan ik u laten zien hoe u goedkoper uit bent — u bespaart al snel twintig euro per maand.", 11, "nl"],
  ["resident", "Oh, dat klinkt goed. En zit ik dan ergens aan vast?", 7, "nl"],
  ["rep", "Nee, u kunt altijd opzeggen, er is geen verplichting.", 6, "nl"],
  ["resident", "Prima. Ja, doe maar dan.", 4, "nl"],
  ["rep", "Top! Dan heb ik uw rekeningnummer nodig om het te regelen.", 6, "nl"],
  ["resident", "Mijn IBAN is NL91 ABNA 0417 1643 00.", 7, "nl"],
  ["rep", "Dank u wel, dat is genoteerd. U ontvangt vandaag nog een bevestiging.", 7, "nl"],
  ["resident", "Fijn, bedankt!", 4, "nl"],
]);

export const nlSaleFixture: ConversationFixture = {
  name: "nl-energy-sale",
  meta: meta(vulid(11), "nl", sale.durationMs),
  transcript: sale.segments,
  context: { campaignVertical: "energy", repUiLanguage: "nl" },
  expectedOutcome: "sale",
};

// --- 2. NL not-interested, opening monologue --------------------------------
const notInterested = timeline([
  ["rep", "Goedemiddag! Ik ben Tom van GreenPower en wij zijn vandaag in de buurt omdat veel mensen hier te veel betalen voor hun energie, en ik laat u graag zien hoe u flink kunt besparen op uw maandelijkse kosten met groene stroom van Nederlandse bodem.", 28, "nl"],
  ["resident", "Nee, geen interesse.", 3, "nl"],
  ["rep", "Oké. Mag ik vragen waarom niet?", 5, "nl"],
  ["resident", "Gewoon niet, geen interesse. Fijne dag.", 4, "nl"],
  ["rep", "Begrijpelijk, een prettige dag nog.", 4, "nl"],
]);

export const nlNotInterestedFixture: ConversationFixture = {
  name: "nl-not-interested",
  meta: meta(vulid(12), "nl", notInterested.durationMs),
  transcript: notInterested.segments,
  context: { campaignVertical: "energy", repUiLanguage: "nl" },
  expectedOutcome: "not_interested",
};

// --- 3. EN follow-up: "come back after 7, my wife decides" ------------------
const followUp = timeline([
  ["rep", "Hi there, I'm Alex from GreenPower. Do you have a quick minute?", 6, "en"],
  ["resident", "I'm a bit busy right now, honestly.", 4, "en"],
  ["rep", "No problem, I understand. It only takes two minutes — would that be okay?", 8, "en"],
  ["resident", "Look, my wife handles all the energy stuff. She decides these things.", 7, "en"],
  ["rep", "Ah, got it. When would be a good time to come back and speak with her?", 8, "en"],
  ["resident", "Come back after 7, she's home then.", 4, "en"],
  ["rep", "Perfect, I'll swing by after seven. Have a good evening!", 6, "en"],
]);

export const enFollowUpFixture: ConversationFixture = {
  name: "en-follow-up",
  meta: meta(vulid(13), "en", followUp.durationMs),
  transcript: followUp.segments,
  context: { campaignVertical: "energy", repUiLanguage: "nl" },
  expectedOutcome: "follow_up",
};

// --- 4. Mixed NL/EN language barrier ----------------------------------------
const languageBarrier = timeline([
  ["rep", "Goedemiddag, ik ben Marijke van GreenPower. Mag ik u iets vragen?", 6, "nl"],
  ["resident", "Sorry, I don't speak Dutch. Do you speak English?", 5, "en"],
  ["rep", "Yes, of course. I can explain in English. We help people switch to green energy and save money.", 10, "en"],
  ["resident", "Sorry, I don't understand this very well, it is confusing.", 6, "en"],
  ["rep", "Ik begrijp het, geen zorgen. Ik stuur u wat informatie, dan kunt u het rustig lezen.", 9, "nl"],
  ["resident", "Yes, please send me the information. Thank you.", 4, "en"],
]);

export const mixedLanguageBarrierFixture: ConversationFixture = {
  name: "mixed-language-barrier",
  meta: meta(vulid(14), "en", languageBarrier.durationMs),
  transcript: languageBarrier.segments,
  context: { campaignVertical: "energy", repUiLanguage: "nl" },
  expectedOutcome: "conversation",
};

// --- 5. DE not-interested, unhandled price objection ------------------------
const deNotInterested = timeline([
  ["rep", "Guten Tag! Ich bin Lukas von GreenPower. Haben Sie kurz Zeit?", 6, "de"],
  ["resident", "Worum geht es denn?", 4, "de"],
  ["rep", "Wir helfen Ihnen, günstiger auf Ökostrom umzusteigen. Was zahlen Sie derzeit im Monat?", 9, "de"],
  ["resident", "Ehrlich gesagt, das ist mir zu teuer, das ganze Angebot.", 6, "de"],
  ["rep", "Ach so, na gut. Vielen Dank für Ihre Zeit.", 5, "de"],
  ["resident", "Nein danke, kein Interesse. Einen schönen Tag noch.", 5, "de"],
  ["rep", "Alles klar, ebenfalls einen schönen Tag!", 4, "de"],
]);

export const deNotInterestedFixture: ConversationFixture = {
  name: "de-not-interested",
  meta: meta(vulid(15), "de", deNotInterested.durationMs),
  transcript: deNotInterested.segments,
  context: { campaignVertical: "energy", repUiLanguage: "nl" },
  expectedOutcome: "not_interested",
};

// --- 6. TR follow-up, concrete return time ("akşam gelin") ------------------
const trFollowUp = timeline([
  ["rep", "İyi günler! Ben GreenPower'dan Emre. Birkaç dakikanız var mı?", 7, "tr"],
  ["resident", "Şu anda biraz meşgulüm, başka zaman olur mu?", 5, "tr"],
  ["rep", "Sorun değil, anlıyorum. Size kısaca bilgi vereyim mi?", 7, "tr"],
  ["resident", "Tamam, akşam gelin, o zaman müsait olurum.", 6, "tr"],
  ["rep", "Harika, o zaman akşam saatlerinde tekrar uğrarım. İyi günler!", 7, "tr"],
]);

export const trFollowUpFixture: ConversationFixture = {
  name: "tr-follow-up",
  meta: meta(vulid(16), "tr", trFollowUp.durationMs),
  transcript: trFollowUp.segments,
  context: { campaignVertical: "energy", repUiLanguage: "nl" },
  expectedOutcome: "follow_up",
};

// --- 7. PL sale, handled trust objection (counter-signal "rozumiem") --------
const plSale = timeline([
  ["rep", "Dzień dobry! Jestem Marta z GreenPower. Czy ma Pani chwilę?", 7, "pl"],
  ["resident", "Tak, o co chodzi?", 4, "pl"],
  ["rep", "Pomagamy mieszkańcom przejść na tańszą zieloną energię. Ile płaci Pani teraz za prąd?", 9, "pl"],
  ["resident", "Skąd mam wiedzieć, czy to nie jest oszustwo?", 6, "pl"],
  ["rep", "Rozumiem Pani obawy, jesteśmy zarejestrowaną firmą i wszystko jest w umowie.", 9, "pl"],
  ["resident", "Dobrze, to brzmi rozsądnie. Ile to kosztuje miesięcznie?", 6, "pl"],
  ["rep", "Sto dwadzieścia złotych miesięcznie, bez zobowiązań, może Pani zrezygnować w każdej chwili.", 9, "pl"],
  ["resident", "Dobrze, zgadzam się. Gdzie mam podpisać?", 5, "pl"],
  ["rep", "Świetnie, potrzebuję jeszcze numer konta bankowego.", 6, "pl"],
  ["resident", "Mój numer konta to PL61 1090 1014 0000 0712 1981 2874.", 7, "pl"],
  ["rep", "Dziękuję, wszystko zapisane. Otrzyma Pani dziś potwierdzenie.", 6, "pl"],
  ["resident", "Super, dziękuję!", 4, "pl"],
]);

export const plSaleFixture: ConversationFixture = {
  name: "pl-sale",
  meta: meta(vulid(17), "pl", plSale.durationMs),
  transcript: plSale.segments,
  context: { campaignVertical: "energy", repUiLanguage: "nl" },
  expectedOutcome: "sale",
};

export const conversationFixtures: ConversationFixture[] = [
  nlSaleFixture,
  nlNotInterestedFixture,
  enFollowUpFixture,
  mixedLanguageBarrierFixture,
  deNotInterestedFixture,
  trFollowUpFixture,
  plSaleFixture,
];
