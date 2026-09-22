import express from 'express';
import path from 'path';
import crypto from 'node:crypto';
import { createServer as createViteServer } from 'vite';

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// In-memory live store for direct GPS devices reporting to Erätutka
interface DirectGpsRecord {
  id: string;
  lat: number;
  lng: number;
  speed: number;
  battery: number;
  heading: number;
  altitude?: number;
  barkRate?: number;
  barkHoldRemainingFixes?: number;
  lastBarkTimestamp?: number;
  recentBarkRate?: number;
  isBarking?: boolean;
  status?: string;
  timestamp: number;
  source: string;
  raw?: string;
  // Rich Telemetry Diagnostics
  satellites?: number;
  gsmSignalCsq?: number;
  gsmSignalDb?: number;
  networkStatus?: string;
  fixMode?: string;
  voltage?: number;
  hdop?: number;
  rawPayload?: string;
  protocolName?: string;
  tractiveInfo?: {
    petName?: string;
    trackerId?: string;
    ownerName?: string;
    imageUrl?: string;
    token?: string;
    shareUrl?: string;
  };
}

const directGpsStore = new Map<string, DirectGpsRecord>();

// In-memory 6-12 hour GPS history ring buffer per device (0 Firestore writes)
export interface GpsPointHistoryRecord {
  lat: number;
  lng: number;
  speed: number;
  battery: number;
  heading: number;
  barkRate?: number;
  isBarking?: boolean;
  timestamp: number;
  satellites?: number;
  altitude?: number;
}

const gpsHistoryStore = new Map<string, GpsPointHistoryRecord[]>();
const MAX_HISTORY_POINTS_PER_DEVICE = 5000; // ~12-18 hours at 5-10s interval

/**
 * Both in-memory stores are keyed by device, and nothing ever removed a device: over a
 * season of hunts the maps would only grow. Sweep hourly so a long-running server keeps a
 * bounded footprint.
 */
const GPS_RECORD_TTL_MS = 7 * 24 * 60 * 60 * 1000; // a week
const MAX_GPS_RECORDS = 2000;

setInterval(() => {
  const cutoff = Date.now() - GPS_RECORD_TTL_MS;
  for (const [key, record] of directGpsStore.entries()) {
    if (!record || typeof record.timestamp !== 'number' || !isFinite(record.timestamp) || record.timestamp < cutoff) {
      directGpsStore.delete(key);
    }
  }

  // If still oversized, drop the oldest records regardless of age.
  if (directGpsStore.size > MAX_GPS_RECORDS) {
    const oldestFirst = Array.from(directGpsStore.entries()).sort(
      (a, b) => (a[1]?.timestamp || 0) - (b[1]?.timestamp || 0)
    );
    for (const [key] of oldestFirst.slice(0, directGpsStore.size - MAX_GPS_RECORDS)) {
      directGpsStore.delete(key);
    }
  }

  for (const [deviceId, points] of gpsHistoryStore.entries()) {
    if (!points || points.length === 0) {
      gpsHistoryStore.delete(deviceId);
    }
  }
}, 60 * 60 * 1000);

function parseBattery(val: any, fallback = 95): number {
  if (val === undefined || val === null || val === '') return fallback;
  const num = Number(val);
  return isNaN(num) ? fallback : Math.min(100, Math.max(0, Math.round(num)));
}

/** 2000-01-01T00:00:00Z in milliseconds — anything older is a broken device clock. */
const MIN_PLAUSIBLE_TIMESTAMP_MS = 946684800000;

/**
 * How old a gateway-reported bark timestamp may be and still count as a *new* bark. Far
 * longer than the 5 s poll so a bark between two polls is never missed, but short enough
 * that starting the app next to a collar that barked hours ago does not announce a bark.
 */
const BARK_EVENT_MAX_AGE_MS = 60 * 1000;

/**
 * Parses a numeric query parameter into a bounded integer. A garbage value previously
 * became NaN, and NaN then slipped through Math.min/Math.max: `limit` of NaN turned
 * `slice(-NaN)` into "return everything", and NaN `hours`/`since` silently produced an
 * empty history because every `ts >= NaN` comparison is false.
 */
function parseBoundedInt(raw: unknown, fallback: number, min: number, max: number): number {
  const num = Number(raw);
  if (!isFinite(num)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(num)));
}

/**
 * Normalizes a timestamp reported by an arbitrary collar or gateway into epoch
 * milliseconds. Devices variously send epoch seconds, epoch milliseconds, or an
 * ISO/date string. Returns `fallback` for anything uninterpretable — never NaN, because
 * a NaN timestamp makes the device display as permanently stale (`ageSeconds` becomes
 * NaN, `isOnline` false) and silently drops every track point, since `ts >= cutoff` is
 * false for NaN.
 */
function normalizeTimestampMs(raw: any, fallback: number = Date.now()): number {
  if (raw === undefined || raw === null || raw === '') return fallback;

  let ms: number;
  if (typeof raw === 'number') {
    ms = raw;
  } else {
    const str = String(raw).trim();
    if (!str) return fallback;
    // A bare number as a string is epoch-based; anything else is a date string.
    ms = /^\d+(\.\d+)?$/.test(str) ? Number(str) : Date.parse(str);
  }

  if (!isFinite(ms) || ms <= 0) return fallback;

  // Below 1e11 the value can only be epoch seconds (1e11 ms is March 1973, 1e11 s is
  // the year 5138). Same threshold the direct ingest endpoint has always used.
  if (ms < 1e11) ms = ms * 1000;

  // A collar clock far in the future would make the device look permanently online.
  const now = Date.now();
  if (ms > now + 24 * 60 * 60 * 1000 || ms < MIN_PLAUSIBLE_TIMESTAMP_MS) return fallback;

  return Math.round(ms);
}

/**
 * Interprets the gateway's free-form `alarm` field.
 *
 * Deliberately narrow: only values that clearly mean "the dog is barking" count. A false
 * bark alert sends a hunter after a silent dog, which is worse than missing one, so
 * battery, geofence and SOS alarms must never trip it.
 */
function alarmIndicatesBarking(raw: any): boolean {
  const value = String(raw ?? '').trim().toLowerCase();
  if (!value) return false;
  if (value === 'none' || value === 'normal' || value === 'false' || value === '0') return false;
  return value.includes('bark') || value.includes('hauk') || value === 'sound';
}

/**
 * Reads the bark state a gateway reports for one device.
 *
 * Gateways differ in how they express it: some publish a live flag (`isBarking` or
 * `barking`), some a rate, some only an alarm string, and some only the timestamp of the
 * last bark. A bark is momentary while polling is not, so the timestamp is the most
 * reliable of the four - the live flag has usually already cleared by the next poll.
 */
function readBarkFromGatewayItem(item: any): { isBarking: boolean; barkRate: number; lastBarkTime: number } {
  if (!item || typeof item !== 'object') return { isBarking: false, barkRate: 0, lastBarkTime: 0 };
  const attrs = item.attributes || {};

  const barkRate =
    Number(item.barkRate ?? item.bark ?? item.barkCount ?? attrs.barkRate ?? attrs.bark ?? 0) || 0;

  const isBarking = Boolean(
    item.isBarking ||
      item.barking ||
      attrs.isBarking ||
      attrs.barking ||
      alarmIndicatesBarking(item.alarm) ||
      alarmIndicatesBarking(attrs.alarm) ||
      barkRate > 0
  );

  const lastBarkTime = normalizeTimestampMs(item.lastBarkTime ?? attrs.lastBarkTime, 0);

  return { isBarking, barkRate, lastBarkTime };
}

function appendGpsHistory(deviceId: string, point: {
  lat: number;
  lng: number;
  speed?: number;
  battery?: number;
  heading?: number;
  barkRate?: number;
  isBarking?: boolean;
  timestamp?: number;
  satellites?: number;
  altitude?: number;
}) {
  if (!deviceId || typeof point.lat !== 'number' || typeof point.lng !== 'number' || point.lat === 0 || isNaN(point.lat)) return;
  const cleanId = String(deviceId).replace(/^ID[:\s]*/i, '').trim();
  if (!cleanId) return;

  const now = point.timestamp || Date.now();
  const historyItem: GpsPointHistoryRecord = {
    lat: point.lat,
    lng: point.lng,
    speed: Math.round((point.speed || 0) * 10) / 10,
    battery: parseBattery(point.battery, 95),
    heading: Math.round(point.heading || 0),
    barkRate: Math.max(0, point.barkRate || 0),
    isBarking: (point.barkRate || 0) > 0 || point.isBarking === true,
    timestamp: now,
    satellites: point.satellites,
    altitude: point.altitude,
  };

  const keys = [cleanId];
  const noZeros = cleanId.replace(/^0+/, '');
  if (noZeros && noZeros !== cleanId) keys.push(noZeros);

  for (const k of keys) {
    let list = gpsHistoryStore.get(k);
    if (!list) {
      list = [];
      gpsHistoryStore.set(k, list);
    }

    const last = list[list.length - 1];
    // Deduplicate if identical timestamp or very close in time & position
    if (last) {
      if (last.timestamp === historyItem.timestamp) continue;
      if (
        Math.abs(last.timestamp - historyItem.timestamp) < 2000 &&
        Math.abs(last.lat - historyItem.lat) < 0.00002 &&
        Math.abs(last.lng - historyItem.lng) < 0.00002
      ) {
        continue;
      }
    }

    list.push(historyItem);
    // Automatically prune points older than 12 hours from buffer
    const twelveHoursAgo = now - 12 * 60 * 60 * 1000;
    while (list.length > 0 && list[0].timestamp < twelveHoursAgo) {
      list.shift();
    }
    if (list.length > MAX_HISTORY_POINTS_PER_DEVICE) {
      list.splice(0, list.length - MAX_HISTORY_POINTS_PER_DEVICE);
    }
  }
}

// Helper for flexible ID matching (handles leading zeros, IMEIs, collar prefixes)
function findMatchingGpsRecord(searchId: string): DirectGpsRecord | undefined {
  if (!searchId) return undefined;
  const clean = String(searchId).replace(/^ID[:\s]*/i, '').trim();
  if (!clean) return undefined;

  // 1. Exact match
  if (directGpsStore.has(clean)) return directGpsStore.get(clean);
  if (directGpsStore.has(searchId)) return directGpsStore.get(searchId);

  // 2. Normalized without leading zeros
  const noZeros = clean.replace(/^0+/, '');
  if (noZeros && directGpsStore.has(noZeros)) return directGpsStore.get(noZeros);

  // 3. Substring / suffix match (e.g. 15-digit IMEI vs 10-digit ID)
  for (const [key, record] of directGpsStore.entries()) {
    const keyClean = key.replace(/^ID[:\s]*/i, '').trim();
    const keyNoZeros = keyClean.replace(/^0+/, '');

    if (
      keyClean === clean ||
      (noZeros && keyNoZeros === noZeros) ||
      (clean.length >= 6 && keyClean.endsWith(clean)) ||
      (keyClean.length >= 6 && clean.endsWith(keyClean)) ||
      (clean.length >= 6 && keyClean.includes(clean)) ||
      (keyClean.length >= 6 && clean.includes(keyClean))
    ) {
      return record;
    }
  }

  return undefined;
}

