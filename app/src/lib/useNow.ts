"use client";

import { useEffect, useState } from "react";

/** A `Date` that ticks every `intervalMs` — the one place components ask
 *  "what time is it really" instead of reading a fixed fixture (StatusStrip's
 *  clock, Today's real work-hours progress). */
export function useNow(intervalMs = 30_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
