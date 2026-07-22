"use client";

/** Opens the Day Setup wizard in a portal (same escape-the-scroll-clip
 *  pattern as CoachRecorder — see its comment). Used for both the very
 *  first "Set up my day" and the re-runnable "Edit my day" affordance
 *  (WIZARD-BRIEF: "re-runnable via an Edit my day affordance on Today"). */
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { DaySetupWizard } from "./DaySetupWizard";
import type { DayProfileRow } from "@/lib/offline/db";

export function EditDayButton({
  existing,
  label = "Edit my day",
  className = "ghost",
  testId = "edit-day-btn",
}: {
  existing?: DayProfileRow | null;
  label?: string;
  className?: string;
  testId?: string;
}) {
  const [open, setOpen] = useState(false);
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setPortalTarget(document.getElementById("app"));
  }, []);

  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)} data-testid={testId}>
        {label}
      </button>
      {open &&
        portalTarget &&
        createPortal(
          <>
            <div className="recbackdrop" onClick={() => setOpen(false)} />
            <DaySetupWizard existing={existing} onClose={() => setOpen(false)} onSaved={() => setOpen(false)} />
          </>,
          portalTarget,
        )}
    </>
  );
}
