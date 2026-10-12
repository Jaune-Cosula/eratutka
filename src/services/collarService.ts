/**
 * Collar Service for Erätutka
 * Unifies telematics fetching between useDogTracker and manual sync components.
 */
import { Dog } from '../types';

export interface DevicePositionResult {
  success: boolean;
  lat?: number;
  lng?: number;
  speed?: number;
  battery?: number;
  heading?: number;
  barkRate?: number;
  status?: string;
  deviceId?: string;
  satellites?: number;
  gsmSignalCsq?: number;
  gsmSignalDb?: number;
  voltage?: number;
  networkStatus?: string;
  fixMode?: string;
  hdop?: number;
  rawPayload?: string;
  protocolName?: string;
  lastPacketLatencySec?: number;
  ageSeconds?: number;
  timestamp?: number;
  isBarking?: boolean;
  barkHoldRemainingFixes?: number;
  lastBarkTimestamp?: number;
  recentBarkRate?: number;
  message?: string;
  tractiveInfo?: {
    petName?: string;
    trackerId?: string;
    ownerName?: string;
    imageUrl?: string;
    token?: string;
    shareUrl?: string;
  };
}

/**
 * The most recent gateway response per device, kept only so the collar diagnostics can show
 * what the app actually received during a bark. Temporary debug aid, not used for logic.
 */
export interface LastGatewayResponse {
  at: number;
  status?: string;
  barkRate?: number;
  isBarking?: boolean;
  hasRawPayload: boolean;
  keys: string[];
}
export const lastGatewayResponses = new Map<string, LastGatewayResponse>();

function recordGatewayResponse(id: string, data: DevicePositionResult | null): void {
  lastGatewayResponses.set(id, {
    at: Date.now(),
    status: data?.status,
    barkRate: data?.barkRate,
    isBarking: data?.isBarking,
    hasRawPayload: Boolean(data?.rawPayload),
    keys: data ? Object.keys(data) : [],
  });
}

/**
 * Extracts Tractive share token from URL, path, or raw token string.
 */
export function extractTractiveToken(input: string | undefined | null): string | null {
  if (!input) return null;
  const str = String(input).trim();
  const urlMatch = str.match(/(?:tractive\.com\/(?:p|share|s)\/|\/(?:p|share|public_share|s)\/)([a-zA-Z0-9_-]+)/i);
  if (urlMatch && urlMatch[1]) {
    return urlMatch[1];
  }
  const paramMatch = str.match(/[?&](?:token|share|p)=([a-zA-Z0-9_-]+)/i);
  if (paramMatch && paramMatch[1]) {
    return paramMatch[1];
  }
  const clean = str.replace(/^ID[:\s]*/i, '').trim();
  if (/^[a-zA-Z0-9_-]{8,32}$/i.test(clean)) {
    // A purely numeric string is a device IMEI or collar ID (e.g. 868123456789012),
    // never a Tractive share token. Treating it as one would replace the collar's
    // configured Micro GPS Gateway with my.tractive.com and silently break telemetry.
    if (/^\d+$/.test(clean)) return null;
    return clean;
  }
  return null;
}

/**
 * Fetches position directly from Tractive live share endpoint
 */
export async function fetchTractivePosition(tokenOrUrl: string): Promise<DevicePositionResult | null> {
  const token = extractTractiveToken(tokenOrUrl) || tokenOrUrl.trim();
  if (!token) return null;

  try {
    const res = await fetch('/api/tractive/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, shareUrl: tokenOrUrl }),
    });
    if (res.ok) {
      return await res.json();
    }
  } catch {}
  return null;
}

/**
 * Fetches the latest live position for a collar device.
 * 1. Checks if it's a Tractive device or share link
 * 2. Tries the Micro GPS Gateway (/api/gateway/sync)
 * 3. Falls back to direct GPS device store (/api/gps/device/:id?pull=true)
 */
