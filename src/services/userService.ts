import {
  doc,
  getDoc,
  setDoc,
  collection,
  getDocs,
  onSnapshot,
  deleteDoc,
  disableNetwork,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Dog, MapAnnotation, HuntSession, TeamMember, RadioMessage } from '../types';
import { getDeletedDogIds, markDogAsDeleted, isDogDeleted } from '../utils/geoUtils';

export interface UserProfile {
  uid: string;
  email: string | null;
  displayName: string;
  huntingClub?: string;
  role?: string;
  createdAt?: number;
  isAnonymous?: boolean;
}

// Global Quota & Offline Tracker
const QUOTA_COOLDOWN_MS = 60 * 60 * 1000; // 1 hour cooldown when free quota runs out

export const getIsFirestoreQuotaExceeded = (): boolean => {
  try {
    const stored = localStorage.getItem('eratutka_firestore_quota_exceeded');
    if (stored) {
      const ts = Number(stored);
      if (Date.now() - ts < QUOTA_COOLDOWN_MS) {
        return true;
      } else {
        localStorage.removeItem('eratutka_firestore_quota_exceeded');
      }
    }
  } catch {}
  return false;
};

// If previously marked as quota exceeded, disable Firestore network immediately
if (getIsFirestoreQuotaExceeded()) {
  try {
    disableNetwork(db).catch(() => {});
  } catch {}
}

const handleFirestoreError = (err: any, context: string) => {
  const errMsg = err?.message || String(err);
  if (
    errMsg.includes('resource-exhausted') ||
    errMsg.includes('Quota exceeded') ||
    errMsg.includes('quota limit exceeded') ||
    err?.code === 'resource-exhausted'
  ) {
    try {
      localStorage.setItem('eratutka_firestore_quota_exceeded', String(Date.now()));
      disableNetwork(db).catch(() => {});
    } catch {}
    console.warn(`[Firestore Quota Limit] Daily free write quota reached during ${context}. App is operating in Offline/In-Memory Relay mode.`);
    return;
  }
  console.warn(`[Firestore Error] during ${context}:`, errMsg);
};

// Generate unique local client ID for this browser tab / device
const localClientId = 'client_' + Math.random().toString(36).substring(2, 10) + '_' + Date.now();

/**
 * Capability key of the active hunt session. Every relay request must carry it, and it
 * is also the Firestore document ID of the session. It lives on the HuntSession object
 * (which is persisted to localStorage), and is mirrored here so the low-level helpers
 * can reach it without threading the session object through every call.
 */
let activeHuntKey: string | null = null;

export const setActiveHuntKey = (huntKey: string | null | undefined): void => {
  activeHuntKey = huntKey && String(huntKey).trim() ? String(huntKey).trim() : null;
};

export const getActiveHuntKey = (): string | null => activeHuntKey;

/** The 'DEFAULT' code is a purely local bucket and never has a session on the server. */
const isRemoteSession = (code: string): boolean => Boolean(code) && code !== 'DEFAULT';

/** Auth header for relay calls. Carries no key when no session is loaded yet. */
export const relayAuthHeaders = (): Record<string, string> => {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (activeHuntKey) headers['X-Hunt-Key'] = activeHuntKey;
  return headers;
};

/** The PIN is a group secret that gates code-based joining; it must never be transmitted. */
const stripSessionSecrets = (info: unknown): unknown => {
  if (!info || typeof info !== 'object') return info;
  const copy: Record<string, unknown> = { ...(info as Record<string, unknown>) };
  delete copy.password;
  delete copy.huntKey;
  return copy;
};

/**
 * Called when the server rejects a relay write with 403, i.e. the capability key is no
 * longer accepted. The UI uses this to tell the hunter to re-join instead of silently
 * appearing to sync.
 */
let sessionAccessDeniedHandler: (() => void) | null = null;

export const setSessionAccessDeniedHandler = (handler: (() => void) | null): void => {
  sessionAccessDeniedHandler = handler;
};

const notifySessionAccessDenied = () => {
  try {
    sessionAccessDeniedHandler?.();
  } catch {}
};

