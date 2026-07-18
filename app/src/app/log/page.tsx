import { AddressScrubber } from "@/components/log/AddressScrubber";
import { OutcomeButtons } from "@/components/log/OutcomeButtons";
import { CoachRecorder } from "@/components/coach/CoachRecorder";

export default function LogPage() {
  return (
    <section className="screen" aria-label="Log a door">
      <AddressScrubber />
      <CoachRecorder />
      <OutcomeButtons />
      <p className="sub" style={{ textAlign: "center", fontSize: 13 }}>
        One tap logs &amp; advances · hold a button for note
      </p>
    </section>
  );
}