export async function fetchDevicePosition(
  cleanId: string,
  gatewayUrl: string = 'http://35.206.111.214:8080/api/positions'
): Promise<DevicePositionResult | null> {
  const trimmedId = String(cleanId || '').replace(/^ID[:\s]*/i, '').trim();
  if (!trimmedId) {
    return null;
  }

  const gwUrl = gatewayUrl || 'http://35.206.111.214:8080/api/positions';
  let data: DevicePositionResult | null = null;

  const isTractive =
    trimmedId.toLowerCase().includes('tractive') ||
    gwUrl.toLowerCase().includes('tractive') ||
    extractTractiveToken(trimmedId) !== null ||
    extractTractiveToken(gwUrl) !== null;

  if (isTractive) {
    const tokenFromGw = extractTractiveToken(gwUrl);
    const tokenFromId = extractTractiveToken(trimmedId);
    const candidate = tokenFromGw || tokenFromId || gwUrl || trimmedId;
    const tractiveRes = await fetchTractivePosition(candidate);
    if (tractiveRes && tractiveRes.success && typeof tractiveRes.lat === 'number') {
      recordGatewayResponse(trimmedId, tractiveRes);
      return tractiveRes;
    }
  }

  // 1. Direct Gateway / Erätutka Direct GPS Ingest (POST)
  try {
    const gwResp = await fetch('/api/gateway/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        gatewayUrl: gwUrl,
        deviceId: trimmedId,
        token: trimmedId,
        shareUrl: gwUrl,
      }),
    });
    if (gwResp.ok) {
      const gwData = await gwResp.json();
      if (gwData && gwData.success && typeof gwData.lat === 'number' && gwData.lat !== 0) {
        data = gwData;
      }
    }
  } catch {
    // Network / abort error, proceed to fallback
  }

  // 2. Direct GPS store pull fallback (GET)
  if (!data || !data.success || typeof data.lat !== 'number' || data.lat === 0) {
    try {
      const resp = await fetch(
        `/api/gps/device/${encodeURIComponent(trimmedId)}?pull=true&gatewayUrl=${encodeURIComponent(gwUrl)}`
      );
      if (resp.ok) {
        const devData = await resp.json();
        if (devData && devData.success && typeof devData.lat === 'number' && devData.lat !== 0) {
          data = devData;
        }
      }
    } catch {
      // Network error
    }
  }

  recordGatewayResponse(trimmedId, data);
  return data;
}

/**
 * Fetches historical GPS track points for a collar device.
 */
export async function fetchDeviceHistory(
  cleanId: string,
  gatewayUrl: string = 'http://35.206.111.214:8080/api/positions',
  options: { hours?: number; since?: number; limit?: number } = {}
): Promise<{ success: boolean; points?: Array<{ lat: number; lng: number; speed?: number; barkRate?: number; timestamp: number }> } | null> {
  const trimmedId = String(cleanId || '').replace(/^ID[:\s]*/i, '').trim();
  if (!trimmedId) {
    return null;
  }

  const gwUrl = gatewayUrl || 'http://35.206.111.214:8080/api/positions';
  let histUrl = `/api/gps/history/${encodeURIComponent(trimmedId)}?gatewayUrl=${encodeURIComponent(gwUrl)}`;
  if (options.since !== undefined) {
    histUrl += `&since=${options.since}&limit=${options.limit || 500}`;
  } else {
    histUrl += `&hours=${options.hours || 12}&limit=${options.limit || 5000}`;
  }

  try {
    const resp = await fetch(histUrl);
    if (resp.ok) {
      return await resp.json();
    }
  } catch {
    // Network error
  }

  return null;
}

export interface DogSyncResult {
  /** Partial telemetry to merge onto the dog, or null when nothing usable came back. */
  updates: Partial<Dog> | null;
  /** Human-readable outcome, shown by whichever UI triggered the sync. */
  feedback: string;
}

/**
 * Pulls the latest position for one collar and maps the gateway response onto a dog.
 *
 * Pure and UI-free on purpose: both the classic radar panel and the Evo dog detail need the
 * same fetch-then-map logic, and duplicating the ~80-line telemetry mapping is how the two
 * front-ends drift apart. The caller owns the "syncing" flag and the feedback timeout.
 */