// Fast In-Memory Relay Helper (0 Firestore writes)
async function pushToLiveRelay(
  sessionCode: string,
  data: {
    sessionInfo?: HuntSession;
    dogs?: Dog[];
    annotations?: MapAnnotation[];
    members?: TeamMember[];
    radioMessages?: RadioMessage[];
    deletedDogIds?: string[];
  }
): Promise<void> {
  try {
    const code = sessionCode.toUpperCase().trim();
    if (!isRemoteSession(code) || !activeHuntKey) return;
    const deletedIds = data.deletedDogIds || Array.from(getDeletedDogIds());
    const resp = await fetch(`/api/session/${code}/relay`, {
      method: 'POST',
      headers: relayAuthHeaders(),
      body: JSON.stringify({
        ...data,
        sessionInfo: stripSessionSecrets(data.sessionInfo),
        deletedDogIds: deletedIds,
        clientId: localClientId,
      }),
    });
    if (resp.status === 403) notifySessionAccessDenied();
  } catch (e) {
    // Silent fail if offline / server reloading
  }
}

// User Profile management
export const fetchUserProfile = async (uid: string): Promise<UserProfile | null> => {
  if (getIsFirestoreQuotaExceeded()) {
    try {
      const local = localStorage.getItem(`eratutka_user_profile_${uid}`);
      if (local) return JSON.parse(local);
    } catch {}
    return null;
  }

  try {
    const userRef = doc(db, 'users', uid);
    const snap = await getDoc(userRef);
    if (snap.exists()) {
      const data = snap.data() as UserProfile;
      try {
        localStorage.setItem(`eratutka_user_profile_${uid}`, JSON.stringify(data));
      } catch {}
      return data;
    }
  } catch (err) {
    handleFirestoreError(err, 'fetchUserProfile');
    try {
      const local = localStorage.getItem(`eratutka_user_profile_${uid}`);
      if (local) return JSON.parse(local);
    } catch {}
  }
  return null;
};

export const saveUserProfile = async (profile: UserProfile): Promise<void> => {
  try {
    localStorage.setItem(`eratutka_user_profile_${profile.uid}`, JSON.stringify(profile));
  } catch {}

  if (getIsFirestoreQuotaExceeded()) return;

  try {
    const userRef = doc(db, 'users', profile.uid);
    await setDoc(
      userRef,
      {
        ...profile,
        updatedAt: Date.now(),
      },
      { merge: true }
    );
  } catch (err) {
    handleFirestoreError(err, 'saveUserProfile');
  }
};

// User Dogs Sync (Saved under users/{uid}/dogs/{dogId})
export const fetchUserDogsFromFirebase = async (uid: string): Promise<Dog[]> => {
  if (getIsFirestoreQuotaExceeded()) {
    try {
      const local = localStorage.getItem(`eratutka_saved_dogs_${uid}`);
      if (local) return JSON.parse(local);
    } catch {}
    return [];
  }

  try {
    const dogsCol = collection(db, 'users', uid, 'dogs');
    const snap = await getDocs(dogsCol);
    const dogs = snap.docs.map((docSnap) => docSnap.data() as Dog);
    if (dogs.length > 0) {
      try {
        localStorage.setItem(`eratutka_saved_dogs_${uid}`, JSON.stringify(dogs));
      } catch {}
    }
    return dogs;
  } catch (err) {
    handleFirestoreError(err, 'fetchUserDogsFromFirebase');
    try {
      const local = localStorage.getItem(`eratutka_saved_dogs_${uid}`);
      if (local) return JSON.parse(local);
    } catch {}
    return [];
  }
};

export const saveDogToUserFirebase = async (uid: string, dog: Dog): Promise<void> => {
  try {
    const existing = localStorage.getItem(`eratutka_saved_dogs_${uid}`);
    let list: Dog[] = existing ? JSON.parse(existing) : [];
    const idx = list.findIndex(d => d.id === dog.id);
    if (idx >= 0) list[idx] = dog;
    else list.push(dog);
    localStorage.setItem(`eratutka_saved_dogs_${uid}`, JSON.stringify(list));
  } catch {}

  if (getIsFirestoreQuotaExceeded()) return;

  try {
    const dogRef = doc(db, 'users', uid, 'dogs', dog.id);
    await setDoc(dogRef, dog, { merge: true });
  } catch (err) {
    handleFirestoreError(err, 'saveDogToUserFirebase');
  }
};

