import { MapAnnotation, Dog, DogTrackPoint } from '../types';
import { extractTractiveToken } from '../services/collarService';

/**
 * Calculates distance between two WGS84 coordinates in meters (Haversine formula).
 */
export function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000; // Earth radius in meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

/**
 * Formats distance nicely (e.g. 450 m or 2.4 km).
 */
export function formatDistance(meters: number): string {
  if (meters < 1000) {
    return `${meters} m`;
  }
  return `${(meters / 1000).toFixed(2)} km`;
}

/**
 * Calculates bearing (0-360 degrees) from point 1 to point 2.
 */
export function calculateBearing(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x =
    Math.cos(φ1) * Math.sin(φ2) -
    Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);

  const θ = Math.atan2(y, x);
  const bearing = ((θ * 180) / Math.PI + 360) % 360;
  return Math.round(bearing);
}

/**
 * Returns Finnish compass direction string from bearing.
 */
export function getCompassDirection(bearing: number): string {
  const directions = [
    { name: 'Pohjoinen (P)', min: 337.5, max: 360 },
    { name: 'Pohjoinen (P)', min: 0, max: 22.5 },
    { name: 'Koillinen (KO)', min: 22.5, max: 67.5 },
    { name: 'Itä (I)', min: 67.5, max: 112.5 },
    { name: 'Kaakko (KK)', min: 112.5, max: 157.5 },
    { name: 'Etelä (E)', min: 157.5, max: 202.5 },
    { name: 'Lounas (LO)', min: 202.5, max: 247.5 },
    { name: 'Länsi (L)', min: 247.5, max: 292.5 },
    { name: 'Luode (LD)', min: 292.5, max: 337.5 },
  ];

  for (const d of directions) {
    if (bearing >= d.min && bearing < d.max) {
      return d.name;
    }
  }
  return 'Pohjoinen (P)';
}

/**
 * Inverse conversion: Converts Finnish ETRS-TM35FIN (EPSG:3067) metric coordinates to WGS84 (lat, lng).
 */
export function etrsTm35FinToWgs84(easting: number, northing: number): { lat: number; lng: number } {
  const a = 6378137.0; // GRS80 / WGS84 semi-major axis
  const f = 1 / 298.257222101;
  const e2 = 2 * f - f * f;
  const k0 = 0.9996;
  const lon0 = (27 * Math.PI) / 180; // Central meridian 27°E
  const E0 = 500000;

  const e_prime2 = e2 / (1 - e2);
  const M = northing / k0;

  const mu = M / (a * (1 - e2 / 4 - (3 * e2 * e2) / 64 - (5 * e2 * e2 * e2) / 256));
  const e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));

  const phi1 =
    mu +
    ((3 * e1) / 2 - (27 * Math.pow(e1, 3)) / 32) * Math.sin(2 * mu) +
    ((21 * Math.pow(e1, 2)) / 16 - (55 * Math.pow(e1, 4)) / 32) * Math.sin(4 * mu) +
    ((151 * Math.pow(e1, 3)) / 96) * Math.sin(6 * mu) +
    ((1097 * Math.pow(e1, 4)) / 512) * Math.sin(8 * mu);

  const C1 = e_prime2 * Math.pow(Math.cos(phi1), 2);
  const T1 = Math.pow(Math.tan(phi1), 2);
  const N1 = a / Math.sqrt(1 - e2 * Math.pow(Math.sin(phi1), 2));
  const R1 = (a * (1 - e2)) / Math.pow(1 - e2 * Math.pow(Math.sin(phi1), 2), 1.5);
  const D = (easting - E0) / (N1 * k0);

  const lat =
    phi1 -
    ((N1 * Math.tan(phi1)) / R1) *
      (Math.pow(D, 2) / 2 -
        (5 + 3 * T1 + 10 * C1 - 4 * Math.pow(C1, 2) - 9 * e_prime2) * (Math.pow(D, 4) / 24) +
        (61 + 90 * T1 + 298 * C1 + 45 * Math.pow(T1, 2) - 252 * e_prime2 - 3 * Math.pow(C1, 2)) *
          (Math.pow(D, 6) / 720));

  const lon =
    lon0 +
    (D -
      (1 + 2 * T1 + C1) * (Math.pow(D, 3) / 6) +
      (5 - 2 * C1 + 28 * T1 - 3 * Math.pow(C1, 2) + 8 * e_prime2 + 24 * Math.pow(T1, 2)) *
        (Math.pow(D, 5) / 120)) /
      Math.cos(phi1);

  return {
    lat: (lat * 180) / Math.PI,
    lng: (lon * 180) / Math.PI,
  };
}

/**
 * Normalizes any coordinate pair from either WGS84 [lng, lat] / [lat, lng] or ETRS-TM35FIN [E, N] into WGS84 { lat, lng }.
 */
export function normalizeCoordinate(coord: any): { lat: number; lng: number } | null {
  if (!coord) return null;
  let a: number;
  let b: number;

  if (Array.isArray(coord) && coord.length >= 2) {
    a = Number(coord[0]);
    b = Number(coord[1]);
  } else if (typeof coord === 'object' && ('lat' in coord || 'latitude' in coord)) {
    const latVal = Number(coord.lat ?? coord.latitude);
    const lngVal = Number(coord.lng ?? coord.lon ?? coord.longitude);
    return normalizeCoordinate([lngVal, latVal]);
  } else if (typeof coord === 'object' && ('x' in coord && 'y' in coord)) {
    a = Number(coord.x);
    b = Number(coord.y);
  } else {
    return null;
  }

  if (isNaN(a) || isNaN(b)) return null;

  // Check if coordinates are Finnish metric coordinates ETRS-TM35FIN (EPSG:3067)
  // Easting is typically 50,000 - 850,000 and Northing is 6,500,000 - 7,800,000
  if (b > 5000000 && a < 1500000) {
    // Standard [Easting, Northing]
    return etrsTm35FinToWgs84(a, b);
  }
  if (a > 5000000 && b < 1500000) {
    // Swapped [Northing, Easting]
    return etrsTm35FinToWgs84(b, a);
  }

  // WGS84: Check if [lat, lng] where lat is Finland's ~59-71 and lng is ~19-33
  if (a >= 58 && a <= 72 && b >= 15 && b <= 35) {
    return { lat: a, lng: b };
  }

  // Standard GeoJSON is [lng, lat]
  if (b >= 58 && b <= 72 && a >= 15 && a <= 35) {
    return { lat: b, lng: a };
  }

  // Generic fallback if within world bounds
  if (Math.abs(b) <= 90 && Math.abs(a) <= 180) {
    return { lat: b, lng: a };
  }
  if (Math.abs(a) <= 90 && Math.abs(b) <= 180) {
    return { lat: a, lng: b };
  }

  return null;
}

