"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { deterministicAnalyzer, type ConsentState } from "@2day/core";
import { useStore } from "@/lib/store";
import { outcomeButtons } from "@/lib/mock";
import { buildConversationMeta } from "@/lib/transcripts";
import { RecordSheet, type CapturedTranscript } from "./RecordSheet";
import { AnalysisCard } from "./AnalysisCard";

/** Rep's app UI language — no i18n yet, and this Tilburg demo rep reads
 *  Dutch. Drives ConversationAnalysis.translatedSummary when a transcript's
 *  own detected language differs (the EN follow-up sample, US-09). */
const REP_UI_LANGUAGE = "nl";

type Stage = "closed" | "sheet" | "analyzing" | "analysis";

/**
 * Owns the whole doorstep recording flow on the Log screen: the "Record"
 * pill, the record bottom sheet (consent + live capture / sample picker),
 * and the resulting analysis card. Mounted once from app/src/app/log/page.tsx.
 */
export function CoachRecorder() {
  const { recording, setRecording, lastAnalysis, setLastAnalysis, logOutcome } = useStore();
  const [stage, setStage] = useState<Stage>("closed");
  const [consent, setConsent] = useState<ConsentState>("notes_only");

  // The sheets must render outside `.content` (AppShell.tsx) — it's
  // `overflow-y:auto`, which would clip an absolutely-positioned sheet
  // pinned to `.app`'s bottom edge (the same reason Snackbar/NudgeBanner are
  // mounted as `.content`'s siblings, not its children). Portaling into
  // `#app` gets the same escape without touching the shared AppShell.
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setPortalTarget(document.getElementById("app"));
  }, []);

  const closeAll = useCallback(() => {
    setStage("closed");
    setRecording(false);
  }, [setRecording]);

  const openSheet = useCallback(() => {
    setStage("sheet");
    setRecording(true);
  }, [setRecording]);

  const handleBackdropClick = useCallback(() => {
    // Ignore taps while the analyzer is running — it's a fast, synchronous
    // deterministic pass, not worth racing a dismiss against.
    if (stage === "sheet") closeAll();
  }, [stage, closeAll]);

  const handleCaptured = useCallback(
    async (payload: CapturedTranscript) => {
      setStage("analyzing");
      try {
        const meta = buildConversationMeta({
          language: payload.language,
          durationMs: payload.durationMs,
          consent,
        });
        const analysis = await deterministicAnalyzer.analyze(meta, payload.segments, {
          campaignVertical: payload.campaignVertical,
          repUiLanguage: REP_UI_LANGUAGE,
        });
        setLastAnalysis(analysis);
        setRecording(false);
        setStage("analysis");
      } catch (err) {
        console.error("conversation analysis failed", err);
        closeAll();
      }
    },
    [consent, setLastAnalysis, setRecording, closeAll],
  );

  const handleLog = useCallback(() => {
    if (!lastAnalysis) return;
    const cfg = outcomeButtons.find((b) => b.outcome === lastAnalysis.outcome);
    logOutcome(lastAnalysis.outcome, cfg?.label ?? lastAnalysis.outcome);
    setLastAnalysis(null);
    setStage("closed");
  }, [lastAnalysis, logOutcome, setLastAnalysis]);

  const handleDismiss = useCallback(() => {
    setLastAnalysis(null);
    setStage("closed");
  }, [setLastAnalysis]);

  return (
    <>
      <div className="recpillrow">
        <button
          type="button"
          className={`recpill${recording ? " active" : ""}`}
          data-testid="record-toggle"
          aria-haspopup="dialog"
          aria-expanded={stage !== "closed"}
          onClick={openSheet}
        >
          <span className="recdotsmall" aria-hidden="true" />
          {recording ? "Recording…" : "Record"}
        </button>
      </div>

      {portalTarget &&
        (stage === "sheet" || stage === "analyzing") &&
        createPortal(
          <>
            <div className="recbackdrop" onClick={handleBackdropClick} />
            <RecordSheet
              consent={consent}
              onConsentChange={setConsent}
              onClose={closeAll}
              onCaptured={handleCaptured}
              analyzing={stage === "analyzing"}
            />
          </>,
          portalTarget,
        )}

      {portalTarget &&
        stage === "analysis" &&
        lastAnalysis &&
        createPortal(
          <>
            <div className="recbackdrop" />
            <AnalysisCard analysis={lastAnalysis} onLog={handleLog} onDismiss={handleDismiss} />
          </>,
          portalTarget,
        )}
    </>
  );
}