export const removeDogFromUserFirebase = async (
  uid: string,
  dogIdOrDog: string | Dog,
  extraIds?: string[]
): Promise<void> => {
  const ids: string[] = [];
  if (typeof dogIdOrDog === 'string') {
    ids.push(dogIdOrDog);
  } else if (dogIdOrDog) {
    if (dogIdOrDog.id) ids.push(dogIdOrDog.id);
    if (dogIdOrDog.collarId) ids.push(dogIdOrDog.collarId);
    if (dogIdOrDog.directGpsId) ids.push(dogIdOrDog.directGpsId);
    if (dogIdOrDog.imei) ids.push(dogIdOrDog.imei);
    if (dogIdOrDog.tractiveTrackerId) ids.push(dogIdOrDog.tractiveTrackerId);
    if (dogIdOrDog.name) ids.push(dogIdOrDog.name);
  }
  if (Array.isArray(extraIds)) {
    ids.push(...extraIds);
  }

  try {
    const existing = localStorage.getItem(`eratutka_saved_dogs_${uid}`);
    if (existing) {
      let list: Dog[] = JSON.parse(existing);
      list = list.filter((d) => !isDogDeleted(d) && !ids.includes(d.id) && !ids.includes(d.collarId) && !ids.includes(d.directGpsId || '') && !ids.includes(d.imei || ''));
      localStorage.setItem(`eratutka_saved_dogs_${uid}`, JSON.stringify(list));
    }
  } catch {}

  if (getIsFirestoreQuotaExceeded()) return;

  for (const id of ids) {
    if (!id) continue;
    try {
      const dogRef = doc(db, 'users', uid, 'dogs', id);
      await deleteDoc(dogRef);
    } catch (err) {
      handleFirestoreError(err, 'removeDogFromUserFirebase');
    }
  }
};

// User Map Annotations Sync
export const fetchUserAnnotationsFromFirebase = async (uid: string): Promise<MapAnnotation[]> => {
  if (getIsFirestoreQuotaExceeded()) {
    try {
      const local = localStorage.getItem(`eratutka_saved_annotations_${uid}`);
      if (local) return JSON.parse(local);
    } catch {}
    return [];
  }

  try {
    const annotCol = collection(db, 'users', uid, 'mapAnnotations');
    const snap = await getDocs(annotCol);
    const annos = snap.docs.map((docSnap) => docSnap.data() as MapAnnotation);
    if (annos.length > 0) {
      try {
        localStorage.setItem(`eratutka_saved_annotations_${uid}`, JSON.stringify(annos));
      } catch {}
    }
    return annos;
  } catch (err) {
    handleFirestoreError(err, 'fetchUserAnnotationsFromFirebase');
    try {
      const local = localStorage.getItem(`eratutka_saved_annotations_${uid}`);
      if (local) return JSON.parse(local);
    } catch {}
    return [];
  }
};

export const saveAnnotationToUserFirebase = async (
  uid: string,
  annotation: MapAnnotation
): Promise<void> => {
  try {
    const existing = localStorage.getItem(`eratutka_saved_annotations_${uid}`);
    let list: MapAnnotation[] = existing ? JSON.parse(existing) : [];
    const idx = list.findIndex(a => a.id === annotation.id);
    if (idx >= 0) list[idx] = annotation;
    else list.push(annotation);
    localStorage.setItem(`eratutka_saved_annotations_${uid}`, JSON.stringify(list));
  } catch {}

  if (getIsFirestoreQuotaExceeded()) return;

  try {
    const annotRef = doc(db, 'users', uid, 'mapAnnotations', annotation.id);
    await setDoc(annotRef, annotation, { merge: true });
  } catch (err) {
    handleFirestoreError(err, 'saveAnnotationToUserFirebase');
  }
};