/**
 * Calculates polygon area in hectares using geodesic approximation.
 */
export function calculatePolygonHectares(coords: [number, number][]): number {
  if (!coords || coords.length < 3) return 0;
  let area = 0;
  const len = coords.length;
  for (let i = 0; i < len; i++) {
    const p1 = coords[i];
    const p2 = coords[(i + 1) % len];
    const x1 = (p1[1] * Math.PI) / 180;
    const y1 = (p1[0] * Math.PI) / 180;
    const x2 = (p2[1] * Math.PI) / 180;
    const y2 = (p2[0] * Math.PI) / 180;
    area += (x2 - x1) * (2 + Math.sin(y1) + Math.sin(y2));
  }
  area = (Math.abs(area) * 6378137.0 * 6378137.0) / 2.0;
  return Math.round((area / 10000) * 10) / 10; // Hectares rounded to 1 decimal
}

/**
 * Approximate conversion from WGS84 to Finnish ETRS-TM35FIN grid coordinates.
 */
export function wgs84ToEtrsTm35Fin(lat: number, lon: number): { n: number; e: number; text: string } {
  // Approximate projection formula for Finnish territory centered on 27°E
  const latRad = (lat * Math.PI) / 180;
  const lonRad = (lon * Math.PI) / 180;
  const lon0 = (27 * Math.PI) / 180; // Central meridian

  const k0 = 0.9996;
  const a = 6378137.0; // WGS84 ellipsoid
  const f = 1 / 298.257223563;
  const e2 = 2 * f - f * f;

  const Δlon = lonRad - lon0;
  const N = a / Math.sqrt(1 - e2 * Math.sin(latRad) * Math.sin(latRad));
  const T = Math.tan(latRad) * Math.tan(latRad);
  const C = (e2 / (1 - e2)) * Math.cos(latRad) * Math.cos(latRad);
  const A = Δlon * Math.cos(latRad);

  const M =
    a *
    ((1 - e2 / 4 - (3 * e2 * e2) / 64 - (5 * e2 * e2 * e2) / 256) * latRad -
      ((3 * e2) / 8 + (3 * e2 * e2) / 32 + (45 * e2 * e2 * e2) / 1024) * Math.sin(2 * latRad) +
      ((15 * e2 * e2) / 256 + (45 * e2 * e2 * e2) / 1024) * Math.sin(4 * latRad) -
      ((35 * e2 * e2 * e2) / 3072) * Math.sin(6 * latRad));

  const easting =
    500000 +
    k0 *
      N *
      (A +
        ((1 - T + C) * A * A * A) / 6 +
        ((5 - 18 * T + T * T + 72 * C - 58 * e2) * A * A * A * A * A) / 120);

  const northing =
    k0 *
    (M +
      N *
        Math.tan(latRad) *
        ((A * A) / 2 +
          ((5 - T + 9 * C + 4 * C * C) * A * A * A * A) / 24 +
          ((61 - 58 * T + T * T + 600 * C - 330 * e2) * A * A * A * A * A * A) / 720));

  const nInt = Math.round(northing);
  const eInt = Math.round(easting);

  return {
    n: nInt,
    e: eInt,
    text: `ETRS-TM35FIN: N ${nInt} E ${eInt}`,
  };
}

/**
 * Calculates estimated walking time in minutes based on distance (assuming ~4 km/h in forest terrain).
 */
export function calculateWalkTimeMinutes(distanceMeters: number): number {
  const speedMetersPerMinute = (4.0 * 1000) / 60; // 4 km/h
  return Math.ceil(distanceMeters / speedMetersPerMinute);
}

/**
 * Maximum retention age of a dog's track points on the map and in memory (12 hours).
 * Older track points automatically age and are pruned.
 */
export const DOG_TRACK_MAX_AGE_MS = 12 * 60 * 60 * 1000;

/**
 * Prunes expired dog track history points older than maxAgeMs (default 12 hours).
 * Also filters out any invalid/NaN coordinates or (0,0).
 */
export function pruneExpiredTrackPoints(
  trackHistory: DogTrackPoint[],
  maxAgeMs: number = DOG_TRACK_MAX_AGE_MS,
  now: number = Date.now()
): DogTrackPoint[] {
  if (!Array.isArray(trackHistory) || trackHistory.length === 0) return [];
  const cutoff = now - maxAgeMs;
  return trackHistory.filter((pt) => {
    if (
      typeof pt.lat !== 'number' ||
      typeof pt.lng !== 'number' ||
      isNaN(pt.lat) ||
      isNaN(pt.lng) ||
      (pt.lat === 0 && pt.lng === 0)
    ) {
      return false;
    }
    return (pt.timestamp || 0) >= cutoff;
  });
}

/**
 * Calculates total odometer distance (in meters) from dog's track history points.
 * Respects optional odometerResetTimestamp and 12-hour track retention limit.
 * Filters out invalid GPS fixes, erratic jumps/glitches, and stationary micro-jitter.
 */
export function calculateDogTotalDistance(dog: Dog): number {
  if (!dog.trackHistory || dog.trackHistory.length < 2) return 0;
  const now = Date.now();
  const cutoffTime = Math.max(dog.odometerResetTimestamp || 0, now - DOG_TRACK_MAX_AGE_MS);

  // Filter valid coordinates and sort chronologically by timestamp (max 12h age)
  const validPoints = dog.trackHistory
    .filter(
      (pt) =>
        typeof pt.lat === 'number' &&
        typeof pt.lng === 'number' &&
        pt.lat !== 0 &&
        pt.lng !== 0 &&
        !isNaN(pt.lat) &&
        !isNaN(pt.lng) &&
        (pt.timestamp || 0) >= cutoffTime
    )
    .sort((a, b) => a.timestamp - b.timestamp);

  if (validPoints.length < 2) return 0;

  let totalMeters = 0;

  for (let i = 1; i < validPoints.length; i++) {
    const p1 = validPoints[i - 1];
    const p2 = validPoints[i];

    // Respect odometer reset time & 12h cutoff
    if (p2.timestamp < cutoffTime || p1.timestamp < cutoffTime) continue;

    const segmentDistance = calculateDistance(p1.lat, p1.lng, p2.lat, p2.lng);
    if (segmentDistance <= 0) continue;

    const timeDeltaSec = Math.max(1, Math.abs((p2.timestamp - p1.timestamp) / 1000));
    const segmentSpeedKmh = (segmentDistance / timeDeltaSec) * 3.6;

    // Filter out crazy GPS teleports/glitches (e.g. > 90 km/h for a dog, or single jump > 1500m in < 15s)
    if (segmentSpeedKmh > 90 && segmentDistance > 500) {
      continue;
    }

    // Filter micro-jitter when dog is stationary:
    // If distance is less than 2.0 meters and speed is near zero (< 0.8 km/h), ignore jitter
    if (segmentDistance < 2.0 && (p2.speed || 0) < 0.8 && (p1.speed || 0) < 0.8) {
      continue;
    }

    totalMeters += segmentDistance;
  }

  return Math.round(totalMeters);
}