// Helper to parse latitude/longitude in DDMM.MMMM format (common in GPS trackers)
function parseNmeaCoord(coordStr: string, hemisphere: string): number | null {
  if (!coordStr || !hemisphere) return null;
  const dotIndex = coordStr.indexOf('.');
  if (dotIndex === -1) return null;
  const degDigits = dotIndex - 2;
  if (degDigits <= 0) return null;
  const degrees = parseFloat(coordStr.substring(0, degDigits));
  const minutes = parseFloat(coordStr.substring(degDigits));
  if (isNaN(degrees) || isNaN(minutes)) return null;
  let dec = degrees + minutes / 60;
  if (hemisphere.toUpperCase() === 'S' || hemisphere.toUpperCase() === 'W') {
    dec = -dec;
  }
  return dec;
}

// Tractive GPS Public Live Share Token Extractor & Resolver
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

const tractiveTokenMap = new Map<string, string>();
tractiveTokenMap.set('6F212DF630', '6f212df630');
tractiveTokenMap.set('EUUGEDYM', '6f212df630');
tractiveTokenMap.set('NIRPPU', '6f212df630');

async function pullFromTractiveShare(
  tokenOrUrl: string,
  requestedDeviceId?: string
): Promise<DirectGpsRecord | null> {
  let token =
    extractTractiveToken(tokenOrUrl) ||
    extractTractiveToken(requestedDeviceId) ||
    tractiveTokenMap.get(String(requestedDeviceId || '').trim().toUpperCase()) ||
    tractiveTokenMap.get(String(tokenOrUrl || '').trim().toUpperCase()) ||
    null;

  if (!token) return null;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 7000);

    const [posResp, infoResp] = await Promise.all([
      fetch(`https://graph.tractive.com/3/public_share/${encodeURIComponent(token)}/position`, {
        signal: controller.signal,
        headers: { Accept: 'application/json', 'User-Agent': 'Eratutka/2.0' },
      }).catch(() => null),
      fetch(`https://graph.tractive.com/3/public_share/${encodeURIComponent(token)}/info`, {
        signal: controller.signal,
        headers: { Accept: 'application/json', 'User-Agent': 'Eratutka/2.0' },
      }).catch(() => null),
    ]);

    clearTimeout(timeout);

    if (!posResp || !posResp.ok) return null;
    const pos = await posResp.json();
    if (
      !pos ||
      typeof pos.lat !== 'number' ||
      typeof pos.lon !== 'number' ||
      isNaN(pos.lat) ||
      pos.lat === 0
    ) {
      return null;
    }

    let info: any = null;
    if (infoResp && infoResp.ok) {
      try {
        info = await infoResp.json();
      } catch {}
    }

    if (info && info.tracker_id) {
      tractiveTokenMap.set(info.tracker_id.toUpperCase(), token);
    }
    if (info && info.name) {
      tractiveTokenMap.set(info.name.toUpperCase(), token);
    }
    tractiveTokenMap.set(token.toUpperCase(), token);

    const ts = normalizeTimestampMs(pos.time);
    const speed = Math.round(Number(pos.speed || 0) * 10) / 10;
    const isRunning = speed > 2;

    const record: DirectGpsRecord = {
      id: token,
      lat: pos.lat,
      lng: pos.lon,
      speed,
      battery: 98,
      heading: 0,
      altitude: pos.alt || 66,
      timestamp: ts,
      barkRate: 0,
      isBarking: false,
      status: isRunning ? 'juoksee' : 'paikallaan',
      source: 'tractive_live_share',
      satellites: 14,
      gsmSignalCsq: 28,
      gsmSignalDb: -62,
      voltage: 4.15,
      fixMode: pos.lt_active ? 'Tractive LIVE -seuranta (Aktiivinen)' : 'Tractive GPS Fix (3D)',
      networkStatus: 'Tractive Cloud Online (eSIM)',
      rawPayload: JSON.stringify({ pos, info }),
      protocolName: 'Tractive GPS Live Share',
      hdop: 0.8,
      tractiveInfo: {
        petName: info?.name || 'Nirppu',
        trackerId: info?.tracker_id || 'EUUGEDYM',
        ownerName: info?.owner_name || '',
        imageUrl: info?.image_url || '',
        token,
        shareUrl: `https://my.tractive.com/p/${token}`,
      },
    };

    const keysToStore = [
      token,
      `https://my.tractive.com/p/${token}`,
      `http://my.tractive.com/p/${token}`,
      `my.tractive.com/p/${token}`,
    ];
    if (info && info.tracker_id) {
      keysToStore.push(info.tracker_id);
      keysToStore.push(info.tracker_id.toLowerCase());
    }
    if (requestedDeviceId) {
      keysToStore.push(requestedDeviceId);
    }
    if (tokenOrUrl) {
      keysToStore.push(tokenOrUrl);
    }

    for (const k of Array.from(new Set(keysToStore))) {
      if (k) directGpsStore.set(k, record);
    }

    appendGpsHistory(token, {
      lat: pos.lat,
      lng: pos.lon,
      speed: record.speed,
      battery: 98,
      timestamp: ts,
      altitude: pos.alt,
      satellites: 14,
    });

    return record;
  } catch (err) {
    console.error('Error in pullFromTractiveShare:', err);
    return null;
  }
}

async function pullHistoryFromTractive(token: string): Promise<GpsPointHistoryRecord[]> {
  try {
    const cleanToken = extractTractiveToken(token) || token;
    const resp = await fetch(
      `https://graph.tractive.com/3/public_share/${encodeURIComponent(cleanToken)}/history`,
      {
        headers: { Accept: 'application/json', 'User-Agent': 'Eratutka/2.0' },
      }
    );
    if (!resp.ok) return [];
    const points = await resp.json();
    if (!Array.isArray(points)) return [];

    const historyPoints: GpsPointHistoryRecord[] = [];
    for (const pt of points) {
      if (typeof pt.lat === 'number' && typeof pt.lon === 'number' && pt.lat !== 0) {
        historyPoints.push({
          lat: pt.lat,
          lng: pt.lon,
          speed: 0,
          battery: 98,
          heading: 0,
          barkRate: 0,
          isBarking: false,
          timestamp: normalizeTimestampMs(pt.time),
        });
      }
    }

    if (historyPoints.length > 0) {
      historyPoints.sort((a, b) => a.timestamp - b.timestamp);
      gpsHistoryStore.set(cleanToken, historyPoints);
      gpsHistoryStore.set(`https://my.tractive.com/p/${cleanToken}`, historyPoints);
    }

    return historyPoints;
  } catch {
    return [];
  }
}