export const removeAnnotationFromUserFirebase = async (
  uid: string,
  annotationId: string
): Promise<void> => {
  try {
    const existing = localStorage.getItem(`eratutka_saved_annotations_${uid}`);
    if (existing) {
      let list: MapAnnotation[] = JSON.parse(existing);
      list = list.filter(a => a.id !== annotationId);
      localStorage.setItem(`eratutka_saved_annotations_${uid}`, JSON.stringify(list));
    }
  } catch {}

  if (getIsFirestoreQuotaExceeded()) return;

  try {
    const annotRef = doc(db, 'users', uid, 'mapAnnotations', annotationId);
    await deleteDoc(annotRef);
  } catch (err) {
    handleFirestoreError(err, 'removeAnnotationFromUserFirebase');
  }
};

// Realtime Session Synchronization (sessions/{sessionCode})
// Uses both In-Memory Server Relay + Firestore Listener for 100% Zero-Quota-Exhaustion guarantee
export const subscribeToSessionFirebase = (
  sessionCode: string,
  onUpdate: (data: {
    session?: HuntSession;
    dogs?: Dog[];
    annotations?: MapAnnotation[];
    members?: TeamMember[];
    radioMessages?: RadioMessage[];
  }) => void
) => {
  const code = sessionCode.toUpperCase().trim();
  let isUnmounted = false;
  let lastRelayTimestamp = 0;

  // 1. High-speed In-Memory Relay Poller (2-3s interval, consumes 0 Firebase writes/reads)
  const pollRelay = async () => {
    if (isUnmounted) return;
    const key = activeHuntKey;
    if (!key || !isRemoteSession(code)) return;
    try {
      const resp = await fetch(
        `/api/session/${code}/relay?since=${lastRelayTimestamp}&clientId=${localClientId}`,
        { headers: { 'X-Hunt-Key': key } }
      );
      if (resp.ok) {
        const json = await resp.json();
        if (json.success && json.updated && json.data) {
          lastRelayTimestamp = json.timestamp || Date.now();
          if (Array.isArray(json.data.deletedDogIds)) {
            markDogAsDeleted(...json.data.deletedDogIds);
          }
          const rawDogs = Array.isArray(json.data.dogs) ? (json.data.dogs as Dog[]) : [];
          const safeDogs = rawDogs.filter((d) => !isDogDeleted(d));

          onUpdate({
            session: json.data.sessionInfo as HuntSession,
            dogs: safeDogs,
            annotations: json.data.annotations as MapAnnotation[],
            members: json.data.members as TeamMember[],
            radioMessages: json.data.radioMessages as RadioMessage[],
          });
        }
      }
    } catch {}
  };

  pollRelay();
  const relayInterval = setInterval(pollRelay, 2500);

  // 2. Firestore Document listener (when quota is active). The document ID is the
  //    capability key, so without a key there is nothing to listen to.
  let unsubscribeFirestore = () => {};
  if (activeHuntKey && isRemoteSession(code) && !getIsFirestoreQuotaExceeded()) {
    try {
      const sessionRef = doc(db, 'sessions', activeHuntKey);
      unsubscribeFirestore = onSnapshot(
        sessionRef,
        (snap) => {
          if (snap.exists()) {
            const data = snap.data();
            if (Array.isArray(data.deletedDogIds)) {
              markDogAsDeleted(...data.deletedDogIds);
            }
            const rawDogs = Array.isArray(data.dogs) ? (data.dogs as Dog[]) : [];
            const safeDogs = rawDogs.filter((d) => !isDogDeleted(d));

            onUpdate({
              session: data.sessionInfo as HuntSession,
              dogs: safeDogs,
              annotations: data.annotations as MapAnnotation[],
              members: data.members as TeamMember[],
              radioMessages: data.radioMessages as RadioMessage[],
            });
          }
        },
        (err) => {
          handleFirestoreError(err, 'subscribeToSessionFirebase');
        }
      );
    } catch (err) {
      handleFirestoreError(err, 'subscribeToSessionFirebase init');
    }
  }

  return () => {
    isUnmounted = true;
    clearInterval(relayInterval);
    unsubscribeFirestore();
  };
};

