/**
 * Doorstep conversation recorder — MediaRecorder (audio capture, on-device
 * only) + the browser's SpeechRecognition API (Chromium: `webkitSpeechRecognition`)
 * wired together into a single start/stop controller that yields
 * `TranscriptSegment[]`.
 *
 * Privacy posture (packages/core/src/conversation.ts, docs/17 §audio):
 * the MediaRecorder Blob exists only to keep the mic stream alive for
 * recognition timing — it is never read, stored, or uploaded. `stop()`/
 * `cancel()` tear the stream down immediately and no chunk ever leaves this
 * module.
 *
 * No diarization in the MVP: every segment produced here carries one fixed
 * `speaker` for the whole session, chosen by the caller from the active
 * `ConsentState` — "notes_only" means only the rep's own voice is ever being
 * captured (so segments are confidently "rep"); "resident_informed" means the
 * mic may be picking up either party, so segments are labeled "unknown"
 * rather than guessed. Segments with speaker "resident" only ever come from
 * the curated sample transcripts (transcripts.ts), never from live capture.
 */
import type { Speaker, TranscriptSegment } from "@2day/core";

/**
 * Minimal ambient typing for the non-standard, Chromium-only
 * SpeechRecognition API — there's no @types/dom-speech-recognition in this
 * repo, so only the surface this module touches is declared here.
 */
interface SpeechRecognitionResultLike {
  isFinal: boolean;
  0: { transcript: string };
}
interface SpeechRecognitionEventLike extends Event {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResultLike> & { length: number };
}
interface SpeechRecognitionLike extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: Event) => void) | null;
  onend: (() => void) | null;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getSpeechRecognitionCtor(): SpeechRecognitionCtor | undefined {
  if (typeof window === "undefined") return undefined;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}

export interface RecorderCapabilities {
  hasMic: boolean;
  hasSpeechRecognition: boolean;
}

export function getRecorderCapabilities(): RecorderCapabilities {
  const hasMic =
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof MediaRecorder !== "undefined";
  const hasSpeechRecognition = !!getSpeechRecognitionCtor();
  return { hasMic, hasSpeechRecognition };
}

/** True when the live-record path (mic + on-device speech recognition) can
 *  run at all on this device/browser. When false, the sheet must fall back
 *  to the sample-transcript picker — some transcript, live or sampled, must
 *  always reach the analyzer. */
export function canRecordLive(): boolean {
  const caps = getRecorderCapabilities();
  return caps.hasMic && caps.hasSpeechRecognition;
}

export interface LiveRecordingResult {
  segments: TranscriptSegment[];
  durationMs: number;
}

export interface LiveRecorder {
  start(): Promise<void>;
  /** Stops capture and returns everything transcribed so far. Safe to call
   *  even if start() never fully completed. */
  stop(): Promise<LiveRecordingResult>;
  /** Tears everything down without returning a result — used when the sheet
   *  is dismissed or the caller switches to the sample picker mid-recording. */
  cancel(): void;
}

export function createLiveRecorder(speaker: Speaker): LiveRecorder {
  let stream: MediaStream | null = null;
  let mediaRecorder: MediaRecorder | null = null;
  let recognition: SpeechRecognitionLike | null = null;
  let startedAt = 0;
  const segments: TranscriptSegment[] = [];

  function teardown() {
    try {
      recognition?.stop();
    } catch {
      // already stopped — ignore
    }
    recognition = null;
    try {
      if (mediaRecorder && mediaRecorder.state !== "inactive") mediaRecorder.stop();
    } catch {
      // already stopped — ignore
    }
    mediaRecorder = null;
    stream?.getTracks().forEach((track) => track.stop());
    stream = null;
  }

  async function start(): Promise<void> {
    if (typeof window === "undefined" || typeof navigator === "undefined") {
      throw new Error("recording requires a browser environment");
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("microphone unavailable");
    }
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      throw new Error("speech recognition unavailable");
    }

    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    startedAt = Date.now();

    // Keeps the stream "live" for recognition timing; chunks are discarded —
    // see the module-level privacy note above.
    mediaRecorder = new MediaRecorder(stream);
    mediaRecorder.ondataavailable = () => {};
    mediaRecorder.start(1000);

    recognition = new Ctor();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = navigator.language || "nl-NL";
    recognition.onresult = (event) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (!result || !result.isFinal) continue;
        const text = result[0].transcript.trim();
        if (!text) continue;
        const endMs = Date.now() - startedAt;
        segments.push({
          speaker,
          text,
          startMs: Math.max(0, endMs - 1500),
          endMs,
          lang: recognition?.lang,
        });
      }
    };
    recognition.onerror = () => {
      // Non-fatal — recognition can drop out mid-session (network hiccup,
      // silence timeout); whatever was captured before the error still ships.
    };
    recognition.start();
  }

  async function stop(): Promise<LiveRecordingResult> {
    const durationMs = startedAt ? Date.now() - startedAt : 0;
    teardown();
    return { segments: [...segments], durationMs };
  }

  function cancel(): void {
    teardown();
  }

  return { start, stop, cancel };
}

/** mm:ss for the live-recording timer. */
export function formatElapsed(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}