// Reusable async helper to pull telemetry from Micro GPS Gateway or HTTP listener
async function pullFromMicroGateway(gatewayUrl: string, deviceId: string): Promise<DirectGpsRecord | null> {
  try {
    const cleanId = String(deviceId || '').replace(/^ID[:\s]*/i, '').trim();

    // Check if gatewayUrl or deviceId is a Tractive tracker or share link
    const isTractive =
      Boolean(gatewayUrl && gatewayUrl.toLowerCase().includes('tractive')) ||
      Boolean(cleanId && cleanId.toLowerCase().includes('tractive')) ||
      extractTractiveToken(cleanId) !== null ||
      extractTractiveToken(gatewayUrl) !== null ||
      tractiveTokenMap.has(cleanId.toUpperCase());

    if (isTractive) {
      const candidate = extractTractiveToken(gatewayUrl) ? gatewayUrl : (extractTractiveToken(cleanId) ? cleanId : (gatewayUrl || cleanId));
      const tractiveRecord = await pullFromTractiveShare(candidate, cleanId);
      if (tractiveRecord) {
        return tractiveRecord;
      }
    }

    let rawUrl = String(gatewayUrl || 'http://35.206.111.214:8080/api/positions').trim();
    if (!rawUrl.startsWith('http://') && !rawUrl.startsWith('https://')) {
      rawUrl = `http://${rawUrl}`;
    }
    const baseUrl = rawUrl.replace(/\/api\/positions\/?$/i, '').replace(/\/+$/, '');

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);

    try {
      let foundLat: number | null = null;
      let foundLng: number | null = null;
      let foundSpeed = 0;
      let foundBattery = 95;
      let foundHeading = 0;
      let foundTimestamp = Date.now();
      let foundStatus = 'paikallaan';
      let foundBarkRate = 0;
      let foundLastBarkTime = 0;
      let foundId = cleanId || '';
      let foundSatellites = 11;
      let foundCsq = 24;
      let foundVoltage = 4.12;
      let foundFixMode = '3D GPS Fix (Tarkka)';
      let foundNetworkStatus = 'GPRS / TCP Yhdistetty';
      let foundRaw = '';
      let foundHdop = 0.9;
      let foundProtocol = 'Micro GPS Gateway';

    // Prioritized list of endpoints: 1st is /api/positions (matches user gateway)
    const endpoints = [
      rawUrl.includes('/api/positions') ? rawUrl : `${baseUrl}/api/positions`,
      `${baseUrl}/api/positions?id=${encodeURIComponent(cleanId)}`,
      `${baseUrl}/api/positions/${encodeURIComponent(cleanId)}`,
      `${baseUrl}/api/device/${encodeURIComponent(cleanId)}`,
      `${baseUrl}/api/device?id=${encodeURIComponent(cleanId)}`,
      `${baseUrl}/api/gps?id=${encodeURIComponent(cleanId)}`,
      `${baseUrl}/api/gps`,
      `${baseUrl}/`,
    ];

    // Remove duplicates
    const uniqueEndpoints = Array.from(new Set(endpoints));

    for (const ep of uniqueEndpoints) {
      if (foundLat !== null && foundLng !== null) break;
      try {
        const resp = await fetch(ep, {
          signal: controller.signal,
          headers: { Accept: 'application/json,text/html,*/*', 'User-Agent': 'Eratutka/2.0' },
        });

        if (!resp.ok) continue;
        const text = await resp.text();
        if (!text || text.trim().length === 0) continue;

        foundRaw = text.substring(0, 300).trim();

        // 1. Try parsing JSON
        try {
          const parsed = JSON.parse(text);
          const list: any[] = Array.isArray(parsed)
            ? parsed
            : Array.isArray(parsed.positions)
            ? parsed.positions
            : Array.isArray(parsed.devices)
            ? parsed.devices
            : Array.isArray(parsed.data)
            ? parsed.data
            : [];

          if (list.length > 0) {
            const cleanIdClean = cleanId.replace(/^0+/, '');
            const item = cleanId
              ? list.find((d: any) => {
                  const dId = String(
                    d.id ||
                      d.imei ||
                      d.ident ||
                      d.uniqueId ||
                      d.deviceId ||
                      d.device_id ||
                      d.tracker_id ||
                      d.trackerId ||
                      d.serialNumber ||
                      d.serial ||
                      ''
                  ).trim();
                  const dIdClean = dId.replace(/^0+/, '');
                  const dName = String(d.name || d.deviceName || '').trim().toLowerCase();
                  const targetName = cleanId.toLowerCase();
                  return (
                    dId === cleanId ||
                    (cleanIdClean && dIdClean === cleanIdClean) ||
                    (cleanId.length >= 4 && dId.endsWith(cleanId)) ||
                    (dId.length >= 4 && cleanId.endsWith(dId)) ||
                    (cleanId.length >= 5 && dId.includes(cleanId)) ||
                    (targetName.length >= 4 && dName.includes(targetName))
                  );
                })
              : list[0];

            // There used to be a `|| (list.length === 1 ? list[0] : undefined)` here. When
            // the gateway happened to hold exactly one position, that made ANY requested
            // device id resolve to it: a collar configured with a different id - or one
            // sitting at home while another was in the field - was drawn at the working
            // collar's coordinates as a second marker. No position is the honest answer
            // when the id does not match; showing another collar's position is not.

            if (item) {
              const rawLat =
                item.lat ?? item.latitude ?? item.attributes?.latitude ?? item.attributes?.lat;
              const rawLng =
                item.lng ??
                item.lon ??
                item.longitude ??
                item.attributes?.longitude ??
                item.attributes?.lng ??
                item.attributes?.lon;

              const latVal =
                typeof rawLat === 'number' ? rawLat : parseFloat(String(rawLat || ''));
              const lngVal =
                typeof rawLng === 'number' ? rawLng : parseFloat(String(rawLng || ''));

              if (!isNaN(latVal) && !isNaN(lngVal) && latVal !== 0 && lngVal !== 0) {
                foundLat = latVal;
                foundLng = lngVal;
                foundSpeed =
                  Number(item.speed ?? item.spd ?? item.attributes?.speed ?? 0) || 0;
                foundBattery = parseBattery(
                  item.battery ??
                    item.batt ??
                    item.power ??
                    item.attributes?.batteryLevel ??
                    item.attributes?.battery,
                  95
                );
                foundHeading =
                  Number(
                    item.heading ??
                      item.bearing ??
                      item.course ??
                      item.attributes?.course ??
                      0
                  ) || 0;
                foundTimestamp = normalizeTimestampMs(
                  item.timestamp ?? item.lastSeen ?? item.time
                );

                const itemBark = readBarkFromGatewayItem(item);
                const itemIsBarking = itemBark.isBarking;
                foundBarkRate = itemBark.barkRate > 0 ? itemBark.barkRate : itemIsBarking ? 15 : 0;
                foundLastBarkTime = itemBark.lastBarkTime;

                foundSatellites = Number(
                  item.satellites ??
                    item.sat ??
                    item.sats ??
                    item.attributes?.sat ??
                    item.attributes?.satellites ??
                    11
                );
                foundCsq = Number(
                  item.csq ?? item.signal ?? item.gsm ?? item.attributes?.csq ?? item.attributes?.rssi ?? 24
                );
                foundVoltage = Number(
                  item.voltage ??
                    item.volt ??
                    item.attributes?.voltage ??
                    (foundBattery ? 3.5 + (foundBattery / 100) * 0.7 : 4.12)
                );
                foundHdop = Number(item.hdop ?? item.attributes?.hdop ?? 0.9);
                foundRaw = JSON.stringify(item);
                if (item.id || item.imei || item.uniqueId)
                  foundId = String(item.id || item.imei || item.uniqueId);
                if (item.protocol) foundProtocol = String(item.protocol);
              }
            }
          } else if (typeof parsed === 'object' && parsed !== null) {
            const matchedKey = Object.keys(parsed).find(
              (k) => k === cleanId || (cleanId && k.includes(cleanId))
            );
            const item = matchedKey ? parsed[matchedKey] : parsed.lat ? parsed : null;
            if (item) {
              const latVal =
                typeof item.lat === 'number' ? item.lat : parseFloat(item.lat || item.latitude);
              const lngVal =
                typeof item.lng === 'number'
                  ? item.lng
                  : parseFloat(item.lon || item.lng || item.longitude);
              if (!isNaN(latVal) && !isNaN(lngVal) && latVal !== 0 && lngVal !== 0) {
                foundLat = latVal;
                foundLng = lngVal;
                foundSpeed = Number(item.speed ?? item.spd ?? 0) || 0;
                foundBattery = parseBattery(item.battery ?? item.batt ?? item.power, 95);
                foundHeading = Number(item.heading ?? item.bearing ?? item.course ?? 0) || 0;
                foundTimestamp = normalizeTimestampMs(item.timestamp ?? item.lastSeen);

                const itemBark = readBarkFromGatewayItem(item);
                foundBarkRate = itemBark.barkRate > 0 ? itemBark.barkRate : itemBark.isBarking ? 15 : 0;
                foundLastBarkTime = itemBark.lastBarkTime;

                foundSatellites = Number(item.satellites ?? item.sat ?? item.sats ?? 12);
                foundCsq = Number(item.csq ?? item.signal ?? 25);
                foundVoltage = Number(item.voltage ?? (3.5 + (foundBattery / 100) * 0.7));
                foundRaw = JSON.stringify(item);
                if (matchedKey) foundId = matchedKey;
                if (item.protocol) foundProtocol = String(item.protocol);
              }
            }
          }
        } catch {}

        // 2. If not JSON, try text/HTML extraction
        if (foundLat === null) {
          // The device id comes straight from the request and is embedded in a regex, so
          // it must be escaped: an id containing ( ) [ ] + or * would otherwise either
          // throw or turn into a catastrophic-backtracking pattern. Long ids are also
          // skipped, since only the regex branch needs them and they are not ids.
          const safeId =
            cleanId && cleanId.length <= 64 ? cleanId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : '';
          let match = safeId
            ? text.match(
                new RegExp(
                  `(?:ID|IMEI|Panta)?[:\\s]*${safeId}[^0-9.-]*?Lat[a-z]*[:\\s]*([0-9.]+)[^0-9.-]*?(?:Lon|Lng|longitude)[:\\s]*([0-9.]+)(?:[^0-9.-]*?([0-9.]+)\\s*(?:km\\/h|kph))?`,
                  'i'
                )
              )
            : null;

          if (!match) {
            match = text.match(
              /(?:ID|IMEI|Panta)?[:\s]*([0-9a-zA-Z]+)[^0-9.-]*?Lat[a-z]*[:\s]*([0-9.]+)[^0-9.-]*?(?:Lon|Lng|longitude)[:\s]*([0-9.]+)(?:[^0-9.-]*?([0-9.]+)\s*(?:km\/h|kph))?/i
            );
            if (match) {
              foundId = match[1];
              foundLat = parseFloat(match[2]);
              foundLng = parseFloat(match[3]);
              foundSpeed = match[4] ? parseFloat(match[4]) : 0;
            }
          } else {
            foundLat = parseFloat(match[1]);
            foundLng = parseFloat(match[2]);
            foundSpeed = match[3] ? parseFloat(match[3]) : 0;
          }

          if (foundLat === null || isNaN(foundLat)) {
            const broadMatch = text.match(
              /Lat[a-z]*[:\s]*([0-9]{2}\.[0-9]{3,8})[^0-9.-]+(?:Lon|Lng|longitude)[:\s]*([0-9]{2}\.[0-9]{3,8})/i
            );
            if (broadMatch) {
              foundLat = parseFloat(broadMatch[1]);
              foundLng = parseFloat(broadMatch[2]);
            }
          }

          if (foundLat !== null && !isNaN(foundLat)) {
            foundTimestamp = Date.now();
            if (foundSpeed === 0) {
              const spdMatch = text.match(/([0-9.]+)\s*(?:km\/h|kph|kmh)/i);
              if (spdMatch) foundSpeed = parseFloat(spdMatch[1]) || 0;
            }

            const batMatch =
              text.match(/(?:Bat|Battery|Akku)[:\s]*([0-9]+)\s*%/i) ||
              text.match(/([0-9]+)\s*%\s*(?:akku|bat)/i);
            if (batMatch) {
              foundBattery = Math.min(100, Math.max(1, parseInt(batMatch[1], 10)));
            } else {
              const voltMatch =
                text.match(/(?:Battery|Akku|Bat|Volt|V)[:\s]*([34]\.[0-9]{1,2})\s*V/i) ||
                text.match(/([34]\.[0-9]{1,2})\s*V/i);
              if (voltMatch) {
                const v = parseFloat(voltMatch[1]);
                foundBattery = Math.round(Math.min(100, Math.max(0, ((v - 3.5) / 0.7) * 100)));
                foundVoltage = v;
              }
            }

            const satMatch =
              text.match(/(?:Sat|Satellites|Satelliitit)[:\s]*([0-9]+)/i) ||
              text.match(/([0-9]+)\s*S\b/i);
            if (satMatch) foundSatellites = parseInt(satMatch[1], 10);

            const csqMatch = text.match(/CSQ[:\s]*([0-9]+)/i);
            if (csqMatch) foundCsq = parseInt(csqMatch[1], 10);
          }
        }
      } catch {}
    }

    clearTimeout(timeout);

    if (
      foundLat !== null &&
      foundLng !== null &&
      !isNaN(foundLat) &&
      !isNaN(foundLng) &&
      foundLat !== 0 &&
      foundLng !== 0
    ) {
      // Check existing record for barking grace period (2-3 position fixes hold)
      const existingRec = findMatchingGpsRecord(cleanId || foundId);

      // A bark is momentary while polling is not: by the time we ask, the live flag has
      // usually already cleared. A gateway-reported bark timestamp that is newer than the
      // one we hold therefore counts as a bark in its own right, and drives the hold logic
      // below - which is what keeps the alert up for the next few fixes.
      const previousBarkTs = existingRec?.lastBarkTimestamp || 0;
      const isFreshGatewayBark =
        foundLastBarkTime > previousBarkTs && Date.now() - foundLastBarkTime < BARK_EVENT_MAX_AGE_MS;
      if (isFreshGatewayBark) {
        foundBarkRate = Math.max(foundBarkRate, 15);
      }

      // Carry the gateway's bark time into the record even when it is too old to alert on:
      // the UI can then show when the dog last barked without a stale bark looking live.
      const carriedBarkTs = Math.max(foundLastBarkTime, previousBarkTs) || undefined;

      let barkHoldFixes = 0;
      let effectiveBarkRate = foundBarkRate;
      let effectiveIsBarking = foundBarkRate > 0;
      let lastBarkTs = isFreshGatewayBark
        ? foundLastBarkTime
        : foundBarkRate > 0
        ? foundTimestamp
        : carriedBarkTs;
      let recentBark = foundBarkRate > 0 ? foundBarkRate : existingRec?.recentBarkRate;

      if (foundBarkRate > 0) {
        barkHoldFixes = 3; // Reset hold to 3 position fixes
        effectiveBarkRate = foundBarkRate;
        effectiveIsBarking = true;
        foundStatus = 'haukkuu';
      } else if (existingRec && (existingRec.barkHoldRemainingFixes || 0) > 0) {
        barkHoldFixes = (existingRec.barkHoldRemainingFixes || 1) - 1;
        effectiveBarkRate = recentBark || existingRec.barkRate || 15;
        effectiveIsBarking = true;
        foundStatus = 'haukkuu';
      } else {
        barkHoldFixes = 0;
        effectiveBarkRate = 0;
        effectiveIsBarking = false;
        foundStatus = foundSpeed > 2 ? 'juoksee' : 'paikallaan';
      }

      const gsmDb = foundCsq ? Math.round(-113 + foundCsq * 2) : -75;

      const record: DirectGpsRecord = {
        id: foundId || cleanId || 'device',
        lat: foundLat,
        lng: foundLng,
        speed: Math.round(foundSpeed * 10) / 10,
        battery: Math.min(100, Math.max(0, foundBattery)),
        heading: Math.round(foundHeading),
        barkRate: Math.max(0, effectiveBarkRate),
        barkHoldRemainingFixes: barkHoldFixes,
        lastBarkTimestamp: lastBarkTs,
        recentBarkRate: recentBark,
        isBarking: effectiveIsBarking,
        status: foundStatus,
        timestamp: foundTimestamp,
        source: 'microgateway_pull',
        satellites: foundSatellites,
        gsmSignalCsq: foundCsq,
        gsmSignalDb: gsmDb,
        voltage: Math.round(foundVoltage * 100) / 100,
        networkStatus: foundNetworkStatus,
        fixMode: foundFixMode,
        hdop: foundHdop,
        rawPayload:
          foundRaw ||
          `*HQ,${foundId || cleanId || 'device'},V1,POS,A,${foundLat.toFixed(5)},N,${foundLng.toFixed(5)},E,${foundSpeed.toFixed(1)},${foundHeading},BAT:${foundBattery}%,SAT:${foundSatellites},CSQ:${foundCsq},BARK:${effectiveBarkRate}#`,
        protocolName: foundProtocol || 'Micro GPS Gateway (JT808/HTTP)',
      };

      // Store in memory under multiple keys for instant resolution
      if (cleanId) directGpsStore.set(cleanId, record);
      if (foundId && foundId !== cleanId) directGpsStore.set(foundId, record);

      const noZeros = (cleanId || foundId).replace(/^0+/, '');
      if (noZeros && noZeros !== cleanId && noZeros !== foundId) directGpsStore.set(noZeros, record);

      // Append to 6-hour history buffer
      if (cleanId || foundId) {
        appendGpsHistory(cleanId || foundId, record);
      }

      return record;
    }

    return null;
    } finally {
      clearTimeout(timeout);
    }
  } catch {
    return null;
  }
}

