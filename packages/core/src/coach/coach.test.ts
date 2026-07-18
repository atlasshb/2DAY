/**
 * Coach tests (vitest). Covers: each fixture classifies correctly, determinism,
 * talkRatio math, handled-objection both ways, the Claude adapter (accept + reject),
 * language fallback, the compliance tip, and the analyzeConversationRequest round-trip.
 */
import { describe, it, expect } from "vitest";
import {
  ClaudeAnalyzerError,
  conversationFixtures,
  createClaudeAnalyzer,
  createDeterministicAnalyzer,
  deNotInterestedFixture,
  deterministicAnalyzer,
  detectLang,
  enFollowUpFixture,
  mixedLanguageBarrierFixture,
  nlNotInterestedFixture,
  nlSaleFixture,
  plSaleFixture,
  trFollowUpFixture,
  type ClaudeAnalysisPayload,
} from "./index.js";
import { analyzeConversationRequest, type ConversationMeta, type TranscriptSegment } from "../conversation.js";

const ULID = /^[0-9A-HJKMNP-TV-Z]{26}$/;

function run(f = nlSaleFixture) {
  return deterministicAnalyzer.analyze(f.meta, f.transcript, f.context);
}

function mkMeta(overrides: Partial<ConversationMeta> = {}): ConversationMeta {
  return { ...nlSaleFixture.meta, ...overrides };
}

describe("deterministicAnalyzer — fixtures", () => {
  it("NL energy sale: sale outcome + handled price objection, valid ULID id", async () => {
    const a = await run(nlSaleFixture);
    expect(a.outcome).toBe("sale");
    expect(a.confidence).toBeGreaterThan(0.7);
    expect(a.engine).toBe("deterministic");
    expect(a.id).toMatch(ULID);
    expect(a.conversationId).toBe(nlSaleFixture.meta.id);
    const price = a.objections.find((o) => o.kind === "price");
    expect(price).toBeDefined();
    expect(price!.handled).toBe(true);
    expect(price!.quote).toContain("duur");
    // healthy balance + resident questions answered surface as positives
    expect(a.whatWentWell.length).toBeGreaterThan(0);
  });

  it("NL not-interested: outcome + opening-monologue tip grounded at segment 0", async () => {
    const a = await run(nlNotInterestedFixture);
    expect(a.outcome).toBe("not_interested");
    const opening = a.improvements.find((t) => t.area === "opening");
    expect(opening).toBeDefined();
    expect(opening!.evidenceSegment).toBe(0);
    // rep dominated → discovery (talk-ratio) tip too
    expect(a.improvements.some((t) => t.area === "discovery")).toBe(true);
    expect(a.talkRatio).toBeGreaterThan(0.7);
  });

  it("EN follow-up: follow_up outcome, nextStep captures time + person, decision-maker objection", async () => {
    const a = await run(enFollowUpFixture);
    expect(a.outcome).toBe("follow_up");
    expect(a.nextStep).toBeDefined();
    expect(a.nextStep!).toContain("7");
    expect(a.nextStep!.toLowerCase()).toContain("wife");
    const dm = a.objections.find((o) => o.kind === "not_decision_maker");
    expect(dm).toBeDefined();
    // the decision-maker point went unanswered → objection_handling tip with evidence
    const tip = a.improvements.find((t) => t.area === "objection_handling");
    expect(tip).toBeDefined();
    expect(tip!.evidenceSegment).toBeGreaterThanOrEqual(0);
  });

  it("mixed NL/EN: conversation outcome, EN dominant, NL translatedSummary, language-barrier objection", async () => {
    const a = await run(mixedLanguageBarrierFixture);
    expect(a.outcome).toBe("conversation");
    expect(a.language).toBe("en");
    expect(a.translatedSummary).toBeDefined();
    expect(a.summary).not.toBe(a.translatedSummary);
    expect(a.objections.some((o) => o.kind === "language_barrier")).toBe(true);
  });

  it("every fixture classifies to its expected outcome", async () => {
    for (const f of conversationFixtures) {
      const a = await deterministicAnalyzer.analyze(f.meta, f.transcript, f.context);
      expect(a.outcome, f.name).toBe(f.expectedOutcome);
    }
  });
});