const DELETED_DOGS_STORAGE_KEY = 'eratutka_deleted_dogs_registry';

// Fast in-memory cache of deleted identifiers to prevent async storage race conditions
let cachedDeletedDogIds: Set<string> | null = null;

// The registry is read once and cached for the life of the page, so anything that changes it
// from outside this document - another tab, a cleanup typed into the console - has to drop the
// cache. Without this the app keeps filtering with a list that no longer exists, and clearing
// the registry appears to do nothing until the page is reloaded.
if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  window.addEventListener('storage', (event) => {
    if (event.key === DELETED_DOGS_STORAGE_KEY) cachedDeletedDogIds = null;
  });
}

/**
 * True for entries that can never be an identifier.
 *
 * An identifier is a dog id, an IMEI, a Tractive token or a share URL, so it never contains
 * whitespace; and the synthetic `name:<petName>` keys an older client wrote are not identifiers
 * either. What is left are descriptions like `Nirppu` or `Tractive GPS (Kissa / Koira)`, which
 * an older version of the app used as identity and which have sat in the registry ever since.
 * They match no dog - that is exactly why dropping them is safe: they cannot be hiding anything.
 * Keeping them would only mislead the next person reading the registry.
 */
const isImpossibleIdentifier = (id: string): boolean => /\s/.test(id) || /^name:/i.test(id);

function normalizeIdentifier(raw: string | undefined | null): string[] {
  if (!raw) return [];
  const s = String(raw).trim();
  if (!s) return [];

  const results = new Set<string>();
  results.add(s);
  results.add(s.toLowerCase());
  results.add(s.toUpperCase());

  // Clean "ID:" prefixes common in SinoTrack/ICAR/Traccar
  const clean = s.replace(/^ID[:\s]*/i, '').trim();
  if (clean) {
    results.add(clean);
    results.add(clean.toLowerCase());
    results.add(clean.toUpperCase());

    // Clean leading zeros (e.g. 007026216737 -> 7026216737)
    const noZeros = clean.replace(/^0+/, '');
    if (noZeros) {
      results.add(noZeros);
      results.add(noZeros.toLowerCase());
      results.add(noZeros.toUpperCase());
    }
  }

  // If this string contains or is a Tractive token / share link
  const tractiveToken = extractTractiveToken(s);
  if (tractiveToken) {
    results.add(tractiveToken);
    results.add(tractiveToken.toLowerCase());
    results.add(tractiveToken.toUpperCase());
  }

  return Array.from(results);
}

/**
 * The identifiers a dog is known by: its own id plus every collar identifier and their
 * normalized variants. Exposed so that a caller reviving a dog speaks about exactly the
 * same strings the deletion registry was written with.
 */
export function getDogIdentifiers(dog: Dog | string | undefined | null): string[] {
  return extractAllDogIdentifiers(dog);
}

function extractAllDogIdentifiers(item: Dog | string | undefined | null): string[] {
  if (!item) return [];
  if (typeof item === 'string') {
    return normalizeIdentifier(item);
  }

  const dog = item;
  // Only identifiers that identify one specific physical collar belong here. Descriptive
  // fields (name, trackerModel, tractivePetName) are deliberately excluded: keying
  // deletion on them meant that deleting one dog also hid every *other* dog sharing the
  // same name or the same collar model — a second IK122 unit would simply vanish.
  const rawList: (string | undefined | null)[] = [
    dog.id,
    dog.collarId,
    dog.directGpsId,
    dog.imei,
    dog.tractiveTrackerId,
    dog.tractiveShareUrl,
  ];

  if (dog.collarId) rawList.push(extractTractiveToken(dog.collarId));
  if (dog.directGpsId) rawList.push(extractTractiveToken(dog.directGpsId));
  if (dog.tractiveShareUrl) rawList.push(extractTractiveToken(dog.tractiveShareUrl));

  const allNormalized = new Set<string>();
  for (const raw of rawList) {
    if (!raw) continue;
    normalizeIdentifier(raw).forEach((id) => allNormalized.add(id));
  }

  return Array.from(allNormalized);
}

/**
 * Returns a Set of dog and collar identifiers that have been explicitly deleted by the user.
 */
export function getDeletedDogIds(): Set<string> {
  if (cachedDeletedDogIds) {
    return cachedDeletedDogIds;
  }

  const set = new Set<string>();
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(DELETED_DOGS_STORAGE_KEY) : null;
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (typeof item !== 'string' || isImpossibleIdentifier(item)) continue;
          normalizeIdentifier(item).forEach((id) => set.add(id));
        }
      }
    }
  } catch {}

  cachedDeletedDogIds = set;
  return set;
}

/**
 * Marks one or more dogs or collar identifiers as permanently deleted,
 * preventing them from being resurrected by background polling, Firestore snapshots, or server relay.
 */
export function markDogAsDeleted(...items: (Dog | string | undefined | null)[]): void {
  try {
    const current = getDeletedDogIds();
    let changed = false;

    for (const item of items) {
      const ids = extractAllDogIdentifiers(item);
      for (const id of ids) {
        if (!current.has(id)) {
          current.add(id);
          changed = true;
        }
      }
    }

    if (changed) {
      cachedDeletedDogIds = current;
      if (typeof localStorage !== 'undefined') {
        const arr = Array.from(current).slice(-500);
        localStorage.setItem(DELETED_DOGS_STORAGE_KEY, JSON.stringify(arr));
      }
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('eratutka_dog_deleted', {
            detail: { deletedIds: Array.from(current) },
          })
        );
      }
    }
  } catch {}
}

