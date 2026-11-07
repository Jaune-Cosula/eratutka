import { useEffect, useState } from 'react';

/**
 * Re-renders the caller on a timer and returns the current time, so time-derived figures (an
 * open bark bout, "time ago" labels) keep moving even when no telemetry update arrives.
 */
export function useNow(intervalMs: number = 10000): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);

  return now;
}