describe("deterministicAnalyzer — DE/TR/PL fixtures", () => {
  it("DE not-interested: outcome + unhandled price objection, detected language de", async () => {
    const a = await run(deNotInterestedFixture);
    expect(a.outcome).toBe("not_interested");
    expect(a.language).toBe("de");
    const price = a.objections.find((o) => o.kind === "price");
    expect(price).toBeDefined();
    expect(price!.handled).toBe(false);
    expect(price!.quote).toContain("teuer");
    expect(a.improvements.some((t) => t.area === "objection_handling")).toBe(true);
  });

  it("TR follow-up: handled no_time objection, concrete return time, detected language tr", async () => {
    const a = await run(trFollowUpFixture);
    expect(a.outcome).toBe("follow_up");
    expect(a.language).toBe("tr");
    const noTime = a.objections.find((o) => o.kind === "no_time");
    expect(noTime).toBeDefined();
    expect(noTime!.handled).toBe(true);
    expect(a.nextStep).toBeDefined();
    expect(a.nextStep!).toContain("akşam");
  });

  it("PL sale: handled trust objection via the 'rozumiem' counter-signal, detected language pl", async () => {
    const a = await run(plSaleFixture);
    expect(a.outcome).toBe("sale");
    expect(a.language).toBe("pl");
    const trust = a.objections.find((o) => o.kind === "trust");
    expect(trust).toBeDefined();
    expect(trust!.handled).toBe(true);
    expect(trust!.quote).toContain("oszustwo");
  });

  it("TR fixture yields an EN summary and an NL translatedSummary when repUiLanguage is nl", async () => {
    const a = await run(trFollowUpFixture);
    expect(trFollowUpFixture.context.repUiLanguage).toBe("nl");
    expect(a.summary).toMatch(/^Outcome:/);
    expect(a.translatedSummary).toBeDefined();
    expect(a.translatedSummary!).toMatch(/^Uitkomst:/);
    expect(a.summary).not.toBe(a.translatedSummary);
  });

  it("stopword vote also detects DE, TR, and PL for untagged text pulled from the new fixtures", () => {
    expect(detectLang(deNotInterestedFixture.transcript[3]!.text, "en")).toBe("de");
    expect(detectLang(trFollowUpFixture.transcript[3]!.text, "en")).toBe("tr");
    expect(detectLang(plSaleFixture.transcript[3]!.text, "en")).toBe("pl");
  });

  it("identical inputs yield a deeply-equal analysis for a new fixture (PL sale)", async () => {
    const a = await deterministicAnalyzer.analyze(plSaleFixture.meta, plSaleFixture.transcript, plSaleFixture.context);
    const b = await deterministicAnalyzer.analyze(plSaleFixture.meta, plSaleFixture.transcript, plSaleFixture.context);
    expect(a).toEqual(b);
  });
});

describe("deterministicAnalyzer — determinism", () => {
  it("identical inputs yield a deeply-equal analysis (incl. id + analyzedAt)", async () => {
    for (const f of conversationFixtures) {
      const a = await deterministicAnalyzer.analyze(f.meta, f.transcript, f.context);
      const b = await deterministicAnalyzer.analyze(f.meta, f.transcript, f.context);
      expect(a).toEqual(b);
    }
  });

  it("analyzedAt defaults to the conversation end instant; an injected clock overrides it", async () => {
    const def = await deterministicAnalyzer.analyze(nlSaleFixture.meta, nlSaleFixture.transcript, nlSaleFixture.context);
    // startedAt 15:30:00+02:00 + durationMs → deterministic end time
    expect(def.analyzedAt).toBe("2026-07-15T15:31:30+02:00");
    const fixed = createDeterministicAnalyzer({ clock: () => Date.parse("2026-07-15T16:00:00+02:00") });
    const withClock = await fixed.analyze(nlSaleFixture.meta, nlSaleFixture.transcript, nlSaleFixture.context);
    expect(withClock.analyzedAt).toBe("2026-07-15T16:00:00+02:00");
  });
});