/**
 * Reads the locally cached session state and re-attaches the dog list. The dogs are
 * stored separately (`eratutka_dogs_${code}`) because duplicating their track history
 * into this blob costs megabytes per write.
 */
function readLocalSession(code: string) {
  try {
    const local = localStorage.getItem(`eratutka_session_${code}`);
    if (!local) return null;
    const parsed = JSON.parse(local);
    if (!Array.isArray(parsed.dogs) || parsed.dogs.length === 0) {
      const dogsStr = localStorage.getItem(`eratutka_dogs_${code}`);
      if (dogsStr) {
        const dogs = JSON.parse(dogsStr);
        if (Array.isArray(dogs) && dogs.length > 0) parsed.dogs = dogs;
      }
    }
    return parsed;
  } catch {
    return null;
  }
}

export const fetchSessionFromFirebase = async (
  sessionCode: string,
  huntKey?: string
): Promise<{
  sessionInfo?: HuntSession;
  dogs?: Dog[];
  annotations?: MapAnnotation[];
  members?: TeamMember[];
  radioMessages?: RadioMessage[];
} | null> => {
  const code = sessionCode.toUpperCase().trim();
  const key = String(huntKey || activeHuntKey || '').trim();

  // Without the capability key the server and Firestore both refuse to hand out the
  // session, so the locally cached copy is the only thing left to read.
  if (!key || !isRemoteSession(code)) {
    return readLocalSession(code);
  }

  // Try Memory Relay first
  try {
    const relayResp = await fetch(`/api/session/${code}/relay?clientId=${localClientId}`, {
      headers: { 'X-Hunt-Key': key },
    });
    if (relayResp.ok) {
      const relayJson = await relayResp.json();
      if (relayJson.success && relayJson.exists && relayJson.data) {
        return {
          sessionInfo: relayJson.data.sessionInfo as HuntSession,
          dogs: relayJson.data.dogs as Dog[],
          annotations: relayJson.data.annotations as MapAnnotation[],
          members: relayJson.data.members as TeamMember[],
          radioMessages: relayJson.data.radioMessages as RadioMessage[],
        };
      }
    }
  } catch {}

  if (getIsFirestoreQuotaExceeded()) {
    return readLocalSession(code);
  }

  try {
    const sessionRef = doc(db, 'sessions', key);
    const snap = await getDoc(sessionRef);
    if (snap.exists()) {
      const data = snap.data();
      if (Array.isArray(data.deletedDogIds)) {
        markDogAsDeleted(...data.deletedDogIds);
      }
      const rawDogs = Array.isArray(data.dogs) ? (data.dogs as Dog[]) : [];
      const safeDogs = rawDogs.filter((d) => !isDogDeleted(d));

      const result = {
        sessionInfo: data.sessionInfo as HuntSession,
        dogs: safeDogs,
        annotations: data.annotations as MapAnnotation[],
        members: data.members as TeamMember[],
        radioMessages: data.radioMessages as RadioMessage[],
      };
      // Cache without the dog list; it lives in `eratutka_dogs_${code}` and is
      // re-attached by readLocalSession on the next offline read.
      try {
        const { dogs: _omittedDogs, ...resultWithoutDogs } = result;
        localStorage.setItem(`eratutka_session_${code}`, JSON.stringify(resultWithoutDogs));
      } catch {}
      return result;
    }
  } catch (err) {
    handleFirestoreError(err, 'fetchSessionFromFirebase');
    return readLocalSession(code);
  }
  return null;
};

// Intelligent Throttling & In-Memory Relay Engine
const sessionWriteTimeouts: Record<string, any> = {};
const sessionPendingData: Record<string, any> = {};
const lastSessionWriteTime: Record<string, number> = {};
const WRITE_THROTTLE_MS = 30000; // Cloud write at most once every 30 seconds for active hunt telemetry
const BURST_WRITE_THROTTLE_MS = 3000; // Minimum 3s interval between forceImmediate writes to prevent quota exhaustion on rapid clicks

