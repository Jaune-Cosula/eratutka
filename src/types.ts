export type MapLayerType = 'topo' | 'mml_maasto' | 'mml_tausta' | 'opentopo' | 'osm' | 'satellite' | 'dark';

export type DogStatus = 'haukkuu' | 'seisoo' | 'juoksee' | 'liikkeessä' | 'paikallaan';

export interface DogTrackPoint {
  lat: number;
  lng: number;
  timestamp: number;
  speed: number; // km/h
  barkRate: number; // hkm/min
}

export interface Dog {
  id: string;
  name: string;
  breed: string;
  collarId: string;
  color: string;
  status: DogStatus;
  lat: number;
  lng: number;
  battery: number; // %
  signal: number; // % (4G/Sat)
  speed: number; // km/h
  barkRate: number; // hkm/min
  barkHoldRemainingFixes?: number; // Jäljellä olevat paikannukset (2-3 fixiä) jolloin haukkuhälytys/tila pidetään aktiivisena pienen tauon aikana
  lastBarkTimestamp?: number; // Viimeisimmän havaitun haukun aikaleima
  recentBarkRate?: number; // Viimeisin mitattu haukkutiheys haukkutauon ajaksi
  heading: number; // degrees 0-360
  trackHistory: DogTrackPoint[];
  isActive: boolean;
  barkAlertEnabled: boolean;
  standAlertEnabled: boolean;
  trackerModel?: string; // e.g. "SinoTrack ST-904L", "Tracker Artemi", "Icarii IK122 4G / IK122T Pro", etc.
  imei?: string; // 15-digit IMEI for SinoTrack / 4G tracker
  simNumber?: string; // Phone number in collar for audio listen calls
  addedBy?: string; // Hunter / user name who added the dog
  lastUpdated?: number; // Timestamp of last received GPS telemetry
  distanceFromUser?: number; // meters
  bearingFromUser?: number; // degrees
  odometerResetTimestamp?: number; // Timestamp when odometer was last reset
  telematicsProvider?: 'eratutka_direct' | 'microgateway' | 'manual' | 'tractive';
  gatewayServerUrl?: string; // e.g. http://35.206.111.214:8080/api/positions
  directGpsId?: string; // Direct device ID for Erätutka server (e.g. 7026216737)
  tractiveShareUrl?: string; // Tractive public share link or token (e.g. https://my.tractive.com/p/6f212df630)
  tractivePetName?: string; // Tractive pet name (e.g. Nirppu)
  tractiveTrackerId?: string; // Tractive collar ID (e.g. EUUGEDYM)
  tractiveOwnerName?: string; // Tractive pet owner name
  autoSyncEnabled?: boolean; // True if cloud auto-polling is active
  trackingIntervalSec?: number; // e.g. 5, 10, 30, 60, 300 seconds
  // Diagnostics & Raw Telemetry
  satellites?: number; // Number of GPS satellites locked (e.g. 12)
  gsmSignalCsq?: number; // GSM/4G signal CSQ value (0-31)
  gsmSignalDb?: number; // Signal strength in dBm (e.g. -72 dBm)
  networkStatus?: string; // e.g. "GPRS / TCP Yhteys aktiivinen", "4G LTE", "Online"
  fixMode?: string; // e.g. "3D GPS Fix", "2D Fix", "LBS Tukiasema"
  voltage?: number; // Battery voltage in Volts (e.g. 4.12 V)
  rawPayload?: string; // Latest raw protocol message / payload received
  lastPacketLatencySec?: number; // Age / latency of last packet in seconds
  protocolName?: string; // e.g. "JT808 / IK122", "OsmAnd HTTP", "SinoTrack", "Gateway HTML"
  hdop?: number; // Horizontal Dilution of Precision (e.g. 0.8 - 1.2)
}

export type HunterRole = 'passimies' | 'koiramies' | 'ajomies' | 'päällikkö' | 'seuraaja' | 'Jahtimestari';
export type HunterStatus = 'passissa' | 'liikkeella' | 'kaato' | 'tauolla';

export interface HuntSession {
  id: string;
  name: string;
  code: string;
  password?: string;
  /**
   * Sessiokohtainen satunnainen jaettu avain. Toimii pääsylippuna (capability):
   * Firestore-dokumentti on polussa `sessions/{huntKey}` ja relay-endpointit
   * vaativat sen `X-Hunt-Key`-otsikossa. Kulkee jakolinkin fragmentissa.
   * Vain hash tallennetaan palvelimelle.
   */
  huntKey?: string;
  creatorName: string;
  createdAt: number;
  myRole: HunterRole;
  myNickname: string;
  isJahtimestari: boolean;
}

export interface TeamMember {
  id: string;
  name: string;
  role: HunterRole;
  status: HunterStatus;
  lat: number;
  lng: number;
  standName?: string;
  phone?: string;
  battery: number;
  lastUpdated: number; // timestamp
}

export type MarkerCategory = 'passipaikka' | 'havainto' | 'raja' | 'turvallisuus' | 'muu';

export interface MapAnnotation {
  id: string;
  title: string;
  category: MarkerCategory;
  subType?: 'hirvi' | 'karhu' | 'susi' | 'teeri' | 'passi' | 'nuotio' | 'laavu' | 'verijalki' | 'autopaikoitus' | 'geofence' | 'turva_alue';
  lat: number;
  lng: number;
  description?: string;
  createdBy: string;
  createdAt: number;
  color?: string;
  radiusMeters?: number; // Geofence säde metreinä
  alertTrigger?: 'exit' | 'enter' | 'both'; // 'exit' = hälytä kun poistuu, 'enter' = hälytä kun saapuu
  assignedDogId?: string; // 'all' or specific dog id
  isEnabled?: boolean; // Onko aluehälytys aktiivinen
  polygon?: [number, number][]; // [lat, lng] points for polygon boundary
  multiPolygon?: [number, number][][]; // Array of polygons for multi-parcel club areas
  areaHectares?: number; // Calculated or provided area size in hectares (ha)
  source?: string; // e.g. 'Oma riista', 'GPX', 'GeoJSON'
}

export interface SafetySector {
  id: string;
  hunterId: string;
  hunterName: string;
  lat: number;
  lng: number;
  startBearing: number; // degrees e.g. 30
  endBearing: number; // degrees e.g. 120
  radiusMeters: number; // e.g. 300
  isEnabled: boolean;
}

export interface RadioMessage {
  id: string;
  senderName: string;
  text: string;
  timestamp: number;
  category?: 'alert' | 'info' | 'action';
}

export interface UserLocation {
  lat: number;
  lng: number;
  accuracy: number;
  heading: number | null;
  speed: number | null;
  altitude: number | null;
  timestamp: number;
}