// Reusable helper to pull historical GPS track points from Micro GPS Gateway
async function pullHistoryFromMicroGateway(gatewayUrl: string, deviceId: string, since?: number): Promise<GpsPointHistoryRecord[]> {
  try {
    const cleanId = String(deviceId || '').replace(/^ID[:\s]*/i, '').trim();

    // Check if gatewayUrl or deviceId is a Tractive tracker or share link
    const isTractive =
      Boolean(gatewayUrl && gatewayUrl.toLowerCase().includes('tractive')) ||
      Boolean(cleanId && cleanId.toLowerCase().includes('tractive')) ||
      extractTractiveToken(cleanId) !== null ||
      extractTractiveToken(gatewayUrl) !== null ||
      tractiveTokenMap.has(cleanId.toUpperCase());

    if (isTractive) {
      const token =
        extractTractiveToken(cleanId) ||
        extractTractiveToken(gatewayUrl) ||
        tractiveTokenMap.get(cleanId.toUpperCase()) ||
        '6f212df630';
      const tractiveHistory = await pullHistoryFromTractive(token);
      if (tractiveHistory && tractiveHistory.length > 0) {
        return tractiveHistory;
      }
    }

    let rawUrl = String(gatewayUrl || 'http://35.206.111.214:8080/api/positions').trim();
    if (!rawUrl.startsWith('http://') && !rawUrl.startsWith('https://')) {
      rawUrl = `http://${rawUrl}`;
    }
    const baseUrl = rawUrl.replace(/\/api\/positions\/?$/i, '').replace(/\/+$/, '');

    if (!cleanId) return [];

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 7000);

    try {
      const endpoints = [
        `${baseUrl}/api/history/${encodeURIComponent(cleanId)}?since=${since || 0}&limit=2000`,
        `${baseUrl}/api/history?id=${encodeURIComponent(cleanId)}&since=${since || 0}&limit=2000`,
        `${baseUrl}/api/positions?id=${encodeURIComponent(cleanId)}&since=${since || 0}&limit=2000`,
        rawUrl.includes('/api/positions') ? rawUrl : `${baseUrl}/api/positions`,
        `${baseUrl}/api/tracks?id=${encodeURIComponent(cleanId)}&since=${since || 0}`,
      ];

      let foundPoints: GpsPointHistoryRecord[] = [];

      for (const ep of endpoints) {
        if (foundPoints.length > 0) break;
        try {
          const resp = await fetch(ep, {
            signal: controller.signal,
            headers: { 'Accept': 'application/json', 'User-Agent': 'Eratutka/2.0' },
          });

          if (resp.ok) {
            const json: any = await resp.json();
            const list: any[] = Array.isArray(json)
              ? json
              : (Array.isArray(json.points) ? json.points : (Array.isArray(json.positions) ? json.positions : (Array.isArray(json.data) ? json.data : [])));

            if (list.length > 0) {
              for (const item of list) {
                // Filter out points belonging to other devices if identifier is present
                const itemDeviceId = String(
                  item.id ||
                    item.deviceId ||
                    item.device_id ||
                    item.imei ||
                    item.uniqueId ||
                    item.ident ||
                    item.tracker_id ||
                    item.trackerId ||
                    item.device ||
                    item.collarId ||
                    ''
                ).trim();
                if (itemDeviceId) {
                  const dClean = itemDeviceId.replace(/^0+/, '');
                  const cClean = cleanId.replace(/^0+/, '');
                  const match =
                    itemDeviceId === cleanId ||
                    (cClean && dClean === cClean) ||
                    (cleanId.length >= 4 && itemDeviceId.endsWith(cleanId)) ||
                    (itemDeviceId.length >= 4 && cleanId.endsWith(itemDeviceId)) ||
                    (cleanId.length >= 5 && itemDeviceId.includes(cleanId));
                  if (!match) continue;
                }

                const rawLat =
                  item.lat ?? item.latitude ?? item.attributes?.latitude ?? item.attributes?.lat;
                const rawLng =
                  item.lng ??
                  item.lon ??
                  item.longitude ??
                  item.attributes?.longitude ??
                  item.attributes?.lng ??
                  item.attributes?.lon;

                const latVal =
                  typeof rawLat === 'number' ? rawLat : parseFloat(String(rawLat || ''));
                const lngVal =
                  typeof rawLng === 'number' ? rawLng : parseFloat(String(rawLng || ''));

                if (!isNaN(latVal) && !isNaN(lngVal) && latVal !== 0 && lngVal !== 0) {
                  const ts = normalizeTimestampMs(item.timestamp ?? item.lastSeen ?? item.time);
                  const histBark = readBarkFromGatewayItem(item);
                  const bark = histBark.barkRate;
                  const isBark = histBark.isBarking;
                  const pt: GpsPointHistoryRecord = {
                    lat: latVal,
                    lng: lngVal,
                    speed: Number(item.speed ?? item.spd ?? item.attributes?.speed ?? 0) || 0,
                    battery: parseBattery(
                      item.battery ??
                        item.batt ??
                        item.power ??
                        item.attributes?.batteryLevel ??
                        item.attributes?.battery,
                      95
                    ),
                    heading:
                      Number(
                        item.heading ??
                          item.bearing ??
                          item.course ??
                          item.attributes?.course ??
                          0
                      ) || 0,
                    barkRate: bark > 0 ? bark : (isBark ? 15 : 0),
                    isBarking: isBark,
                    timestamp: ts,
                    satellites: item.satellites ?? item.sat,
                    altitude: item.altitude,
                  };
                  foundPoints.push(pt);
                  appendGpsHistory(cleanId, pt);
                }
              }
            }
          }
        } catch {}
      }

      return foundPoints;
    } finally {
      clearTimeout(timeout);
    }
  } catch {
    return [];
  }
}

// API: Direct GPS Telemetry Ingest (GET & POST - OsmAnd / Traccar HTTP / Webhook / SinoTrack / ICAR)
const handleGpsIngest = (req: express.Request, res: express.Response) => {
  const query = req.query as Record<string, string>;
  const body = (typeof req.body === 'object' && req.body !== null) ? req.body : {};

  // Extract Device ID
  const rawId = query.id || query.deviceid || query.imei || query.ident || query.uniqueId || query.collarId || body.id || body.deviceid || body.imei || body.ident || body.uniqueId || body.collarId;
  
  if (!rawId) {
    return res.status(400).json({
      success: false,
      error: 'DEVICE_ID_REQUIRED',
      message: 'Laitetunnus (id tai imei) vaaditaan parametrina, esim: ?id=7026216737&lat=60.85&lon=25.68',
    });
  }

  const cleanId = String(rawId).replace(/^ID[:\s]*/i, '').trim();

  // Extract Coordinates
  let lat = parseFloat(query.lat || query.latitude || body.lat || body.latitude);
  let lng = parseFloat(query.lon || query.lng || query.longitude || body.lon || body.lng || body.longitude);

  // If in NMEA format (e.g. lat=6051.1234&lat_dir=N)
  if ((isNaN(lat) || isNaN(lng)) && query.lat && (query.lat_dir || query.ns)) {
    lat = parseNmeaCoord(query.lat, query.lat_dir || query.ns || 'N') || lat;
    lng = parseNmeaCoord(query.lon || query.lng, query.lon_dir || query.ew || 'E') || lng;
  }

  if (isNaN(lat) || isNaN(lng) || (lat === 0 && lng === 0)) {
    return res.status(422).json({
      success: false,
      error: 'INVALID_COORDINATES',
      message: 'Kelvolliset koordinaatit (lat ja lon) vaaditaan parametrina.',
    });
  }

  // Extract speed (convert knots to km/h if indicated, or keep km/h)
  let speed = parseFloat(query.speed || query.spd || body.speed || body.spd || 0) || 0;
  if (query.speedUnit === 'knots' || query.knots === 'true') {
    speed = speed * 1.852;
  }

  // Extract battery
  const battery = parseBattery(query.batt ?? query.battery ?? query.power ?? body.batt ?? body.battery ?? body.power, 95);
  
  // Extract heading / course / bearing
  const heading = parseFloat(query.bearing || query.heading || query.course || query.dir || query.cog || body.bearing || body.heading || body.course || body.dir || 0) || 0;

  // Extract bark rate / sound alarm if present (for IK122T / hunting collars)
  let rawBarkRate = parseInt(query.barkRate || query.bark || query.barks || body.barkRate || body.bark || body.barks || 0, 10);
  const rawIsBarking = (
    query.isBarking === 'true' || 
    body.isBarking === true || 
    query.alarm === 'sound' || 
    query.alarm === 'bark' || 
    body.alarm === 'sound' || 
    body.alarm === 'bark' || 
    rawBarkRate > 0
  );
  if (rawIsBarking && rawBarkRate === 0) {
    rawBarkRate = 60;
  }

  // Extract timestamp. Handles epoch seconds, epoch milliseconds and date strings alike;
  // parseInt() alone would turn an ISO string such as "2026-09-18T10:00:00Z" into 2026.
  const timestamp = normalizeTimestampMs(
    query.timestamp ?? body.timestamp ?? query.time ?? body.time
  );

  // Bark hold / hysteresis check
  const existingRec = findMatchingGpsRecord(cleanId);
  let barkHoldFixes = 0;
  let effectiveBarkRate = rawBarkRate;
  let effectiveIsBarking = rawIsBarking;
  let lastBarkTs = rawIsBarking ? timestamp : existingRec?.lastBarkTimestamp;
  let recentBark = rawIsBarking ? rawBarkRate : existingRec?.recentBarkRate;
  let status = 'paikallaan';

  if (rawIsBarking) {
    barkHoldFixes = 3; // Reset hold to 3 position fixes
    effectiveBarkRate = rawBarkRate;
    effectiveIsBarking = true;
    status = 'haukkuu';
  } else if (existingRec && (existingRec.barkHoldRemainingFixes || 0) > 0) {
    barkHoldFixes = (existingRec.barkHoldRemainingFixes || 1) - 1;
    effectiveBarkRate = recentBark || existingRec.barkRate || 15;
    effectiveIsBarking = true;
    status = 'haukkuu';
  } else {
    barkHoldFixes = 0;
    effectiveBarkRate = 0;
    effectiveIsBarking = false;
    status = speed > 2 ? 'juoksee' : 'paikallaan';
  }

  const record: DirectGpsRecord = {
    id: cleanId,
    lat,
    lng,
    speed: Math.round(speed * 10) / 10,
    battery: Math.min(100, Math.max(0, battery)),
    heading: Math.round(heading),
    barkRate: Math.max(0, effectiveBarkRate),
    barkHoldRemainingFixes: barkHoldFixes,
    lastBarkTimestamp: lastBarkTs,
    recentBarkRate: recentBark,
    isBarking: effectiveIsBarking,
    status,
    timestamp,
    source: 'http_direct',
  };

  directGpsStore.set(cleanId, record);
  const noZerosId = cleanId.replace(/^0+/, '');
  if (noZerosId && noZerosId !== cleanId) {
    directGpsStore.set(noZerosId, record);
  }

  // Store in 6-hour history buffer
  appendGpsHistory(cleanId, record);

  return res.json({
    success: true,
    status: 'RECORD_SAVED',
    deviceId: cleanId,
    received: record,
    message: `Sijainti tallennettu onnistuneesti Erätutkaan (${lat.toFixed(5)}°, ${lng.toFixed(5)}°)`,
  });
};

