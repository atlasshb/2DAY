/**
 * Sample doorstep transcripts + ConversationMeta helpers for the doorstep
 * recording flow (Log screen — components/coach/**).
 *
 * These are hand-authored copies for the app's UI/demo path, not a re-export
 * of any @2day/core internal test fixtures — the app must not depend on
 * core's test-only files, only on its public "@2day/core" contracts
 * (packages/core/src/conversation.ts).
 *
 * The wording mirrors real doorstep energy-switch canvassing (this app's
 * demo campaign, docs/00 Tilburg scenario): a handled price objection, a
 * quick not-interested, and an English follow-up that lands on a concrete
 * return time — matching US-08/09/10 in e2e/user-stories.md.
 */
import type { ConsentState, ConversationMeta, TranscriptSegment } from "@2day/core";

/** Same demo org/rep/campaign identity used across the app's mock data
 *  (app/src/lib/mock.ts) — kept as local literals rather than an import so
 *  this module has no dependency on mock.ts's shape. */
const DEMO_ORG_ID = "01J9Z8QORGDEMO000000001";
const DEMO_REP_ID = "01J9Z8QREPDEMO000000001";
const DEMO_CAMPAIGN_ID = "01J9Z8QCAMPAIGNDEMO00001";

/** Campaign vertical passed as analyzer context — this demo campaign is a
 *  residential energy-contract switch, the classic NL doorstep-sales case. */
export const DEFAULT_CAMPAIGN_VERTICAL = "energy";

const CROCKFORD32 = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/** Not a spec-correct ULID (no timestamp/monotonic entropy) — sufficient for
 *  client-only ids that never persist past this session (a live-recorded
 *  conversation's id). Sample transcripts below use stable string ids. */
export function generateMockId(): string {
  let out = "";
  for (let i = 0; i < 26; i++) {
    out += CROCKFORD32[Math.floor(Math.random() * CROCKFORD32.length)] ?? "0";
  }
  return out;
}

function seg(
  speaker: TranscriptSegment["speaker"],
  text: string,
  startMs: number,
  endMs: number,
  lang: string,
): TranscriptSegment {
  return { speaker, text, startMs, endMs, lang };
}

export interface SampleTranscript {
  id: string;
  /** Sample-picker row title. */
  label: string;
  /** One-line description of how the conversation plays out. */
  hint: string;
  /** Dominant BCP-47 language of the conversation. */
  language: string;
  /** Analyzer context — see ConversationAnalyzer.analyze's `context` param. */
  campaignVertical: string;
  segments: TranscriptSegment[];
}

