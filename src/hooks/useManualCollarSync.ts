import { useEffect, useRef, useState } from 'react';
import { Dog } from '../types';
import { syncDogTelemetry } from '../services/collarService';

/**
 * Owns the small amount of UI state around a manual "refresh now" collar sync: the
 * in-flight flag, the feedback line, and the auto-dismiss timeout. The actual fetch and
 * telemetry mapping live in `syncDogTelemetry` so the classic radar panel and the Evo dog
 * detail share one implementation.
 */
export function useManualCollarSync(
  onUpdateDogTelemetry?: (dogId: string, updates: Partial<Dog>) => void
) {
  const [isSyncingGps, setIsSyncingGps] = useState(false);
  const [syncFeedback, setSyncFeedback] = useState<string | null>(null);
  const syncingRef = useRef(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const syncNow = async (dog: Dog) => {
    if (!onUpdateDogTelemetry || syncingRef.current) return;
    syncingRef.current = true;
    setIsSyncingGps(true);
    setSyncFeedback('Haetaan GPS-paikkatietoa palvelimelta...');

    try {
      const { updates, feedback } = await syncDogTelemetry(dog);
      if (updates) onUpdateDogTelemetry(dog.id, updates);
      setSyncFeedback(feedback);
    } finally {
      syncingRef.current = false;
      setIsSyncingGps(false);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => setSyncFeedback(null), 5000);
    }
  };

  const clearFeedback = () => setSyncFeedback(null);

  return { syncNow, isSyncingGps, syncFeedback, clearFeedback };
}