export const saveSessionPartial = async (
  sessionCode: string,
  partialData: {
    sessionInfo?: HuntSession;
    dogs?: Dog[];
    annotations?: MapAnnotation[];
    members?: TeamMember[];
    radioMessages?: RadioMessage[];
    deletedDogIds?: string[];
  },
  forceImmediate = false
): Promise<void> => {
  const code = sessionCode.toUpperCase().trim();
  const key = activeHuntKey;
  const deletedIds = partialData.deletedDogIds || Array.from(getDeletedDogIds());
  const safeDogs = partialData.dogs ? partialData.dogs.filter((d) => !isDogDeleted(d)) : undefined;
  // The PIN gates code-based joining and is verified server-side; it must never travel
  // to the relay, to Firestore or into another hunter's client. The key is only added
  // when a session object was actually supplied: a bare `undefined` field is rejected
  // by Firestore, which would silently break team/radio/annotation sync.
  const safeSessionInfo = partialData.sessionInfo
    ? (stripSessionSecrets(partialData.sessionInfo) as HuntSession)
    : undefined;
  const payloadToStore = {
    ...partialData,
    ...(safeSessionInfo ? { sessionInfo: safeSessionInfo } : {}),
    ...(safeDogs ? { dogs: safeDogs } : {}),
    deletedDogIds: deletedIds,
  };

  // 1. Always save to LocalStorage immediately (instant & offline).
  //    The dog list is deliberately not duplicated here: with 12 h of track history
  //    per dog it reaches several megabytes, and it is already persisted under
  //    `eratutka_dogs_${code}` by useDogTracker. It is re-attached on read.
  try {
    const existingStr = localStorage.getItem(`eratutka_session_${code}`);
    const existing = existingStr ? JSON.parse(existingStr) : {};
    const { dogs: _omittedDogs, ...payloadWithoutDogs } = payloadToStore;
    const merged = { ...existing, ...payloadWithoutDogs, updatedAt: Date.now() };
    delete merged.dogs;
    localStorage.setItem(`eratutka_session_${code}`, JSON.stringify(merged));
  } catch {}

  // 2. Always push to In-Memory Server Relay immediately (0 Firebase writes, instant sync across all hunters)
  pushToLiveRelay(code, payloadToStore);

  // 3. Skip the cloud write when there is no capability key (nothing to write to), when
  //    the Firestore quota is exceeded, or when this client is known to be outdated.
  if (
    !key ||
    !isRemoteSession(code) ||
    getIsFirestoreQuotaExceeded() ||
    (typeof window !== 'undefined' && (window as any).__ERATUTKA_OUTDATED_CLIENT__)
  ) {
    return;
  }

  // 4. Merge pending data for throttled Firebase batch write
  sessionPendingData[code] = {
    ...(sessionPendingData[code] || {}),
    ...payloadToStore,
  };

  const executeCloudWrite = async () => {
    const dataToWrite = sessionPendingData[code];
    if (!dataToWrite) return;
    delete sessionPendingData[code];
    lastSessionWriteTime[code] = Date.now();

    try {
      // Re-read the key here: this may run from a timer, after the session changed.
      const writeKey = activeHuntKey;
      if (!writeKey || !isRemoteSession(code)) return;
      const sessionRef = doc(db, 'sessions', writeKey);
      await setDoc(
        sessionRef,
        {
          ...dataToWrite,
          updatedAt: Date.now(),
        },
        { merge: true }
      );
    } catch (err) {
      handleFirestoreError(err, 'saveSessionPartial');
    }
  };

  const now = Date.now();
  const lastWrite = lastSessionWriteTime[code] || 0;
  const timeSinceLastWrite = now - lastWrite;

  if (forceImmediate) {
    if (timeSinceLastWrite >= BURST_WRITE_THROTTLE_MS) {
      if (sessionWriteTimeouts[code]) {
        clearTimeout(sessionWriteTimeouts[code]);
        delete sessionWriteTimeouts[code];
      }
      await executeCloudWrite();
    } else {
      // Rapid click burst protection: batch rapid user actions within 1-3 seconds into a single cloud write
      if (!sessionWriteTimeouts[code]) {
        const remainingDelay = Math.max(500, BURST_WRITE_THROTTLE_MS - timeSinceLastWrite);
        sessionWriteTimeouts[code] = setTimeout(() => {
          delete sessionWriteTimeouts[code];
          executeCloudWrite();
        }, remainingDelay);
      }
    }
  } else if (timeSinceLastWrite >= WRITE_THROTTLE_MS) {
    if (sessionWriteTimeouts[code]) {
      clearTimeout(sessionWriteTimeouts[code]);
      delete sessionWriteTimeouts[code];
    }
    await executeCloudWrite();
  } else {
    // Schedule throttled write for background telemetry
    if (!sessionWriteTimeouts[code]) {
      const remainingTime = Math.max(1000, WRITE_THROTTLE_MS - timeSinceLastWrite);
      sessionWriteTimeouts[code] = setTimeout(() => {
        delete sessionWriteTimeouts[code];
        executeCloudWrite();
      }, remainingTime);
    }
  }
};

