/**
 * User-level settings store, kept in sync with the account's `users/{uid}.settings` map.
 *
 * Framework-agnostic singleton (same idiom as `setActiveHuntKey` in userService.ts) so both
 * React components (via useSyncedSetting) and non-React code can read/write it, and so it does
 * not depend on the React provider order - LanguageProvider wraps App, but the signed-in user
 * lives inside App.
 *
 * localStorage is always the source of truth on this device: every write lands there first so
 * it survives offline and quota exhaustion, and the cloud copy is a best-effort mirror.
 */
import { UserSettings, saveUserSettings, readCachedUserSettings } from './userService';
import { MapLayerType } from '../types';

export type SettingsKey = keyof UserSettings;
export type SettingsValue<K extends SettingsKey> = Required<UserSettings>[K];

export const SETTINGS_KEYS: SettingsKey[] = [
  'language',
  'mapLayer',
  'showPropertyBoundaries',
  'mmlSource',
  'mmlApiKey',
];

const STORAGE_KEY: Record<SettingsKey, string> = {
  language: 'eratutka_language',
  mapLayer: 'eratutka_map_layer',
  showPropertyBoundaries: 'eratutka_show_kiinteistorajat',
  mmlSource: 'eratutka_mml_source',
  mmlApiKey: 'eratutka_mml_key',
};

const MAP_LAYERS: MapLayerType[] = [
  'topo',
  'mml_maasto',
  'mml_tausta',
  'opentopo',
  'osm',
  'satellite',
  'dark',
];

/** Which user's settings were last reconciled on this device, to avoid seeding across accounts. */
const OWNER_STORAGE_KEY = 'eratutka_settings_owner';

const CLOUD_PUSH_DEBOUNCE_MS = 800;

// ---------------------------------------------------------------------------
// Defaults & validation
// ---------------------------------------------------------------------------

function isValidValue(key: SettingsKey, value: unknown): boolean {
  switch (key) {
    case 'language':
      return value === 'fi' || value === 'en';
    case 'mapLayer':
      return typeof value === 'string' && (MAP_LAYERS as string[]).includes(value);
    case 'showPropertyBoundaries':
      return typeof value === 'boolean';
    case 'mmlSource':
      return value === 'kapsi' || value === 'custom';
    case 'mmlApiKey':
      return typeof value === 'string';
    default:
      return false;
  }
}

function defaultState(): Required<UserSettings> {
  return {
    language: 'fi',
    mapLayer: 'mml_maasto',
    showPropertyBoundaries: true,
    mmlSource: 'kapsi',
    mmlApiKey: '',
  };
}

function readRaw(key: SettingsKey): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY[key]);
  } catch {
    return null;
  }
}

/** Reads the current device's values, applying per-key defaults (incl. the derived mmlSource). */
function readStateFromStorage(): Required<UserSettings> {
  const defaults = defaultState();
  const rawKey = readRaw('mmlApiKey');
  const mmlApiKey = typeof rawKey === 'string' ? rawKey : defaults.mmlApiKey;
  // `mmlSource`'s default is derived: a stored custom key implies the custom source.
  const rawSource = readRaw('mmlSource');
  const mmlSource =
    rawSource === 'kapsi' || rawSource === 'custom'
      ? rawSource
      : mmlApiKey
      ? 'custom'
      : 'kapsi';

  const rawLang = readRaw('language');
  const rawLayer = readRaw('mapLayer');
  const rawBounds = readRaw('showPropertyBoundaries');

  return {
    language: rawLang === 'en' || rawLang === 'fi' ? rawLang : defaults.language,
    mapLayer:
      typeof rawLayer === 'string' && (MAP_LAYERS as string[]).includes(rawLayer)
        ? (rawLayer as MapLayerType)
        : defaults.mapLayer,
    showPropertyBoundaries: rawBounds !== null ? rawBounds === 'true' : defaults.showPropertyBoundaries,
    mmlSource,
    mmlApiKey,
  };
}

// ---------------------------------------------------------------------------
// Module state
// ---------------------------------------------------------------------------

let uid: string | null = null;
let loaded = false;
let state: Required<UserSettings> = readStateFromStorage();
const subscribers = new Set<() => void>();
let pushTimer: ReturnType<typeof setTimeout> | null = null;

function notify(): void {
  subscribers.forEach((cb) => cb());
}