/**
 * Clears one or more dog IDs from the deleted registry (e.g. if the user intentionally re-adds it).
 */
export function clearDogFromDeleted(...items: (Dog | string | undefined | null)[]): void {
  try {
    const current = getDeletedDogIds();
    let changed = false;

    for (const item of items) {
      const ids = extractAllDogIdentifiers(item);
      for (const id of ids) {
        if (current.delete(id)) {
          changed = true;
        }
      }
    }

    if (changed) {
      cachedDeletedDogIds = current;
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(DELETED_DOGS_STORAGE_KEY, JSON.stringify(Array.from(current)));
      }
    }
  } catch {}
}

const PENDING_DELETIONS_STORAGE_KEY = 'eratutka_pending_deletions';

/**
 * Deletions this device has made but not yet handed to the server.
 *
 * A deletion has to reach the server as an *event*, not as accumulated state. The registry
 * above only ever grows and every client in the hunt holds its own copy, so re-uploading it
 * wholesale meant a client that had not yet polled a revival would re-assert an old deletion
 * on its next routine write. Because a deletion beats a revival, that silently undid a collar
 * that had just been added back - for the whole party, a couple of seconds later, over and
 * over. Sending only the ids still waiting for acknowledgement leaves a stale registry with
 * nothing to re-assert.
 *
 * The list survives a reload and a stay offline: whatever is in it is retried on the next
 * push that the server accepts.
 */
export function getPendingDeletedIds(): string[] {
  try {
    const raw =
      typeof localStorage !== 'undefined'
        ? localStorage.getItem(PENDING_DELETIONS_STORAGE_KEY)
        : null;
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((id): id is string => typeof id === 'string' && id.length > 0);
  } catch {
    return [];
  }
}

function writePendingDeletedIds(ids: string[]): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(PENDING_DELETIONS_STORAGE_KEY, JSON.stringify(ids.slice(-200)));
    }
  } catch {}
}

/** Remembers that these identifiers were deleted and still have to reach the server. */
export function addPendingDeletedIds(ids: (string | undefined | null)[]): void {
  const current = getPendingDeletedIds();
  const seen = new Set(current);
  let changed = false;

  for (const id of ids || []) {
    const s = String(id ?? '').trim();
    if (!s || seen.has(s)) continue;
    seen.add(s);
    current.push(s);
    changed = true;
  }

  if (changed) writePendingDeletedIds(current);
}

/**
 * Forgets pending deletions the server has accepted. With no argument the whole list is
 * dropped; otherwise only the given identifiers are removed.
 */
export function clearPendingDeletedIds(ids?: (string | undefined | null)[]): void {
  if (!ids) {
    writePendingDeletedIds([]);
    return;
  }

  const removing = new Set(
    ids.map((id) => String(id ?? '').trim()).filter(Boolean)
  );
  if (removing.size === 0) return;

  writePendingDeletedIds(getPendingDeletedIds().filter((id) => !removing.has(id)));
}

/**
 * Checks if a dog ID or Dog object has been marked as deleted.
 */
export function isDogDeleted(dogOrId: Dog | string | undefined | null): boolean {
  if (!dogOrId) return false;
  const deletedSet = getDeletedDogIds();
  if (deletedSet.size === 0) return false;

  const idsToCheck = extractAllDogIdentifiers(dogOrId);
  for (const id of idsToCheck) {
    if (deletedSet.has(id)) return true;
  }
  return false;
}

/**
 * Intelligently merges a local list of dogs with an incoming list of dogs (from Firestore / Relay / Storage / Broadcast).
 * - Never drops local dogs when incoming list is empty or partial.
 * - Filters out dogs that have been explicitly deleted by the user to prevent ghost resurrections.
 * - Chooses the freshest telemetry for each dog by comparing timestamp / lastUpdated.
 * - Seamlessly unions trackHistory without duplicates.
 * - Preserves collar config and user customizations.
 */
export function mergeDogLists(
  localDogs: Dog[],
  incomingDogs: Dog[],
  explicitDeletedIds?: Set<string>
): Dog[] {
  const deletedSet = explicitDeletedIds || getDeletedDogIds();

  const isItemDeleted = (d: Dog): boolean => {
    if (!d || !d.id) return true;
    if (deletedSet.size === 0) return false;
    const ids = extractAllDogIdentifiers(d);
    for (const id of ids) {
      if (deletedSet.has(id)) return true;
    }
    return false;
  };

  // Filter out any deleted dogs from both lists
  const validLocal = (Array.isArray(localDogs) ? localDogs : []).filter(
    (d) => !isItemDeleted(d)
  );
  const validIncoming = (Array.isArray(incomingDogs) ? incomingDogs : []).filter(
    (d) => !isItemDeleted(d)
  );

  if (validIncoming.length === 0) {
    return validLocal.filter((d) => !isItemDeleted(d));
  }
  if (validLocal.length === 0) {
    return validIncoming
      .filter((d) => !isItemDeleted(d))
      .map((d) => ({ ...d, isActive: d.isActive !== false }));
  }

  const mergedMap = new Map<string, Dog>();

  // 1. First add all local dogs to map
  for (const local of validLocal) {
    if (!isItemDeleted(local)) {
      mergedMap.set(local.id, { ...local, isActive: local.isActive !== false });
    }
  }

  // Helper to find the existing record of the same collar (by id or collar/imei/directGpsId/tractive).
  // The dog's NAME is deliberately not used as a match: two hunters can each have a dog
  // called "Rex", and matching on the name silently fused them into a single entry, making
  // one of the two real dogs disappear from the map mid-hunt. A duplicate entry from two
  // records of the same dog is the lesser problem — it is visible and can be deleted.
  const findExistingLocal = (incoming: Dog): Dog | undefined => {
    if (mergedMap.has(incoming.id)) return mergedMap.get(incoming.id);
    const incTractive = incoming.collarId ? extractTractiveToken(incoming.collarId) : null;

    for (const local of mergedMap.values()) {
      if (incoming.collarId && local.collarId && incoming.collarId === local.collarId) return local;
      if (incoming.directGpsId && local.directGpsId && incoming.directGpsId === local.directGpsId) return local;
      if (incoming.imei && local.imei && incoming.imei === local.imei) return local;
      if (incoming.tractiveTrackerId && local.tractiveTrackerId && incoming.tractiveTrackerId === local.tractiveTrackerId) return local;
      if (incTractive && local.collarId && extractTractiveToken(local.collarId) === incTractive) return local;
      if (incTractive && local.directGpsId && extractTractiveToken(local.directGpsId) === incTractive) return local;
    }
    return undefined;
  };

  // 2. Process incoming dogs
  for (const incoming of validIncoming) {
    if (isItemDeleted(incoming)) continue;

    const existing = findExistingLocal(incoming);
    if (!existing) {
      // New dog from remote (and verified not deleted)
      mergedMap.set(incoming.id, { ...incoming, isActive: incoming.isActive !== false });
      continue;
    }

    // Both exist: decide freshest telemetry
    const localTime = existing.lastUpdated || 0;
    const incomingTime = incoming.lastUpdated || 0;

    // Base on the fresher one
    const isIncomingFresher = incomingTime > localTime;
    const primary = isIncomingFresher ? incoming : existing;
    const secondary = isIncomingFresher ? existing : incoming;

    // Merge track histories (union by timestamp, automatically pruned to 12h)
    const histMap = new Map<number, DogTrackPoint>();
    (secondary.trackHistory || []).forEach((pt) => histMap.set(pt.timestamp, pt));
    (primary.trackHistory || []).forEach((pt) => histMap.set(pt.timestamp, pt));

    const combinedHistory = pruneExpiredTrackPoints(
      Array.from(histMap.values()).sort((a, b) => a.timestamp - b.timestamp)
    ).slice(-5000);

    const mergedDog: Dog = {
      ...secondary,
      ...primary,
      id: existing.id, // Preserve consistent local client dog ID
      isActive: primary.isActive !== false,
      autoSyncEnabled: primary.autoSyncEnabled ?? secondary.autoSyncEnabled ?? true,
      directGpsId: primary.directGpsId || secondary.directGpsId,
      gatewayServerUrl: primary.gatewayServerUrl || secondary.gatewayServerUrl,
      imei: primary.imei || secondary.imei,
      collarId: primary.collarId || secondary.collarId,
      trackerModel: primary.trackerModel || secondary.trackerModel,
      lastBarkTimestamp: primary.lastBarkTimestamp || secondary.lastBarkTimestamp,
      recentBarkRate: primary.recentBarkRate || secondary.recentBarkRate,
      trackHistory: combinedHistory.length > 0 ? combinedHistory : (primary.trackHistory || []),
    };

    mergedMap.set(existing.id, mergedDog);
  }

  return Array.from(mergedMap.values()).filter((d) => !isItemDeleted(d));
}

