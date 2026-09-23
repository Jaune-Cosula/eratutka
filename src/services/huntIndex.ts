/**
 * The hunts this device has taken part in, read from its own storage.
 *
 * There is no other source. The server keeps its sessions in memory and Firestore denies
 * `list`, so a client can never enumerate hunts - by design, since knowing a hunt's key is what
 * grants access to it. What the device does keep is one set of keys per hunt it has touched,
 * with the hunt code in the key names, which is enough to show what is stored here and to let
 * the hunter clear out the hunts they no longer care about.
 *
 * What clearing can and cannot do is worth being precise about:
 *   * it frees this device, which is where the space has actually run out;
 *   * the cloud copy cannot be deleted from the browser (`allow delete: if false`), so those
 *     documents still need the Firebase console or a TTL policy;
 *   * an old hunt cannot be reopened from this list either - the capability key is stripped
 *     before a session is stored, so returning to a hunt takes its share link or code + PIN.
 */
import { Dog, MapAnnotation } from '../types';

const HUNT_KEY_KINDS = ['dogs', 'session', 'annotations', 'team', 'radio', 'hidden_dogs'];

export interface StoredHunt {
  code: string;
  name?: string;
  /** When this device last wrote anything for the hunt. */
  lastUsedAt?: number;
  bytes: number;
  dogCount: number;
  annotationCount: number;
}

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

/** The hunts stored on this device, most recently used first. */
export function listStoredHunts(): StoredHunt[] {
  if (typeof localStorage === 'undefined') return [];

  const codes = new Set<string>();
  for (const key of Object.keys(localStorage)) {
    for (const kind of HUNT_KEY_KINDS) {
      const prefix = `eratutka_${kind}_`;
      if (!key.startsWith(prefix)) continue;
      const code = key.slice(prefix.length);
      // DEFAULT is the bucket for "not in a hunt", not a hunt.
      if (code && code !== 'DEFAULT') codes.add(code);
    }
  }

  const hunts: StoredHunt[] = [];
  for (const code of codes) {
    let bytes = 0;
    for (const kind of HUNT_KEY_KINDS) {
      bytes += localStorage.getItem(`eratutka_${kind}_${code}`)?.length || 0;
    }

    const blob = readJson<{ updatedAt?: number; sessionInfo?: { name?: string } }>(
      `eratutka_session_${code}`
    );
    const dogs = readJson<Dog[]>(`eratutka_dogs_${code}`);
    const annotations = readJson<MapAnnotation[]>(`eratutka_annotations_${code}`);

    hunts.push({
      code,
      name: blob?.sessionInfo?.name,
      lastUsedAt: blob?.updatedAt,
      bytes,
      dogCount: Array.isArray(dogs) ? dogs.length : 0,
      annotationCount: Array.isArray(annotations) ? annotations.length : 0,
    });
  }

  return hunts.sort((a, b) => (b.lastUsedAt || 0) - (a.lastUsedAt || 0));
}

/**
 * Forgets one hunt on this device.
 *
 * `keepCode` is the hunt currently open. Dropping that one would leave the app running a
 * session whose stored state is gone, so it is refused here rather than left to the caller to
 * remember.
 */
export function forgetStoredHunt(code: string, keepCode?: string): void {
  if (typeof localStorage === 'undefined' || !code || code === keepCode) return;
  for (const kind of HUNT_KEY_KINDS) {
    try {
      localStorage.removeItem(`eratutka_${kind}_${code}`);
    } catch {}
  }
}
