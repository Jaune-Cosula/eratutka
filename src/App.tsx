import React, { useEffect, useState, useRef } from 'react';
import { MapPin } from 'lucide-react';
import {
  Dog,
  TeamMember,
  MapAnnotation,
  SafetySector,
  RadioMessage,
  UserLocation,
  MapLayerType,
  HunterStatus,
  HuntSession,
} from './types';
import { INITIAL_CENTER } from './data/mockData';
import { Header } from './components/Header';
import { MobileBottomNav } from './components/MobileBottomNav';
import { MapContainer } from './components/MapContainer';
import { DogRadarPanel } from './components/DogRadarPanel';
import { TeamPanel } from './components/TeamPanel';
import { AnnotationsPanel } from './components/AnnotationsPanel';
import { RulerPanel } from './components/RulerPanel';
import { SosModal } from './components/SosModal';
import { AddDogModal } from './components/AddDogModal';
import { AddAnnotationModal } from './components/AddAnnotationModal';
import { ImportMapDataModal } from './components/ImportMapDataModal';
import { HuntAuthModal } from './components/HuntAuthModal';
import { ShareSessionModal } from './components/ShareSessionModal';
import { useUserLocation } from './hooks/useUserLocation';
import { useDogTracker } from './hooks/useDogTracker';
import {
  readDogLibrary,
  writeDogLibrary,
  mergeIntoDogLibrary,
} from './services/dogLibrary';
import {
  generateGpx,
  mergeDogLists,
  markDogAsDeleted,
  isDogDeleted,
  getDogIdentifiers,
} from './utils/geoUtils';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { auth } from './lib/firebase';
import {
  UserProfile,
  fetchUserProfile,
  fetchUserDogsFromFirebase,
  saveDogToUserFirebase,
  removeDogFromUserFirebase,
  fetchUserAnnotationsFromFirebase,
  saveAnnotationToUserFirebase,
  removeAnnotationFromUserFirebase,
  subscribeToSessionFirebase,
  fetchSessionFromFirebase,
  saveSessionToFirebase,
  saveSessionAnnotations,
  saveSessionDogs,
  saveSessionTeam,
  saveSessionRadio,
  setActiveHuntKey,
  setSessionAccessDeniedHandler,
} from './services/userService';
import { UserAuthModal } from './components/UserAuthModal';
import { VersionUpdateChecker } from './components/VersionUpdateChecker';

/**
 * Makes the joining hunter's nickname unique inside the hunt.
 *
 * The team list is keyed by nickname: the client updates "its own" entry by matching the
 * name, so two hunters who picked the same nickname shared a single entry and kept
 * overwriting each other's position - and their radio messages looked like they came from
 * the same person. Appending "(2)", "(3)" ... gives each hunter a distinct entry.
 */
