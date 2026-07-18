"use client";

import type { CoachingTip, ConversationAnalysis, ObjectionKind } from "@2day/core";
import { outcomeButtons } from "@/lib/mock";

const OBJECTION_LABEL: Record<ObjectionKind, string> = {
  price: "Price",
  trust: "Trust",
  no_time: "No time",
  already_has_provider: "Has provider",
  not_decision_maker: "Not decision-maker",
  language_barrier: "Language barrier",
  bad_experience: "Bad experience",
  other: "Other",
};

const AREA_LABEL: Record<CoachingTip["area"], string> = {
  opening: "Opening",
  discovery: "Discovery",
  pitch: "Pitch",
  objection_handling: "Objections",
  closing: "Closing",
  tone: "Tone",
  compliance: "Compliance",
};

/**
 * Full-height sheet rendering a ConversationAnalysis (docs/05/07 sheet
 * pattern, `.recsheet.full`). Mounted by CoachRecorder once
 * `deterministicAnalyzer.analyze()` resolves, for either a live recording or
 * a picked sample transcript.
 */
export function AnalysisCard({
  analysis,
  onLog,
  onDismiss,
}: {
  analysis: ConversationAnalysis;
  onLog: () => void;
  onDismiss: () => void;
}) {
  const outcomeCfg = outcomeButtons.find((b) => b.outcome === analysis.outcome);
  const outcomeLabel = outcomeCfg?.label ?? analysis.outcome;
  const colorVar = outcomeCfg?.colorVar ?? "--convo";

  const repPct = Math.round(analysis.talkRatio * 100);
  const residentPct = Math.max(0, 100 - repPct);
  const healthy = analysis.talkRatio >= 0.4 && analysis.talkRatio <= 0.6;

  return (
    <div
      className="recsheet full"
      data-testid="analysis-card"
      role="dialog"
      aria-label="Conversation analysis"
    >
      <div className="grab" />
      <div className="reccardbody">
        <div className="anahead">
          <span
            className="anaoutcome"
            data-testid="analysis-outcome"
            style={{ background: `var(${colorVar})` }}
          >
            {outcomeLabel}
            <b>{Math.round(analysis.confidence * 100)}%</b>
          </span>
          <span className="pill" data-testid="analysis-language">
            {analysis.language.toUpperCase()}
          </span>
        </div>

        <p className="anasummary">{analysis.summary}</p>
        {analysis.translatedSummary && (
          <p className="translatedsummary">{analysis.translatedSummary}</p>
        )}

        {analysis.whatWentWell.length > 0 && (
          <div className="card">
            <div className="cardtitle">What went well</div>
            <ul className="coach">
              {analysis.whatWentWell.map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
          </div>
        )}

        {analysis.improvements.length > 0 && (
          <div className="card">
            <div className="cardtitle">Improve</div>
            <ul className="coach">
              {analysis.improvements.map((tip, i) => (
                <li key={i}>
                  <span className="pill areachip">{AREA_LABEL[tip.area]}</span>
                  {tip.tip}
                </li>
              ))}
            </ul>
          </div>
        )}

        {analysis.objections.length > 0 && (
          <div className="card">
            <div className="cardtitle">Objections</div>
            <div className="objlist">
              {analysis.objections.map((objection, i) => (
                <div className="objrow" key={i}>
                  <span className="pill objkind">{OBJECTION_LABEL[objection.kind]}</span>
                  <span className="objquote">&ldquo;{objection.quote}&rdquo;</span>
                  <span
                    className={`objhandled${objection.handled ? " ok" : " no"}`}
                    aria-label={objection.handled ? "handled" : "not handled"}
                  >
                    {objection.handled ? "✓" : "✗"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="card">
          <div className="cardtitle">Talk ratio</div>
          <div className="talktrack">
            <div className="talkband" />
            <div className="talkfill" style={{ width: `${repPct}%` }} />
          </div>
          <div className="talklabels">
            <span>Rep {repPct}%</span>
            {healthy && <span className="healthytag">✓ healthy range</span>}
            <span>Resident {residentPct}%</span>
          </div>
          <p className="qcount">
            {analysis.questionsAsked} question{analysis.questionsAsked === 1 ? "" : "s"} asked
          </p>
        </div>

        {analysis.nextStep && (
          <div className="nextstep">
            <b>Next step</b>
            {analysis.nextStep}
          </div>
        )}
      </div>

      <div className="reccardfoot">
        <button type="button" className="primary" data-testid="log-outcome-btn" onClick={onLog}>
          Log as {outcomeLabel}
        </button>
        <button type="button" className="ghost" style={{ minHeight: 48 }} onClick={onDismiss}>
          Dismiss
        </button>
      </div>
    </div>
  );
}