/**
 * Serializes the dog list for localStorage, dropping the oldest track points until it fits.
 *
 * The list is written to the device on every save, and with up to 5 000 points per collar
 * (~12 h) a handful of collars already approaches the browser's ~5 MB quota — and it used to
 * be written under two keys on top of that. When the quota is reached `setItem` throws and the
 * write is simply lost, which is how a stale deletion marker survived a reload on a phone and
 * kept hiding a collar while the same code worked on a desktop with more room.
 *
 * Only the copy on disk is trimmed: the in-memory list keeps the full history for the map and
 * the relay carries it to the rest of the party, so nothing is lost while the app is running.
 */
const TRACK_POINT_KEEP_STEPS = [5000, 1000, 250, 50, 0];

export function serializeDogsForStorage(dogs: Dog[], budgetBytes = 1_200_000): string {
  const withHistoryKept = (keep: number) =>
    JSON.stringify(
      (dogs || []).map((dog) =>
        keep > 0
          ? { ...dog, trackHistory: (dog.trackHistory || []).slice(-keep) }
          : { ...dog, trackHistory: [] }
      )
    );

  let smallest = withHistoryKept(0);
  for (const keep of TRACK_POINT_KEEP_STEPS) {
    const serialized = withHistoryKept(keep);
    smallest = serialized;
    if (serialized.length <= budgetBytes) return serialized;
  }
  return smallest;
}

/**
 * Generates GPX XML string for exporting dog tracks and map annotations.
 */
