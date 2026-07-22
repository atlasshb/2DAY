"use client";

/**
 * Minimal `dexie-react-hooks`-style bridge — reactively re-runs a Dexie query
 * whenever the tables it touched change, using `liveQuery` from the `dexie`
 * package itself (already a dependency; this is not a new one).
 */
import { useEffect, useState } from "react";
import { liveQuery } from "dexie";

export function useLiveQuery<T>(
  querier: () => Promise<T> | T,
  deps: React.DependencyList,
  initial: T,
): T {
  const [value, setValue] = useState<T>(initial);

  useEffect(() => {
    const subscription = liveQuery(querier).subscribe({
      next: setValue,
      error: (err) => console.error("useLiveQuery", err),
    });
    return () => subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return value;
}
