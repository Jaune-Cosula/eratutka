import { useCallback, useState } from 'react';

/**
 * Which front-end the app renders: "Evo" (the Kenttäinstrumentti redesign, now the default)
 * or the long-standing "classic" UI, kept as a fallback behind `?ui=classic`. Deliberately a
 * *device* choice, not an account setting — it is never synced to Firestore and never flips
 * on another device.
 *
 * Precedence on load: a `?ui=evo` / `?ui=classic` URL parameter wins over localStorage, which
 * wins over the default of "evo".
 */
export type UiMode = 'classic' | 'evo';

const STORAGE_KEY = 'eratutka_ui_mode';

function readInitialMode(): UiMode {
  try {
    const param = new URL(window.location.href).searchParams.get('ui');
    if (param === 'evo' || param === 'classic') return param;
  } catch {}
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'evo' || saved === 'classic') return saved;
  } catch {}
  return 'evo';
}

export function useUiMode(): [UiMode, (mode: UiMode) => void] {
  const [mode, setMode] = useState<UiMode>(readInitialMode);

  const set = useCallback((next: UiMode) => {
    setMode(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {}
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('ui', next);
      window.history.replaceState(null, '', url.toString());
    } catch {}
  }, []);

  return [mode, set];
}