export function generateGpx(dogs: Dog[], annotations: MapAnnotation[]): string {
  const now = new Date().toISOString();
  let gpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Erätutka - https://eratutka.fi" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <name>Erätutka Vienti ${new Date().toLocaleDateString('fi-FI')}</name>
    <time>${now}</time>
  </metadata>
`;

  // Add waypoints for annotations
  annotations.forEach((anno) => {
    gpx += `  <wpt lat="${anno.lat}" lon="${anno.lng}">
    <name>${escapeXml(anno.title)}</name>
    <desc>${escapeXml(anno.description || anno.category)}</desc>
    <type>${anno.category}</type>
  </wpt>\n`;
  });

  // Add tracks for dogs
  dogs.forEach((dog) => {
    if (dog.trackHistory.length > 0) {
      gpx += `  <trk>
    <name>Koira: ${escapeXml(dog.name)} (${escapeXml(dog.breed)})</name>
    <trkseg>\n`;
      dog.trackHistory.forEach((pt) => {
        const ptTime = new Date(pt.timestamp).toISOString();
        gpx += `      <trkpt lat="${pt.lat}" lon="${pt.lng}">
        <time>${ptTime}</time>
        <extensions>
          <barkRate>${pt.barkRate}</barkRate>
          <speed>${pt.speed}</speed>
        </extensions>
      </trkpt>\n`;
      });
      gpx += `    </trkseg>
  </trk>\n`;
    }
  });

  gpx += `</gpx>`;
  return gpx;
}

export interface ParsedMapData {
  annotations: MapAnnotation[];
  dogs: Dog[];
  fileName: string;
  fileFormat: 'GPX' | 'GeoJSON' | 'KML' | 'JSON' | 'Tuntematon';
  summary: {
    waypointsCount: number;
    tracksCount: number;
    areasCount: number;
  };
}

/**
 * Parses user or peer supplied map data files (GPX, GeoJSON, KML, JSON).
 */
export function parseMapDataFile(
  fileContent: string,
  fileName: string,
  sourceLabel?: string
): ParsedMapData {
  const trimmed = fileContent.trim();
  const lowerName = fileName.toLowerCase();
  const creatorTag = sourceLabel?.trim() || `Tiedosto: ${fileName}`;

  const result: ParsedMapData = {
    annotations: [],
    dogs: [],
    fileName,
    fileFormat: 'Tuntematon',
    summary: {
      waypointsCount: 0,
      tracksCount: 0,
      areasCount: 0,
    },
  };

  try {
    // 1. Check if JSON or GeoJSON
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      const parsedJson = JSON.parse(trimmed);
      result.fileFormat = lowerName.endsWith('.geojson') ? 'GeoJSON' : 'JSON';
      parseJsonOrGeoJson(parsedJson, creatorTag, result);
      return result;
    }

    // 2. Check if GPX XML
    if (trimmed.includes('<gpx') || trimmed.includes('<trk') || trimmed.includes('<wpt')) {
      result.fileFormat = 'GPX';
      parseGpxXml(trimmed, creatorTag, result);
      return result;
    }

    // 3. Check if KML XML
    if (trimmed.includes('<kml') || trimmed.includes('<Placemark')) {
      result.fileFormat = 'KML';
      parseKmlXml(trimmed, creatorTag, result);
      return result;
    }

    // Fallback: try parsing as XML
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(trimmed, 'text/xml');
    if (xmlDoc.getElementsByTagName('wpt').length > 0 || xmlDoc.getElementsByTagName('trk').length > 0) {
      result.fileFormat = 'GPX';
      parseGpxXml(trimmed, creatorTag, result);
    } else if (xmlDoc.getElementsByTagName('Placemark').length > 0) {
      result.fileFormat = 'KML';
      parseKmlXml(trimmed, creatorTag, result);
    }
  } catch (err) {
    console.error('Error parsing map data file:', err);
  }

  return result;
}

function parseGpxXml(xmlString: string, creatorTag: string, result: ParsedMapData) {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlString, 'text/xml');

  // 1. Waypoints (<wpt>)
  const waypoints = xmlDoc.getElementsByTagName('wpt');
  for (let i = 0; i < waypoints.length; i++) {
    const wpt = waypoints[i];
    const latStr = wpt.getAttribute('lat');
    const lonStr = wpt.getAttribute('lon');
    if (!latStr || !lonStr) continue;

    const lat = parseFloat(latStr);
    const lng = parseFloat(lonStr);
    if (isNaN(lat) || isNaN(lng)) continue;

    const nameNode = wpt.getElementsByTagName('name')[0];
    const descNode = wpt.getElementsByTagName('desc')[0] || wpt.getElementsByTagName('cmt')[0];
    const typeNode = wpt.getElementsByTagName('type')[0] || wpt.getElementsByTagName('sym')[0];

    const title = nameNode?.textContent?.trim() || `Passi / Kohde ${i + 1}`;
    const description = descNode?.textContent?.trim() || '';
    const typeStr = (typeNode?.textContent?.trim() || '').toLowerCase();

    const { category, subType, color } = categorizeFeature(title, description, typeStr);

    result.annotations.push({
      id: `imported-wpt-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 6)}`,
      title,
      category,
      subType,
      lat,
      lng,
      description: description || undefined,
      createdBy: creatorTag,
      createdAt: Date.now(),
      color,
    });
    result.summary.waypointsCount++;
  }

  // 2. Tracks (<trk>)
  const tracks = xmlDoc.getElementsByTagName('trk');
  for (let t = 0; t < tracks.length; t++) {
    const trk = tracks[t];
    const trkName = trk.getElementsByTagName('name')[0]?.textContent?.trim() || `Reitti ${t + 1}`;
    const trkPts = trk.getElementsByTagName('trkpt');
    if (trkPts.length === 0) continue;

    const trackHistory: Dog['trackHistory'] = [];
    for (let p = 0; p < trkPts.length; p++) {
      const pt = trkPts[p];
      const lat = parseFloat(pt.getAttribute('lat') || '');
      const lng = parseFloat(pt.getAttribute('lon') || '');
      if (isNaN(lat) || isNaN(lng)) continue;

      const timeNode = pt.getElementsByTagName('time')[0];
      const timeVal = timeNode?.textContent ? new Date(timeNode.textContent).getTime() : Date.now() - (trkPts.length - p) * 5000;
      const speedNode = pt.getElementsByTagName('speed')[0];
      const barkNode = pt.getElementsByTagName('barkRate')[0];

      trackHistory.push({
        lat,
        lng,
        timestamp: timeVal,
        speed: speedNode ? parseFloat(speedNode.textContent || '0') : 0,
        barkRate: barkNode ? parseInt(barkNode.textContent || '0', 10) : 0,
      });
    }

    if (trackHistory.length > 0) {
      const lastPt = trackHistory[trackHistory.length - 1];
      const firstPt = trackHistory[0];

      // If it looks like a dog track (contains 'Koira' or 'dog' or has bark rates)
      if (trkName.toLowerCase().includes('koira') || trkName.toLowerCase().includes('dog') || trackHistory.some(p => p.barkRate > 0)) {
        result.dogs.push({
          id: `imported-dog-${Date.now()}-${t}`,
          name: trkName.replace(/^Koira:\s*/i, ''),
          breed: 'Tuotu GPX-jälki',
          collarId: `GPX-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
          color: '#f97316',
          lat: lastPt.lat,
          lng: lastPt.lng,
          speed: lastPt.speed || 0,
          barkRate: lastPt.barkRate || 0,
          battery: 95,
          signal: 90,
          heading: 0,
          status: 'haukkuu',
          isActive: true,
          barkAlertEnabled: true,
          standAlertEnabled: true,
          trackerModel: 'GPX-tiedosto (Tuotu)',
          addedBy: creatorTag,
          lastUpdated: Date.now(),
          trackHistory,
        });
        result.summary.tracksCount++;
      } else {
        // Also add the start point as an annotation
        result.annotations.push({
          id: `imported-trk-start-${Date.now()}-${t}`,
          title: `Reitin alku: ${trkName}`,
          category: 'muu',
          subType: 'nuotio',
          lat: firstPt.lat,
          lng: firstPt.lng,
          description: `Tuotu reitti (${trackHistory.length} pistettä)`,
          createdBy: creatorTag,
          createdAt: Date.now(),
          color: '#0284c7',
        });
        result.summary.waypointsCount++;
      }
    }
  }
}