export const saveSessionAnnotations = async (
  sessionCode: string,
  annotations: MapAnnotation[],
  forceImmediate = true
): Promise<void> => {
  return saveSessionPartial(sessionCode, { annotations }, forceImmediate);
};

export const saveSessionDogs = async (
  sessionCode: string,
  dogs: Dog[],
  forceImmediate = false
): Promise<void> => {
  const safeDogs = (dogs || []).filter((d) => !isDogDeleted(d));
  return saveSessionPartial(
    sessionCode,
    { dogs: safeDogs, deletedDogIds: Array.from(getDeletedDogIds()) },
    forceImmediate
  );
};

export const saveSessionTeam = async (
  sessionCode: string,
  members: TeamMember[],
  forceImmediate = false
): Promise<void> => {
  return saveSessionPartial(sessionCode, { members }, forceImmediate);
};

export const saveSessionRadio = async (
  sessionCode: string,
  radioMessages: RadioMessage[],
  forceImmediate = true
): Promise<void> => {
  return saveSessionPartial(sessionCode, { radioMessages }, forceImmediate);
};

export const saveSessionToFirebase = async (
  session: HuntSession,
  dogs: Dog[],
  annotations: MapAnnotation[],
  members: TeamMember[],
  radioMessages?: RadioMessage[]
): Promise<void> => {
  return saveSessionPartial(
    session.code,
    {
      sessionInfo: session,
      dogs: dogs || [],
      annotations: annotations || [],
      members: members || [],
      radioMessages: radioMessages || [],
    },
    true
  );
};

export interface CreateSessionResult {
  code?: string;
  huntKey?: string;
  error?: string;
}

export interface ResolveSessionResult {
  huntKey?: string;
  sessionInfo?: Partial<HuntSession>;
  error?: string;
}

/**
 * Asks the server to mint a new hunt session. The server owns both the code and the
 * capability key, so a guessed code can never be claimed by someone else.
 */
export const createSessionOnServer = async (
  name: string,
  pin: string
): Promise<CreateSessionResult> => {
  try {
    const resp = await fetch('/api/session/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, pin }),
    });
    const json: any = await resp.json().catch(() => null);
    if (resp.ok && json && json.success && json.code && json.huntKey) {
      return { code: String(json.code), huntKey: String(json.huntKey) };
    }
    return { error: (json && json.message) || 'Jahtipäivän luonti epäonnistui.' };
  } catch {
    return { error: 'Palvelimeen ei saatu yhteyttä. Tarkista verkkoyhteys.' };
  }
};

/**
 * Exchanges a hunt code + PIN for the session's capability key. Only succeeds while the
 * server still remembers the session; after a restart the share link is the way in.
 */
export const resolveSessionKey = async (
  code: string,
  pin: string
): Promise<ResolveSessionResult> => {
  try {
    const resp = await fetch('/api/session/resolve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, pin }),
    });
    const json: any = await resp.json().catch(() => null);
    if (resp.ok && json && json.success && json.huntKey) {
      return {
        huntKey: String(json.huntKey),
        sessionInfo: json.sessionInfo as Partial<HuntSession>,
      };
    }
    return { error: (json && json.message) || 'Väärä jahtikoodi tai PIN-koodi.' };
  } catch {
    return { error: 'Palvelimeen ei saatu yhteyttä. Tarkista verkkoyhteys.' };
  }
};