function writeKeyLocal(key: SettingsKey, value: SettingsValue<SettingsKey>): void {
  try {
    localStorage.setItem(STORAGE_KEY[key], String(value));
  } catch {}
}

export function subscribe(cb: () => void): () => void {
  subscribers.add(cb);
  return () => subscribers.delete(cb);
}

/** Stable snapshot for useSyncExternalStore; only replaced when a value actually changes. */
export function getSnapshot(): Required<UserSettings> {
  return state;
}

// ---------------------------------------------------------------------------
// Cloud push (debounced, best-effort)
// ---------------------------------------------------------------------------

function flushCloudPush(): void {
  if (pushTimer) {
    clearTimeout(pushTimer);
    pushTimer = null;
  }
  // Re-check at fire time: this may run from a timer after logout or a user switch.
  if (!loaded || !uid) return;
  saveUserSettings(uid, { ...state });
}

function scheduleCloudPush(): void {
  if (!loaded || !uid) return;
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(flushCloudPush, CLOUD_PUSH_DEBOUNCE_MS);
}

if (typeof window !== 'undefined') {
  // Flush a pending write when the page is hidden/closed. `pagehide`/`visibilitychange` are
  // used instead of `beforeunload`, which is unreliable on mobile Safari.
  const flush = () => {
    if (pushTimer) flushCloudPush();
  };
  window.addEventListener('pagehide', flush);
  window.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush();
  });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Updates one setting: memory + localStorage synchronously, then a debounced cloud mirror.
 * Before the account's settings are reconciled (`loaded`), the cloud push is skipped so the
 * local defaults cannot overwrite the cloud copy.
 */
export function updateSetting<K extends SettingsKey>(key: K, value: SettingsValue<K>): void {
  if (!isValidValue(key, value)) return;
  if (state[key] === value) return;
  state = { ...state, [key]: value };
  writeKeyLocal(key, value);
  notify();
  scheduleCloudPush();
}

function applySettings(settings: UserSettings): void {
  const next = { ...state };
  let changed = false;
  for (const key of SETTINGS_KEYS) {
    const value = settings[key];
    if (value !== undefined && isValidValue(key, value) && next[key] !== value) {
      Object.assign(next, { [key]: value });
      writeKeyLocal(key, value as SettingsValue<SettingsKey>);
      changed = true;
    }
  }
  if (changed) {
    state = next;
    notify();
  }
}

function resetToDefaults(): void {
  const defaults = defaultState();
  state = defaults;
  for (const key of SETTINGS_KEYS) writeKeyLocal(key, defaults[key]);
  notify();
}

function hasAnyField(settings: UserSettings | null | undefined): boolean {
  if (!settings) return false;
  return SETTINGS_KEYS.some((key) => settings[key] !== undefined);
}

function readOwner(): string | null {
  try {
    return localStorage.getItem(OWNER_STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeOwner(value: string): void {
  try {
    localStorage.setItem(OWNER_STORAGE_KEY, value);
  } catch {}
}

/**
 * Called from the auth listener after login, once the profile (and its `settings`) is known.
 *
 * Precedence: cloud settings win; otherwise the user's own last local snapshot (offline);
 * otherwise seed the cloud from this device's current values - but only if the device is not
 * carrying a *different* user's values, so a shared device cannot leak one hunter's settings
 * (notably the MML API key) into the next account.
 */
export function reconcileOnLogin(newUid: string, cloudSettings?: UserSettings | null): void {
  uid = newUid;
  loaded = false;

  let shouldPush = false;

  if (hasAnyField(cloudSettings)) {
    applySettings(cloudSettings!);
  } else {
    const cached = readCachedUserSettings(newUid);
    if (hasAnyField(cached)) {
      applySettings(cached!);
      shouldPush = true;
    } else {
      const owner = readOwner();
      if (owner && owner !== newUid) {
        resetToDefaults();
      } else {
        // First login for this user on this device: keep the current local values and seed them.
        shouldPush = true;
      }
    }
  }

  writeOwner(newUid);
  loaded = true;
  if (shouldPush) flushCloudPush();
}

/** Called on logout: stop pushing, but keep local values so the device keeps working offline. */
export function setSettingsUid(newUid: string | null): void {
  uid = newUid;
  loaded = false;
  if (pushTimer) {
    clearTimeout(pushTimer);
    pushTimer = null;
  }
}
