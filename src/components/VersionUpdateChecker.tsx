import React, { useEffect, useState, useRef } from 'react';
import { RefreshCw, Sparkles, X } from 'lucide-react';

interface VersionResponse {
  success: boolean;
  version: string;
  bootTime: number;
  timestamp: number;
}

/**
 * Offers an update when the server reports a different ERATUTKA_VERSION than the one
 * this page started on.
 *
 * Two deliberate behaviours:
 *
 *  - Only the version is compared, never `bootTime`. A boot time changes on every
 *    restart (a crash, a scale event, every dev file save), which used to reload hunters
 *    mid-hunt even though their client build had not changed.
 *  - The reload is never forced. An automatic countdown destroys unsaved UI state
 *    (ruler measurements, a half-placed annotation, an open dialog) in the middle of a
 *    hunt, so the hunter decides when to take it.
 */
export function VersionUpdateChecker() {
  // Version this page is running against; set once by the first successful check.
  const initialVersionRef = useRef<string | null>(null);
  // Version the hunter already chose to postpone, so the banner does not reappear.
  const dismissedVersionRef = useRef<string | null>(null);
  const isReloadingRef = useRef<boolean>(false);

  // Version offered in the full banner, and whether an update exists at all (for the pill).
  const [pendingVersion, setPendingVersion] = useState<string | null>(null);
  const [hasUpdate, setHasUpdate] = useState<boolean>(false);

  const checkVersion = async () => {
    try {
      const res = await fetch(`/api/app-version?_t=${Date.now()}`, {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache' },
      });
      if (!res.ok) return;
      const data: VersionResponse = await res.json();
      if (!data || !data.version) return;

      const version = String(data.version);

      if (initialVersionRef.current === null) {
        initialVersionRef.current = version;
        return;
      }

      // Still our build, or one the hunter already postponed.
      if (version === initialVersionRef.current || version === dismissedVersionRef.current) {
        return;
      }

      setPendingVersion(version);
      setHasUpdate(true);
    } catch (e) {
      // Offline or a network glitch: keep running on the current build.
    }
  };

  useEffect(() => {
    checkVersion();

    // Check periodically, and whenever the hunter returns to the app.
    const interval = setInterval(checkVersion, 45000);

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') checkVersion();
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', checkVersion);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', checkVersion);
    };
  }, []);

  const reload = () => {
    if (isReloadingRef.current) return;
    isReloadingRef.current = true;
    try {
      window.location.reload();
    } catch (e) {
      window.location.href = window.location.pathname + '?v=' + Date.now();
    }
  };

  const postpone = () => {
    dismissedVersionRef.current = pendingVersion;
    setPendingVersion(null);
    // Tell the session sync loop to stop mirroring to Firestore from this outdated build.
    // The in-memory relay and LocalStorage keep working, so the hunt stays live; only the
    // durable copy is held back until the reload.
    (window as any).__ERATUTKA_OUTDATED_CLIENT__ = true;
  };

  if (!hasUpdate) return null;

  // Postponed: leave a small, unobtrusive way back to the update.
  if (!pendingVersion) {
    return (
      <div className="fixed top-16 right-3 z-[3500] animate-fade-in">
        <button
          onClick={reload}
          className="flex items-center space-x-2 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-full shadow-lg border border-emerald-400/50 text-xs font-bold transition-all active:scale-95 cursor-pointer"
          title="Uusi versio saatavilla – päivitä kun sinulle sopii"
        >
          <RefreshCw className="w-3.5 h-3.5" style={{ animationDuration: '3s' }} />
          <span>Päivitä Erätutka</span>
        </button>
      </div>
    );
  }

  return (
    <div className="fixed top-3 left-1/2 transform -translate-x-1/2 z-[3500] w-[94%] max-w-md animate-fade-in">
      <div className="bg-stone-900/95 text-white border-2 border-emerald-500/80 rounded-2xl p-3.5 shadow-2xl backdrop-blur-md flex items-center justify-between space-x-3">
        <div className="flex items-center space-x-3 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center shrink-0">
            <Sparkles className="w-5 h-5 text-emerald-400" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center space-x-1.5">
              <span className="text-xs font-black text-emerald-400 uppercase tracking-wide">
                Uusi versio saatavilla
              </span>
              <span className="text-[10px] px-1.5 py-0.2 bg-emerald-950 text-emerald-300 rounded border border-emerald-800 font-mono">
                {pendingVersion}
              </span>
            </div>
            <p className="text-[11px] text-stone-300 truncate">
              Päivitä rauhassa — jahti jatkuu keskeytyksettä.
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-1.5 shrink-0">
          <button
            onClick={reload}
            className="flex items-center space-x-1 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl shadow transition-all active:scale-95 cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Päivitä nyt</span>
          </button>
          <button
            onClick={postpone}
            className="p-1.5 text-stone-400 hover:text-stone-200 rounded-lg hover:bg-stone-800 cursor-pointer"
            title="Myöhemmin"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
