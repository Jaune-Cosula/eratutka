import React from 'react';
import { User as FirebaseUser } from 'firebase/auth';
import {
  Dog,
  DogStatus,
  TeamMember,
  MapAnnotation,
  MarkerCategory,
  RadioMessage,
  HuntSession,
  HunterStatus,
  HunterRole,
  MapLayerType,
  UserLocation,
  SafetySector,
} from '../types';
import { UserProfile } from '../services/userService';
import { useLanguage, Language } from '../context/LanguageContext';
import { calculateDistance, calculateBearing } from '../utils/geoUtils';
import { UiMode } from './useUiMode';

/* ============================================================= Evon sanasto
 * Evo keeps its own strings so the shared LanguageContext (and thus every
 * classic component) stays untouched. The active language still comes from
 * that context, so the FI/EN toggle keeps working for both UIs. */

export const fi = {
  map: 'Kartta', dogs: 'Koirat', team: 'Porukka', marks: 'Merkinnät', account: 'Tili',
  live: 'Live', noHunt: 'Ei jahtia',
  members: 'Jäsenet', radio: 'Radio', send: 'Lähetä', sos: 'SOS', share: 'Jaa',
  addDog: 'Lisää panta', addMark: 'Lisää merkintä',
  cancel: 'Peruuta', save: 'Tallenna', remove: 'Poista', close: 'Sulje',

  buildingLimit: '150 m rakennusraja', radar: 'Tutka', radarRange: 'Tutka · 900 m',
  layers: 'Karttatasot', recenter: 'Keskitä', gps: 'GPS-seuranta',
  layerTerrain: 'Maasto', layerAerial: 'Ilmakuva', layerBase: 'Peruskartta', layerOpenTopo: 'OpenTopo',

  inHunt: 'Jahdissa', library: 'Omat pannat', collar: 'Panta', battery: 'Akku',
  signal: 'Signaali', distance: 'Etäisyys', speed: 'Nopeus', status: 'Tila',
  history: 'Kulkuhistoria', lastSeen: 'Paikkatieto', toLibrary: 'Siirrä kirjastoon',
  noDogs: 'Ei pantoja kytkettynä', noDogsHint: 'Kytke koiran GPS-panta syöttämällä pannan ID tai IMEI.',
  showOnMap: 'Näytä kartalla', hidden: 'Piilotettu', shareInHunt: 'Jaa jahdissa',
  myDog: 'Oma panta', telemetry: 'Telemetria', track: 'Reitti', diagnostics: 'Diagnostiikka',

  teamTitle: 'Jahtiporukka', owner: 'Jahtimestari', role: 'Rooli',
  quickPhrases: 'Pikaviestit', msgPlaceholder: 'Viesti porukalle…',
  r_passimies: 'Passimies', r_koiramies: 'Koiramies', r_ajomies: 'Ajomies', r_seuraaja: 'Seuraaja', r_paallikko: 'Jahtimestari',
  st_passissa: 'Passissa', st_liikkeessa: 'Liikkeessä', st_kaato: 'Kaato', st_tauolla: 'Tauolla',

  ds_haukkuu: 'Haukkuu', ds_seisoo: 'Seisoo', ds_juoksee: 'Juoksee', ds_liikkeessa: 'Liikkeessä', ds_paikallaan: 'Paikallaan',
  lost: 'Ei yhteyttä',

  mc_passipaikka: 'Passipaikka', mc_havainto: 'Havainto / Jälki', mc_raja: 'Alue / Raja', mc_turvallisuus: 'Turvallisuus', mc_muu: 'Muu',

  profile: 'Profiili', notSignedIn: 'Et ole kirjautunut', signedInHint: 'Kirjaudu, niin pannat ja merkinnät kulkevat mukanasi.',
  signIn: 'Kirjaudu', signOut: 'Kirjaudu ulos', email: 'Sähköposti', club: 'Seura',
  settings: 'Asetukset', language: 'Kieli', mapLayer: 'Karttataso', bounds: 'Kiinteistörajat',
  mmlSource: 'MML-karttalähde', kapsi: 'Kapsi.fi', ownKey: 'Oma avain',
  switchToClassic: 'Vaihda vanhaan käyttöliittymään', switchToClassicHint: 'Evo on prototyyppi. Voit palata milloin tahansa.',

  currentHunt: 'Nykyinen jahti', noSessionTitle: 'Ei aktiivista jahtia',
  noSessionBody: 'Luo uusi jahtipäivä tai liity koodilla ja PIN-koodilla.',
  createHunt: 'Luo uusi jahtipäivä', joinHunt: 'Liity koodilla', leaveHunt: 'Poistu jahdista',
  shareHunt: 'Jaa jahti', revealPin: 'Näytä PIN', hidePin: 'Piilota PIN', huntCode: 'Jahtikoodi',
  deviceHunts: 'Tämän laitteen jahdit', deviceNote: 'Tallennettu vain tälle laitteelle. Pilvikopiota ei poisteta.',
  clearDevice: 'Siivoa laite', clearAll: 'Siivoa muut', lastUsed: 'Käytetty',

  sosTitle: 'Hätätilanne', sosPrompt: 'Lähettää sijaintisi ja hälytyksen koko porukalle.',
  sosSend: 'Lähetä hätäkutsu', quick: 'Pikavalinta',
};