function parseKmlXml(xmlString: string, creatorTag: string, result: ParsedMapData) {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlString, 'text/xml');

  const placemarks = xmlDoc.getElementsByTagName('Placemark');
  for (let i = 0; i < placemarks.length; i++) {
    const pm = placemarks[i];
    const name = pm.getElementsByTagName('name')[0]?.textContent?.trim() || `Kohde ${i + 1}`;
    const desc = pm.getElementsByTagName('description')[0]?.textContent?.trim() || '';

    // Point
    const pointNode = pm.getElementsByTagName('Point')[0];
    if (pointNode) {
      const coordStr = pointNode.getElementsByTagName('coordinates')[0]?.textContent?.trim();
      if (coordStr) {
        const parts = coordStr.split(',');
        if (parts.length >= 2) {
          const lng = parseFloat(parts[0]);
          const lat = parseFloat(parts[1]);
          if (!isNaN(lat) && !isNaN(lng)) {
            const { category, subType, color } = categorizeFeature(name, desc, '');
            result.annotations.push({
              id: `imported-kml-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 6)}`,
              title: name,
              category,
              subType,
              lat,
              lng,
              description: desc || undefined,
              createdBy: creatorTag,
              createdAt: Date.now(),
              color,
            });
            result.summary.waypointsCount++;
          }
        }
      }
    }
  }
}

function parseJsonOrGeoJson(json: any, creatorTag: string, result: ParsedMapData) {
  if (!json || typeof json !== 'object') return;

  // 1. Check if it is an Erätutka export or state object
  if (json.annotations && Array.isArray(json.annotations)) {
    json.annotations.forEach((anno: any, idx: number) => {
      if (anno.lat && anno.lng) {
        result.annotations.push({
          ...anno,
          id: anno.id || `imported-json-${Date.now()}-${idx}`,
          createdBy: anno.createdBy || creatorTag,
        });
        result.summary.waypointsCount++;
      }
    });
  }

  if (json.dogs && Array.isArray(json.dogs)) {
    json.dogs.forEach((dog: any, idx: number) => {
      // Imported JSON is arbitrary: coordinates may be strings and the track history may
      // be absent. Normalize both so every dog entering the app has the shape the rest of
      // the code assumes (numeric lat/lng and a trackHistory array), including from an
      // Erätutka export written by an older build.
      const lat = typeof dog.lat === 'number' ? dog.lat : Number(dog.lat);
      const lng = typeof dog.lng === 'number' ? dog.lng : Number(dog.lng ?? dog.lon);
      if (!isFinite(lat) || !isFinite(lng) || (lat === 0 && lng === 0)) return;
      result.dogs.push({
        ...dog,
        lat,
        lng,
        trackHistory: Array.isArray(dog.trackHistory) ? dog.trackHistory : [],
        id: dog.id || `imported-dog-json-${Date.now()}-${idx}`,
        addedBy: dog.addedBy || creatorTag,
      });
      result.summary.tracksCount++;
    });
  }

  // Helper to process a single GeoJSON or Oma riista feature
  const processFeature = (feat: any, idx: number) => {
    if (!feat) return;
    const props = feat.properties || feat.props || feat;
    const geom = feat.geometry || (feat.coordinates && feat.type ? feat : null);
    if (!geom) {
      // Check if feature itself has coordinates / lat / lng / points
      if (feat.lat || feat.latitude || feat.coordinates || feat.points) {
        const norm = normalizeCoordinate(feat.lat ? [feat.lng ?? feat.lon, feat.lat] : feat.coordinates);
        if (norm) {
          const title = feat.name || feat.nimi || feat.title || `Kohde ${idx + 1}`;
          result.annotations.push({
            id: `imported-item-${Date.now()}-${idx}`,
            title,
            category: 'passipaikka',
            subType: 'passi',
            lat: norm.lat,
            lng: norm.lng,
            description: feat.description || feat.kuvaus || feat.desc || undefined,
            createdBy: creatorTag,
            createdAt: Date.now(),
          });
          result.summary.waypointsCount++;
        }
      }
      return;
    }

    const title =
      props.name ||
      props.nimi ||
      props.clubName ||
      props.seuranNimi ||
      props.alueenNimi ||
      props.title ||
      props.huntingClub ||
      props.seura ||
      `Metsästysalue / Kohde ${idx + 1}`;

    const desc =
      props.description ||
      props.kuvaus ||
      props.desc ||
      props.tunnus ||
      props.huntingYear ||
      (props.pintaAla ? `Pinta-ala: ${props.pintaAla} ha` : '') ||
      '';

    const geomType = geom.type;
    const coords = geom.coordinates;

    // A. Point
    if (geomType === 'Point' && Array.isArray(coords)) {
      const norm = normalizeCoordinate(coords);
      if (norm) {
        const { category, subType, color } = categorizeFeature(title, desc, props.category || props.tyyppi || '');
        result.annotations.push({
          id: `imported-geojson-pt-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 6)}`,
          title,
          category: props.category || category,
          subType: props.subType || subType,
          lat: norm.lat,
          lng: norm.lng,
          description: desc || undefined,
          radiusMeters: props.radiusMeters || props.radius,
          createdBy: creatorTag,
          createdAt: Date.now(),
          color: props.color || color,
          source: 'Oma riista / GeoJSON',
        });
        result.summary.waypointsCount++;
      }
    }

    // B. Polygon
    else if (geomType === 'Polygon' && Array.isArray(coords) && coords.length > 0) {
      const outerRing = coords[0]; // exterior ring
      if (Array.isArray(outerRing) && outerRing.length >= 3) {
        const normalizedPoints: [number, number][] = [];
        let sumLat = 0;
        let sumLng = 0;
        let validPoints = 0;

        outerRing.forEach((pt: any) => {
          const norm = normalizeCoordinate(pt);
          if (norm) {
            normalizedPoints.push([norm.lat, norm.lng]);
            sumLat += norm.lat;
            sumLng += norm.lng;
            validPoints++;
          }
        });

        if (validPoints >= 3) {
          const centerLat = sumLat / validPoints;
          const centerLng = sumLng / validPoints;
          const calculatedHa = calculatePolygonHectares(normalizedPoints);
          const haSize = props.pintaAla || props.areaSize || props.hectares || calculatedHa;

          result.annotations.push({
            id: `imported-geojson-poly-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 6)}`,
            title: title.toLowerCase().includes('alue') || title.toLowerCase().includes('seura') ? title : `${title} (Alue)`,
            category: 'raja',
            subType: 'geofence',
            lat: centerLat,
            lng: centerLng,
            polygon: normalizedPoints,
            areaHectares: Math.round(Number(haSize) * 10) / 10,
            radiusMeters: Math.round(Math.sqrt((Number(haSize) * 10000) / Math.PI)),
            description: desc ? `${desc} • ${haSize} ha` : `Seuran metsästysalue (${haSize} ha)`,
            createdBy: creatorTag,
            createdAt: Date.now(),
            color: '#16a34a', // Forest green for hunting zones
            source: 'Oma riista',
          });
          result.summary.areasCount++;
        }
      }
    }

    // C. MultiPolygon (Very common in Oma riista club areas with multiple parcels)
    else if (geomType === 'MultiPolygon' && Array.isArray(coords) && coords.length > 0) {
      const allPolygons: [number, number][][] = [];
      let totalSumLat = 0;
      let totalSumLng = 0;
      let totalValidPoints = 0;
      let totalCalculatedHa = 0;

      coords.forEach((polygonCoords: any) => {
        if (Array.isArray(polygonCoords) && polygonCoords.length > 0) {
          const outerRing = polygonCoords[0];
          if (Array.isArray(outerRing)) {
            const currentPolyPoints: [number, number][] = [];
            outerRing.forEach((pt: any) => {
              const norm = normalizeCoordinate(pt);
              if (norm) {
                currentPolyPoints.push([norm.lat, norm.lng]);
                totalSumLat += norm.lat;
                totalSumLng += norm.lng;
                totalValidPoints++;
              }
            });
            if (currentPolyPoints.length >= 3) {
              allPolygons.push(currentPolyPoints);
              totalCalculatedHa += calculatePolygonHectares(currentPolyPoints);
            }
          }
        }
      });

      if (allPolygons.length > 0 && totalValidPoints > 0) {
        const centerLat = totalSumLat / totalValidPoints;
        const centerLng = totalSumLng / totalValidPoints;
        const haSize = props.pintaAla || props.areaSize || props.hectares || totalCalculatedHa;

        result.annotations.push({
          id: `imported-geojson-multipoly-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 6)}`,
          title: title.toLowerCase().includes('alue') || title.toLowerCase().includes('seura') ? title : `${title} (Alue)`,
          category: 'raja',
          subType: 'geofence',
          lat: centerLat,
          lng: centerLng,
          polygon: allPolygons[0], // primary polygon
          multiPolygon: allPolygons, // all polygons / parcels
          areaHectares: Math.round(Number(haSize) * 10) / 10,
          radiusMeters: Math.round(Math.sqrt((Number(haSize) * 10000) / Math.PI)),
          description: desc ? `${desc} • ${haSize} ha (${allPolygons.length} palstaa)` : `Seuran metsästysalue (${haSize} ha, ${allPolygons.length} palstaa)`,
          createdBy: creatorTag,
          createdAt: Date.now(),
          color: '#16a34a',
          source: 'Oma riista',
        });
        result.summary.areasCount++;
      }
    }

    // D. GeometryCollection
    else if (geomType === 'GeometryCollection' && Array.isArray(geom.geometries)) {
      geom.geometries.forEach((g: any, gIdx: number) => {
        processFeature({ type: 'Feature', properties: props, geometry: g }, idx * 100 + gIdx);
      });
    }
  };

  // 2. GeoJSON FeatureCollection
  if (json.type === 'FeatureCollection' && Array.isArray(json.features)) {
    json.features.forEach((feat: any, idx: number) => {
      processFeature(feat, idx);
    });
    return;
  }

  // 3. Single GeoJSON Feature or Geometry
  if (json.type === 'Feature' || json.type === 'Polygon' || json.type === 'MultiPolygon' || json.type === 'Point') {
    processFeature(json, 0);
    return;
  }

  // 4. Oma riista proprietary JSON wrappers (e.g. { features: [...] }, { zones: [...] }, { alueet: [...] }, { areas: [...] })
  const featuresList = json.features || json.zones || json.alueet || json.areas || json.geometries;
  if (Array.isArray(featuresList)) {
    featuresList.forEach((feat: any, idx: number) => {
      processFeature(feat, idx);
    });
    return;
  }

  // 5. Array of items / features
  if (Array.isArray(json)) {
    json.forEach((item: any, idx: number) => {
      if (item.type === 'Feature' || item.geometry || item.coordinates) {
        processFeature(item, idx);
      } else if (item.lat && (item.lng || item.lon)) {
        const norm = normalizeCoordinate([item.lng ?? item.lon, item.lat]);
        if (norm) {
          const { category, subType } = categorizeFeature(item.title || item.name || '', item.description || '', '');
          result.annotations.push({
            id: item.id || `imported-item-${Date.now()}-${idx}`,
            title: item.title || item.name || `Piste ${idx + 1}`,
            category: item.category || category,
            subType: item.subType || subType,
            lat: norm.lat,
            lng: norm.lng,
            description: item.description || undefined,
            createdBy: creatorTag,
            createdAt: Date.now(),
          });
          result.summary.waypointsCount++;
        }
      }
    });
  }
}