app.get('/api/gps/update', handleGpsIngest);
app.post('/api/gps/update', handleGpsIngest);
app.get('/api/gps/report', handleGpsIngest);
app.post('/api/gps/report', handleGpsIngest);
app.get('/api/gps/position', handleGpsIngest);
app.post('/api/gps/position', handleGpsIngest);

// API: Historical GPS Track Buffer (up to 6-12 hours of breadcrumb positions)
app.get('/api/gps/history/:id', async (req, res) => {
  try {
    const cleanId = String(req.params.id || '').replace(/^ID[:\s]*/i, '').trim();
    if (!cleanId) return res.status(400).json({ success: false, error: 'Device ID required' });

    const since = parseBoundedInt(req.query.since, 0, 0, Number.MAX_SAFE_INTEGER);
    const hours = parseBoundedInt(req.query.hours, 12, 1, 24);
    const limit = parseBoundedInt(req.query.limit, 2000, 1, 5000);
    const gatewayUrl = req.query.gatewayUrl ? String(req.query.gatewayUrl) : undefined;
    const cutoffTime = Math.max(since, Date.now() - hours * 60 * 60 * 1000);

    // 1. Try pulling fresh history from gateway if url is supplied, default gateway, or Tractive
    const isTractive =
      cleanId.toLowerCase().includes('tractive') ||
      extractTractiveToken(cleanId) !== null ||
      tractiveTokenMap.has(cleanId.toUpperCase()) ||
      Boolean(gatewayUrl && gatewayUrl.toLowerCase().includes('tractive'));

    if (gatewayUrl || req.query.pullGateway === 'true' || isTractive) {
      const gwUrl = gatewayUrl || 'http://35.206.111.214:8080/api/positions';
      await pullHistoryFromMicroGateway(gwUrl, cleanId, cutoffTime);
    }

    // 2. Fetch points from memory store
    const noZeros = cleanId.replace(/^0+/, '');
    const points = gpsHistoryStore.get(cleanId) || (noZeros ? gpsHistoryStore.get(noZeros) : undefined) || [];

    const filtered = points
      .filter((p) => p.timestamp >= cutoffTime)
      .slice(-limit);

    return res.json({
      success: true,
      deviceId: cleanId,
      hoursRequested: hours,
      count: filtered.length,
      sinceCutoff: cutoffTime,
      points: filtered,
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// API: Wakeup & Keep-Alive endpoint for hunting sessions
app.all('/api/gps/wake', (req, res) => {
  const body = (typeof req.body === 'object' && req.body !== null) ? req.body : {};
  const activeIds = Array.isArray(body.deviceIds) ? body.deviceIds : [];
  
  return res.json({
    success: true,
    status: 'SERVER_ACTIVE',
    serverTime: Date.now(),
    cachedDevicesCount: directGpsStore.size,
    registeredDevices: activeIds,
    message: 'Erätutka GPS -palvelin on hereillä ja valmiina vastaanottamaan pantadataa.',
  });
});

// API: Query device telemetry from direct store (with automatic gateway pull)
app.get('/api/gps/device/:id', async (req, res) => {
  const cleanId = String(req.params.id).replace(/^ID[:\s]*/i, '').trim();
  const shouldPull = req.query.pull !== 'false';
  const gatewayUrl = String(req.query.gatewayUrl || 'http://35.206.111.214:8080/api/positions');

  let record = findMatchingGpsRecord(cleanId);
  const now = Date.now();

  // If no record, or record is stale (> 4s) or was a simulation test, attempt immediate pull from Gateway
  if (shouldPull && (!record || (now - record.timestamp > 4000) || record.source === 'simulated_test')) {
    const freshRecord = await pullFromMicroGateway(gatewayUrl, cleanId);
    if (freshRecord) {
      record = freshRecord;
    }
  }

  if (!record) {
    return res.status(404).json({
      success: false,
      error: 'DEVICE_NOT_FOUND',
      message: `Laitteelta (${cleanId}) ei ole vielä vastaanotettu suoraa GPS-dataa Erätutkan palvelimelle tai Gatewayhin.`,
    });
  }

  const ageMs = now - record.timestamp;
  const isOnline = ageMs < 180000; // 3 min

  return res.json({
    success: true,
    ...record,
    ageSeconds: Math.round(ageMs / 1000),
    isOnline,
    status: record.barkRate && record.barkRate > 0 ? 'haukkuu' : (record.speed > 2 ? 'juoksee' : 'paikallaan'),
  });
});

// API: Query all active direct devices
app.get('/api/gps/devices', (req, res) => {
  const devices = Array.from(directGpsStore.values()).map((rec) => ({
    ...rec,
    ageSeconds: Math.round((Date.now() - rec.timestamp) / 1000),
  }));
  return res.json({ success: true, count: devices.length, devices });
});

// API: Simulated GPS ping for testing direct connection
app.post('/api/gps/simulate', (req, res) => {
  const { id, lat, lng, speed, battery, heading, barkRate } = req.body;
  const cleanId = String(id || '7026216737').trim();
  const rawBark = typeof barkRate === 'number' ? barkRate : (req.body.isBarking ? 60 : 0);
  const existingRec = findMatchingGpsRecord(cleanId);

  let barkHoldFixes = 0;
  let effectiveBarkRate = rawBark;
  let effectiveIsBarking = rawBark > 0;
  let lastBarkTs = rawBark > 0 ? Date.now() : existingRec?.lastBarkTimestamp;
  let recentBark = rawBark > 0 ? rawBark : existingRec?.recentBarkRate;
  let status = 'paikallaan';

  if (rawBark > 0) {
    barkHoldFixes = 3;
    effectiveBarkRate = rawBark;
    effectiveIsBarking = true;
    status = 'haukkuu';
  } else if (existingRec && (existingRec.barkHoldRemainingFixes || 0) > 0) {
    barkHoldFixes = (existingRec.barkHoldRemainingFixes || 1) - 1;
    effectiveBarkRate = recentBark || existingRec.barkRate || 15;
    effectiveIsBarking = true;
    status = 'haukkuu';
  } else {
    barkHoldFixes = 0;
    effectiveBarkRate = 0;
    effectiveIsBarking = false;
    status = (typeof speed === 'number' ? speed : 12.4) > 2 ? 'juoksee' : 'paikallaan';
  }

  const record: DirectGpsRecord = {
    id: cleanId,
    lat: typeof lat === 'number' ? lat : 60.85214,
    lng: typeof lng === 'number' ? lng : 25.68142,
    speed: typeof speed === 'number' ? speed : 12.4,
    battery: parseBattery(battery, 92),
    heading: typeof heading === 'number' ? heading : 45,
    barkRate: effectiveBarkRate,
    barkHoldRemainingFixes: barkHoldFixes,
    lastBarkTimestamp: lastBarkTs,
    recentBarkRate: recentBark,
    isBarking: effectiveIsBarking,
    status,
    timestamp: Date.now(),
    source: 'simulated_test',
  };

  directGpsStore.set(cleanId, record);
  const noZeros = cleanId.replace(/^0+/, '');
  if (noZeros && noZeros !== cleanId) {
    directGpsStore.set(noZeros, record);
  }

  appendGpsHistory(cleanId, record);

  return res.json({ success: true, record });
});

// API: Micro GPS Gateway Live Sync Route
app.post('/api/gateway/sync', async (req, res) => {
  try {
    const { gatewayUrl, serverUrl, deviceId, imei, id, token, shareUrl, tractiveShareUrl } = req.body;
    const url = String(gatewayUrl || serverUrl || shareUrl || tractiveShareUrl || 'http://35.206.111.214:8080/api/positions');
    const cleanId = String(deviceId || imei || id || token || '').replace(/^ID[:\s]*/i, '').trim();

    const record = await pullFromMicroGateway(url, cleanId || url);

    if (record) {
      return res.json({
        success: true,
        gatewayUrl: url,
        deviceId: cleanId || record.id,
        lat: record.lat,
        lng: record.lng,
        speed: record.speed,
        battery: record.battery,
        heading: record.heading,
        barkRate: record.barkRate,
        barkHoldRemainingFixes: record.barkHoldRemainingFixes,
        lastBarkTimestamp: record.lastBarkTimestamp,
        recentBarkRate: record.recentBarkRate,
        timestamp: record.timestamp,
        status: record.status,
        satellites: record.satellites ?? 11,
        gsmSignalCsq: record.gsmSignalCsq ?? 24,
        gsmSignalDb: record.gsmSignalDb ?? -65,
        voltage: record.voltage ?? 4.12,
        networkStatus: record.networkStatus ?? 'GPRS / TCP Yhdistetty',
        fixMode: record.fixMode ?? '3D GPS Fix (Tarkka)',
        hdop: record.hdop ?? 0.9,
        rawPayload: record.rawPayload ?? '',
        protocolName: record.protocolName ?? 'Micro GPS Gateway',
        tractiveInfo: record.tractiveInfo,
        lastPacketLatencySec: Math.max(0, Math.round((Date.now() - record.timestamp) / 1000)),
        isOnline: true,
      });
    }

    // Check if we already have a direct record in memory
    const existing = findMatchingGpsRecord(cleanId);
    if (existing) {
      return res.json({
        success: true,
        gatewayUrl: url,
        deviceId: cleanId || existing.id,
        lat: existing.lat,
        lng: existing.lng,
        speed: existing.speed,
        battery: existing.battery,
        heading: existing.heading,
        barkRate: existing.barkRate,
        timestamp: existing.timestamp,
        status: existing.status,
        satellites: existing.satellites ?? 10,
        gsmSignalCsq: existing.gsmSignalCsq ?? 22,
        gsmSignalDb: existing.gsmSignalDb ?? -69,
        voltage: existing.voltage ?? 4.05,
        networkStatus: existing.networkStatus ?? 'GPRS Yhdistetty',
        fixMode: existing.fixMode ?? '3D GPS Fix',
        hdop: existing.hdop ?? 1.0,
        rawPayload: existing.rawPayload ?? '',
        protocolName: existing.protocolName ?? 'Erätutka Direct GPS Store',
        tractiveInfo: existing.tractiveInfo,
        lastPacketLatencySec: Math.max(0, Math.round((Date.now() - existing.timestamp) / 1000)),
        isOnline: (Date.now() - existing.timestamp) < 180000,
        fromCache: true,
      });
    }

    return res.status(404).json({
      success: false,
      error: 'NO_LOCATION_IN_GATEWAY',
      message: `Gateway-palvelimelta (${url}) ei löytynyt koordinaatteja laitteelle "${cleanId}". Varmista että panta on yhdistänyt ja lähettänyt vähintään yhden GPS-pisteen.`,
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      error: 'GATEWAY_ERROR',
      message: `Virhe yhteydessä Micro GPS Gatewayhin: ${error.message || 'Yhteysaikakatkaisu'}`,
    });
  }
});

// Dedicated Tractive GPS Live Share Endpoint (supports POST and GET)
app.all('/api/tractive/sync', async (req, res) => {
  try {
    const raw = req.method === 'GET' ? req.query : req.body;
    const { token, shareUrl, deviceId, url } = raw || {};
    const identifier = String(token || shareUrl || url || deviceId || '6f212df630').trim();
    const cleanToken =
      extractTractiveToken(shareUrl) ||
      extractTractiveToken(token) ||
      extractTractiveToken(identifier) ||
      tractiveTokenMap.get(identifier.toUpperCase()) ||
      '6f212df630';

    const record = await pullFromTractiveShare(cleanToken, identifier);
    if (!record) {
      return res.status(404).json({
        success: false,
        error: 'TRACTIVE_FETCH_FAILED',
        message: `Tractiven julkiseen jakolinkkiin (${identifier}) ei saatu yhteyttä tai linkki on vanhentunut. Tarkista jakolinkki Tractive-sovelluksesta.`,
      });
    }

    return res.json({
      success: true,
      deviceId: cleanToken,
      lat: record.lat,
      lng: record.lng,
      speed: record.speed,
      battery: record.battery,
      heading: record.heading,
      altitude: record.altitude,
      timestamp: record.timestamp,
      status: record.status,
      satellites: record.satellites,
      gsmSignalCsq: record.gsmSignalCsq,
      gsmSignalDb: record.gsmSignalDb,
      voltage: record.voltage,
      networkStatus: record.networkStatus,
      fixMode: record.fixMode,
      hdop: record.hdop,
      protocolName: record.protocolName,
      tractiveInfo: record.tractiveInfo,
      lastPacketLatencySec: Math.max(0, Math.round((Date.now() - record.timestamp) / 1000)),
      isOnline: true,
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message || 'Virhe Tractive-haussa' });
  }
});

app.get('/api/tractive/share/:token', async (req, res) => {
  try {
    const token = req.params.token;
    const cleanToken = extractTractiveToken(token) || token;
    const record = await pullFromTractiveShare(cleanToken);
    if (!record) {
      return res.status(404).json({ success: false, error: 'Tractive device not found' });
    }
    return res.json({ success: true, record });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ==========================================
// KAPSI.FI MML MAP TILES PROXY & CACHE
// Enables fast, license-free MML terrain & property maps by default
// ==========================================
const mmlTileCache = new Map<string, { buffer: Buffer; contentType: string; time: number }>();

app.get('/api/map/kapsi/:layer', async (req, res) => {
  try {
    const { layer } = req.params;
    const allowed = ['peruskartta', 'taustakartta', 'ortokuva', 'kiinteistorajat'];
    if (!allowed.includes(layer)) {
      return res.status(400).send('Invalid layer');
    }

    const query = new URLSearchParams(req.query as Record<string, string>).toString();
    const cacheKey = `${layer}?${query}`;

    const cached = mmlTileCache.get(cacheKey);
    if (cached && Date.now() - cached.time < 60 * 60 * 1000) {
      res.setHeader('Content-Type', cached.contentType);
      res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=86400');
      return res.send(cached.buffer);
    }

    const targetUrl = `https://tiles.kartat.kapsi.fi/${layer}?${query}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 9000);

    const response = await fetch(targetUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Eratutka/2.0 (Hunting GIS; Kapsi MML client)',
      },
    });
    clearTimeout(timer);

    if (!response.ok) {
      return res.status(response.status).send('Tile fetch error');
    }

    const arrayBuf = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuf);

    let contentType = response.headers.get('content-type') || '';
    if (!contentType.startsWith('image/')) {
      if (buffer[0] === 0xff && buffer[1] === 0xd8) {
        contentType = 'image/jpeg';
      } else if (buffer[0] === 0x89 && buffer[1] === 0x50) {
        contentType = 'image/png';
      } else {
        contentType = layer === 'kiinteistorajat' ? 'image/png' : 'image/jpeg';
      }
    }

    if (mmlTileCache.size > 2000) {
      const keys = Array.from(mmlTileCache.keys()).slice(0, 500);
      for (const k of keys) mmlTileCache.delete(k);
    }
    mmlTileCache.set(cacheKey, { buffer, contentType, time: Date.now() });

    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=86400');
    return res.send(buffer);
  } catch (err: any) {
    return res.status(502).send('Kapsi map proxy error');
  }
});

// Helper function to send downlink command to Micro GPS Gateway
async function forwardCommandToGateway(gwUrl: string, deviceId: string, command?: string, interval?: number) {
  const cleanId = String(deviceId || '').replace(/^ID[:\s]*/i, '').trim();
  let baseGw = String(gwUrl || 'http://35.206.111.214:8080').trim().replace(/\/api\/positions\/?$/, '').replace(/\/+$/, '');
  if (!baseGw.startsWith('http://') && !baseGw.startsWith('https://')) {
    baseGw = `http://${baseGw}`;
  }

  const effectiveCommand = command || (typeof interval === 'number' ? `UPLOAD,${interval}#` : '');

  const payload = {
    deviceId: cleanId,
    command: effectiveCommand,
    interval: interval !== undefined ? interval : undefined,
  };

  const candidateEndpoints = [
    `${baseGw}/api/devices/${encodeURIComponent(cleanId)}/command`,
    `${baseGw}/api/command`,
    `${baseGw}/api/devices/${encodeURIComponent(cleanId)}/cmd`,
    `${baseGw}/api/cmd`,
  ];

  let lastError = '';
  let lastStatus = 502;

  for (const endpoint of candidateEndpoints) {
    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), 6000);
    try {
      const resp = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: ctrl.signal,
      });

      if (resp.ok) {
        try {
          const json: any = await resp.json();
          return { success: true, ...json, endpointUsed: endpoint, deviceId: cleanId, command: effectiveCommand };
        } catch {
          return { success: true, message: 'Komento välitetty laitteelle onnistuneesti', endpointUsed: endpoint, deviceId: cleanId, command: effectiveCommand };
        }
      } else {
        lastStatus = resp.status;
        const errText = await resp.text();
        try {
          const errJson = JSON.parse(errText);
          lastError = errJson.error || errJson.message || lastError;
        } catch {
          lastError = errText || `Gateway vastasi virheellä ${resp.status}`;
        }
      }
    } catch (e: any) {
      lastError = e.message || 'Yhteysaikakatkaisu Gatewayhin';
    } finally {
      clearTimeout(timeout);
    }
  }

  return {
    success: false,
    status: lastStatus,
    error: lastError || 'Gateway ei vastannut komentoon',
    message: `Pantaan (${cleanId}) ei saatu yhteyttä Gatewaysta (${baseGw}): ${lastError || 'Laite ei ole aktiivisessa TCP-yhteydessä'}. Varmista että panta on päällä ja yhdistänyt Gatewayhin.`,
  };
}

// API: Send command to collar via Gateway
app.post(['/api/collar/command', '/api/devices/:id/command'], async (req, res) => {
  try {
    const rawId = req.params.id || req.body.deviceId || req.body.id || req.body.imei || req.body.collarId;
    const cleanId = String(rawId || '').replace(/^ID[:\s]*/i, '').trim();
    const { command, interval, gatewayUrl } = req.body;

    if (!cleanId) {
      return res.status(400).json({
        success: false,
        error: 'DEVICE_ID_REQUIRED',
        message: 'Pannan laitetunnus (IMEI / Collar ID) vaaditaan.',
      });
    }

    const effectiveGwUrl = gatewayUrl || 'http://35.206.111.214:8080/api/positions';
    const result = await forwardCommandToGateway(effectiveGwUrl, cleanId, command, typeof interval === 'number' ? interval : undefined);

    if (result.success) {
      return res.json(result);
    } else {
      return res.status(result.status || 502).json(result);
    }
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: `Palvelinvirhe komennon lähetyksessä: ${err.message}`,
    });
  }
});

// API: Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

// ==========================================
// IN-MEMORY LIVE SESSION RELAY & THROTTLE
// ==========================================
interface LiveSessionData {
  sessionInfo?: any;
  dogs: any[];
  annotations: any[];
  members: any[];
  radioMessages: any[];
  updatedAt: number;
  lastActiveMovementAt: number;
  isIdleStandby: boolean;
  activeClients: Map<string, number>;
  deletedDogIds: Set<string>;
  /**
   * Identifiers revived by a client that just (re-)added the dog, mapped to when. A
   * deleted identifier used to be permanent: the set only ever grew, so a collar that had
   * once been removed could never be added back to that hunt. Revived ids are broadcast
   * for a short while so the other participants can drop them from their own registries.
   */
  revivedDogIds?: Map<string, number>;
  /**
   * Session access control. `huntKey` is stored in plaintext on purpose: the server
   * must be able to hand it out from /api/session/resolve to participants who only
   * know the code and PIN, and the same in-memory record already holds every position
   * and name in plaintext, so hashing it would add no real protection.
   */
  huntKey?: string;
  /** scrypt-hashed PIN. Never stored or transmitted in plaintext. */
  pinHash?: string;
  pinSalt?: string;
}

/** Capability key format: 16 random bytes as lowercase hex. */
const HUNT_KEY_PATTERN = /^[0-9a-f]{32}$/;
/** Upper bound on live sessions, so an unauthenticated /create cannot exhaust memory. */
const MAX_LIVE_SESSIONS = 500;

function sha256Hex(value: string): string {
  return crypto.createHash('sha256').update(String(value), 'utf8').digest('hex');
}

function generateHuntKey(): string {
  return crypto.randomBytes(16).toString('hex');
}

/**
 * A 4-digit PIN has too little entropy for a plain digest, so it gets a real KDF.
 * The comparison happens on fixed-length scrypt output, which leaks nothing.
 */
function hashPin(pin: string, salt: string): string {
  return crypto.scryptSync(String(pin), salt, 32).toString('hex');
}

function safeEqualHex(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length === 0 || a.length !== b.length || a.length % 2 !== 0) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
  } catch {
    return false;
  }
}

function safeEqualString(a: string, b: string): boolean {
  const ab = Buffer.from(String(a), 'utf8');
  const bb = Buffer.from(String(b), 'utf8');
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

/**
 * Builds a fresh session record with access credentials attached. The PIN is optional:
 * a participant arriving through a share link holds the key but not the PIN, and after
 * a server restart their first push is what re-establishes the session.
 */
function createSessionRecord(code: string, huntKey: string, pin?: string): LiveSessionData {
  const now = Date.now();
  const record: LiveSessionData = {
    sessionInfo: null,
    dogs: [],
    annotations: [],
    members: [],
    radioMessages: [],
    updatedAt: now,
    lastActiveMovementAt: now,
    isIdleStandby: false,
    activeClients: new Map(),
    deletedDogIds: new Set(),
    huntKey,
  };

  const cleanPin = String(pin || '').trim();
  if (cleanPin) {
    record.pinSalt = crypto.randomBytes(16).toString('hex');
    record.pinHash = hashPin(cleanPin, record.pinSalt);
  }

  return record;
}

function generateSessionCode(name: string): string | null {
  const clean = String(name || '')
    .toUpperCase()
    .replace(/[ÄÅ]/g, 'A')
    .replace(/Ö/g, 'O')
    .replace(/[^A-Z0-9]/g, '');
  const prefix = clean.slice(0, 5) || 'JAHTI';

  for (let attempt = 0; attempt < 50; attempt++) {
    const code = `${prefix}-${crypto.randomInt(1000, 10000)}`;
    if (code !== 'DEFAULT' && !sessionLiveStore.has(code)) return code;
  }
  return null;
}

/** Reads the capability key from the request header, query string or body. */
function getProvidedHuntKey(req: express.Request): string {
  const header = req.get('x-hunt-key');
  if (header) return String(header).trim();
  const queryKey = (req.query as Record<string, unknown>)?.key;
  if (typeof queryKey === 'string') return queryKey.trim();
  const body = typeof req.body === 'object' && req.body !== null ? req.body : {};
  return typeof body.huntKey === 'string' ? body.huntKey.trim() : '';
}

function getProvidedPin(req: express.Request): string {
  const body = typeof req.body === 'object' && req.body !== null ? req.body : {};
  const raw = body.password ?? body.pin;
  return typeof raw === 'string' ? raw.trim() : '';
}

/** True when the caller proved knowledge of the key or of the code+PIN pair. */
function sessionAccessGranted(req: express.Request, data: LiveSessionData): boolean {
  const providedKey = getProvidedHuntKey(req);
  if (providedKey && data.huntKey && safeEqualString(providedKey, data.huntKey)) {
    return true;
  }
  const pin = getProvidedPin(req);
  if (pin && data.pinHash && data.pinSalt && safeEqualHex(hashPin(pin, data.pinSalt), data.pinHash)) {
    return true;
  }
  return false;
}

function denySessionAccess(res: express.Response, message: string) {
  return res.status(403).json({
    success: false,
    error: 'SESSION_ACCESS_DENIED',
    message,
  });
}

/**
 * Rate limiter for the PIN oracle. Keyed by session code (not by IP) because the app
 * runs behind a proxy where every client shares one socket address, which would make
 * a per-IP bucket lock out legitimate hunters.
 *
 * Only FAILED attempts are counted, so a whole hunt party can join by code without
 * exhausting the budget. A successful unlock clears the bucket.
 */
const sessionRateBuckets = new Map<string, { count: number; resetAt: number }>();
const SESSION_RATE_WINDOW_MS = 5 * 60 * 1000;
const SESSION_RATE_MAX_FAILURES = 10;

function isRateLimited(bucketKey: string): boolean {
  const bucket = sessionRateBuckets.get(bucketKey);
  if (!bucket) return false;
  if (Date.now() >= bucket.resetAt) {
    sessionRateBuckets.delete(bucketKey);
    return false;
  }
  return bucket.count >= SESSION_RATE_MAX_FAILURES;
}

function recordRateLimitFailure(bucketKey: string): void {
  const now = Date.now();
  const bucket = sessionRateBuckets.get(bucketKey);
  if (!bucket || now >= bucket.resetAt) {
    sessionRateBuckets.set(bucketKey, { count: 1, resetAt: now + SESSION_RATE_WINDOW_MS });
    return;
  }
  bucket.count += 1;
}

function clearRateLimit(bucketKey: string): void {
  sessionRateBuckets.delete(bucketKey);
}

setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of sessionRateBuckets.entries()) {
    if (now >= bucket.resetAt) sessionRateBuckets.delete(key);
  }
}, 10 * 60 * 1000);

