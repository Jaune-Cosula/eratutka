import React, { createContext, useContext, useState, useEffect } from 'react';

export type Language = 'fi' | 'en';

export interface Translations {
  // Common Navigation & Tabs
  map: string;
  dogs: string;
  chatRadio: string;
  annotations: string;
  ruler: string;
  huntSession: string;
  share: string;
  sos: string;
  gpsTracking: string;
  exportGpx: string;
  addDog: string;
  addMarker: string;
  account: string;
  signIn: string;
  logOut: string;
  theme: string;

  // Radar & Tracking
  trackDog: string;
  trackHunter: string;
  radarHeading: string;
  radarSubheading: string;
  barkRate: string;
  battery: string;
  distance: string;
  bearing: string;
  speed: string;
  totalDistance: string;
  resetOdometer: string;
  standingBark: string;
  dogStatus: string;
  callCollar: string;
  showOnMap: string;
  callPhone: string;
  hunterStatus: string;
  hunterStand: string;

  // Annotations & Geofence
  markersAndAreas: string;
  addGeofenceArea: string;
  geofenceTitle: string;
  geofenceRadius: string;
  geofenceCondition: string;
  geofenceExitAlert: string;
  geofenceEnterAlert: string;
  geofenceBothAlert: string;
  geofenceHelp: string;
  categoryStand: string;
  categorySighting: string;
  categoryArea: string;
  categorySafety: string;

  // Team & Radio
  teamTitle: string;
  radioChannel: string;
  sendRadioMsg: string;
  statusOnStand: string;
  statusMoving: string;
  statusBreak: string;

  // Auth Modal
  authModalTitle: string;
  authModalSubtitle: string;
  continueWithGoogle: string;
  googleRecommended: string;
  orEmailSignIn: string;
  emailLabel: string;
  passwordLabel: string;
  nameLabel: string;
  guestSignIn: string;
  createAccount: string;

  // SOS & Emergency
  sosTitle: string;
  sosPrompt: string;
  sendSosBtn: string;
  cancel: string;
  save: string;
}