function categorizeFeature(
  title: string,
  description: string,
  typeStr: string
): { category: MapAnnotation['category']; subType?: MapAnnotation['subType']; color?: string } {
  const combined = `${title} ${description} ${typeStr}`.toLowerCase();

  if (combined.includes('hirvi') || combined.includes('moose') || combined.includes('elk')) {
    return { category: 'havainto', subType: 'hirvi', color: '#ef4444' };
  }
  if (combined.includes('karhu') || combined.includes('bear')) {
    return { category: 'havainto', subType: 'karhu', color: '#9333ea' };
  }
  if (combined.includes('susi') || combined.includes('wolf')) {
    return { category: 'havainto', subType: 'susi', color: '#6366f1' };
  }
  if (combined.includes('teeri') || combined.includes('metso') || combined.includes('lintu')) {
    return { category: 'havainto', subType: 'teeri', color: '#10b981' };
  }
  if (combined.includes('nuotio') || combined.includes('tuli') || combined.includes('laavu') || combined.includes('kota')) {
    return { category: 'muu', subType: 'nuotio', color: '#f97316' };
  }
  if (combined.includes('auto') || combined.includes('park') || combined.includes('parkki')) {
    return { category: 'muu', subType: 'autopaikoitus', color: '#0ea5e9' };
  }
  if (combined.includes('geofence') || combined.includes('raja') || combined.includes('turva') || combined.includes('alue')) {
    return { category: 'raja', subType: 'geofence', color: '#f59e0b' };
  }
  if (combined.includes('passi') || combined.includes('stand') || combined.includes('torni') || combined.includes('lava') || combined.includes('kyttäys')) {
    return { category: 'passipaikka', subType: 'passi', color: '#d97706' };
  }

  return { category: 'passipaikka', subType: 'passi', color: '#d97706' };
}

function escapeXml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