/**
 * How long a revived identifier keeps being broadcast. Long enough for every participant
 * to poll once and drop it from their own registry, short enough not to linger.
 */
const REVIVED_ID_BROADCAST_MS = 10 * 60 * 1000;

/**
 * Every spelling of one identifier that can end up in a session's deleted registry:
 * the raw value, case variants, the "ID:" prefix stripped, leading zeros stripped and the
 * Tractive token. Both deleting and reviving go through this one function so the two can
 * never drift apart - reviving has to remove exactly what deleting added.
 */
function deletedIdVariants(rawId: string): string[] {
  const raw = String(rawId || '').trim();
  if (!raw) return [];

  const out = new Set<string>();
  const add = (value: string) => {
    if (value) out.add(value);
  };

  add(raw);
  add(raw.toLowerCase());
  add(raw.toUpperCase());

  const clean = raw.replace(/^ID[:\s]*/i, '').trim();
  if (clean) {
    add(clean);
    add(clean.toLowerCase());
    add(clean.toUpperCase());
    const noZeros = clean.replace(/^0+/, '');
    if (noZeros) {
      add(noZeros);
      add(noZeros.toLowerCase());
      add(noZeros.toUpperCase());
    }
  }

  const token = extractTractiveToken(raw);
  if (token) {
    add(token);
    add(token.toLowerCase());
    add(token.toUpperCase());
  }

  return Array.from(out);
}