export const sampleTranscripts: SampleTranscript[] = [
  {
    id: "sample-nl-sale",
    label: "NL · Sale — price objection handled",
    hint: "Resident hesitates on price; rep reframes to the monthly saving and closes.",
    language: "nl",
    campaignVertical: DEFAULT_CAMPAIGN_VERTICAL,
    segments: [
      seg(
        "rep",
        "Goedemiddag! Ik loop hier voor GroenStroom, mag ik u iets vragen over uw energiecontract?",
        0,
        4200,
        "nl",
      ),
      seg("resident", "Ehm, tuurlijk, wat wil je weten?", 4200, 6800, "nl"),
      seg(
        "rep",
        "Zit u nog vast bij uw huidige leverancier, of loopt het contract dit jaar af?",
        6800,
        11200,
        "nl",
      ),
      seg("resident", "Volgens mij loopt die in september af, waarom?", 11200, 14600, "nl"),
      seg(
        "rep",
        "Mooi moment dus. Veel huishoudens in deze straat besparen zo'n 23 euro per maand door nu over te stappen naar groene stroom.",
        14600,
        22400,
        "nl",
      ),
      seg(
        "resident",
        "Het klinkt allemaal duur, ik wil niet ineens meer gaan betalen.",
        22400,
        26800,
        "nl",
      ),
      seg(
        "rep",
        "Begrijpelijk — daarom laat ik u het maandbedrag zien voor en na: u gaat van 128 naar 105 euro, geen instapkosten, en u kunt maandelijks opzeggen.",
        26800,
        35200,
        "nl",
      ),
      seg("resident", "Oh, als het echt goedkoper is dan hoor ik het graag.", 35200, 38400, "nl"),
      seg(
        "rep",
        "Top, dan regel ik de overstap nu voor u, dat duurt twee minuten en uw huidige leverancier krijgt automatisch bericht.",
        38400,
        44800,
        "nl",
      ),
      seg("resident", "Oke, doe maar, dan teken ik.", 44800, 47200, "nl"),
    ],
  },
  {
    id: "sample-nl-not-interested",
    label: "NL · Not interested",
    hint: "Resident shuts it down early — no time, already settled with a provider.",
    language: "nl",
    campaignVertical: DEFAULT_CAMPAIGN_VERTICAL,
    segments: [
      seg(
        "rep",
        "Goedemiddag, ik kom namens GroenStroom langs over energie in de buurt.",
        0,
        3600,
        "nl",
      ),
      seg("resident", "Nee sorry, geen interesse, we zitten al goed vast.", 3600, 6200, "nl"),
      seg(
        "rep",
        "Helemaal begrijpelijk. Mag ik vragen of het contract dit jaar nog afloopt? Dan kan ik u een folder achterlaten.",
        6200,
        11800,
        "nl",
      ),
      seg(
        "resident",
        "Nee, echt niet, ik heb nu geen tijd, ik sta net te koken.",
        11800,
        15200,
        "nl",
      ),
      seg("rep", "Prima, dan laat ik u weer met rust. Fijne avond nog.", 15200, 18400, "nl"),
      seg("resident", "Doei.", 18400, 19000, "nl"),
    ],
  },
  {
    id: "sample-en-follow-up",
    label: "EN · Follow-up — come back after 7",
    hint: "Resident is interested but busy now; sets a concrete return time.",
    language: "en",
    campaignVertical: DEFAULT_CAMPAIGN_VERTICAL,
    segments: [
      seg(
        "rep",
        "Hi there, sorry to bother you — I'm out here today with GreenSwitch talking to folks about their energy contract.",
        0,
        5200,
        "en",
      ),
      seg(
        "resident",
        "Oh, hi. I'm actually in the middle of making dinner right now, is this quick?",
        5200,
        9000,
        "en",
      ),
      seg(
        "rep",
        "Totally get it — quick version: a lot of houses on this street are saving around 20 euros a month switching to green energy. Worth a look?",
        9000,
        16400,
        "en",
      ),
      seg(
        "resident",
        "Yeah, maybe, I just really can't do it right now with the kids and dinner going.",
        16400,
        20800,
        "en",
      ),
      seg(
        "rep",
        "No worries at all. Would it work if I came back after 7, once things have calmed down?",
        20800,
        25600,
        "en",
      ),
      seg("resident", "Yeah, after 7 is good, come back then.", 25600, 28000, "en"),
      seg("rep", "Perfect, I'll knock again after 7. Enjoy your dinner!", 28000, 31200, "en"),
    ],
  },
];

/** Total conversation span implied by a segment list — used as durationMs
 *  when a sample is picked in place of a live recording. */
export function transcriptDurationMs(segments: TranscriptSegment[]): number {
  return segments.reduce((max, s) => Math.max(max, s.endMs), 0);
}

export interface ConversationMetaInput {
  language: string;
  durationMs: number;
  consent: ConsentState;
}

/** Builds a full ConversationMeta for a just-finished conversation (live or
 *  sampled) — fills the demo org/rep/campaign identity and the structural
 *  audio posture (`audioRetained: false`), leaving only what's genuinely
 *  per-recording variable. */
export function buildConversationMeta(input: ConversationMetaInput): ConversationMeta {
  return {
    id: generateMockId(),
    orgId: DEMO_ORG_ID,
    repId: DEMO_REP_ID,
    campaignId: DEMO_CAMPAIGN_ID,
    startedAt: new Date(Date.now() - input.durationMs).toISOString(),
    durationMs: input.durationMs,
    consent: input.consent,
    audioRetained: false,
    language: input.language,
  };
}
