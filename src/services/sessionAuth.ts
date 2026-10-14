/**
 * The active session's capability key, kept in a leaf module so low-level services
 * (collarService) can attach the X-Hunt-Key header without importing userService — importing
 * userService there would close a module cycle (userService -> geoUtils -> collarService).
 *
 * userService re-exports these and additionally mirrors the key into the delete-registry secret.
 */
let activeHuntKey: string | null = null;

export const setActiveHuntKey = (huntKey: string | null | undefined): void => {
  activeHuntKey = huntKey && String(huntKey).trim() ? String(huntKey).trim() : null;
};

export const getActiveHuntKey = (): string | null => activeHuntKey;

/** Auth header for relay and device routes. Carries no key when no session is loaded yet. */
export const relayAuthHeaders = (): Record<string, string> => {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (activeHuntKey) headers['X-Hunt-Key'] = activeHuntKey;
  return headers;
};