describe("deterministicAnalyzer — arithmetic + objection handling", () => {
  it("talkRatio is rep-time / total-time", async () => {
    const transcript: TranscriptSegment[] = [
      { speaker: "rep", text: "Goedemiddag, mag ik u iets vragen?", startMs: 0, endMs: 30_000, lang: "nl" },
      { speaker: "resident", text: "Ja, prima.", startMs: 30_000, endMs: 40_000, lang: "nl" },
    ];
    const a = await deterministicAnalyzer.analyze(mkMeta(), transcript, { campaignVertical: "energy", repUiLanguage: "nl" });
    expect(a.talkRatio).toBe(0.75); // 30s rep / 40s total
  });

  it("an objection is handled iff a later rep segment carries a counter-signal", async () => {
    const ctx = { campaignVertical: "energy", repUiLanguage: "nl" };
    const handled: TranscriptSegment[] = [
      { speaker: "resident", text: "Het is best duur.", startMs: 0, endMs: 4_000, lang: "nl" },
      { speaker: "rep", text: "Juist daarom bespaart u juist geld.", startMs: 4_000, endMs: 9_000, lang: "nl" },
    ];
    const unhandled: TranscriptSegment[] = [
      { speaker: "resident", text: "Het is best duur.", startMs: 0, endMs: 4_000, lang: "nl" },
      { speaker: "rep", text: "Oké, dank u en een fijne dag.", startMs: 4_000, endMs: 8_000, lang: "nl" },
    ];
    const ha = await deterministicAnalyzer.analyze(mkMeta(), handled, ctx);
    const ua = await deterministicAnalyzer.analyze(mkMeta(), unhandled, ctx);
    expect(ha.objections.find((o) => o.kind === "price")!.handled).toBe(true);
    expect(ua.objections.find((o) => o.kind === "price")!.handled).toBe(false);
    // unhandled objection produces the coaching tip; handled one does not
    expect(ua.improvements.some((t) => t.area === "objection_handling")).toBe(true);
    expect(ha.improvements.some((t) => t.area === "objection_handling")).toBe(false);
  });

  it("a sale without a price/terms recap raises a compliance tip", async () => {
    const transcript: TranscriptSegment[] = [
      { speaker: "resident", text: "Ja, doe maar.", startMs: 0, endMs: 3_000, lang: "nl" },
      { speaker: "rep", text: "Top, geregeld!", startMs: 3_000, endMs: 6_000, lang: "nl" },
    ];
    const a = await deterministicAnalyzer.analyze(mkMeta(), transcript, { campaignVertical: "energy", repUiLanguage: "nl" });
    expect(a.outcome).toBe("sale");
    expect(a.improvements.some((t) => t.area === "compliance")).toBe(true);
  });
});

describe("language fallback + dominant detection", () => {
  it("stopword vote guesses NL vs EN for untagged text", () => {
    expect(detectLang("ik heb echt geen tijd en geen interesse", "en")).toBe("nl");
    expect(detectLang("i really have no time and no interest", "nl")).toBe("en");
  });

  it("an untagged segment is language-detected for the dominant language", async () => {
    const transcript: TranscriptSegment[] = [
      { speaker: "rep", text: "Do you have a minute to talk about your energy?", startMs: 0, endMs: 6_000 },
      { speaker: "resident", text: "Sure, go ahead.", startMs: 6_000, endMs: 9_000 },
    ];
    const a = await deterministicAnalyzer.analyze(mkMeta({ language: "nl" }), transcript, {
      campaignVertical: "energy",
      repUiLanguage: "en",
    });
    expect(a.language).toBe("en");
  });
});

describe("createClaudeAnalyzer", () => {
  const goodPayload: ClaudeAnalysisPayload = {
    outcome: "sale",
    confidence: 0.82,
    summary: "Outcome: sale.",
    whatWentWell: ["Warm rapport"],
    improvements: [{ area: "closing", tip: "Confirm the start date." }],
    objections: [{ kind: "price", quote: "Het is best duur.", handled: true }],
    talkRatio: 0.52,
    questionsAsked: 4,
    language: "nl",
  };

  it("validates the transport reply and stamps id/analyzedAt/engine", async () => {
    let seen: unknown;
    const analyzer = createClaudeAnalyzer(async (req) => {
      seen = req;
      return goodPayload;
    });
    const a = await analyzer.analyze(nlSaleFixture.meta, nlSaleFixture.transcript, nlSaleFixture.context);
    expect(a.engine).toBe("claude");
    expect(a.id).toMatch(ULID);
    expect(a.conversationId).toBe(nlSaleFixture.meta.id);
    expect(a.outcome).toBe("sale");
    expect(a.analyzedAt).toMatch(/\+02:00$/);
    // the request never carries GPS (docs/17): point is stripped from meta
    expect((seen as { meta: Record<string, unknown> }).meta).not.toHaveProperty("point");
    expect((seen as { tool: { input_schema: unknown } }).tool.input_schema).toBeDefined();
  });

  it("rejects a malformed transport reply (never best-efforts it)", async () => {
    const analyzer = createClaudeAnalyzer(async () => ({ outcome: "banana", confidence: 2 }));
    await expect(
      analyzer.analyze(nlSaleFixture.meta, nlSaleFixture.transcript, nlSaleFixture.context),
    ).rejects.toBeInstanceOf(ClaudeAnalyzerError);
  });
});

describe("wire contract", () => {
  it("every fixture is a valid analyzeConversationRequest and analyzes after a zod round-trip", async () => {
    for (const f of conversationFixtures) {
      const parsed = analyzeConversationRequest.parse({
        meta: f.meta,
        transcript: f.transcript,
        context: f.context,
      });
      const a = await deterministicAnalyzer.analyze(parsed.meta, parsed.transcript, parsed.context);
      expect(a.outcome).toBe(f.expectedOutcome);
    }
  });
});
