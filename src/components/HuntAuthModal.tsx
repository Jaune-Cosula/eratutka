import React, { useEffect, useState } from 'react';
import { Shield, Users, Key, Plus, LogIn, CheckCircle2, Lock, UserCheck, Dog as DogIcon, User, X, ChevronDown, ChevronUp, Trash2 } from 'lucide-react';
import { HuntSession, HunterRole, TeamMember, Dog, MapAnnotation } from '../types';
import { useLanguage } from '../context/LanguageContext';
import { listStoredHunts, forgetStoredHunt, StoredHunt } from '../services/huntIndex';
import {
  saveSessionToFirebase,
  createSessionOnServer,
  resolveSessionKey,
  setActiveHuntKey,
} from '../services/userService';

interface HuntAuthModalProps {
  onSessionCreatedOrJoined: (session: HuntSession, initialDogs?: Dog[]) => void;
  onClose?: () => void;
  isDarkMode: boolean;
  canCloseWithoutSession?: boolean;
  currentDogs?: Dog[];
  currentAnnotations?: MapAnnotation[];
  /**
   * Signed-in state, so a hunter can pull their saved collars in *before* the hunt exists.
   * Signing in restores them into the collar list (see App), which is what makes the "Omat
   * koirat" choice below possible on a device that has never seen them - a new phone, or one
   * whose site data was cleared.
   */
  isSignedIn?: boolean;
  userName?: string;
  onOpenAuthModal?: () => void;
  /** The hunt that is open right now, marked in the list of stored hunts and never cleared. */
  currentHuntCode?: string;
}

