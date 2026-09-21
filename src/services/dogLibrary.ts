/**
 * The hunter's own collar library: the dogs they have configured but are NOT currently
 * sharing in a hunt.
 *
 * A library dog is deliberately absent from the session, so nothing about it is
 * transmitted and nobody else can see it in any form - not even as an undeclared entry.
 * That is what lets a hunter keep several collars (some at home) without broadcasting
 * where those collars are, and without deleting them to get them off the map.
 *
 * Stored on the device only. The cloud copy for signed-in users is the existing
 * `users/{uid}/dogs` collection, which is left to `saveDogToUserFirebase`.
 */
import { Dog } from '../types';
import { getDogIdentifiers } from '../utils/geoUtils';

const DOG_LIBRARY_STORAGE_KEY = 'eratutka_dog_library';

/** Reads the collar library. Never throws: a broken entry yields an empty library. */
export function readDogLibrary(): Dog[] {
  try {
    if (typeof localStorage === 'undefined') return [];
    const raw = localStorage.getItem(DOG_LIBRARY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((dog): dog is Dog => Boolean(dog && typeof dog === 'object' && dog.id));
  } catch (e) {
    return [];
  }
}

/** Replaces the stored collar library. Never throws. */
export function writeDogLibrary(dogs: Dog[]): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(DOG_LIBRARY_STORAGE_KEY, JSON.stringify(dogs || []));
  } catch (e) {
    // Quota exceeded or storage unavailable: the in-memory library stays authoritative
  }
}

/**
 * Merges collars into the library, keeping one entry per physical collar: an incoming
 * collar that is already stored replaces its entry instead of being added again.
 *
 * Matching runs on the collar identifier set rather than `id` alone, because a dog's `id`
 * is minted from a timestamp (`dog-real-...`) every time it is added - the same collar
 * carried over from another hunt arrives under a new `id`, and keying on it alone would
 * quietly grow the library with duplicates. Names are never used to match.
 */
export function mergeIntoDogLibrary(library: Dog[], incoming: Dog[]): Dog[] {
  const next = [...(library || [])];
  const indexOf = new Map<string, number>();
  next.forEach((entry, i) => {
    getDogIdentifiers(entry).forEach((id) => indexOf.set(id, i));
  });

  for (const dog of incoming || []) {
    if (!dog || !dog.id) continue;
    const identifiers = getDogIdentifiers(dog);
    const existing = identifiers
      .map((id) => indexOf.get(id))
      .find((i) => i !== undefined);

    if (existing !== undefined) {
      next[existing] = dog;
    } else {
      next.push(dog);
    }
    // Point every identifier at the entry's final position, so a collar whose `id` was not
    // in the index is still recognized on the next incoming copy.
    const position = existing !== undefined ? existing : next.length - 1;
    identifiers.forEach((id) => indexOf.set(id, position));
  }

  return next;
}
