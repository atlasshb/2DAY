"use client";

import { useEffect } from "react";
import { useStore } from "@/lib/store";

/** Fires the train leave-by nudge ~2.6s after the Route tab is first visited,
 *  mirroring the prototype's `go.trainShown` one-time setTimeout in go(). */
export function RouteEffects() {
  const { requestTrainNudge } = useStore();

  useEffect(() => {
    requestTrainNudge();
  }, [requestTrainNudge]);

  return null;
}
