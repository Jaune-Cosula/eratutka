/**
 * Collar Service for Erätutka
 * Unifies telematics fetching between useDogTracker and manual sync components.
 */

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
