"use client";

import { useEffect, useRef, useState } from "react";
import type { ConsentState, Speaker, TranscriptSegment } from "@2day/core";
import { ConsentChip } from "./ConsentChip";
import {
  canRecordLive,
  createLiveRecorder,
  formatElapsed,
  type LiveRecorder,
} from "@/lib/recorder";
import { DEFAULT_CAMPAIGN_VERTICAL, sampleTranscripts, transcriptDurationMs } from "@/lib/transcripts";

export interface CapturedTranscript {
  segments: TranscriptSegment[];
  durationMs: number;
  language: string;
  campaignVertical: string;
}

type Phase = "setup" | "live" | "samples";

/**
 * Bottom sheet for the doorstep recording flow (mounted by CoachRecorder).
 * Three phases:
 *  - "setup"   consent chip + a big Record button, shown when mic + speech
 *              recognition are both available.
 *  - "live"    elapsed timer, pulsing dot, big Stop button.
 *  - "samples" the always-available fallback list of typed sample
 *              transcripts — reached automatically when recording isn't
 *              supported (or fails to start), or manually via the small
 *              "samples" link that's visible even while live so E2E/sandboxes
 *              can always drive the flow deterministically.
 */
export function RecordSheet({
  consent,
  onConsentChange,
  onClose,
  onCaptured,
  analyzing,
}: {
  consent: ConsentState;
  onConsentChange: (next: ConsentState) => void;
  onClose: () => void;
  onCaptured: (payload: CapturedTranscript) => void;
  analyzing: boolean;
}) {
  const [autoFallback] = useState(() => !canRecordLive());
  const [phase, setPhase] = useState<Phase>(() => (canRecordLive() ? "setup" : "samples"));
  const [elapsedMs, setElapsedMs] = useState(0);
  const [note, setNote] = useState<string | null>(null);
  const recorderRef = useRef<LiveRecorder | null>(null);
  const startedAtRef = useRef(0);

  // Live elapsed-time ticker — stops as soon as analysis starts, even though
  // this component (and its "live" phase) stays mounted until the parent
  // swaps in the AnalysisCard.
  useEffect(() => {
    if (phase !== "live" || analyzing) return;
    const id = setInterval(() => setElapsedMs(Date.now() - startedAtRef.current), 250);
    return () => clearInterval(id);
  }, [phase, analyzing]);

  // Always tear down any live mic/recognition session on unmount.
  useEffect(() => {
    return () => {
      recorderRef.current?.cancel();
      recorderRef.current = null;
    };
  }, []);

  async function handleStart() {
    setNote(null);
    const speaker: Speaker = consent === "notes_only" ? "rep" : "unknown";
    const recorder = createLiveRecorder(speaker);
    recorderRef.current = recorder;
    try {
      await recorder.start();
      // The mic-permission prompt can resolve after the user has already
      // backed out (closed the sheet, or hit "use a sample instead") —
      // don't resurrect a live session nobody's looking at.
      if (recorderRef.current !== recorder) {
        recorder.cancel();
        return;
      }
      startedAtRef.current = Date.now();
      setElapsedMs(0);
      setPhase("live");
    } catch {
      if (recorderRef.current !== recorder) return;
      recorderRef.current = null;
      setNote("Microphone unavailable — pick a sample instead.");
      setPhase("samples");
    }
  }

  async function handleStop() {
    const recorder = recorderRef.current;
    recorderRef.current = null;
    if (!recorder) return;
    const result = await recorder.stop();
    if (result.segments.length === 0) {
      setNote("Didn't catch any speech — try again or pick a sample.");
      setPhase("samples");
      return;
    }
    const lang =
      (typeof navigator !== "undefined" ? navigator.language.split("-")[0] : undefined) ?? "nl";
    onCaptured({
      segments: result.segments,
      durationMs: result.durationMs,
      language: lang,
      campaignVertical: DEFAULT_CAMPAIGN_VERTICAL,
    });
  }

  function handleUseSamples() {
    recorderRef.current?.cancel();
    recorderRef.current = null;
    setNote(null);
    setPhase("samples");
  }

  function handlePickSample(id: string) {
    const sample = sampleTranscripts.find((s) => s.id === id);
    if (!sample) return;
    onCaptured({
      segments: sample.segments,
      durationMs: transcriptDurationMs(sample.segments),
      language: sample.language,
      campaignVertical: sample.campaignVertical,
    });
  }

  return (
    <div className="recsheet" data-testid="record-sheet" role="dialog" aria-label="Record conversation">
      <div className="grab" />
      <div className="recsheethead">
        <span className="recsheettitle">Record conversation</span>
        <button type="button" className="recclose" onClick={onClose} aria-label="Close">
          ✕
        </button>
      </div>

      {analyzing ? (
        <div className="compiling" style={{ justifyContent: "center", padding: "24px 0" }}>
          <span className="spinner" /> Analyzing conversation…
        </div>
      ) : (
        <>
          <ConsentChip value={consent} onChange={onConsentChange} disabled={phase === "live"} />

          {phase === "live" && (
            <div className="reclive">
              <div className="recliverow">
                <span className="recdot" aria-hidden="true" />
                Recording
              </div>
              <div className="rectimer">{formatElapsed(elapsedMs)}</div>
              <button
                type="button"
                className="stopbtn"
                data-testid="stop-record"
                onClick={handleStop}
                aria-label="Stop recording"
              >
                ■ Stop
              </button>
            </div>
          )}

          {phase === "setup" && (
            <button
              type="button"
              className="stopbtn start"
              onClick={handleStart}
              aria-label="Start recording"
            >
              ● Rec
            </button>
          )}

          {phase === "samples" && (
            <div className="samplelist">
              {(note || autoFallback) && (
                <p className="samplenote">
                  {note ?? "Recording isn't available on this device — pick a sample."}
                </p>
              )}
              {sampleTranscripts.map((sample) => (
                <button
                  key={sample.id}
                  type="button"
                  className="samplerow"
                  data-testid="sample-transcript-btn"
                  onClick={() => handlePickSample(sample.id)}
                >
                  <span className="samplelabel">{sample.label}</span>
                  <span className="samplehint">{sample.hint}</span>
                </button>
              ))}
            </div>
          )}

          {phase !== "samples" && (
            <button
              type="button"
              className="sampleslink"
              data-testid="samples-link"
              onClick={handleUseSamples}
            >
              Use a sample conversation instead
            </button>
          )}
        </>
      )}
    </div>
  );
}