function makeUniqueNickname(desired: string, existingNames: string[]): string {
  const taken = new Set(existingNames.map((n) => String(n || '').trim().toLowerCase()));
  const base = String(desired || '').trim() || 'Metsästäjä';
  if (!taken.has(base.toLowerCase())) return base;

  for (let suffix = 2; suffix <= 50; suffix++) {
    const candidate = `${base} (${suffix})`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
  return `${base} (${Date.now() % 1000})`;
}

export default function App() {
  const [activeTab, setActiveTab] = useState<'map' | 'radar' | 'team' | 'annotations' | 'ruler'>('map');
  const [isDarkMode, setIsDarkMode] = useState<boolean>(true);
  const [mapLayer, setMapLayer] = useState<MapLayerType>(() => {
    const saved = localStorage.getItem('eratutka_map_layer');
    if (saved) return saved as MapLayerType;
    return 'mml_maasto';
  });

  useEffect(() => {
    localStorage.setItem('eratutka_map_layer', mapLayer);
  }, [mapLayer]);

  // User Account & Cloud Sync State
  const [currentUser, setCurrentUser] = useState<FirebaseUser | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [showUserAuthModal, setShowUserAuthModal] = useState<boolean>(false);

  // Firebase Auth Listener & Automatic Cloud Sync
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      if (user) {
        // Fetch User Profile
        const profile = await fetchUserProfile(user.uid);
        if (profile) {
          setUserProfile(profile);
        } else {
          const defaultProfile: UserProfile = {
            uid: user.uid,
            email: user.email,
            displayName: user.displayName || (user.isAnonymous ? 'Vieras-metsästäjä' : 'Metsästäjä'),
            huntingClub: 'Ei määritelty',
            createdAt: Date.now(),
            isAnonymous: user.isAnonymous,
          };
          setUserProfile(defaultProfile);
        }

        // Restore User's Saved Dogs from Cloud Firestore
        const cloudDogs = await fetchUserDogsFromFirebase(user.uid);
        if (cloudDogs && cloudDogs.length > 0) {
          setDogs((prev) => {
            const merged = mergeDogLists(prev, cloudDogs);
            dogsRef.current = merged;
            return merged;
          });
        }

        // Restore User's Saved Map Annotations from Cloud Firestore
        const cloudAnnotations = await fetchUserAnnotationsFromFirebase(user.uid);
        if (cloudAnnotations && cloudAnnotations.length > 0) {
          setAnnotations((prev) => {
            const uniqueMap = new Map<string, MapAnnotation>();
            [...cloudAnnotations, ...prev].forEach((a) => uniqueMap.set(a.id, a));
            return Array.from(uniqueMap.values());
          });
        }
      } else {
        setUserProfile(null);
      }
    });

    return () => unsubscribe();
  }, []);

  // Session State
  const [currentSession, setCurrentSession] = useState<HuntSession | null>(() => {
    const saved = localStorage.getItem('eratutka_session');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        return null;
      }
    }
    return null;
  });

  const [showSessionAuthModal, setShowSessionAuthModal] = useState<boolean>(() => {
    const saved = localStorage.getItem('eratutka_session');
    return !saved;
  });
  const [showShareModal, setShowShareModal] = useState<boolean>(false);
  const [sessionAccessError, setSessionAccessError] = useState<boolean>(false);

  // Arm the capability key of the active session before any effect or callback runs.
  // Without it the relay and Firestore refuse to serve the session.
  setActiveHuntKey(currentSession?.huntKey);

  // A rejected relay write means the stored key is no longer valid (e.g. the hunt was
  // re-created). Tell the hunter instead of appearing to sync in silence.
  useEffect(() => {
    setSessionAccessDeniedHandler(() => {
      setSessionAccessError(true);
      setShowSessionAuthModal(true);
    });
    return () => setSessionAccessDeniedHandler(null);
  }, []);

  // Application Dog State & Telemetry (Managed via useDogTracker hook)
  const {
    dogs,
    setDogs,
    selectedDogId,
    setSelectedDogId,
    dogsRef,
    handleAddDog,
    handleDeleteDog,
    handleUpdateDogTelemetry,
    handleToggleDogAlert,
  } = useDogTracker({
    sessionCode: currentSession?.code,
    currentUser,
    userNickname: currentSession?.myNickname || userProfile?.displayName,
  });

  const [selectedHunterId, setSelectedHunterId] = useState<string | null>(null);

  const [team, setTeam] = useState<TeamMember[]>(() => {
    const savedSession = localStorage.getItem('eratutka_session');
    if (savedSession) {
      try {
        const sess = JSON.parse(savedSession);
        const code = sess?.code;
        if (code) {
          const sessionTeam = localStorage.getItem(`eratutka_team_${code}`);
          if (sessionTeam) {
            const parsed = JSON.parse(sessionTeam);
            if (Array.isArray(parsed)) {
              return parsed;
            }
          }
        }
        return [];
      } catch (e) {}
    }
    return [];
  });

  const [radioMessages, setRadioMessages] = useState<RadioMessage[]>(() => {
    const savedSession = localStorage.getItem('eratutka_session');
    if (savedSession) {
      try {
        const sess = JSON.parse(savedSession);
        const code = sess?.code;
        if (code) {
          const sessionRadio = localStorage.getItem(`eratutka_radio_${code}`);
          if (sessionRadio) return JSON.parse(sessionRadio);
        }
        return [];
      } catch (e) {}
    }
    return [];
  });

  // How many radio messages the hunter has already seen. The badge used to show the total
  // message count, which only ever grew and never cleared. Restored history counts as
  // read; only messages that arrive afterwards are unread.
  const [lastReadRadioCount, setLastReadRadioCount] = useState<number>(() => radioMessages.length);

  useEffect(() => {
    // Opening the chat/team tab counts as reading everything currently there.
    if (activeTab === 'team') setLastReadRadioCount(radioMessages.length);
  }, [activeTab, radioMessages.length]);

  const unreadRadioCount = Math.max(0, radioMessages.length - lastReadRadioCount);

  const [annotations, setAnnotations] = useState<MapAnnotation[]>(() => {
    const savedSession = localStorage.getItem('eratutka_session');
    if (savedSession) {
      try {
        const sess = JSON.parse(savedSession);
        const code = sess?.code;
        if (code) {
          const sessionAnno = localStorage.getItem(`eratutka_annotations_${code}`);
          if (sessionAnno) return JSON.parse(sessionAnno);
        }
        return [];
      } catch (e) {}
    }
    return [];
  });

  const [safetySectors, setSafetySectors] = useState<SafetySector[]>([]);

  // GPS User Location State (Managed via useUserLocation hook)
  const { userLocation, isGpsTracking, toggleGps } = useUserLocation({
    initialTracking: true,
  });

  // Map toggles & Ruler active target
  const [showSafetySectors, setShowSafetySectors] = useState<boolean>(true);
  const [showDogTracks, setShowDogTracks] = useState<boolean>(true);
  const [showHunterNames, setShowHunterNames] = useState<boolean>(true);
  const [activeRulerPoint, setActiveRulerPoint] = useState<{ lat: number; lng: number; title: string } | null>(null);
  const [mapFocusTarget, setMapFocusTarget] = useState<{ lat: number; lng: number } | null>(null);

  // Dogs hidden from this hunter's own map. Deliberately personal and per hunt: the choice
  // never syncs to the party (another hunter may be relying on seeing that collar), and a
  // new hunt starts with every dog visible again. Hiding only affects drawing - the collar
  // is still polled and its track still recorded, so nothing is lost.
  const hiddenDogsStorageKey = `eratutka_hidden_dogs_${currentSession?.code || 'DEFAULT'}`;
  const [hiddenDogIds, setHiddenDogIds] = useState<string[]>([]);
  // Which hunt's stored value has been loaded into the state above. The persist effect must
  // stay quiet until this matches the active hunt: otherwise it writes the initial empty
  // list over the stored one before the load takes effect, and the choice is lost on every
  // reload. (React's StrictMode double-invokes effects, which made that wipe reliable.)
  const [hiddenLoadedKey, setHiddenLoadedKey] = useState<string | null>(null);

  useEffect(() => {
    let parsed: string[] = [];
    try {
      const raw = localStorage.getItem(hiddenDogsStorageKey);
      const value = raw ? JSON.parse(raw) : [];
      parsed = Array.isArray(value) ? value.filter((id) => typeof id === 'string') : [];
    } catch (e) {
      parsed = [];
    }
    setHiddenDogIds(parsed);
    setHiddenLoadedKey(hiddenDogsStorageKey);
  }, [hiddenDogsStorageKey]);

  useEffect(() => {
    if (hiddenLoadedKey !== hiddenDogsStorageKey) return;
    try {
      localStorage.setItem(hiddenDogsStorageKey, JSON.stringify(hiddenDogIds));
    } catch (e) {}
  }, [hiddenDogIds, hiddenDogsStorageKey, hiddenLoadedKey]);

  const handleToggleDogVisibility = (dogId: string) => {
    setHiddenDogIds((prev) =>
      prev.includes(dogId) ? prev.filter((id) => id !== dogId) : [...prev, dogId]
    );
  };

  // Everything the hunter can actually see: used for the map, for the badge count, and for
  // picking a default dog to track.
  const visibleDogs = dogs.filter((d) => !hiddenDogIds.includes(d.id));

  // Collar library: the hunter's own dogs that are NOT in the current hunt. They are
  // deliberately not part of the session, so nothing about them is transmitted and nobody
  // else can see them - which is what keeps collars that stayed home from being broadcast.
  // Read lazily in the initialiser so the stored value is in place before any effect runs
  // and could overwrite it with the empty default.
  const [dogLibrary, setDogLibrary] = useState<Dog[]>(() => readDogLibrary());

  useEffect(() => {
    writeDogLibrary(dogLibrary);
  }, [dogLibrary]);

  // Ids of collars added from this device, so "take out of the hunt" is offered only for
  // dogs the hunter actually manages here.
  const myDogIdsStorageKey = 'eratutka_my_dogs';
  const [myDogIds, setMyDogIds] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(myDogIdsStorageKey);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed.filter((id) => typeof id === 'string') : [];
    } catch (e) {
      return [];
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(myDogIdsStorageKey, JSON.stringify(myDogIds));
    } catch (e) {}
  }, [myDogIds]);

  const rememberMyDog = (dogId: string) => {
    if (!dogId) return;
    setMyDogIds((prev) => (prev.includes(dogId) ? prev : [...prev, dogId]));
  };

  const isMyDog = (dog: Dog) => Boolean(dog && myDogIds.includes(dog.id));

  /** Adds a dog to the hunt and remembers that this device manages it. */
  const handleAddDogTracked = (dog: Dog) => {
    rememberMyDog(dog.id);
    handleAddDog(dog);
  };

  /** Moves a library collar into the current hunt, so the party can see it. */
  const handleShareLibraryDog = (dog: Dog) => {
    setDogLibrary((prev) => prev.filter((d) => d.id !== dog.id));
    handleAddDogTracked(dog);
  };

  /**
   * Takes a collar out of the hunt and keeps it in the library. Nothing about it is
   * transmitted afterwards, and its settings are preserved, so it can be shared again
   * without re-entering the collar id.
   */
  const handleUnshareDog = (dogId: string) => {
    const dog = dogsRef.current.find((d) => d.id === dogId);
    if (dog) {
      setDogLibrary((prev) => mergeIntoDogLibrary(prev, [dog]));
    }
    handleDeleteDog(dogId, { keepSaved: true });
  };

  // Modals State
  const [showSosModal, setShowSosModal] = useState<boolean>(false);
  const [showAddDogModal, setShowAddDogModal] = useState<boolean>(false);
  const [showAddAnnotationModal, setShowAddAnnotationModal] = useState<boolean>(false);
  const [showImportMapDataModal, setShowImportMapDataModal] = useState<boolean>(false);
  const [importToastMsg, setImportToastMsg] = useState<string | null>(null);
  const [isPickingAnnotationLocation, setIsPickingAnnotationLocation] = useState<boolean>(false);
  const [clickLatLng, setClickLatLng] = useState<{ lat: number; lng: number } | null>(null);

  // Refs to maintain current state inside event listeners & channels
  const teamRef = useRef(team);
  teamRef.current = team;
  const annotationsRef = useRef(annotations);
  annotationsRef.current = annotations;
  const radioMessagesRef = useRef(radioMessages);
  radioMessagesRef.current = radioMessages;

  // Auto-prompt session auth modal if URL contains ?huntCode=...
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const codeInUrl = params.get('huntCode');
    if (codeInUrl && currentSession?.code?.toUpperCase() !== codeInUrl.toUpperCase()) {
      setShowSessionAuthModal(true);
    }
  }, [currentSession?.code]);

  // Sync session state to LocalStorage
  useEffect(() => {
    if (currentSession) {
      localStorage.setItem('eratutka_session', JSON.stringify(currentSession));
    } else {
      localStorage.removeItem('eratutka_session');
    }
  }, [currentSession]);

  // Sync state to session-scoped LocalStorage
  useEffect(() => {
    const code = currentSession?.code || 'DEFAULT';
    localStorage.setItem(`eratutka_team_${code}`, JSON.stringify(team));
    localStorage.setItem('eratutka_team', JSON.stringify(team));
  }, [team, currentSession?.code]);

  useEffect(() => {
    const code = currentSession?.code || 'DEFAULT';
    localStorage.setItem(`eratutka_radio_${code}`, JSON.stringify(radioMessages));
    localStorage.setItem('eratutka_radio', JSON.stringify(radioMessages));
  }, [radioMessages, currentSession?.code]);

  useEffect(() => {
    const code = currentSession?.code || 'DEFAULT';
    localStorage.setItem(`eratutka_annotations_${code}`, JSON.stringify(annotations));
    localStorage.setItem('eratutka_annotations', JSON.stringify(annotations));
  }, [annotations, currentSession?.code]);

  // Real-Time Cross-Tab / Cross-Window Synchronization Listener
  useEffect(() => {
    if (!currentSession) return;
    const code = currentSession.code;

    let channel: BroadcastChannel | null = null;
    try {
      channel = new BroadcastChannel(`eratutka_channel_${code}`);
      channel.onmessage = (event) => {
        const data = event.data;
        if (!data || typeof data !== 'object') return;

        if (data.type === 'REQUEST_SYNC') {
          channel?.postMessage({
            type: 'SYNC_ALL',
            dogs: dogsRef.current,
            team: teamRef.current,
            annotations: annotationsRef.current,
            radioMessages: radioMessagesRef.current,
          });
        } else if (data.type === 'SYNC_ALL') {
          if (Array.isArray(data.dogs) && data.dogs.length > 0) {
            setDogs((prev) => {
              const merged = mergeDogLists(prev, data.dogs);
              dogsRef.current = merged;
              return merged;
            });
          }
          if (Array.isArray(data.team)) {
            teamRef.current = data.team;
            setTeam(data.team);
          }
          if (Array.isArray(data.annotations)) {
            annotationsRef.current = data.annotations;
            setAnnotations(data.annotations);
          }
          if (Array.isArray(data.radioMessages)) {
            radioMessagesRef.current = data.radioMessages;
            setRadioMessages(data.radioMessages);
          }
        } else if (data.type === 'DELETE_DOG') {
          const ids = Array.isArray(data.deletedIds) ? data.deletedIds : [data.dogId];
          markDogAsDeleted(...ids);
          setDogs((prev) => {
            const filtered = prev.filter((d) => !isDogDeleted(d) && d.id !== data.dogId);
            dogsRef.current = filtered;
            return filtered;
          });
        } else if (data.type === 'UPDATE_DOGS' && Array.isArray(data.dogs)) {
          setDogs((prev) => {
            const merged = mergeDogLists(prev, data.dogs);
            dogsRef.current = merged;
            return merged;
          });
        } else if (data.type === 'UPDATE_TEAM' && Array.isArray(data.team)) {
          teamRef.current = data.team;
          setTeam(data.team);
        } else if (data.type === 'UPDATE_ANNOTATIONS' && Array.isArray(data.annotations)) {
          annotationsRef.current = data.annotations;
          setAnnotations(data.annotations);
        } else if (data.type === 'UPDATE_RADIO' && Array.isArray(data.radioMessages)) {
          radioMessagesRef.current = data.radioMessages;
          setRadioMessages(data.radioMessages);
        }
      };

      // Request live sync from any other active client in this hunt
      channel.postMessage({ type: 'REQUEST_SYNC' });
    } catch (e) {
      // BroadcastChannel fallback
    }

    const handleStorageChange = (e: StorageEvent) => {
      if (!e.key || !e.newValue) return;
      try {
        if (e.key === `eratutka_dogs_${code}` || e.key === 'eratutka_dogs') {
          const parsed = JSON.parse(e.newValue);
          if (Array.isArray(parsed)) {
            setDogs((prev) => {
              const merged = mergeDogLists(prev, parsed);
              dogsRef.current = merged;
              return merged;
            });
          }
        } else if (e.key === `eratutka_team_${code}`) {
          const parsed = JSON.parse(e.newValue);
          teamRef.current = parsed;
          setTeam(parsed);
        } else if (e.key === `eratutka_annotations_${code}`) {
          const parsed = JSON.parse(e.newValue);
          annotationsRef.current = parsed;
          setAnnotations(parsed);
        } else if (e.key === `eratutka_radio_${code}`) {
          const parsed = JSON.parse(e.newValue);
          radioMessagesRef.current = parsed;
          setRadioMessages(parsed);
        }
      } catch (err) {
        // Storage parse error
      }
    };

    const handleDogDeletedEvent = () => {
      setDogs((prev) => {
        const filtered = prev.filter((d) => !isDogDeleted(d));
        dogsRef.current = filtered;
        return filtered;
      });
    };

    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('eratutka_dog_deleted', handleDogDeletedEvent);

    return () => {
      if (channel) channel.close();
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('eratutka_dog_deleted', handleDogDeletedEvent);
    };
  }, [currentSession?.code]);

  // Firestore Real-Time Session Synchronization Listener
  useEffect(() => {
    if (!currentSession?.code) return;

    const unsubscribe = subscribeToSessionFirebase(currentSession.code, (data) => {
      if (data.session) {
        setCurrentSession((prev) => {
          if (!prev) return data.session || null;
          return {
            ...data.session,
            // The shared session payload deliberately carries no secrets, so the key and
            // PIN must be carried over from our own copy or the hunt loses its access.
            password: prev.password,
            huntKey: prev.huntKey,
            myRole: prev.myRole,
            myNickname: prev.myNickname,
            isJahtimestari: prev.isJahtimestari,
          };
        });
      }
      if (data.members && Array.isArray(data.members)) {
        teamRef.current = data.members;
        setTeam(data.members);
      }
      if (data.dogs && Array.isArray(data.dogs)) {
        setDogs((prev) => {
          const merged = mergeDogLists(prev, data.dogs!);
          dogsRef.current = merged;
          return merged;
        });
      }
      if (data.annotations && Array.isArray(data.annotations)) {
        setAnnotations((prev) => {
          const map = new Map<string, MapAnnotation>();
          // 1. Add all annotations received from Firestore
          data.annotations!.forEach((a) => map.set(a.id, a));
          // 2. Preserve any local user imported / created annotations that might still be syncing
          prev.forEach((a) => {
            if (!map.has(a.id)) {
              map.set(a.id, a);
            }
          });
          const merged = Array.from(map.values());
          annotationsRef.current = merged;
          return merged;
        });
      }
      if (data.radioMessages && Array.isArray(data.radioMessages)) {
        radioMessagesRef.current = data.radioMessages;
        setRadioMessages(data.radioMessages);
      }
    });

    return () => {
      unsubscribe();
    };
  }, [currentSession?.code]);

  // Sync user location changes to team state and Firestore
  useEffect(() => {
    if (!userLocation || !currentSession?.code) return;
    const myName = currentSession.myNickname;
    if (!myName) return;

    const currentTeam = teamRef.current;
    let updated = false;
    const newTeam = currentTeam.map((m) => {
      if (m.name.toLowerCase() === myName.toLowerCase()) {
        if (m.lat !== userLocation.lat || m.lng !== userLocation.lng) {
          updated = true;
          return {
            ...m,
            lat: userLocation.lat,
            lng: userLocation.lng,
            lastUpdated: Date.now(),
          };
        }
      }
      return m;
    });

    if (updated) {
      teamRef.current = newTeam;
      setTeam(newTeam);
      saveSessionTeam(currentSession.code, newTeam);
    }
  }, [userLocation, currentSession]);

  // Handlers
  const handleMapClick = (lat: number, lng: number) => {
    setClickLatLng({ lat, lng });
    if (isPickingAnnotationLocation) {
      setIsPickingAnnotationLocation(false);
      setShowAddAnnotationModal(true);
    }
  };

  const handleExportGpx = () => {
    const xml = generateGpx(dogs, annotations);
    const blob = new Blob([xml], { type: 'application/gpx+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Eratutka_vienti_${new Date().toISOString().slice(0, 10)}.gpx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleImportMapData = (
    importedAnnotations: MapAnnotation[],
    importedDogs: Dog[],
    sourceLabel: string
  ) => {
    let updatedAnno = annotationsRef.current;
    if (importedAnnotations.length > 0) {
      updatedAnno = [...importedAnnotations, ...annotationsRef.current];
      annotationsRef.current = updatedAnno;
      setAnnotations(updatedAnno);

      if (currentUser) {
        importedAnnotations.forEach((ann) => {
          saveAnnotationToUserFirebase(currentUser.uid, ann);
        });
      }
    }

    let updatedDogs = dogsRef.current;
    if (importedDogs.length > 0) {
      importedDogs.forEach((dog) => rememberMyDog(dog.id));
      updatedDogs = [...dogsRef.current, ...importedDogs];
      dogsRef.current = updatedDogs;
      setDogs(updatedDogs);

      if (currentUser) {
        importedDogs.forEach((dog) => {
          saveDogToUserFirebase(currentUser.uid, dog);
        });
      }
    }

    if (currentSession?.code) {
      if (importedAnnotations.length > 0) {
        localStorage.setItem(`eratutka_annotations_${currentSession.code}`, JSON.stringify(updatedAnno));
        saveSessionAnnotations(currentSession.code, updatedAnno);
      }
      if (importedDogs.length > 0) {
        localStorage.setItem(`eratutka_dogs_${currentSession.code}`, JSON.stringify(updatedDogs));
        saveSessionDogs(currentSession.code, updatedDogs);
      }

      try {
        const ch = new BroadcastChannel(`eratutka_channel_${currentSession.code}`);
        if (importedAnnotations.length > 0) {
          ch.postMessage({ type: 'UPDATE_ANNOTATIONS', annotations: updatedAnno });
        }
        if (importedDogs.length > 0) {
          ch.postMessage({ type: 'UPDATE_DOGS', dogs: updatedDogs });
        }
        ch.close();
      } catch (e) {}
    }

    const totalCount = importedAnnotations.length + importedDogs.length;
    const label = sourceLabel ? ` (${sourceLabel})` : '';
    setImportToastMsg(`Tuotu onnistuneesti ${totalCount} kohdetta kartalle${label}!`);
    setTimeout(() => {
      setImportToastMsg(null);
    }, 4500);
  };

  const handleSendMessage = (text: string, category?: 'alert' | 'info' | 'action') => {
    const msg: RadioMessage = {
      id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      senderName: currentSession?.myNickname ? `${currentSession.myNickname}` : 'Minä (Passi)',
      text,
      timestamp: Date.now(),
      category: category || 'info',
    };

    const updatedMsgs = [msg, ...radioMessagesRef.current];
    radioMessagesRef.current = updatedMsgs;
    setRadioMessages(updatedMsgs);

    if (currentSession?.code) {
      localStorage.setItem(`eratutka_radio_${currentSession.code}`, JSON.stringify(updatedMsgs));
      saveSessionRadio(currentSession.code, updatedMsgs);
      try {
        const ch = new BroadcastChannel(`eratutka_channel_${currentSession.code}`);
        ch.postMessage({ type: 'UPDATE_RADIO', radioMessages: updatedMsgs });
        ch.close();
      } catch (e) {}
    }
  };

  const handleUpdateMemberStatus = (memberId: string, newStatus: HunterStatus) => {
    const updatedTeam = teamRef.current.map((m) => (m.id === memberId ? { ...m, status: newStatus } : m));
    teamRef.current = updatedTeam;
    setTeam(updatedTeam);

    if (currentSession?.code) {
      localStorage.setItem(`eratutka_team_${currentSession.code}`, JSON.stringify(updatedTeam));
      saveSessionTeam(currentSession.code, updatedTeam);
    }
  };

  const handleDeleteHunter = (hunterId: string) => {
    const updatedTeam = teamRef.current.filter((m) => m.id !== hunterId);
    teamRef.current = updatedTeam;
    setTeam(updatedTeam);
    if (selectedHunterId === hunterId) {
      setSelectedHunterId(null);
    }

    if (currentSession?.code) {
      localStorage.setItem(`eratutka_team_${currentSession.code}`, JSON.stringify(updatedTeam));
      saveSessionTeam(currentSession.code, updatedTeam);
      try {
        const ch = new BroadcastChannel(`eratutka_channel_${currentSession.code}`);
        ch.postMessage({ type: 'UPDATE_TEAM', team: updatedTeam });
        ch.close();
      } catch (e) {}
    }
  };

  const handleAddAnnotation = (ann: MapAnnotation) => {
    const updatedAnno = [ann, ...annotationsRef.current];
    annotationsRef.current = updatedAnno;
    setAnnotations(updatedAnno);

    if (currentUser) {
      saveAnnotationToUserFirebase(currentUser.uid, ann);
    }

    if (currentSession?.code) {
      localStorage.setItem(`eratutka_annotations_${currentSession.code}`, JSON.stringify(updatedAnno));
      saveSessionAnnotations(currentSession.code, updatedAnno);
      try {
        const ch = new BroadcastChannel(`eratutka_channel_${currentSession.code}`);
        ch.postMessage({ type: 'UPDATE_ANNOTATIONS', annotations: updatedAnno });
        ch.close();
      } catch (e) {}
    }
  };

  const handleDeleteAnnotation = (id: string) => {
    const updatedAnno = annotationsRef.current.filter((a) => a.id !== id);
    annotationsRef.current = updatedAnno;
    setAnnotations(updatedAnno);

    if (currentUser) {
      removeAnnotationFromUserFirebase(currentUser.uid, id);
    }

    if (currentSession?.code) {
      localStorage.setItem(`eratutka_annotations_${currentSession.code}`, JSON.stringify(updatedAnno));
      saveSessionAnnotations(currentSession.code, updatedAnno);
      try {
        const ch = new BroadcastChannel(`eratutka_channel_${currentSession.code}`);
        ch.postMessage({ type: 'UPDATE_ANNOTATIONS', annotations: updatedAnno });
        ch.close();
      } catch (e) {}
    }
  };

  const handleSessionCreatedOrJoined = async (session: HuntSession, initialDogs?: Dog[]) => {
    // The capability key must be armed before anything reads or writes the session.
    setActiveHuntKey(session.huntKey);
    setSessionAccessError(false);

    // 1. Fetch cloud session state if it exists in Firestore
    const cloudData = await fetchSessionFromFirebase(session.code, session.huntKey);

    let finalSession = { ...session };
    if (cloudData && cloudData.sessionInfo) {
      finalSession = {
        ...cloudData.sessionInfo,
        // The PIN is never returned by the server, and the key is ours to hold.
        password: session.password,
        huntKey: session.huntKey,
        myNickname: session.myNickname,
        myRole: session.myRole,
        isJahtimestari: session.isJahtimestari,
      };
    }

    setActiveHuntKey(finalSession.huntKey);
    setCurrentSession(finalSession);
    localStorage.setItem('eratutka_session', JSON.stringify(finalSession));
    setShowSessionAuthModal(false);

    // 2. Check dogs: Prioritize cloud data, then initialDogs passed from creator, then localStorage/current
    let sessionDogs: Dog[] = [];
    if (cloudData?.dogs && Array.isArray(cloudData.dogs) && cloudData.dogs.length > 0) {
      sessionDogs = cloudData.dogs;
    } else if (initialDogs !== undefined) {
      sessionDogs = initialDogs;
    } else {
      const savedDogsKey = `eratutka_dogs_${finalSession.code}`;
      const savedDogsStr = localStorage.getItem(savedDogsKey);
      if (savedDogsStr) {
        try {
          const parsed = JSON.parse(savedDogsStr);
          if (Array.isArray(parsed) && parsed.length > 0) {
            sessionDogs = parsed;
          }
        } catch (e) {}
      }
    }

    // The session list is relayed to the whole party, so a collar must never enter it just
    // because it happens to sit on this device. Collars the hunt does not already know
    // about are this device's own: they move to the collar library, where they are kept and
    // one click shares them. A collar the hunt does know about (this hunter shared it here
    // earlier) stays in the hunt and keeps its local track history and settings.
    //
    // This is also what makes "Puhdas jahtipohja" work: the creator passes no initial dogs,
    // so every collar on the device lands in the library instead of the old behaviour,
    // where mergeDogLists unioned the whole device list back in and the hunt was not clean.
    const huntIdentifiers = new Set(sessionDogs.flatMap((d) => getDogIdentifiers(d)));
    const belongsToHunt = (dog: Dog) =>
      getDogIdentifiers(dog).some((id) => huntIdentifiers.has(id));

    const carriedOver = dogsRef.current.filter((d) => !belongsToHunt(d));
    if (carriedOver.length > 0) {
      setDogLibrary((prev) => mergeIntoDogLibrary(prev, carriedOver));
    }

    // mergeDogLists also filters every deleted identifier (id, collarId, imei,
    // directGpsId, tractive), not just id.
    sessionDogs = mergeDogLists(dogsRef.current.filter(belongsToHunt), sessionDogs);

    setDogs(sessionDogs);
    dogsRef.current = sessionDogs;
    localStorage.setItem(`eratutka_dogs_${finalSession.code}`, JSON.stringify(sessionDogs));

    if (sessionDogs.length > 0) {
      setSelectedDogId(sessionDogs[0].id);
    } else {
      setSelectedDogId(null);
    }

    // 3. Check team: Preserve existing session team members and append new hunter
    let sessionTeam: TeamMember[] = (cloudData?.members && Array.isArray(cloudData.members) && cloudData.members.length > 0)
      ? [...cloudData.members]
      : [];
    
    if (sessionTeam.length === 0) {
      const savedTeamKey = `eratutka_team_${finalSession.code}`;
      const savedTeamStr = localStorage.getItem(savedTeamKey);
      if (savedTeamStr) {
        try {
          const parsed = JSON.parse(savedTeamStr);
          if (Array.isArray(parsed) && parsed.length > 0) {
            sessionTeam = parsed;
          }
        } catch (e) {}
      }
    }

    // A joining hunter must not collide with an existing nickname. The creator is skipped:
    // a freshly created hunt already contains their own entry, so deduplicating would
    // rename the hunt master to "Nimi (2)" against themselves.
    if (!session.isJahtimestari) {
      const uniqueNickname = makeUniqueNickname(
        finalSession.myNickname || 'Metsästäjä',
        sessionTeam.map((m) => m.name)
      );
      if (uniqueNickname !== finalSession.myNickname) {
        finalSession = { ...finalSession, myNickname: uniqueNickname };
        // The session state was already written earlier in this function; re-set it so the
        // stored name, the team entry and the radio log all agree.
        setCurrentSession(finalSession);
        localStorage.setItem('eratutka_session', JSON.stringify(finalSession));
      }
    }

    // Ensure current joining user is in session team without overwriting others
    const myName = finalSession.myNickname || 'Metsästäjä';
    const existingIndex = sessionTeam.findIndex((m) => m.name.toLowerCase() === myName.toLowerCase());
    const myMemberData: TeamMember = {
      id: existingIndex >= 0 ? sessionTeam[existingIndex].id : `hunter-me-${Date.now()}`,
      name: myName,
      role: finalSession.myRole === 'Jahtimestari' ? 'päällikkö' : (finalSession.myRole as any),
      status: existingIndex >= 0 ? sessionTeam[existingIndex].status : 'passissa',
      lat: userLocation ? userLocation.lat : INITIAL_CENTER.lat,
      lng: userLocation ? userLocation.lng : INITIAL_CENTER.lng,
      battery: 98,
      lastUpdated: Date.now(),
    };

    if (existingIndex >= 0) {
      sessionTeam[existingIndex] = { ...sessionTeam[existingIndex], ...myMemberData };
    } else {
      sessionTeam = [...sessionTeam, myMemberData];
    }
    setTeam(sessionTeam);
    teamRef.current = sessionTeam;
    localStorage.setItem(`eratutka_team_${finalSession.code}`, JSON.stringify(sessionTeam));

    // 4. Check annotations: combine cloud and existing local annotations
    const annoMap = new Map<string, MapAnnotation>();
    if (cloudData?.annotations && Array.isArray(cloudData.annotations)) {
      cloudData.annotations.forEach((a) => annoMap.set(a.id, a));
    }
    let sessionAnno: MapAnnotation[] = Array.from(annoMap.values());

    if (sessionAnno.length === 0) {
      const savedAnnoKey = `eratutka_annotations_${finalSession.code}`;
      const savedAnnoStr = localStorage.getItem(savedAnnoKey);
      if (savedAnnoStr) {
        try {
          const parsed = JSON.parse(savedAnnoStr);
          if (Array.isArray(parsed) && parsed.length > 0) {
            sessionAnno = parsed;
          }
        } catch (e) {}
      }
    }
    setAnnotations(sessionAnno);
    annotationsRef.current = sessionAnno;
    localStorage.setItem(`eratutka_annotations_${finalSession.code}`, JSON.stringify(sessionAnno));

    // 5. Check radio messages
    let sessionRadio: RadioMessage[] = (cloudData?.radioMessages && Array.isArray(cloudData.radioMessages) && cloudData.radioMessages.length > 0)
      ? cloudData.radioMessages
      : [];
    if (sessionRadio.length === 0) {
      const savedRadioKey = `eratutka_radio_${finalSession.code}`;
      const savedRadioStr = localStorage.getItem(savedRadioKey);
      if (savedRadioStr) {
        try {
          const parsed = JSON.parse(savedRadioStr);
          if (Array.isArray(parsed) && parsed.length > 0) {
            sessionRadio = parsed;
          }
        } catch (e) {}
      }
    }
    setRadioMessages(sessionRadio);
    radioMessagesRef.current = sessionRadio;
    localStorage.setItem(`eratutka_radio_${finalSession.code}`, JSON.stringify(sessionRadio));

    // Save full combined state to Firestore so all active participants see each other live
    await saveSessionToFirebase(finalSession, sessionDogs, sessionAnno, sessionTeam, sessionRadio);

    // Broadcast session data sync to all open local tabs / clients in this hunt session
    try {
      const ch = new BroadcastChannel(`eratutka_channel_${finalSession.code}`);
      ch.postMessage({
        type: 'SYNC_ALL',
        dogs: sessionDogs,
        team: sessionTeam,
        annotations: sessionAnno,
        radioMessages: sessionRadio,
      });
      ch.close();
    } catch (e) {}
  };

  const handleLeaveSession = () => {
    setCurrentSession(null);
    localStorage.removeItem('eratutka_session');
    setShowShareModal(false);
    setShowSessionAuthModal(true);
  };

  return (
    <div
      className={`h-screen h-[100dvh] max-h-[100dvh] w-full flex flex-col font-sans transition-colors duration-200 overflow-hidden ${
        isDarkMode ? 'bg-stone-950 text-stone-100' : 'bg-stone-100 text-stone-900'
      }`}
    >
      {/* Live Version Checker & Auto-Updater */}
      <VersionUpdateChecker />

      {/* Top Header */}
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        isDarkMode={isDarkMode}
        setIsDarkMode={setIsDarkMode}
        userLocation={userLocation}
        isGpsTracking={isGpsTracking}
        toggleGps={toggleGps}
        onOpenSos={() => setShowSosModal(true)}
        onExportGpx={handleExportGpx}
        onImportMapData={() => setShowImportMapDataModal(true)}
        onAddDog={() => setShowAddDogModal(true)}
        onAddAnnotation={() => setShowAddAnnotationModal(true)}
        activeDogCount={visibleDogs.filter((d) => d.isActive).length}
        teamCount={team.length}
        unreadRadioCount={unreadRadioCount}
        session={currentSession}
        onOpenSessionModal={() => setShowSessionAuthModal(true)}
        onOpenShareModal={() => setShowShareModal(true)}
        currentUser={currentUser}
        userProfile={userProfile}
        onOpenAuthModal={() => setShowUserAuthModal(true)}
      />

      {/* Main View Area */}
      <main className="flex-1 relative overflow-hidden pb-[54px] md:pb-0">
        {activeTab === 'map' && (
          <MapContainer
            mapLayer={mapLayer}
            setMapLayer={setMapLayer}
            dogs={dogs}
            hiddenDogIds={hiddenDogIds}
            selectedDogId={selectedDogId}
            setSelectedDogId={setSelectedDogId}
            team={team}
            selectedHunterId={selectedHunterId}
            setSelectedHunterId={setSelectedHunterId}
            annotations={annotations}
            safetySectors={safetySectors}
            userLocation={userLocation}
            isDarkMode={isDarkMode}
            onMapClick={handleMapClick}
            activeRulerPoint={activeRulerPoint}
            showSafetySectors={showSafetySectors}
            setShowSafetySectors={setShowSafetySectors}
            showDogTracks={showDogTracks}
            setShowDogTracks={setShowDogTracks}
            showHunterNames={showHunterNames}
            setShowHunterNames={setShowHunterNames}
            toggleGps={toggleGps}
            isGpsTracking={isGpsTracking}
            mapFocusTarget={mapFocusTarget}
            myNickname={currentSession?.myNickname}
          />
        )}

        {activeTab === 'radar' && (
          <DogRadarPanel
            dogs={dogs}
            hiddenDogIds={hiddenDogIds}
            onToggleDogVisibility={handleToggleDogVisibility}
            isMyDog={isMyDog}
            onUnshareDog={handleUnshareDog}
            libraryDogs={dogLibrary}
            onShareLibraryDog={handleShareLibraryDog}
            selectedDogId={selectedDogId}
            setSelectedDogId={setSelectedDogId}
            team={team}
            selectedHunterId={selectedHunterId}
            setSelectedHunterId={setSelectedHunterId}
            onFocusOnMap={(lat, lng) => {
              setMapFocusTarget({ lat, lng });
              setActiveTab('map');
            }}
            userLocation={userLocation}
            isDarkMode={isDarkMode}
            onAddDog={() => setShowAddDogModal(true)}
            onToggleDogAlert={handleToggleDogAlert}
            onUpdateDogTelemetry={handleUpdateDogTelemetry}
            onDeleteDog={handleDeleteDog}
            onDeleteHunter={handleDeleteHunter}
            isJahtimestari={currentSession?.isJahtimestari || false}
          />
        )}

        {activeTab === 'team' && (
          <TeamPanel
            team={team}
            radioMessages={radioMessages}
            onSendMessage={handleSendMessage}
            onUpdateMemberStatus={handleUpdateMemberStatus}
            userLocation={userLocation}
            isDarkMode={isDarkMode}
            onSelectHunterForTracking={(hunterId) => {
              setSelectedHunterId(hunterId);
              setActiveTab('radar');
            }}
            onRemoveMember={handleDeleteHunter}
            isJahtimestari={currentSession?.isJahtimestari || false}
          />
        )}

        {activeTab === 'annotations' && (
          <AnnotationsPanel
            annotations={annotations}
            onAddAnnotation={() => setShowAddAnnotationModal(true)}
            onDeleteAnnotation={handleDeleteAnnotation}
            onFocusOnMap={(lat, lng) => {
              setActiveRulerPoint({ lat, lng, title: 'Kohde' });
              setMapFocusTarget({ lat, lng });
              setActiveTab('map');
            }}
            isDarkMode={isDarkMode}
            onImportMapData={() => setShowImportMapDataModal(true)}
            onExportGpx={handleExportGpx}
          />
        )}

        {activeTab === 'ruler' && (
          <RulerPanel
            userLocation={userLocation}
            dogs={dogs}
            annotations={annotations}
            activeRulerPoint={activeRulerPoint}
            setActiveRulerPoint={setActiveRulerPoint}
            isDarkMode={isDarkMode}
          />
        )}
      </main>

      {/* Modals */}
      {showSessionAuthModal && (
        <HuntAuthModal
          onSessionCreatedOrJoined={handleSessionCreatedOrJoined}
          onClose={() => setShowSessionAuthModal(false)}
          isDarkMode={isDarkMode}
          canCloseWithoutSession={Boolean(currentSession)}
          currentDogs={dogs}
          currentAnnotations={annotations}
        />
      )}

      {showShareModal && currentSession && (
        <ShareSessionModal
          session={currentSession}
          team={team}
          onClose={() => setShowShareModal(false)}
          onLeaveSession={handleLeaveSession}
          isDarkMode={isDarkMode}
        />
      )}

      {showSosModal && (
        <SosModal
          userLocation={userLocation}
          onClose={() => setShowSosModal(false)}
          isDarkMode={isDarkMode}
        />
      )}

      {showAddDogModal && (
        <AddDogModal
          onAddDog={handleAddDogTracked}
          onClose={() => setShowAddDogModal(false)}
          isDarkMode={isDarkMode}
          userLat={userLocation ? userLocation.lat : INITIAL_CENTER.lat}
          userLng={userLocation ? userLocation.lng : INITIAL_CENTER.lng}
          currentUserName={userProfile?.displayName || currentSession?.myNickname || currentUser?.displayName || 'Minä'}
        />
      )}

      {showAddAnnotationModal && !isPickingAnnotationLocation && (
        <AddAnnotationModal
          onAddAnnotation={handleAddAnnotation}
          onClose={() => {
            setShowAddAnnotationModal(false);
            setIsPickingAnnotationLocation(false);
          }}
          isDarkMode={isDarkMode}
          defaultLat={clickLatLng ? clickLatLng.lat : userLocation ? userLocation.lat : INITIAL_CENTER.lat}
          defaultLng={clickLatLng ? clickLatLng.lng : userLocation ? userLocation.lng : INITIAL_CENTER.lng}
          userLat={userLocation?.lat}
          userLng={userLocation?.lng}
          onPickFromMap={() => {
            setShowAddAnnotationModal(false);
            setIsPickingAnnotationLocation(true);
          }}
        />
      )}

      {isPickingAnnotationLocation && (
        <div className="fixed top-16 sm:top-20 left-1/2 transform -translate-x-1/2 z-[2500] bg-stone-900/95 text-white border-2 border-amber-500 rounded-2xl px-4 py-3 shadow-2xl flex items-center space-x-3 backdrop-blur-md animate-bounce">
          <MapPin className="w-6 h-6 text-emerald-400 animate-pulse" />
          <div>
            <p className="text-xs font-black text-amber-400 uppercase tracking-wider">Osoita paikka kartalta</p>
            <p className="text-xs text-stone-200">Napsauta karttaa asettaaksesi merkinnän koordinaatit</p>
          </div>
          <button
            onClick={() => {
              setIsPickingAnnotationLocation(false);
              setShowAddAnnotationModal(true);
            }}
            className="px-3 py-1.5 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-300 text-xs font-bold border border-stone-700 ml-2 active:scale-95 cursor-pointer"
          >
            Peruuta
          </button>
        </div>
      )}

      {showImportMapDataModal && (
        <ImportMapDataModal
          onClose={() => setShowImportMapDataModal(false)}
          onImport={handleImportMapData}
          isDarkMode={isDarkMode}
          currentUserName={userProfile?.displayName || currentSession?.myNickname || currentUser?.displayName || ''}
        />
      )}

      {/* Toast Notification Banner */}
      {importToastMsg && (
        <div className="fixed bottom-16 md:bottom-6 left-1/2 transform -translate-x-1/2 z-[3000] px-4 py-3 bg-emerald-700/95 text-white font-bold text-xs rounded-2xl shadow-2xl border border-emerald-400/50 flex items-center space-x-2 backdrop-blur-md animate-fade-in pointer-events-none">
          <span>✓</span>
          <span>{importToastMsg}</span>
        </div>
      )}

      {/* The server no longer accepts this session's capability key */}
      {sessionAccessError && (
        <div className="fixed bottom-16 md:bottom-6 left-1/2 transform -translate-x-1/2 z-[3000] px-4 py-3 bg-red-900/95 text-white font-bold text-xs rounded-2xl shadow-2xl border border-red-500/60 flex items-center space-x-2 backdrop-blur-md animate-fade-in max-w-[92%]">
          <span>⚠</span>
          <span>
            Jahtiyhteys katkesi — liity jahtiin uudelleen jakolinkillä tai koodilla.
          </span>
        </div>
      )}

      <UserAuthModal
        isOpen={showUserAuthModal}
        onClose={() => setShowUserAuthModal(false)}
        currentUser={currentUser}
        userProfile={userProfile}
        savedDogsCount={dogs.length}
        savedMarkersCount={annotations.length}
      />

      {/* Mobile Bottom Navigation Bar (Always accessible on mobile) */}
      <MobileBottomNav
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        activeDogCount={visibleDogs.filter((d) => d.isActive).length}
        teamCount={team.length}
        unreadRadioCount={unreadRadioCount}
        isDarkMode={isDarkMode}
        onAddDog={() => setShowAddDogModal(true)}
        onAddAnnotation={() => setShowAddAnnotationModal(true)}
      />
    </div>
  );
}
