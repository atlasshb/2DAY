/**
 * Conversation intelligence contracts — docs/21-conversation-intelligence.md.
 *
 * Privacy posture (decided, non-negotiable — doc 17/21):
 *  - Raw audio NEVER leaves the device and is deleted the moment a transcript
 *    exists (`audioRetained` is structurally `false` on the wire).
 *  - Only transcripts + derived analysis sync, under the rep's org policy.
 *  - Recording requires an explicit per-conversation consent state; "notes_only"
 *    mode captures the rep's own voice memo after the door, never the resident.
 *  - Production transcription is on-device (Whisper-class model); the repo MVP
 *    uses typed fixtures + the browser's speech API where available.
 */
import { z } from "zod";
import type { GeoPoint, ISODateTime, ULID, VisitOutcome } from "./types.js";

export type ConsentState = "resident_informed" | "notes_only";

export type Speaker = "rep" | "resident" | "unknown";

export interface TranscriptSegment {
  speaker: Speaker;
  text: string;
  startMs: number;
  endMs: number;
  /** BCP-47, per segment — doorstep conversations code-switch. */
  lang?: string;
}

export interface ConversationMeta {
  id: ULID;
  orgId: ULID;
  repId: ULID;
  campaignId: ULID;
  visitEventId?: ULID; // links to the logged door outcome
  addressUnitId?: ULID;
  point?: GeoPoint;
  startedAt: ISODateTime;
  durationMs: number;
  consent: ConsentState;
  /** Structurally false on the wire: audio is deleted on-device after transcription. */
  audioRetained: false;
  /** Dominant detected language, BCP-47 ("nl", "en", "tr", "ar", "pl"...). */
  language: string;
}

export type ObjectionKind =
  | "price"
  | "trust"
  | "no_time"
  | "already_has_provider"
  | "not_decision_maker"
  | "language_barrier"
  | "bad_experience"
  | "other";

export interface Objection {
  kind: ObjectionKind;
  /** Verbatim resident phrase that raised it. */
  quote: string;
  handled: boolean;
  /** How the rep answered (or should have). */
  note?: string;
}

export interface CoachingTip {
  area:
    | "opening"
    | "discovery"
    | "pitch"
    | "objection_handling"
    | "closing"
    | "tone"
    | "compliance";
  tip: string;
  /** Index into the transcript segments this tip is grounded in. */
  evidenceSegment?: number;
}

export interface ConversationAnalysis {
  id: ULID;
  conversationId: ULID;
  /** Classified door outcome; mirrors the visit outcome enum. */
  outcome: Extract<VisitOutcome, "sale" | "not_interested" | "follow_up" | "conversation">;
  confidence: number; // 0..1
  summary: string;
  whatWentWell: string[];
  improvements: CoachingTip[];
  objections: Objection[];
  /** Rep speaking time / total speaking time; healthy doorstep range ≈ 0.4–0.6. */
  talkRatio: number;
  questionsAsked: number;
  /** Concrete next step when outcome is follow_up ("terugkomen na 19:00"). */
  nextStep?: string;
  language: string;
  /** Summary translated to the rep's UI language when it differs. */
  translatedSummary?: string;
  analyzedAt: ISODateTime;
  /** "deterministic" = offline rules engine; "claude" = LLM coach (doc 21 §AI). */
  engine: "deterministic" | "claude";
}

/** Analyzer seam — deterministic offline impl + Claude impl behind one contract. */
export interface ConversationAnalyzer {
  analyze(
    meta: ConversationMeta,
    transcript: TranscriptSegment[],
    context: { campaignVertical: string; repUiLanguage: string },
  ): Promise<ConversationAnalysis>;
}

// ---------------------------------------------------------------------------
// Wire schemas
// ---------------------------------------------------------------------------
import { geoPoint, isoDateTime, ulid } from "./schemas.js";

export const transcriptSegment = z.object({
  speaker: z.enum(["rep", "resident", "unknown"]),
  text: z.string().min(1).max(4000),
  startMs: z.number().int().min(0),
  endMs: z.number().int().min(0),
  lang: z.string().min(2).max(35).optional(),
});

export const conversationMeta = z.object({
  id: ulid,
  orgId: ulid,
  repId: ulid,
  campaignId: ulid,
  visitEventId: ulid.optional(),
  addressUnitId: ulid.optional(),
  point: geoPoint.optional(),
  startedAt: isoDateTime,
  durationMs: z.number().int().min(0).max(30 * 60_000),
  consent: z.enum(["resident_informed", "notes_only"]),
  audioRetained: z.literal(false),
  language: z.string().min(2).max(35),
});

export const analyzeConversationRequest = z.object({
  meta: conversationMeta,
  transcript: z.array(transcriptSegment).min(1).max(500),
  context: z.object({
    campaignVertical: z.string().min(1),
    repUiLanguage: z.string().min(2).max(35),
  }),
});
