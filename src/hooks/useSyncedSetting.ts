import { useCallback, useSyncExternalStore } from 'react';
import {
  SettingsKey,
  SettingsValue,
  getSnapshot,
  subscribe,
  updateSetting,
} from '../services/settingsService';

/**
 * Reads and writes one account-synced setting. Defaults live in settingsService; the value is
 * never undefined. Writes go to localStorage synchronously and to the account's cloud copy on
 * a short debounce (see settingsService).
 */
export function useSyncedSetting<K extends SettingsKey>(
  key: K
): [SettingsValue<K>, (value: SettingsValue<K>) => void] {
  useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const value = getSnapshot()[key] as SettingsValue<K>;
  const setValue = useCallback((next: SettingsValue<K>) => updateSetting(key, next), [key]);
  return [value, setValue];
}
