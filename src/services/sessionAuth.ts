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

/**
 * Sealed restore token for the active hunt. Sent alongside the key so a server instance that
 * has never seen this hunt (restart, Cloud Run scale-to-zero) can rebuild it from the token.
 */
let activeRestoreToken: string | null = null;

export const setActiveRestoreToken = (token: string | null | undefined): void => {
  activeRestoreToken = token && String(token).trim() ? String(token).trim() : null;
};

export const getActiveRestoreToken = (): string | null => activeRestoreToken;

/** The signed-in user's uid, mirrored here so the delete path can carry it without prop drilling. */
let activeUid: string | null = null;

export const setActiveUid = (uid: string | null | undefined): void => {
  activeUid = uid && String(uid).trim() ? String(uid).trim() : null;
};

export const getActiveUid = (): string | null => activeUid;

/** Auth header for relay and device routes. Carries no key when no session is loaded yet. */
export const relayAuthHeaders = (): Record<string, string> => {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (activeHuntKey) headers['X-Hunt-Key'] = activeHuntKey;
  if (activeRestoreToken) headers['X-Hunt-Restore'] = activeRestoreToken;
  return headers;
};