export type EvoStrings = typeof fi;

export const en: EvoStrings = {
  map: 'Map', dogs: 'Dogs', team: 'Team', marks: 'Markers', account: 'Account',
  live: 'Live', noHunt: 'No hunt',
  members: 'Members', radio: 'Radio', send: 'Send', sos: 'SOS', share: 'Share',
  addDog: 'Add collar', addMark: 'Add marker',
  cancel: 'Cancel', save: 'Save', remove: 'Remove', close: 'Close',

  buildingLimit: '150 m building limit', radar: 'Radar', radarRange: 'Radar · 900 m',
  layers: 'Map layers', recenter: 'Recenter', gps: 'GPS tracking',
  layerTerrain: 'Terrain', layerAerial: 'Aerial', layerBase: 'Base map', layerOpenTopo: 'OpenTopo',

  inHunt: 'In hunt', library: 'My collars', collar: 'Collar', battery: 'Battery',
  signal: 'Signal', distance: 'Distance', speed: 'Speed', status: 'Status',
  history: 'Track history', lastSeen: 'Last fix', toLibrary: 'Move to library',
  noDogs: 'No collars connected', noDogsHint: 'Connect a GPS collar by entering its ID or IMEI.',
  showOnMap: 'Show on map', hidden: 'Hidden', shareInHunt: 'Share in hunt',
  myDog: 'My collar', telemetry: 'Telemetry', track: 'Track', diagnostics: 'Diagnostics',

  teamTitle: 'Hunting party', owner: 'Hunt master', role: 'Role',
  quickPhrases: 'Quick phrases', msgPlaceholder: 'Message the party…',
  r_passimies: 'Stand hunter', r_koiramies: 'Dog handler', r_ajomies: 'Driver', r_seuraaja: 'Observer', r_paallikko: 'Hunt master',
  st_passissa: 'Standing', st_liikkeessa: 'Moving', st_kaato: 'Down', st_tauolla: 'On break',

  ds_haukkuu: 'Barking', ds_seisoo: 'Standing', ds_juoksee: 'Running', ds_liikkeessa: 'Moving', ds_paikallaan: 'Stationary',
  lost: 'No signal',

  mc_passipaikka: 'Stand', mc_havainto: 'Sighting / track', mc_raja: 'Area / boundary', mc_turvallisuus: 'Safety', mc_muu: 'Other',

  profile: 'Profile', notSignedIn: 'Not signed in', signedInHint: 'Sign in so your collars and markers travel with you.',
  signIn: 'Sign in', signOut: 'Sign out', email: 'Email', club: 'Club',
  settings: 'Settings', language: 'Language', mapLayer: 'Map layer', bounds: 'Property lines',
  mmlSource: 'MML map source', kapsi: 'Kapsi.fi', ownKey: 'Own key',
  switchToClassic: 'Switch to the classic UI', switchToClassicHint: 'Evo is a prototype. You can go back at any time.',

  currentHunt: 'Current hunt', noSessionTitle: 'No active hunt',
  noSessionBody: 'Create a new hunt or join with a code and PIN.',
  createHunt: 'Create a new hunt', joinHunt: 'Join with code', leaveHunt: 'Leave hunt',
  shareHunt: 'Share hunt', revealPin: 'Reveal PIN', hidePin: 'Hide PIN', huntCode: 'Hunt code',
  deviceHunts: 'Hunts on this device', deviceNote: 'Stored on this device only. The cloud copy is not deleted.',
  clearDevice: 'Clean device', clearAll: 'Clear others', lastUsed: 'Used',

  sosTitle: 'Emergency', sosPrompt: 'Sends your location and an alert to the whole party.',
  sosSend: 'Send SOS', quick: 'Quick',
};