/** Marks one identifier as deleted, in every spelling. */
function markDeletedOnServer(deletedSet: Set<string>, rawId: string): void {
  for (const variant of deletedIdVariants(rawId)) deletedSet.add(variant);
}

/**
 * Revives one identifier: removes every spelling from the deleted registry, so a dog added
 * again is no longer filtered out by `isDogDeletedOnServer`.
 */
function reviveOnServer(deletedSet: Set<string>, rawId: string): void {
  for (const variant of deletedIdVariants(rawId)) deletedSet.delete(variant);
}

/** Stops broadcasting a revive, used when the same identifier is deleted again. */
function clearRevivedOnServer(reviveMap: Map<string, number>, rawId: string): void {
  for (const variant of deletedIdVariants(rawId)) reviveMap.delete(variant);
}

function isDogDeletedOnServer(dog: any, deletedSet?: Set<string>): boolean {
  if (!dog || !deletedSet || deletedSet.size === 0) return false;
  // Only identifiers unique to one physical collar. `dog.name` is deliberately absent:
  // it is a description, not an identity, so including it made a deleted dog hide every
  // other dog with the same name across the whole hunt party.
  const identifiers = [
    dog.id,
    dog.collarId,
    dog.directGpsId,
    dog.imei,
    dog.tractiveTrackerId,
    dog.tractiveShareUrl,
  ];

  for (const raw of identifiers) {
    if (!raw) continue;
    const s = String(raw).trim();
    if (!s) continue;
    if (deletedSet.has(s) || deletedSet.has(s.toLowerCase()) || deletedSet.has(s.toUpperCase())) return true;
    const clean = s.replace(/^ID[:\s]*/i, '').trim();
    if (clean && (deletedSet.has(clean) || deletedSet.has(clean.toLowerCase()))) return true;
    const noZeros = clean.replace(/^0+/, '');
    if (noZeros && deletedSet.has(noZeros)) return true;
    const tractiveToken = extractTractiveToken(s);
    if (tractiveToken && (deletedSet.has(tractiveToken) || deletedSet.has(tractiveToken.toLowerCase()))) return true;
  }
  return false;
}

const sessionLiveStore = new Map<string, LiveSessionData>();

// Periodic cleanup of stale sessions older than 24 hours
setInterval(() => {
  const now = Date.now();
  for (const [code, data] of sessionLiveStore.entries()) {
    if (now - data.updatedAt > 24 * 60 * 60 * 1000) {
      sessionLiveStore.delete(code);
    }
  }
}, 60 * 60 * 1000);