const translations: Record<Language, Translations> = {
  fi: {
    map: 'Kartta',
    dogs: 'Koirat',
    chatRadio: 'Chat & Radio',
    annotations: 'Merkinnät',
    ruler: 'Mittari',
    huntSession: 'Jahti',
    share: 'Jaa',
    sos: 'SOS HÄTÄ',
    gpsTracking: 'GPS-Seuranta',
    exportGpx: 'Vie GPX',
    addDog: 'Lisää Koira',
    addMarker: 'Lisää Merkintä',
    account: 'Tili',
    signIn: 'Kirjaudu',
    logOut: 'Kirjaudu ulos',
    theme: 'Teema',

    trackDog: 'Seuraa koiraa',
    trackHunter: 'Seuraa metsästäjää',
    radarHeading: 'TUTKASEURANTA & GPS',
    radarSubheading: 'Seuraa koirien ja metsästäjien paikkatietoa, etäisyyttä ja tilaa',
    barkRate: 'Haukut/min',
    battery: 'Akku',
    distance: 'Etäisyys',
    bearing: 'Kompassisuunta',
    speed: 'Nopeus',
    totalDistance: 'Kulkema matka',
    resetOdometer: 'Nollaa matkamittari',
    standingBark: 'Seisontahaukku',
    dogStatus: 'Pannan tila',
    callCollar: 'Soita pantaan',
    showOnMap: 'Näytä kartalla',
    callPhone: 'Soita',
    hunterStatus: 'Metsästäjän tila',
    hunterStand: 'Passipaikka',

    markersAndAreas: 'Karttamerkinnät & Turva-alueet',
    addGeofenceArea: 'Lisää Geofence-turva-alue',
    geofenceTitle: 'Turva-alueen hälytysasetukset',
    geofenceRadius: 'Alueen säde',
    geofenceCondition: 'Hälytyksen ehto',
    geofenceExitAlert: 'Hälytä kun koira POISTUU alueelta (Turva-alue)',
    geofenceEnterAlert: 'Hälytä kun koira SAAPUI alueelle (Kieltoalue)',
    geofenceBothAlert: 'Hälytä molemmista (Rajanylitys)',
    geofenceHelp: 'Erätutka antaa äänihälytyksen kun koira ylittää asetetun turva-alueen rajan.',
    categoryStand: 'Passipaikka',
    categorySighting: 'Havainto / Jälki',
    categoryArea: 'Alue / Geofence',
    categorySafety: 'Turvallisuus',

    teamTitle: 'Jahtiporukka & Pikaviestin',
    radioChannel: 'Radiokanava',
    sendRadioMsg: 'Lähetä radioviesti',
    statusOnStand: 'Passissa',
    statusMoving: 'Liikkeellä',
    statusBreak: 'Tauolla',

    authModalTitle: 'Erätutka Tili & Synkronointi',
    authModalSubtitle: 'Kirjaudu sisään tallentaaksesi koirat, merkinnät ja jahtisessiot pilveen.',
    continueWithGoogle: 'Jatka Google-tilillä',
    googleRecommended: 'Google-kirjautuminen toimii heti ilman lisäasetuksia.',
    orEmailSignIn: 'tai kirjaudu sähköpostilla',
    emailLabel: 'Sähköpostiosoite',
    passwordLabel: 'Salasana',
    nameLabel: 'Nimesi / Kutsumanimi',
    guestSignIn: 'Jatka vierailijana (Tallentuu vain laitteelle)',
    createAccount: 'Luo Tili',

    sosTitle: '⚠️ SOS HÄTÄILMOITUS',
    sosPrompt: 'Oletko varma että haluat lähettää hätäkutson kaikille jahdin osallistujille?',
    sendSosBtn: 'LÄHETÄ HÄTÄKUTSU NYT',
    cancel: 'Peruuta',
    save: 'Tallenna',
  },
  en: {
    map: 'Map',
    dogs: 'Dogs',
    chatRadio: 'Chat & Radio',
    annotations: 'Markers',
    ruler: 'Ruler',
    huntSession: 'Hunt Session',
    share: 'Share',
    sos: 'EMERGENCY SOS',
    gpsTracking: 'GPS Tracking',
    exportGpx: 'Export GPX',
    addDog: 'Add Dog',
    addMarker: 'Add Marker',
    account: 'Account',
    signIn: 'Sign In',
    logOut: 'Sign Out',
    theme: 'Theme',

    trackDog: 'Track Dog',
    trackHunter: 'Track Hunter',
    radarHeading: 'RADAR TRACKING & GPS',
    radarSubheading: 'Track real-time positions, distances, barking rate and battery status',
    barkRate: 'Barks/min',
    battery: 'Battery',
    distance: 'Distance',
    bearing: 'Compass Heading',
    speed: 'Speed',
    totalDistance: 'Distance Covered',
    resetOdometer: 'Reset Odometer',
    standingBark: 'Standing Bark',
    dogStatus: 'Collar Status',
    callCollar: 'Call Collar',
    showOnMap: 'Show on Map',
    callPhone: 'Call Phone',
    hunterStatus: 'Hunter Status',
    hunterStand: 'Stand Location',

    markersAndAreas: 'Map Markers & Geofences',
    addGeofenceArea: 'Add Geofence Boundary',
    geofenceTitle: 'Geofence Alarm Settings',
    geofenceRadius: 'Zone Radius',
    geofenceCondition: 'Alarm Trigger',
    geofenceExitAlert: 'Alert when dog EXITS boundary (Safety Zone)',
    geofenceEnterAlert: 'Alert when dog ENTERS boundary (Restricted Area)',
    geofenceBothAlert: 'Alert on both (Boundary Crossing)',
    geofenceHelp: 'Erätutka triggers audio alerts when a dog crosses the defined geofence boundary.',
    categoryStand: 'Hunting Stand',
    categorySighting: 'Sighting / Tracks',
    categoryArea: 'Zone / Geofence',
    categorySafety: 'Safety',

    teamTitle: 'Hunting Group & Radio',
    radioChannel: 'Radio Channel',
    sendRadioMsg: 'Send Radio Message',
    statusOnStand: 'On Stand',
    statusMoving: 'In Motion',
    statusBreak: 'On Break',

    authModalTitle: 'Erätutka Account & Cloud Sync',
    authModalSubtitle: 'Sign in to sync your dogs, map markers, and hunting sessions across devices.',
    continueWithGoogle: 'Continue with Google',
    googleRecommended: 'Google sign-in works instantly without extra setup.',
    orEmailSignIn: 'or sign in with email',
    emailLabel: 'Email Address',
    passwordLabel: 'Password',
    nameLabel: 'Your Name / Handle',
    guestSignIn: 'Continue as Guest (Local storage only)',
    createAccount: 'Create Account',

    sosTitle: '⚠️ EMERGENCY SOS DISTRESS',
    sosPrompt: 'Are you sure you want to broadcast an emergency distress signal to all hunters?',
    sendSosBtn: 'SEND EMERGENCY SOS NOW',
    cancel: 'Cancel',
    save: 'Save',
  },
};

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: Translations;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<Language>(() => {
    const saved = localStorage.getItem('eratutka_language');
    if (saved === 'en' || saved === 'fi') return saved;
    return 'fi';
  });

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    localStorage.setItem('eratutka_language', lang);
  };

  const t = translations[language];

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
};