export function useEvo(): { lang: Language; s: EvoStrings } {
  const { language } = useLanguage();
  return { lang: language, s: language === 'en' ? en : fi };
}

/* ================================================================ apurit */

export interface Rel { dist: number; bearing: number; compass: string }

export function relToUser(userLocation: UserLocation | null, lat: number, lng: number): Rel | null {
  if (!userLocation || typeof lat !== 'number' || typeof lng !== 'number') return null;
  if (!isFinite(lat) || !isFinite(lng) || (lat === 0 && lng === 0)) return null;
  const dist = calculateDistance(userLocation.lat, userLocation.lng, lat, lng);
  const bearing = calculateBearing(userLocation.lat, userLocation.lng, lat, lng);
  return { dist, bearing, compass: compassFromBearing(bearing) };
}

export function compassFromBearing(b: number): string {
  return ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(((b % 360) + 360) % 360 / 45) % 8];
}

export function fmtDist(meters: number): string {
  return meters >= 1000 ? (meters / 1000).toFixed(meters % 1000 === 0 ? 0 : 1) + ' km' : Math.round(meters) + ' m';
}

export function dogStatusLabel(status: DogStatus, s: EvoStrings): string {
  switch (status) {
    case 'haukkuu': return s.ds_haukkuu;
    case 'seisoo': return s.ds_seisoo;
    case 'juoksee': return s.ds_juoksee;
    case 'liikkeessä': return s.ds_liikkeessa;
    default: return s.ds_paikallaan;
  }
}

export function dogStatusTone(status: DogStatus): 'live' | 'info' | 'muted' | 'alert' {
  if (status === 'haukkuu') return 'live';
  if (status === 'juoksee' || status === 'liikkeessä') return 'info';
  return 'muted';
}

export function roleLabel(role: HunterRole, s: EvoStrings): string {
  switch (role) {
    case 'passimies': return s.r_passimies;
    case 'koiramies': return s.r_koiramies;
    case 'ajomies': return s.r_ajomies;
    case 'seuraaja': return s.r_seuraaja;
    default: return s.r_paallikko;
  }
}

export function hunterStatusLabel(status: HunterStatus, s: EvoStrings): string {
  switch (status) {
    case 'passissa': return s.st_passissa;
    case 'liikkeella': return s.st_liikkeessa;
    case 'kaato': return s.st_kaato;
    default: return s.st_tauolla;
  }
}

export function catLabel(cat: MarkerCategory, s: EvoStrings): string {
  switch (cat) {
    case 'passipaikka': return s.mc_passipaikka;
    case 'havainto': return s.mc_havainto;
    case 'raja': return s.mc_raja;
    case 'turvallisuus': return s.mc_turvallisuus;
    default: return s.mc_muu;
  }
}

export function catColor(cat: MarkerCategory): string {
  return ({ passipaikka: '#38bdf8', havainto: '#f5a524', raja: '#a78bfa', turvallisuus: '#ef4444', muu: '#9aa7b2' } as Record<string, string>)[cat] || '#9aa7b2';
}

export function timeAgo(ts: number | undefined, lang: Language): string {
  if (!ts) return '—';
  const mins = Math.floor((Date.now() - ts) / 60000);
  if (mins < 1) return lang === 'en' ? 'now' : 'nyt';
  if (mins < 60) return mins + ' min';
  const hours = Math.floor(mins / 60);
  if (hours < 24) return hours + ' h';
  return Math.floor(hours / 24) + (lang === 'en' ? ' d' : ' vrk');
}

export function fmtClock(ts: number | undefined): string {
  if (!ts) return '—';
  return new Date(ts).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

export function fmtBytes(b: number): string {
  return b >= 1048576 ? (b / 1048576).toFixed(1) + ' Mt' : Math.max(1, Math.round(b / 1024)) + ' kt';
}

/* ============================================================= primitiivit */

export const Micro: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className }) => (
  <span className={'evo-micro ' + (className || '')}>{children}</span>
);

export const Chip: React.FC<{ tone?: 'live' | 'warn' | 'danger' | 'muted' | 'plain'; children: React.ReactNode }> = ({ tone = 'plain', children }) => (
  <span className={'evo-chip ' + (tone === 'plain' ? '' : tone)}>{children}</span>
);