export const HuntAuthModal: React.FC<HuntAuthModalProps> = ({
  onSessionCreatedOrJoined,
  onClose,
  isDarkMode,
  canCloseWithoutSession = false,
  currentDogs = [],
  currentAnnotations = [],
  isSignedIn = false,
  userName,
  onOpenAuthModal,
  currentHuntCode,
}) => {
  const { language } = useLanguage();
  const urlParams = new URLSearchParams(window.location.search);
  const paramHuntCode = urlParams.get('huntCode');
  // The capability key travels in the URL fragment: browsers never send a fragment to
  // the server and never leak it through the Referer header, unlike a query parameter.
  const paramHuntKey = (() => {
    const hash = window.location.hash.replace(/^#/, '');
    if (!hash) return null;
    return new URLSearchParams(hash).get('huntKey');
  })();

  const [activeTab, setActiveTab] = useState<'create' | 'join'>(paramHuntCode ? 'join' : 'create');

  // Create form state
  const [createSessionName, setCreateSessionName] = useState('Hirvijahti 2026');
  const [createNickname, setCreateNickname] = useState(language === 'fi' ? 'Jahtimestari' : 'Hunt Master');
  const [createPassword, setCreatePassword] = useState('1234');

  // Dog inclusion mode for new hunt creation: 'current' | 'empty'
  const [includeDogsMode, setIncludeDogsMode] = useState<'current' | 'empty'>(
    currentDogs.length > 0 ? 'current' : 'empty'
  );

  // Signing in from this screen restores the hunter's saved collars, and those are exactly what
  // they came to include - so follow along until they choose for themselves. Without this the
  // choice stayed on "start clean" as it was initialised when the list was still empty, and the
  // collars they just brought in would be quietly left out.
  const [includeDogsChosen, setIncludeDogsChosen] = useState(false);
  useEffect(() => {
    if (!includeDogsChosen && currentDogs.length > 0) setIncludeDogsMode('current');
  }, [includeDogsChosen, currentDogs.length]);

  // What this device has stored for each hunt it has taken part in. Read when the screen opens
  // and after every cleanup, because storage is the only place that knows.
  const [storedHunts, setStoredHunts] = useState<StoredHunt[]>([]);
  const [showStoredHunts, setShowStoredHunts] = useState(false);
  useEffect(() => {
    setStoredHunts(listStoredHunts());
  }, []);

  const formatHuntLastUsed = (timestamp?: number): string => {
    if (!timestamp) return language === 'fi' ? 'ei aikaleimaa' : 'no timestamp';
    const date = new Date(timestamp);
    const time = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const sameDay = new Date().toDateString() === date.toDateString();
    return sameDay
      ? (language === 'fi' ? `tänään ${time}` : `today ${time}`)
      : `${date.toLocaleDateString()} ${time}`;
  };

  const formatHuntSize = (bytes: number): string =>
    bytes >= 1024 * 1024
      ? `${(bytes / 1024 / 1024).toFixed(1)} Mt`
      : `${Math.max(1, Math.round(bytes / 1024))} kt`;

  const huntsToClear = storedHunts.filter((hunt) => hunt.code !== currentHuntCode);

  const handleForgetHunt = (hunt: StoredHunt) => {
    const label = language === 'fi'
      ? `Poista jahdin ${hunt.code} tiedot tältä laitteelta?\n\nMukana lähtevät myös sen merkinnät (${hunt.annotationCount} kpl) ja koiralista. Pilvikopiota tämä ei poista.`
      : `Remove the data for hunt ${hunt.code} from this device?\n\nIts markers (${hunt.annotationCount}) and collar list go too. The cloud copy is not touched.`;
    if (!window.confirm(label)) return;
    forgetStoredHunt(hunt.code, currentHuntCode);
    setStoredHunts(listStoredHunts());
  };

  const handleForgetAllOtherHunts = () => {
    const label = language === 'fi'
      ? `Poista ${huntsToClear.length} muun jahdin tiedot tältä laitteelta (${formatHuntSize(huntsToClear.reduce((sum, h) => sum + h.bytes, 0))})?\n\nNykyinen jahti säilyy. Pilvikopioita tämä ei poista.`
      : `Remove the data for ${huntsToClear.length} other hunts from this device (${formatHuntSize(huntsToClear.reduce((sum, h) => sum + h.bytes, 0))})?\n\nThe current hunt is kept. Cloud copies are not touched.`;
    if (!window.confirm(label)) return;
    huntsToClear.forEach((hunt) => forgetStoredHunt(hunt.code, currentHuntCode));
    setStoredHunts(listStoredHunts());
  };

  // Join form state
  const [joinCode, setJoinCode] = useState(paramHuntCode ? paramHuntCode.toUpperCase() : '');
  const [joinNickname, setJoinNickname] = useState(language === 'fi' ? 'Metsästäjä' : 'Hunter');
  const [joinRole, setJoinRole] = useState<HunterRole>('passimies');
  const [joinPassword, setJoinPassword] = useState('');

  // Set while a session is being created or a code+PIN is being exchanged for a key
  const [isCheckingCloud, setIsCheckingCloud] = useState<boolean>(false);

  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleCreateSession = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!createSessionName.trim() || !createNickname.trim() || !createPassword.trim()) {
      setErrorMessage(
        language === 'fi'
          ? 'Täytä kaikki kentät: jahtipäivän nimi, nimimerkki ja PIN-koodi.'
          : 'Please fill in all fields: session name, nickname, and PIN.'
      );
      return;
    }

    setIsCheckingCloud(true);
    // The server mints both the code and the capability key, so a guessed code can
    // never be claimed by someone else before the hunt master creates it.
    const created = await createSessionOnServer(createSessionName.trim(), createPassword.trim());
    setIsCheckingCloud(false);

    if (created.error || !created.code || !created.huntKey) {
      setErrorMessage(created.error || 'Jahtipäivän luonti epäonnistui.');
      return;
    }

    const dogsToInclude: Dog[] =
      includeDogsMode === 'current' && currentDogs.length > 0
        ? currentDogs
        : [];

    const newSession: HuntSession = {
      id: `session-${Date.now()}`,
      name: createSessionName.trim(),
      code: created.code,
      password: createPassword.trim(),
      huntKey: created.huntKey,
      creatorName: createNickname.trim(),
      createdAt: Date.now(),
      myRole: 'Jahtimestari',
      myNickname: createNickname.trim(),
      isJahtimestari: true,
    };

    // Arm the relay key before the first push, otherwise the server rejects it.
    setActiveHuntKey(created.huntKey);

    // Initialize Creator as first team member
    const creatorMember: TeamMember = {
      id: `hunter-creator-${Date.now()}`,
      name: createNickname.trim(),
      role: 'päällikkö',
      status: 'passissa',
      lat: 63.854,
      lng: 29.812,
      battery: 100,
      lastUpdated: Date.now(),
    };

    // Save session to Firestore for live sync with all initial dogs
    await saveSessionToFirebase(
      newSession,
      dogsToInclude,
      currentAnnotations,
      [creatorMember],
      []
    );

    onSessionCreatedOrJoined(newSession, dogsToInclude);
  };

  const handleJoinSession = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!joinCode.trim() || !joinNickname.trim()) {
      setErrorMessage(
        language === 'fi'
          ? 'Syötä jahtikoodi ja oma nimimerkkisi.'
          : 'Please enter hunt code and your nickname.'
      );
      return;
    }

    const upperCode = joinCode.trim().toUpperCase();

    // Route 1: the share link already carries the capability key.
    let huntKey: string | null = paramHuntKey;
    let sessionInfo: Partial<HuntSession> | undefined;

    // Route 2: only a code and the PIN — the server exchanges them for the key.
    if (!huntKey) {
      if (!joinPassword.trim()) {
        setErrorMessage(
          language === 'fi'
            ? 'Syötä jahtipäivän PIN-koodi, tai avaa jahtimestarin lähettämä jakolinkki.'
            : 'Enter the hunt PIN, or open the share link from the hunt master.'
        );
        return;
      }

      setIsCheckingCloud(true);
      const resolved = await resolveSessionKey(upperCode, joinPassword.trim());
      setIsCheckingCloud(false);

      if (resolved.error || !resolved.huntKey) {
        setErrorMessage(resolved.error || 'Väärä jahtikoodi tai PIN-koodi.');
        return;
      }

      huntKey = resolved.huntKey;
      sessionInfo = resolved.sessionInfo;
    }

    setActiveHuntKey(huntKey);

    const newSession: HuntSession = {
      id: `session-joined-${Date.now()}`,
      name:
        sessionInfo?.name ||
        `${language === 'fi' ? 'Jahtipäivä' : 'Hunt Session'} (${upperCode})`,
      code: upperCode,
      // The PIN is verified by the server and never handed back to a joining client.
      password: sessionInfo?.password,
      huntKey,
      creatorName: sessionInfo?.creatorName || (language === 'fi' ? 'Jahtimestari' : 'Hunt Master'),
      createdAt: sessionInfo?.createdAt || Date.now(),
      myRole: joinRole,
      myNickname: joinNickname.trim(),
      isJahtimestari: false,
    };

    onSessionCreatedOrJoined(newSession);
  };

  return (
    <div
      onClick={(e) => {
        if (canCloseWithoutSession && onClose && e.target === e.currentTarget) {
          onClose();
        }
      }}
      className="fixed inset-0 z-[3000] flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-fade-in overflow-y-auto"
    >
      <div
        className={`w-full max-w-lg max-h-[90vh] flex flex-col rounded-3xl border ${
          isDarkMode ? 'bg-stone-900 border-amber-500/30 text-stone-100' : 'bg-white border-amber-300 text-stone-900'
        } shadow-2xl overflow-hidden`}
      >
        {/* Header */}
        <div className="p-5 sm:p-6 bg-gradient-to-r from-stone-950 via-stone-900 to-stone-950 border-b border-stone-800 relative">
          {canCloseWithoutSession && onClose && (
            <button
              onClick={onClose}
              className="absolute top-4 right-4 p-2 rounded-xl bg-stone-800/80 hover:bg-stone-700 text-stone-300 transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          )}

          <div className="flex items-center space-x-3 mb-2">
            <div className="p-2.5 rounded-2xl bg-amber-500/20 text-amber-400 border border-amber-500/30">
              <Shield className="w-7 h-7" />
            </div>
            <div>
              <h2 className="text-xl sm:text-2xl font-black tracking-wide text-white">
                {language === 'fi' ? 'Erätutka LIVE-jahti' : 'Erätutka LIVE Hunt'}
              </h2>
              <p className="text-xs text-stone-400">
                {language === 'fi'
                  ? 'Reaaliaikainen jahtiporukan ja koiratutkan tilannekuva'
                  : 'Real-time hunting team and dog radar situational view'}
              </p>
            </div>
          </div>

          {/* Tab switch */}
          <div className="flex items-center p-1 mt-4 rounded-2xl bg-stone-900 border border-stone-800">
            <button
              type="button"
              onClick={() => {
                setActiveTab('create');
                setErrorMessage(null);
              }}
              className={`flex-1 py-2.5 rounded-xl font-black text-xs transition flex items-center justify-center space-x-2 cursor-pointer ${
                activeTab === 'create'
                  ? 'bg-amber-500 text-stone-950 shadow-md'
                  : 'text-stone-400 hover:text-stone-200'
              }`}
            >
              <Plus className="w-4 h-4" />
              <span>{language === 'fi' ? 'Luo uusi jahtipäivä' : 'Create Hunt'}</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveTab('join');
                setErrorMessage(null);
              }}
              className={`flex-1 py-2.5 rounded-xl font-black text-xs transition flex items-center justify-center space-x-2 cursor-pointer ${
                activeTab === 'join'
                  ? 'bg-amber-500 text-stone-950 shadow-md'
                  : 'text-stone-400 hover:text-stone-200'
              }`}
            >
              <LogIn className="w-4 h-4" />
              <span>{language === 'fi' ? 'Liity koodilla' : 'Join with Code'}</span>
            </button>
          </div>
        </div>

        {/* Scrollable Content Form */}
        <div className="p-5 sm:p-6 overflow-y-auto flex-1 space-y-5">
          {errorMessage && (
            <div className="p-3.5 rounded-2xl bg-red-950/80 border border-red-500/50 text-red-300 text-xs font-bold animate-fadeIn">
              ⚠️ {errorMessage}
            </div>
          )}

          {activeTab === 'create' ? (
            <form onSubmit={handleCreateSession} className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase text-stone-400 mb-1">
                  {language === 'fi' ? 'Jahtipäivän nimi / Alue' : 'Hunt Session Name / Area'}
                </label>
                <div className="relative">
                  <Shield className="w-4 h-4 text-stone-500 absolute left-3.5 top-3" />
                  <input
                    type="text"
                    value={createSessionName}
                    onChange={(e) => setCreateSessionName(e.target.value)}
                    placeholder="esim. Hirvijahti 2026, Ilomantsi"
                    className="w-full pl-9 pr-3.5 py-2.5 rounded-xl bg-stone-950 border border-stone-800 focus:border-amber-500 text-stone-100 text-sm font-semibold outline-none transition"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-stone-400 mb-1">
                  {language === 'fi' ? 'Oma nimimerkkisi (Jahtimestari)' : 'Your Nickname (Hunt Master)'}
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-stone-500 absolute left-3.5 top-3" />
                  <input
                    type="text"
                    value={createNickname}
                    onChange={(e) => setCreateNickname(e.target.value)}
                    placeholder="esim. Päällikkö Antti"
                    className="w-full pl-9 pr-3.5 py-2.5 rounded-xl bg-stone-950 border border-stone-800 focus:border-amber-500 text-stone-100 text-sm font-semibold outline-none transition"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-stone-400 mb-1">
                  {language === 'fi' ? 'Jahtipäivän PIN-koodi / Salasana' : 'Hunt PIN / Password'}
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-stone-500 absolute left-3.5 top-3" />
                  <input
                    type="text"
                    value={createPassword}
                    onChange={(e) => setCreatePassword(e.target.value)}
                    placeholder="esim. 1234"
                    className="w-full pl-9 pr-3.5 py-2.5 rounded-xl bg-stone-950 border border-stone-800 focus:border-amber-500 text-stone-100 text-sm font-mono outline-none transition"
                    required
                  />
                </div>
                <p className="text-[10px] text-stone-400 mt-1">
                  {language === 'fi'
                    ? 'Jahtiseurueen jäsenet tarvitsevat tämän salasanan liittyäkseen jahtiin.'
                    : 'Group members will need this password to join your live hunt.'}
                </p>
              </div>

              {/* Dog inclusion choice */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold uppercase text-stone-400">
                  {language === 'fi' ? 'Jahtiin liitettävät koirat' : 'Dogs to Include'}
                </label>

                {/* Signing in already restores the saved collars into the list (App does it on
                    the auth state change), so this only has to offer the way in and say what it
                    brought. */}
                {onOpenAuthModal && !isSignedIn && (
                  <button
                    type="button"
                    onClick={onOpenAuthModal}
                    className="w-full p-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 text-amber-200 hover:bg-amber-500/20 transition flex items-center space-x-2.5 text-left cursor-pointer"
                  >
                    <LogIn className="w-4 h-4 text-amber-400 shrink-0" />
                    <span className="text-[11px] leading-snug font-semibold">
                      {language === 'fi'
                        ? 'Kirjaudu sisään, niin omat tallennetut pantasi ovat valittavissa tähän jahtiin.'
                        : 'Sign in to have your saved collars available for this hunt.'}
                    </span>
                  </button>
                )}

                {isSignedIn && userName && (
                  <p className="text-[11px] text-emerald-400 flex items-center space-x-1.5 px-1">
                    <UserCheck className="w-3.5 h-3.5 shrink-0" />
                    <span>
                      {language === 'fi'
                        ? `Kirjautuneena ${userName} — tallennetut pannat ovat alla valittavissa.`
                        : `Signed in as ${userName} — your saved collars are available below.`}
                    </span>
                  </p>
                )}
                {currentDogs.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setIncludeDogsChosen(true);
                        setIncludeDogsMode('current');
                      }}
                      className={`p-3 rounded-2xl border text-left transition flex flex-col justify-between cursor-pointer ${
                        includeDogsMode === 'current'
                          ? 'bg-amber-500/20 border-amber-500 text-amber-200 ring-1 ring-amber-500/50'
                          : 'bg-stone-950 border-stone-800 text-stone-400 hover:text-stone-200'
                      }`}
                    >
                      <div className="flex items-center justify-between w-full mb-1">
                        <span className="text-xs font-bold text-stone-200">
                          {language === 'fi' ? 'Omat koirat' : 'Current Dogs'} ({currentDogs.length} kpl)
                        </span>
                        {includeDogsMode === 'current' && (
                          <CheckCircle2 className="w-4 h-4 text-amber-400 shrink-0" />
                        )}
                      </div>
                      <p className="text-[10px] text-stone-400">
                        {currentDogs.map((d) => d.name).join(', ')}
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setIncludeDogsChosen(true);
                        setIncludeDogsMode('empty');
                      }}
                      className={`p-3 rounded-2xl border text-left transition flex flex-col justify-between cursor-pointer ${
                        includeDogsMode === 'empty'
                          ? 'bg-amber-500/20 border-amber-500 text-amber-200 ring-1 ring-amber-500/50'
                          : 'bg-stone-950 border-stone-800 text-stone-400 hover:text-stone-200'
                      }`}
                    >
                      <div className="flex items-center justify-between w-full mb-1">
                        <span className="text-xs font-bold text-stone-200">
                          {language === 'fi' ? 'Aloita tyhjällä' : 'Start Clean'}
                        </span>
                        {includeDogsMode === 'empty' && (
                          <CheckCircle2 className="w-4 h-4 text-amber-400 shrink-0" />
                        )}
                      </div>
                      <p className="text-[10px] text-stone-400">
                        {language === 'fi' ? 'Ei koiria alussa. Lisää myöhemmin.' : 'No dogs initially.'}
                      </p>
                    </button>
                  </div>
                ) : (
                  <div className="p-3 rounded-2xl bg-stone-950/70 border border-stone-800 text-xs text-stone-300 space-y-1">
                    <div className="flex items-center space-x-1.5 text-amber-400 font-bold">
                      <DogIcon className="w-4 h-4" />
                      <span>{language === 'fi' ? 'Puhdas jahtipohja' : 'Clean Hunt Slate'}</span>
                    </div>
                    <p className="text-[11px] text-stone-400 leading-snug">
                      {language === 'fi'
                        ? 'Jahti luodaan ilman koiria. Omat pannasi siirtyvät kirjastoon, josta saat ne jahtiin yhdellä ruksilla.'
                        : 'Hunt starts with no dogs. Your own collars are kept in the library, one tick away.'}
                    </p>
                  </div>
                )}
              </div>

              <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-200 flex items-start space-x-2.5">
                <UserCheck className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold">{language === 'fi' ? 'Jahtimestarin oikeudet:' : 'Hunt Master privileges:'}</span>{' '}
                  {language === 'fi'
                    ? 'Saat luonnin jälkeen kutsukoodin ja QR-koodin, jolla voit kutsua porukan kartalle mukaan.'
                    : 'You will receive an invite code and QR code to bring your group onto the live map.'}
                </div>
              </div>

              <button
                type="submit"
                className="w-full py-3.5 rounded-2xl bg-amber-500 hover:bg-amber-400 text-stone-950 font-black text-sm tracking-wide transition shadow-lg flex items-center justify-center space-x-2 cursor-pointer"
              >
                <Plus className="w-5 h-5" />
                <span>{language === 'fi' ? 'Luo jahtipäivä ja avaa kartta' : 'Create Hunt & Open Map'}</span>
              </button>
            </form>
          ) : (
            <form onSubmit={handleJoinSession} className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase text-stone-400 mb-1">
                  {language === 'fi' ? 'Jahtikoodi' : 'Hunt Code'}
                </label>
                <div className="relative">
                  <Key className="w-4 h-4 text-stone-500 absolute left-3.5 top-3" />
                  <input
                    type="text"
                    value={joinCode}
                    onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                    placeholder="esim. HIRVI-4921"
                    className="w-full pl-9 pr-3.5 py-2.5 rounded-xl bg-stone-950 border border-stone-800 focus:border-amber-500 text-amber-400 text-sm font-mono font-bold uppercase outline-none transition"
                    required
                  />
                </div>

                {isCheckingCloud && (
                  <p className="text-[11px] text-amber-400 mt-1 animate-pulse">
                    {language === 'fi' ? 'Yhdistetään jahtiin...' : 'Joining hunt...'}
                  </p>
                )}

                {paramHuntKey && (
                  <div className="mt-2 p-3 rounded-2xl bg-emerald-950/70 border border-emerald-500/40 text-xs text-emerald-200 flex items-center justify-between">
                    <span className="text-[11px]">
                      {language === 'fi'
                        ? 'Jakolinkki sisältää jahtiavaimen — PIN-koodia ei tarvita.'
                        : 'The share link contains the hunt key — no PIN needed.'}
                    </span>
                    <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-stone-400 mb-1">
                  {language === 'fi' ? 'Oma nimesi / Nimimerkki' : 'Your Name / Nickname'}
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-stone-500 absolute left-3.5 top-3" />
                  <input
                    type="text"
                    value={joinNickname}
                    onChange={(e) => setJoinNickname(e.target.value)}
                    placeholder="esim. Matti V."
                    className="w-full pl-9 pr-3.5 py-2.5 rounded-xl bg-stone-950 border border-stone-800 focus:border-amber-500 text-stone-100 text-sm font-semibold outline-none transition"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-stone-400 mb-1">
                  {language === 'fi' ? 'Rooli jahdissa' : 'Role in Hunt'}
                </label>
                <select
                  value={joinRole}
                  onChange={(e) => setJoinRole(e.target.value as HunterRole)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-stone-950 border border-stone-800 focus:border-amber-500 text-stone-100 text-sm font-semibold outline-none transition cursor-pointer"
                >
                  <option value="passimies">{language === 'fi' ? 'Passimies' : 'Stand Hunter'}</option>
                  <option value="koiramies">{language === 'fi' ? 'Koiramies' : 'Dog Handler'}</option>
                  <option value="ajomies">{language === 'fi' ? 'Ajomies' : 'Driver / Tracker'}</option>
                  <option value="seuraaja">{language === 'fi' ? 'Seuraaja / Tarkkailija' : 'Observer'}</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-stone-400 mb-1">
                  {language === 'fi' ? 'Jahtipäivän PIN-koodi' : 'Hunt PIN'}
                  {paramHuntKey && (
                    <span className="ml-1 text-emerald-400 normal-case font-semibold">
                      ({language === 'fi' ? 'ei tarvita linkillä' : 'not needed with a link'})
                    </span>
                  )}
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-stone-500 absolute left-3.5 top-3" />
                  <input
                    type="password"
                    value={joinPassword}
                    onChange={(e) => setJoinPassword(e.target.value)}
                    placeholder={
                      paramHuntKey
                        ? language === 'fi'
                          ? 'Ohitetaan — jakolinkki avaa jahdin'
                          : 'Skipped — the link unlocks the hunt'
                        : language === 'fi'
                        ? 'Anna PIN-koodi'
                        : 'Enter PIN'
                    }
                    className="w-full pl-9 pr-3.5 py-2.5 rounded-xl bg-stone-950 border border-stone-800 focus:border-amber-500 text-stone-100 text-sm font-mono outline-none transition"
                    required={!paramHuntKey}
                    disabled={Boolean(paramHuntKey)}
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isCheckingCloud}
                className="w-full py-3.5 rounded-2xl bg-amber-500 hover:bg-amber-400 disabled:opacity-60 disabled:cursor-not-allowed text-stone-950 font-black text-sm tracking-wide transition shadow-lg flex items-center justify-center space-x-2 cursor-pointer"
              >
                <LogIn className="w-5 h-5" />
                <span>{language === 'fi' ? 'Liity jahtipäivään' : 'Join Hunt Session'}</span>
              </button>
            </form>
          )}

          {/* Hunts stored on this device. Not a way back into an old hunt: the capability key
              is stripped before a session is stored, so returning takes that hunt's share link
              or code + PIN. This is for seeing what is kept here and clearing what is not needed
              - the precise alternative to wiping the browser's site data. */}
          {storedHunts.length > 0 && (
            <div className="mt-4 pt-3 border-t border-stone-800/70">
              <button
                type="button"
                onClick={() => setShowStoredHunts((prev) => !prev)}
                className="w-full flex items-center justify-between text-xs font-bold uppercase tracking-wider text-stone-400 hover:text-stone-200 transition cursor-pointer"
              >
                <span>
                  {language === 'fi'
                    ? `Tämän laitteen jahdit (${storedHunts.length})`
                    : `Hunts on this device (${storedHunts.length})`}
                </span>
                {showStoredHunts ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>

              {showStoredHunts && (
                <div className="mt-2.5 space-y-1.5">
                  {storedHunts.map((hunt) => {
                    const isCurrent = hunt.code === currentHuntCode;
                    return (
                      <div
                        key={hunt.code}
                        className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-stone-950/70 border border-stone-800"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center space-x-1.5">
                            <span className="text-xs font-mono font-bold text-amber-300">{hunt.code}</span>
                            {isCurrent && (
                              <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 font-bold uppercase">
                                {language === 'fi' ? 'nykyinen' : 'current'}
                              </span>
                            )}
                          </div>
                          <p className="text-[10px] text-stone-400 truncate">
                            {hunt.name ? `${hunt.name} • ` : ''}
                            {formatHuntLastUsed(hunt.lastUsedAt)} • {formatHuntSize(hunt.bytes)} •{' '}
                            {hunt.dogCount} {language === 'fi' ? 'koiraa' : 'dogs'} •{' '}
                            {hunt.annotationCount} {language === 'fi' ? 'merkintää' : 'markers'}
                          </p>
                        </div>
                        {!isCurrent && (
                          <button
                            type="button"
                            onClick={() => handleForgetHunt(hunt)}
                            title={language === 'fi' ? 'Poista tämän jahdin tiedot laitteelta' : 'Remove this hunt from the device'}
                            className="p-1.5 rounded-lg text-stone-400 hover:text-red-400 hover:bg-red-500/10 transition-colors shrink-0 cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    );
                  })}

                  {huntsToClear.length > 1 && (
                    <button
                      type="button"
                      onClick={handleForgetAllOtherHunts}
                      className="w-full p-2 rounded-xl border border-stone-800 text-stone-400 hover:text-red-400 hover:border-red-500/40 text-[11px] font-bold transition cursor-pointer"
                    >
                      {language === 'fi'
                        ? `Siivoa ${huntsToClear.length} muuta (${formatHuntSize(huntsToClear.reduce((sum, h) => sum + h.bytes, 0))})`
                        : `Clear ${huntsToClear.length} others (${formatHuntSize(huntsToClear.reduce((sum, h) => sum + h.bytes, 0))})`}
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