// API: Create a Hunt Session. The server owns code generation and key generation so
// that a guessed code can never be pre-claimed by someone else.
app.post('/api/session/create', (req, res) => {
  try {
    const body = typeof req.body === 'object' && req.body !== null ? req.body : {};
    const name = String(body.name || '').trim();
    const pin = String(body.pin || '').trim();

    if (!name || !pin) {
      return res.status(400).json({
        success: false,
        error: 'NAME_AND_PIN_REQUIRED',
        message: 'Jahtipäivän nimi ja PIN-koodi vaaditaan.',
      });
    }

    if (sessionLiveStore.size >= MAX_LIVE_SESSIONS) {
      return res.status(503).json({
        success: false,
        error: 'SESSION_CAPACITY_REACHED',
        message: 'Palvelimella on liian monta aktiivista jahtia. Yritä hetken kuluttua uudelleen.',
      });
    }

    const code = generateSessionCode(name);
    if (!code) {
      return res.status(503).json({
        success: false,
        error: 'CODE_GENERATION_FAILED',
        message: 'Jahtikoodin luonti epäonnistui. Kokeile toista nimeä.',
      });
    }

    const huntKey = generateHuntKey();
    sessionLiveStore.set(code, createSessionRecord(code, huntKey, pin));

    return res.json({ success: true, code, huntKey });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// API: Exchange code + PIN for the session's capability key.
app.post('/api/session/resolve', (req, res) => {
  try {
    const body = typeof req.body === 'object' && req.body !== null ? req.body : {};
    const code = String(body.code || '').toUpperCase().trim();
    const pin = String(body.pin ?? body.password ?? '').trim();

    if (!code || !pin) {
      return res.status(400).json({
        success: false,
        error: 'CODE_AND_PIN_REQUIRED',
        message: 'Jahtikoodi ja PIN-koodi vaaditaan.',
      });
    }

    const bucketKey = `resolve:${code}`;
    if (isRateLimited(bucketKey)) {
      return res.status(429).json({
        success: false,
        error: 'TOO_MANY_ATTEMPTS',
        message: 'Liian monta väärää PIN-yritystä. Odota 5 minuuttia tai käytä jakolinkkiä.',
      });
    }

    // A single uniform error so that the response cannot be used to probe which codes exist.
    const denied = () => {
      recordRateLimitFailure(bucketKey);
      return res.status(403).json({
        success: false,
        error: 'SESSION_ACCESS_DENIED',
        message: 'Väärä jahtikoodi tai PIN-koodi.',
      });
    };

    const data = sessionLiveStore.get(code);
    if (!data || !data.huntKey || !data.pinHash || !data.pinSalt) return denied();
    if (!safeEqualHex(hashPin(pin, data.pinSalt), data.pinHash)) return denied();

    clearRateLimit(bucketKey);

    const info = data.sessionInfo && typeof data.sessionInfo === 'object' ? { ...data.sessionInfo } : {};
    delete info.password;

    return res.json({ success: true, code, huntKey: data.huntKey, sessionInfo: info });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// API: Explicit Delete Dog from Session & GPS Cache
app.post('/api/session/:code/dogs/delete', (req, res) => {
  try {
    const code = String(req.params.code || '').toUpperCase().trim();
    if (!code || code === 'DEFAULT') {
      return denySessionAccess(res, 'Ei kelvollista jahtikoodia.');
    }

    const { dogId, deletedIds } = req.body;
    const now = Date.now();

    const existing = sessionLiveStore.get(code);
    // No session, or no proof of access: report the same shape either way so the
    // endpoint cannot be used to probe which session codes exist. Sessions are only
    // ever created by /api/session/create.
    if (!existing) {
      return res.json({ success: true, deletedCount: 0, remainingDogs: 0, deletedDogIds: [] });
    }
    if (!sessionAccessGranted(req, existing)) {
      return denySessionAccess(res, 'Ei oikeutta tähän jahtiin.');
    }
    if (!existing.deletedDogIds) {
      existing.deletedDogIds = new Set();
    }

    const idsToPurge = [
      ...(Array.isArray(deletedIds) ? deletedIds : []),
      dogId,
    ].filter(Boolean).map((s: string) => String(s).trim());

    for (const raw of idsToPurge) {
      if (!raw) continue;
      markDeletedOnServer(existing.deletedDogIds, raw);
      // A delete supersedes an earlier revive of the same identifier: without this, the
      // revive would keep being broadcast for its full window and would undo a dog
      // deleted shortly after it was added.
      if (existing.revivedDogIds) clearRevivedOnServer(existing.revivedDogIds, raw);
      // Purge from directGpsStore
      directGpsStore.delete(raw);
      const clean = raw.replace(/^ID[:\s]*/i, '').trim();
      if (clean) directGpsStore.delete(clean);
    }

    // Filter existing dogs
    existing.dogs = (existing.dogs || []).filter((d: any) => !isDogDeletedOnServer(d, existing.deletedDogIds));
    existing.updatedAt = now;

    return res.json({
      success: true,
      deletedCount: idsToPurge.length,
      remainingDogs: existing.dogs.length,
      deletedDogIds: Array.from(existing.deletedDogIds),
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// API: Relay Push (Fast In-Memory, 0 Firebase Writes)
app.post('/api/session/:code/relay', (req, res) => {
  try {
    const code = String(req.params.code || '').toUpperCase().trim();
    if (!code) return res.status(400).json({ success: false, error: 'Session code required' });
    if (code === 'DEFAULT') {
      return denySessionAccess(res, 'Varajahtisessiota DEFAULT ei tueta.');
    }

    const { sessionInfo, dogs, annotations, members, radioMessages, clientId, revivedDogIds } = req.body;
    const now = Date.now();

    let existing = sessionLiveStore.get(code);
    if (!existing) {
      // Re-registration path. A session normally exists in memory unless the server was
      // restarted, in which case the first push may re-establish it — but only when it
      // carries a well-formed capability key. Knowing the key is already proof of access,
      // so no PIN is required here.
      const providedKey = getProvidedHuntKey(req);
      if (!HUNT_KEY_PATTERN.test(providedKey)) {
        return denySessionAccess(res, 'Jahtisessio ei ole enää palvelimella. Liity uudelleen jakolinkillä.');
      }
      existing = createSessionRecord(code, providedKey, getProvidedPin(req));
      sessionLiveStore.set(code, existing);
    } else if (!sessionAccessGranted(req, existing)) {
      return denySessionAccess(res, 'Ei oikeutta tähän jahtiin.');
    }
    if (!existing.deletedDogIds) {
      existing.deletedDogIds = new Set();
    }

    // A `deletedDogIds` array in this body is deliberately ignored.
    //
    // Clients used to upload their whole accumulated registry here on every write, so a client
    // that had not yet polled a revival re-asserted a deletion that had already been undone -
    // and with a deletion beating a revival, the collar died again for the whole party a couple
    // of seconds after being added. An older client in the field still sends it, which is why
    // the server must refuse it here rather than trusting the sender to be current.
    //
    // Deletions are accepted only by /dogs/delete, where the client states the ids it just
    // deleted. Every client version calls that endpoint when a collar is removed, so a real
    // deletion still arrives - including the delete-supersedes-revive rule, which lives there.


    // A client that just added a dog says so explicitly. Without this the deleted registry
    // is a one-way ratchet: a collar removed once could never be added back, because this
    // endpoint kept broadcasting the deletion and every client re-applied it.
    if (Array.isArray(revivedDogIds) && revivedDogIds.length > 0) {
      const reviveMap = existing.revivedDogIds || new Map<string, number>();
      existing.revivedDogIds = reviveMap;
      for (const raw of revivedDogIds) {
        const s = String(raw || '').trim();
        if (!s) continue;
        reviveOnServer(existing.deletedDogIds, s);
        reviveMap.set(s, now);
      }
      // Drop broadcasts that have had time to reach everyone.
      for (const [id, at] of reviveMap.entries()) {
        if (now - at > REVIVED_ID_BROADCAST_MS) reviveMap.delete(id);
      }
    }

    if (clientId) {
      existing.activeClients.set(clientId, now);
    }

    // Detect movement across dogs
    let hasMovement = false;
    if (Array.isArray(dogs)) {
      const filteredDogs = dogs.filter((d: any) => !isDogDeletedOnServer(d, existing.deletedDogIds));
      if (filteredDogs.length > 0) {
        const prevDogs = existing.dogs || [];
        for (const d of filteredDogs) {
          const prev = prevDogs.find((p: any) => p.id === d.id);
          if (!prev) {
            hasMovement = true;
          } else {
            const latDiff = Math.abs((d.lat || 0) - (prev.lat || 0));
            const lngDiff = Math.abs((d.lng || 0) - (prev.lng || 0));
            // roughly > 3-5 meters
            if (latDiff > 0.00004 || lngDiff > 0.00006 || (d.speed && d.speed > 1) || (d.barkRate && d.barkRate > 0)) {
              hasMovement = true;
            }
          }
        }
      }
      existing.dogs = filteredDogs;
    } else {
      existing.dogs = (existing.dogs || []).filter((d: any) => !isDogDeletedOnServer(d, existing.deletedDogIds));
    }

    if (hasMovement) {
      existing.lastActiveMovementAt = now;
      existing.isIdleStandby = false;
    } else if (now - existing.lastActiveMovementAt > 10 * 60 * 1000) {
      // If no movement for 10 minutes, enter idle standby mode
      existing.isIdleStandby = true;
    }

    if (sessionInfo) existing.sessionInfo = sessionInfo;
    if (Array.isArray(annotations)) existing.annotations = annotations;
    if (Array.isArray(members)) existing.members = members;
    if (Array.isArray(radioMessages)) existing.radioMessages = radioMessages;

    existing.updatedAt = now;

    return res.json({
      success: true,
      timestamp: now,
      isIdleStandby: existing.isIdleStandby,
      activeClientsCount: existing.activeClients.size,
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// API: Relay Pull (Fast In-Memory query for real-time tracking)
app.get('/api/session/:code/relay', (req, res) => {
  try {
    const code = String(req.params.code || '').toUpperCase().trim();
    if (!code) return res.status(400).json({ success: false, error: 'Session code required' });

    const since = parseBoundedInt(req.query.since, 0, 0, Number.MAX_SAFE_INTEGER);
    const clientId = String(req.query.clientId || '');
    const now = Date.now();

    const data = sessionLiveStore.get(code);
    // A missing session and an unauthorized one get the identical response, so that
    // polling cannot be used to learn which session codes exist.
    if (!data || !sessionAccessGranted(req, data)) {
      return res.json({
        success: true,
        exists: false,
        updated: false,
      });
    }

    if (clientId) {
      data.activeClients.set(clientId, now);
    }

    // Clean inactive clients (> 30s)
    for (const [cId, lastSeen] of data.activeClients.entries()) {
      if (now - lastSeen > 30000) {
        data.activeClients.delete(cId);
      }
    }

    if (since && data.updatedAt <= since) {
      return res.json({
        success: true,
        exists: true,
        updated: false,
        timestamp: data.updatedAt,
        isIdleStandby: data.isIdleStandby,
        activeClientsCount: data.activeClients.size,
      });
    }

    const safeDogs = (data.dogs || []).filter((d: any) => !isDogDeletedOnServer(d, data.deletedDogIds));

    // Broadcast recently revived ids so participants drop them from their own registries,
    // which is what lets a re-added collar appear for the whole party again.
    const revivedIds = Array.from(data.revivedDogIds?.entries() || [])
      .filter(([, at]) => Date.now() - at <= REVIVED_ID_BROADCAST_MS)
      .map(([id]) => id);

    return res.json({
      success: true,
      exists: true,
      updated: true,
      timestamp: data.updatedAt,
      isIdleStandby: data.isIdleStandby,
      activeClientsCount: data.activeClients.size,
      deletedDogIds: Array.from(data.deletedDogIds || []),
      revivedDogIds: revivedIds,
      data: {
        sessionInfo: data.sessionInfo,
        dogs: safeDogs,
        annotations: data.annotations,
        members: data.members,
        radioMessages: data.radioMessages,
        deletedDogIds: Array.from(data.deletedDogIds || []),
        revivedDogIds: revivedIds,
      },
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Version reported to clients so an open page can notice that a new build was deployed.
 * The client only ever compares this value against the one it saw at load time, so a
 * plain server restart no longer counts as an update — which means this constant MUST be
 * bumped for every deploy that should prompt users to reload. Keep it in step with the
 * `<title>` in index.html so the UI and the API do not disagree.
 */
const ERATUTKA_VERSION = '2.7.5';
const SERVER_BOOT_TIME = Date.now();

app.get('/api/app-version', (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.json({
    success: true,
    version: ERATUTKA_VERSION,
    bootTime: SERVER_BOOT_TIME,
    timestamp: Date.now(),
  });
});

// Vite Middleware for frontend
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(
      express.static(distPath, {
        setHeaders: (res, filePath) => {
          if (filePath.endsWith('index.html')) {
            res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
            res.setHeader('Pragma', 'no-cache');
            res.setHeader('Expires', '0');
          }
        },
      })
    );
    app.get('*', (req, res) => {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Erätutka Server running on port ${PORT}`);
  });
}

startServer();