export const Btn: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'danger' | 'ghost' | 'plain'; block?: boolean; sm?: boolean }> = ({
  variant = 'plain', block, sm, className, children, ...rest
}) => (
  <button className={'evo-btn ' + variant + (block ? ' block' : '') + (sm ? ' sm' : '') + ' ' + (className || '')} {...rest}>
    {children}
  </button>
);

export const Seg = <T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { v: T; label: React.ReactNode }[] }) => (
  <div className="evo-seg">
    {options.map((o) => (
      <button key={o.v} type="button" className={value === o.v ? 'on' : ''} onClick={() => onChange(o.v)}>
        {o.label}
      </button>
    ))}
  </div>
);

export const Sheet: React.FC<{ title: string; onClose: () => void; children: React.ReactNode }> = ({ title, onClose, children }) => (
  <>
    <div className="evo-scrim" onClick={onClose} />
    <div className="evo-sheet">
      <div className="mx-auto mt-2.5 mb-1 h-1 w-10 rounded-full" style={{ background: 'var(--e-border)' }} />
      <div className="flex items-center justify-between gap-3 border-b px-4 pb-3 pt-1" style={{ borderColor: 'var(--e-border-soft)' }}>
        <h2 className="text-[17px] font-extrabold">{title}</h2>
        <button className="evo-iconbtn" onClick={onClose} aria-label="close">✕</button>
      </div>
      <div className="overflow-y-auto p-4 pb-8">{children}</div>
    </div>
  </>
);

/* ============================================================= EvoProps */
/* Everything App.tsx already owns, handed to Evo. Evo is purely presentational —
 * it never calls a data hook itself, so collars are never polled twice. */

/** Small navigation handle Evo passes to its screens (they do not own the tab state). */
export interface EvoNav {
  goMap: () => void;
  openHub: () => void;
}


export interface EvoProps {
  setUiMode: (mode: UiMode) => void;

  currentSession: HuntSession | null;
  currentUser: FirebaseUser | null;
  userProfile: UserProfile | null;
  userLocation: UserLocation | null;
  isGpsTracking: boolean;
  toggleGps: () => void;

  mapLayer: MapLayerType;
  setMapLayer: (layer: MapLayerType) => void;

  dogs: Dog[];
  visibleDogs: Dog[];
  hiddenDogIds: string[];
  selectedDogId: string | null;
  setSelectedDogId: (id: string | null) => void;
  dogLibrary: Dog[];
  isMyDog: (dog: Dog) => boolean;

  team: TeamMember[];
  selectedHunterId?: string | null;
  setSelectedHunterId?: (id: string | null) => void;
  radioMessages: RadioMessage[];
  unreadRadioCount: number;

  annotations: MapAnnotation[];
  safetySectors?: SafetySector[];
  setSafetySectors?: (s: SafetySector[]) => void;

  mapFocusTarget: { lat: number; lng: number } | null;
  setMapFocusTarget: (t: { lat: number; lng: number } | null) => void;
  activeRulerPoint: { lat: number; lng: number; title: string } | null;
  setActiveRulerPoint: (p: { lat: number; lng: number; title: string } | null) => void;

  showDogTracks: boolean;
  setShowDogTracks: (v: boolean) => void;
  showHunterNames: boolean;
  setShowHunterNames: (v: boolean) => void;
  showSafetySectors?: boolean;
  setShowSafetySectors?: (v: boolean) => void;

  onToggleDogVisibility: (dogId: string) => void;
  onUnshareDog: (dogId: string) => void;
  onShareLibraryDog: (dog: Dog) => void;
  onDeleteDog: (dogId: string, options?: { keepSaved?: boolean }) => void;
  onToggleDogAlert: (dogId: string, type: 'bark' | 'stand') => void;
  onSendMessage: (text: string, category?: 'alert' | 'info' | 'action') => void;
  onUpdateMemberStatus: (memberId: string, status: HunterStatus) => void;
  onDeleteHunter: (hunterId: string) => void;
  onDeleteAnnotation: (id: string) => void;
  onMapClick: (lat: number, lng: number) => void;
  onExportGpx: () => void;
  onLeaveSession: () => void;

  openAddDog: () => void;
  openAddAnnotation: () => void;
  openImportMapData: () => void;
  openSos: () => void;
  openSessionAuth: () => void;
  openShare: () => void;
  openUserAuth: () => void;
}
