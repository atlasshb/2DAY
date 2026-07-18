import { AddressScrubber } from "@/components/log/AddressScrubber";
import { OutcomeButtons } from "@/components/log/OutcomeButtons";

export default function LogPage() {
  return (
    <section className="screen" aria-label="Log a door">
      <AddressScrubber />
      <OutcomeButtons />
      <p className="sub" style={{ textAlign: "center", fontSize: 13 }}>
        One tap logs &amp; advances · hold a button for note
      </p>
    </section>
  );
}
