"use client";

import { useState } from "react";
import type { ConsentState } from "@2day/core";

const CONSENT_COPY: Record<ConsentState, { icon: string; label: string }> = {
  resident_informed: { icon: "🎙️", label: "Resident informed" },
  notes_only: { icon: "🔒", label: "Notes only (my voice)" },
};

export function ConsentChip({
  value,
  onChange,
  disabled = false,
}: {
  value: ConsentState;
  onChange: (next: ConsentState) => void;
  disabled?: boolean;
}) {
  const [showPrivacy, setShowPrivacy] = useState(false);
  const other: ConsentState = value === "notes_only" ? "resident_informed" : "notes_only";
  const copy = CONSENT_COPY[value];

  return (
    <div className="consentblock">
      <button
        type="button"
        className={`consentchip${value === "resident_informed" ? " informed" : ""}`}
        data-testid="consent-chip"
        aria-pressed={value === "resident_informed"}
        disabled={disabled}
        onClick={() => onChange(other)}
      >
        <span aria-hidden="true">{copy.icon}</span>
        {copy.label}
        <span className="consentswap" aria-hidden="true">
          ⇄
        </span>
      </button>
      <p className="consentcopy">
        <b>Resident informed</b> captures both voices; <b>Notes only</b> records just your own
        recap after the door.{" "}
        <button
          type="button"
          className="privacylink"
          aria-expanded={showPrivacy}
          onClick={() => setShowPrivacy((v) => !v)}
        >
          privacy
        </button>
      </p>
      {showPrivacy && (
        <p className="privacydetail">
          Audio never leaves this phone and is deleted the moment it&apos;s transcribed — only the
          text transcript and analysis sync.
        </p>
      )}
    </div>
  );
}
