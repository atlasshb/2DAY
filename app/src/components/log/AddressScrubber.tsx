"use client";

import { useStore } from "@/lib/store";

export function AddressScrubber() {
  const { addr, goPrevDoor, goNextDoor } = useStore();

  return (
    <div className="addr">
      <button
        type="button"
        className="addrbtn"
        aria-label="Previous door"
        disabled={addr.doorIdx <= 1}
        onClick={goPrevDoor}
      >
        ‹
      </button>
      <div className="addrmain">
        <div className="addrst">
          {addr.street} {addr.houseNo}
        </div>
        <div className="addrmeta">{addr.meta}</div>
      </div>
      <button
        type="button"
        className="addrbtn"
        aria-label="Next door"
        disabled={addr.doorIdx >= addr.total}
        onClick={goNextDoor}
      >
        ›
      </button>
    </div>
  );
}
