import type { Dog } from '../types';

/**
 * Fields a hunt participant is allowed to receive over the relay and in the shared
 * `sessions/{huntKey}` document. Owner-only identifiers and diagnostics (imei, simNumber,
 * collarId, directGpsId, gatewayServerUrl, tractive*, rawPayload, the diagnostics block and
 * telematicsProvider) are deliberately absent: the projection is an ALLOWLIST, so any
 * owner-only field added later is stripped by default.
 *
 * `id` and `addedByUid` are kept on purpose as mechanic fields:
 *  - `id` is the stable correlation key (map key, merge, delete matching, H3 ownership lookup);
 *  - `addedByUid` powers the phase-2 H3 ownership check and the client delete pre-check, and
 *    must round-trip through non-owner re-pushes so the server store keeps the owner stamp.
 * (A session-scoped opaque id to replace `id` on the wire is deferred to the token phase.)
 */
export const VIEWER_DOG_FIELDS: readonly string[] = [
  'id',
  'name',
  'breed',
  'color',
  'status',
  'lat',
  'lng',
  'battery',
  'signal',
  'speed',
  'heading',
  'barkRate',
  'barkHoldRemainingFixes',
  'lastBarkTimestamp',
  'recentBarkRate',
  'trackHistory',
  'lastUpdated',
  'distanceFromUser',
  'bearingFromUser',
  'isActive',
  'barkAlertEnabled',
  'standAlertEnabled',
  // Manual bark marker is hunt content shared by every participant (see the toggle in the list).
  'manualBarkActive',
  'manualBarkBy',
  'manualBarkAt',
  'manualBarkBouts',
  'trackerModel',
  'addedBy',
  'addedByUid',
  'autoSyncEnabled',
  'trackingIntervalSec',
  'odometerResetTimestamp',
];

/**
 * Returns a new object containing only the allowlisted own fields whose value is defined.
 * Omitted fields are never assigned `undefined` (Firestore/spread-safe) and the result is
 * idempotent, so it is safe to apply at every wire boundary.
 */
export function projectDogForViewer(dog: Dog | null | undefined): Dog {
  const source = (dog || {}) as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const field of VIEWER_DOG_FIELDS) {
    const value = source[field];
    if (value !== undefined) out[field] = value;
  }
  return out as unknown as Dog;
}
