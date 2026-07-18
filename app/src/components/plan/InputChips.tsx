import { planInputChips } from "@/lib/mock";

export function InputChips() {
  return (
    <div className="chips">
      {planInputChips.map((chip) => (
        <span
          key={chip.icon + chip.label}
          className="pill"
          style={chip.emphasis ? { borderColor: "var(--accent)", color: "var(--accent)" } : undefined}
        >
          {chip.icon} {chip.prefix}
          {chip.bold ? <b>{chip.label}</b> : chip.label}
        </span>
      ))}
    </div>
  );
}
