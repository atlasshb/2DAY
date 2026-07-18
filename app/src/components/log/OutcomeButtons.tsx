"use client";

import type { OutcomeButtonConfig } from "@/lib/mock";
import { outcomeButtons } from "@/lib/mock";
import { useStore } from "@/lib/store";

/** First three outcomes get full-width rows sized by tap frequency
 *  (No answer largest, then Conversation/Sale); the remaining four share a
 *  2×2 grid — matches prototype/index.html's #logbtns exactly. */
const FULL_WIDTH_COUNT = 3;

export function OutcomeButtons() {
  const { logOutcome } = useStore();

  const fullWidthButtons = outcomeButtons.slice(0, FULL_WIDTH_COUNT);
  const gridButtons = outcomeButtons.slice(FULL_WIDTH_COUNT);
  const gridRows: OutcomeButtonConfig[][] = [];
  for (let i = 0; i < gridButtons.length; i += 2) {
    gridRows.push(gridButtons.slice(i, i + 2));
  }

  function OutcomeButton({ btn }: { btn: OutcomeButtonConfig }) {
    return (
      <button
        type="button"
        className={`lb ${btn.size}`}
        style={{ background: `var(${btn.colorVar})` }}
        data-o={btn.label}
        onClick={() => logOutcome(btn.outcome, btn.label)}
      >
        {btn.key && <span className="k">{btn.key}</span>}
        {btn.label}
        {btn.sub && <small>{btn.sub}</small>}
      </button>
    );
  }

  return (
    <div className="logbtns" id="logbtns">
      {fullWidthButtons.map((btn) => (
        <OutcomeButton key={btn.outcome} btn={btn} />
      ))}
      {gridRows.map((row) => (
        <div className="lbrow" key={row.map((b) => b.outcome).join("-")}>
          {row.map((btn) => (
            <OutcomeButton key={btn.outcome} btn={btn} />
          ))}
        </div>
      ))}
    </div>
  );
}