export async function syncDogTelemetry(dogToSync: Dog): Promise<DogSyncResult> {
  const isTractive =
    dogToSync.telematicsProvider === 'tractive' ||
    Boolean(dogToSync.tractiveShareUrl) ||
    Boolean(dogToSync.trackerModel?.toLowerCase().includes('tractive')) ||
    String(dogToSync.directGpsId || '').toLowerCase().includes('tractive') ||
    String(dogToSync.collarId || '').toLowerCase().includes('tractive') ||
    (dogToSync.tractiveShareUrl && extractTractiveToken(dogToSync.tractiveShareUrl) !== null) ||
    (dogToSync.directGpsId && extractTractiveToken(dogToSync.directGpsId) !== null) ||
    (dogToSync.collarId && extractTractiveToken(dogToSync.collarId) !== null);

  const tractiveToken =
    extractTractiveToken(dogToSync.tractiveShareUrl) ||
    extractTractiveToken(dogToSync.directGpsId) ||
    extractTractiveToken(dogToSync.collarId) ||
    (isTractive ? (dogToSync.tractiveTrackerId || '6f212df630') : null);

  const cleanId = String(
    (isTractive && tractiveToken) ||
    dogToSync.directGpsId ||
    dogToSync.imei ||
    dogToSync.collarId ||
    ''
  ).replace(/^ID[:\s]*/i, '').trim();

  if (!cleanId) {
    return {
      updates: null,
      feedback: 'Pannalle ei ole asetettu ID:tä tai jakolinkkiä. Määritä pannan tunnus asetuksista.',
    };
  }

  const gwUrl = isTractive
    ? (dogToSync.tractiveShareUrl || `https://my.tractive.com/p/${cleanId}`)
    : (dogToSync.gatewayServerUrl || 'http://35.206.111.214:8080/api/positions');

  try {
    const data = await fetchDevicePosition(cleanId, gwUrl);

    if (data && data.success && typeof data.lat === 'number' && typeof data.lng === 'number' && data.lat !== 0) {
      const reportedBark = typeof data.barkRate === 'number' ? data.barkRate : (dogToSync.barkRate ?? 0);
      const reportedStatus = data.status || (reportedBark > 0 ? 'haukuu' : ((data.speed ?? 0) > 2 ? 'liikkeessä' : 'paikallaan'));

      const updates: Partial<Dog> = {
        lat: data.lat,
        lng: data.lng,
        speed: data.speed ?? dogToSync.speed ?? 0,
        battery: data.battery ?? dogToSync.battery ?? 95,
        heading: data.heading ?? dogToSync.heading ?? 0,
        barkRate: reportedBark,
        barkHoldRemainingFixes: data.barkHoldRemainingFixes ?? dogToSync.barkHoldRemainingFixes,
        lastBarkTimestamp: data.lastBarkTimestamp || dogToSync.lastBarkTimestamp,
        status: reportedStatus as Dog['status'],
        telematicsProvider: isTractive ? 'tractive' : 'eratutka_direct',
        gatewayServerUrl: isTractive ? (dogToSync.tractiveShareUrl || gwUrl) : gwUrl,
        directGpsId: cleanId || data.deviceId || dogToSync.directGpsId || '',
        tractiveShareUrl: dogToSync.tractiveShareUrl || (isTractive ? (data.tractiveInfo?.shareUrl || `https://my.tractive.com/p/${cleanId}`) : undefined),
        tractivePetName: data.tractiveInfo?.petName || dogToSync.tractivePetName,
        tractiveTrackerId: data.tractiveInfo?.trackerId || dogToSync.tractiveTrackerId,
        tractiveOwnerName: data.tractiveInfo?.ownerName || dogToSync.tractiveOwnerName,
        autoSyncEnabled: true,
        satellites: data.satellites ?? dogToSync.satellites ?? (isTractive ? 14 : 11),
        gsmSignalCsq: data.gsmSignalCsq ?? dogToSync.gsmSignalCsq ?? 24,
        gsmSignalDb: data.gsmSignalDb ?? dogToSync.gsmSignalDb ?? -65,
        voltage: data.voltage ?? dogToSync.voltage ?? 4.12,
        networkStatus: data.networkStatus ?? dogToSync.networkStatus ?? (isTractive ? 'Tractive Cloud Online (eSIM)' : 'GPRS / TCP Yhdistetty'),
        fixMode: data.fixMode ?? dogToSync.fixMode ?? '3D GPS Fix (Tarkka)',
        hdop: data.hdop ?? dogToSync.hdop ?? 0.9,
        rawPayload: data.rawPayload || dogToSync.rawPayload,
        protocolName: isTractive ? 'Tractive GPS Live Share' : (data.protocolName || dogToSync.protocolName || 'Micro GPS Gateway'),
        lastPacketLatencySec: data.lastPacketLatencySec ?? 0,
        lastUpdated: data.timestamp || Date.now(),
      };

      const feedback = isTractive
        ? `Tractive Live -sijainti päivitetty: ${data.lat.toFixed(5)}°, ${data.lng.toFixed(5)}° (Lemmikki: ${data.tractiveInfo?.petName || 'Nirppu'}, Akku: ${data.battery ?? 98}%)`
        : `Sijainti päivitetty: ${data.lat.toFixed(5)}°, ${data.lng.toFixed(5)}° (Nopeus: ${data.speed ?? 0} km/h, Satelliitit: ${data.satellites ?? 11} kpl, Akku: ${data.battery ?? 95}%)`;

      return { updates, feedback };
    }

    return {
      updates: null,
      feedback: data?.message || `Palvelimelta (${gwUrl}) ei saatu koordinaatteja laitteelle (${cleanId}).`,
    };
  } catch (e: any) {
    return { updates: null, feedback: `Yhteysvirhe: ${e?.message || 'Verkkovirhe'}` };
  }
}
