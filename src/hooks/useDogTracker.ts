import { useState, useEffect, useRef } from 'react';
import { Dog, DogTrackPoint } from '../types';
import {
  calculateDistance,
  pruneExpiredTrackPoints,
  getDeletedDogIds,
  getDogIdentifiers,
  markDogAsDeleted,
  clearDogFromDeleted,
  isDogDeleted,
  addPendingDeletedIds,
  clearPendingDeletedIds,
} from '../utils/geoUtils';
import { playBarkSpikeAlert } from '../utils/audioAlerts';
import { saveSessionDogs, saveDogToUserFirebase, removeDogFromUserFirebase, relayAuthHeaders } from '../services/userService';
import { fetchDevicePosition, fetchDeviceHistory, extractTractiveToken } from '../services/collarService';
import { User as FirebaseUser } from 'firebase/auth';

interface UseDogTrackerOptions {
  sessionCode?: string;
  currentUser?: FirebaseUser | null;
  userNickname?: string;
}

/**
 * Minimum interval between background (poll-driven) LocalStorage writes of the dog
 * list. A list with 12 h of track points per dog reaches several megabytes, so
 * re-serializing it on every 5 s telemetry tick would block the main thread.
 */
const LOCAL_SAVE_THROTTLE_MS = 10000;

/**
 * Custom hook for managing dogs, collar telemetry, and gateway polling.
 * Handles continuous pull sync from JT808 / Micro GPS Gateway (http://35.206.111.214:8080/api/positions),
 * historical track points catch-up, bark alerts, and local & cloud synchronization.
 */
export function useDogTracker({
  sessionCode,
  currentUser,
  userNickname,
}: UseDogTrackerOptions) {
  // Application Dog State (scoped by active hunt session code)
  const [dogs, setDogs] = useState<Dog[]>(() => {
    const savedSession = localStorage.getItem('eratutka_session');
    if (savedSession) {
      try {
        const sess = JSON.parse(savedSession);
        const code = sess?.code;
        if (code) {
          const sessionDogs = localStorage.getItem(`eratutka_dogs_${code}`);
          if (sessionDogs) {
            const parsed = JSON.parse(sessionDogs);
            if (Array.isArray(parsed)) {
              return parsed.filter((d) => d && d.id && !isDogDeleted(d));
            }
          }
        }
      } catch (e) {}
    }
    // Fallback: check general local storage or default storage
    try {
      const defaultDogs = localStorage.getItem('eratutka_dogs_DEFAULT') || localStorage.getItem('eratutka_dogs');
      if (defaultDogs) {
        const parsed = JSON.parse(defaultDogs);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed.filter((d) => d && d.id && !isDogDeleted(d));
        }
      }
    } catch (e) {}
    return [];
  });

  const [selectedDogId, setSelectedDogId] = useState<string | null>(null);
  const dogsRef = useRef<Dog[]>(dogs);
  dogsRef.current = dogs;

  const lastLocalSaveRef = useRef<number>(0);
  const pendingLocalSaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * Persists the dog list under both the session-scoped and the generic key.
   * Never throws: a full storage quota must not break telemetry handling.
   */
  const persistDogsLocally = (list: Dog[], code: string) => {
    try {
      const serialized = JSON.stringify(list);
      localStorage.setItem(`eratutka_dogs_${code}`, serialized);
      localStorage.setItem('eratutka_dogs', serialized);
    } catch (e) {
      // Quota exceeded or storage unavailable: in-memory state stays authoritative
    }
    lastLocalSaveRef.current = Date.now();
  };

  // Pick a default dog once, when the list first becomes available.
  //
  // This deliberately does NOT re-select whenever the selection is empty. The old version
  // did, which made the "Lopeta seuranta" (stop tracking) button appear to do nothing: it
  // cleared the selection and this effect immediately put it back. An empty selection is a
  // legitimate state - it means "no dog is being actively tracked".
  const hasPickedInitialDogRef = useRef(false);
  useEffect(() => {
    if (dogs.length === 0) {
      setSelectedDogId(null);
      return;
    }

    if (hasPickedInitialDogRef.current) {
      // Keep whatever the user has selected; only drop it if that dog is really gone.
      if (selectedDogId && !dogs.some((d) => d.id === selectedDogId)) {
        setSelectedDogId(null);
      }
      return;
    }

    hasPickedInitialDogRef.current = true;
    if (!selectedDogId) {
      setSelectedDogId(dogs[0].id);
    }
  }, [dogs, selectedDogId]);

  // Sync state to session-scoped LocalStorage, throttled so that the 5 s telemetry
  // poll does not re-serialize megabytes of track history on every tick.
  useEffect(() => {
    const elapsed = Date.now() - lastLocalSaveRef.current;

    if (elapsed >= LOCAL_SAVE_THROTTLE_MS) {
      if (pendingLocalSaveRef.current) {
        clearTimeout(pendingLocalSaveRef.current);
        pendingLocalSaveRef.current = null;
      }
      persistDogsLocally(dogsRef.current, sessionCode || 'DEFAULT');
    } else if (!pendingLocalSaveRef.current) {
      // Read through the ref when the timer fires so the newest list is persisted
      pendingLocalSaveRef.current = setTimeout(() => {
        pendingLocalSaveRef.current = null;
        persistDogsLocally(dogsRef.current, sessionCode || 'DEFAULT');
      }, LOCAL_SAVE_THROTTLE_MS - elapsed);
    }
  }, [dogs, sessionCode]);

  useEffect(() => {
    return () => {
      if (pendingLocalSaveRef.current) {
        clearTimeout(pendingLocalSaveRef.current);
        pendingLocalSaveRef.current = null;
      }
    };
  }, []);

  // Listen for dog deletion events across tabs/components to purge immediately
  useEffect(() => {
    const handleDogDeletedEvent = () => {
      const surviving = dogsRef.current.filter((d) => !isDogDeleted(d));
      if (surviving.length !== dogsRef.current.length) {
        dogsRef.current = surviving;
        setDogs(surviving);
        if (selectedDogId && !surviving.some((d) => d.id === selectedDogId)) {
          setSelectedDogId(surviving.length > 0 ? surviving[0].id : null);
        }
      }
    };

    window.addEventListener('eratutka_dog_deleted', handleDogDeletedEvent);

    const code = sessionCode || 'DEFAULT';
    let ch: BroadcastChannel | null = null;
    try {
      ch = new BroadcastChannel(`eratutka_channel_${code}`);
      ch.onmessage = (ev) => {
        if (ev.data?.type === 'DELETE_DOG') {
          handleDogDeletedEvent();
        }
      };
    } catch (e) {}

    return () => {
      window.removeEventListener('eratutka_dog_deleted', handleDogDeletedEvent);
      if (ch) {
        try {
          ch.close();
        } catch (e) {}
      }
    };
  }, [sessionCode, selectedDogId]);

  // LIVE TRACCAR / DIRECT GPS / GPS-TRACE / FLESPI / ICAR GPS COLLAR AUTO-POLLING (Continuous Live Sync)
  useEffect(() => {
    let isMounted = true;
    const lastHistorySyncMap: Record<string, number> = {};

    const pollCycle = async () => {
      const allDogs = dogsRef.current.filter((d) => d && d.id && !isDogDeleted(d));
      if (!allDogs || allDogs.length === 0) return;

      // Find all dogs with auto-sync enabled (or not explicitly false)
      const dogsToPoll = allDogs.filter((d) => d.autoSyncEnabled !== false);
      if (dogsToPoll.length === 0) return;

      let hasUpdates = false;
      const currentList = [...allDogs];

      // Wake up device IDs on server if needed
      const deviceIdsToWake = dogsToPoll
        .map((d) => d.directGpsId || d.imei || d.collarId)
        .filter(Boolean) as string[];
      if (deviceIdsToWake.length > 0) {
        fetch('/api/gps/wake', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ deviceIds: deviceIdsToWake }),
        }).catch(() => {});
      }

      for (const dog of dogsToPoll) {
        try {
          // If dog was deleted by the user while background sync was running, skip it immediately!
          if (isDogDeleted(dog) || !dogsRef.current.some((d) => d.id === dog.id)) {
            continue;
          }

          const isTractiveDog =
            dog.telematicsProvider === 'tractive' ||
            Boolean(dog.tractiveShareUrl) ||
            Boolean(dog.trackerModel?.toLowerCase().includes('tractive')) ||
            String(dog.directGpsId || '').toLowerCase().includes('tractive') ||
            String(dog.collarId || '').toLowerCase().includes('tractive') ||
            extractTractiveToken(dog.tractiveShareUrl) !== null ||
            extractTractiveToken(dog.directGpsId) !== null ||
            extractTractiveToken(dog.collarId) !== null;

          const tractiveToken =
            extractTractiveToken(dog.tractiveShareUrl) ||
            extractTractiveToken(dog.directGpsId) ||
            extractTractiveToken(dog.collarId) ||
            (isTractiveDog ? (dog.tractiveTrackerId || '6f212df630') : null);

          const directId = (isTractiveDog && tractiveToken) ? tractiveToken : (dog.directGpsId || dog.imei || dog.collarId);
          const cleanId = String(directId || '').replace(/^ID[:\s]*/i, '').trim();
          if (!cleanId) {
            // No collar ID/IMEI configured for this dog; do not poll
            continue;
          }
          const gwUrl = isTractiveDog
            ? (dog.tractiveShareUrl || `https://my.tractive.com/p/${cleanId}`)
            : (dog.gatewayServerUrl || 'http://35.206.111.214:8080/api/positions');

          // 0. Catch-Up GPS History Sync (initial 12h catch-up, then lightweight incremental sync with since-parameter)
          const nowTs = Date.now();
          const lastHistSync = lastHistorySyncMap[dog.id] || 0;
          const currentDogHistory = dog.trackHistory || [];
          const isInitialOrShort = currentDogHistory.length <= 1;

          if (nowTs - lastHistSync > 30000 || isInitialOrShort) {
            lastHistorySyncMap[dog.id] = nowTs;
            try {
              let latestTs = 0;
              if (currentDogHistory.length > 0) {
                const recentSlice = currentDogHistory.slice(-10);
                for (const pt of recentSlice) {
                  if (pt.timestamp > latestTs) latestTs = pt.timestamp;
                }
              }

              // Full 12h catchup on startup/empty history or huge gap (>4h); otherwise lightweight incremental sync
              const isFullCatchUp = isInitialOrShort || latestTs === 0 || (nowTs - latestTs > 4 * 3600 * 1000);
              const histData = await fetchDeviceHistory(
                cleanId,
                gwUrl,
                isFullCatchUp ? { hours: 12, limit: 5000 } : { since: Math.max(0, latestTs - 5000), limit: 500 }
              );

              if (histData && histData.success && Array.isArray(histData.points) && histData.points.length > 0) {
                const dogIdx = currentList.findIndex((d) => d.id === dog.id);
                if (dogIdx !== -1) {
                  const existingHistory = currentList[dogIdx].trackHistory || [];
                  const existingMap = new Map<number, boolean>();
                  for (const pt of existingHistory) {
                    existingMap.set(pt.timestamp, true);
                  }

                  const newPointsToAdd: DogTrackPoint[] = [];
                  for (const hp of histData.points) {
                    if (!existingMap.has(hp.timestamp)) {
                      newPointsToAdd.push({
                        lat: hp.lat,
                        lng: hp.lng,
                        speed: hp.speed || 0,
                        barkRate: hp.barkRate || 0,
                        timestamp: hp.timestamp,
                      });
                      existingMap.set(hp.timestamp, true);
                    }
                  }

                  if (newPointsToAdd.length > 0) {
                    const combined = [...existingHistory, ...newPointsToAdd];
                    combined.sort((a, b) => a.timestamp - b.timestamp);
                    currentList[dogIdx] = {
                      ...currentList[dogIdx],
                      trackHistory: pruneExpiredTrackPoints(combined).slice(-5000),
                    };
                    hasUpdates = true;
                  }
                }
              }
            } catch {}
          }

          // Fetch latest telemetry using unified collar service
          const data = await fetchDevicePosition(cleanId, gwUrl);

          if (data && data.success && typeof data.lat === 'number' && typeof data.lng === 'number' && data.lat !== 0 && data.lng !== 0) {
            const dogIndex = currentList.findIndex((d) => d.id === dog.id);
            if (dogIndex !== -1) {
              const existingDog = currentList[dogIndex];
              const now = Date.now();
              const isNewLocation =
                Math.abs(existingDog.lat - data.lat) > 0.00002 ||
                Math.abs(existingDog.lng - data.lng) > 0.00002;

              const rawBarkRate = typeof data.barkRate === 'number' ? data.barkRate : (data.isBarking ? 15 : 0);
              let finalBarkRate = rawBarkRate;
              let barkHoldRemainingFixes = typeof data.barkHoldRemainingFixes === 'number'
                ? data.barkHoldRemainingFixes
                : (existingDog.barkHoldRemainingFixes ?? 0);
              let lastBarkTimestamp = data.lastBarkTimestamp || existingDog.lastBarkTimestamp;
              let recentBarkRate = data.recentBarkRate || existingDog.recentBarkRate || (rawBarkRate > 0 ? rawBarkRate : undefined);

              if (rawBarkRate > 0) {
                barkHoldRemainingFixes = 3; // Reset hold to 3 position fixes
                // The gateway timestamps the bark itself, which is more accurate than the
                // moment we happened to poll for it.
                lastBarkTimestamp = data.lastBarkTimestamp || data.timestamp || now;
                recentBarkRate = rawBarkRate;
                finalBarkRate = rawBarkRate;

                // Sound bark alert if new barking start
                if (existingDog.status !== 'haukkuu' && existingDog.barkAlertEnabled !== false) {
                  playBarkSpikeAlert();
                }
              } else if (barkHoldRemainingFixes > 0) {
                // Grace period / hold active during brief bark pause
                barkHoldRemainingFixes = barkHoldRemainingFixes - 1;
                finalBarkRate = recentBarkRate || existingDog.barkRate || 15;
              } else {
                barkHoldRemainingFixes = 0;
                finalBarkRate = 0;
              }

              const isBarkingActive = rawBarkRate > 0 || barkHoldRemainingFixes > 0;
              const rawStatus = data.status === 'liikkeessä' ? 'juoksee' : data.status;
              const reportedStatus = isBarkingActive
                ? 'haukkuu'
                : (rawStatus && rawStatus !== 'haukkuu'
                    ? rawStatus
                    : ((data.speed ?? existingDog.speed ?? 0) > 2 ? 'juoksee' : 'paikallaan'));

              const newPoint: DogTrackPoint = {
                lat: data.lat,
                lng: data.lng,
                timestamp: data.timestamp || now,
                speed: data.speed ?? existingDog.speed ?? 0,
                barkRate: finalBarkRate,
              };

              const newHistory = isNewLocation
                ? pruneExpiredTrackPoints([...(existingDog.trackHistory || []), newPoint]).slice(-5000)
                : (existingDog.trackHistory && existingDog.trackHistory.length > 0 ? pruneExpiredTrackPoints(existingDog.trackHistory) : [newPoint]);

              currentList[dogIndex] = {
                ...existingDog,
                lat: data.lat,
                lng: data.lng,
                speed: data.speed ?? existingDog.speed ?? 0,
                battery: data.battery ?? existingDog.battery ?? 95,
                heading: data.heading ?? existingDog.heading ?? 0,
                barkRate: finalBarkRate,
                barkHoldRemainingFixes: barkHoldRemainingFixes,
                lastBarkTimestamp: lastBarkTimestamp,
                recentBarkRate: recentBarkRate,
                status: reportedStatus,
                telematicsProvider: isTractiveDog ? 'tractive' : (existingDog.telematicsProvider || 'eratutka_direct'),
                directGpsId: cleanId || existingDog.directGpsId || data.deviceId || '',
                gatewayServerUrl: isTractiveDog ? (existingDog.tractiveShareUrl || gwUrl) : (existingDog.gatewayServerUrl || gwUrl),
                tractiveShareUrl: existingDog.tractiveShareUrl || (isTractiveDog ? (data.tractiveInfo?.shareUrl || `https://my.tractive.com/p/${cleanId}`) : undefined),
                tractivePetName: data.tractiveInfo?.petName || existingDog.tractivePetName,
                tractiveTrackerId: data.tractiveInfo?.trackerId || existingDog.tractiveTrackerId,
                tractiveOwnerName: data.tractiveInfo?.ownerName || existingDog.tractiveOwnerName,
                satellites: data.satellites ?? existingDog.satellites ?? (isTractiveDog ? 14 : 11),
                gsmSignalCsq: data.gsmSignalCsq ?? existingDog.gsmSignalCsq ?? 24,
                gsmSignalDb: data.gsmSignalDb ?? existingDog.gsmSignalDb ?? -65,
                voltage: data.voltage ?? existingDog.voltage ?? 4.12,
                networkStatus: data.networkStatus ?? existingDog.networkStatus ?? (isTractiveDog ? 'Tractive Cloud Online (eSIM)' : 'GPRS / TCP Yhdistetty'),
                fixMode: data.fixMode ?? existingDog.fixMode ?? '3D GPS Fix (Tarkka)',
                hdop: data.hdop ?? existingDog.hdop ?? 0.9,
                rawPayload: data.rawPayload || existingDog.rawPayload,
                protocolName: isTractiveDog ? 'Tractive GPS Live Share' : (data.protocolName || existingDog.protocolName || 'Micro GPS Gateway'),
                lastPacketLatencySec: data.lastPacketLatencySec ?? Math.max(0, Math.round((now - (data.timestamp || now)) / 1000)),
                lastUpdated: data.timestamp || now,
                autoSyncEnabled: true,
                trackHistory: newHistory,
              };
              hasUpdates = true;
            }
          }
        } catch (err) {
          // Silent polling retry on next interval
        }
      }

      if (hasUpdates && isMounted) {
        // Crucial: merge against LATEST dogsRef.current and filter using isDogDeleted to prevent resurrecting deleted dogs
        const updatedMap = new Map(currentList.map((d) => [d.id, d]));
        const latestSurvivingDogs = dogsRef.current.filter((d) => d && d.id && !isDogDeleted(d));
        const finalList = latestSurvivingDogs.map((d) => updatedMap.get(d.id) || d);

        dogsRef.current = finalList;
        setDogs([...finalList]);

        if (sessionCode) {
          // Local persistence happens in the throttled effect above
          saveSessionDogs(sessionCode, finalList);
        }
      }
    };

    // A cycle performs one history fetch and one position fetch per auto-synced dog, so a
    // slow gateway or a large pack can take longer than the 5 s tick. Overlapping cycles
    // would pile up requests and race each other writing `currentList`, so a tick is
    // skipped while the previous one is still running.
    let isPolling = false;

    const runPollCycle = async () => {
      if (isPolling) return;
      isPolling = true;
      try {
        await pollCycle();
      } finally {
        isPolling = false;
      }
    };

    // Run first poll cycle immediately without waiting
    runPollCycle();

    const pollInterval = setInterval(runPollCycle, 5000);

    return () => {
      isMounted = false;
      clearInterval(pollInterval);
    };
  }, [sessionCode]);

  const handleAddDog = (newDog: Dog) => {
    // If this dog ID was previously marked deleted, unmark it
    clearDogFromDeleted(newDog, newDog.id, newDog.collarId, newDog.directGpsId, newDog.imei, newDog.tractiveTrackerId);
    // ...and retract the deletion in the outgoing queue too. A delete that was never
    // acknowledged (offline, server restarting, a rejected request) stays queued and is
    // flushed on the next write - which happens moments after this add. Without retracting it
    // here, adding a collar back would queue its own deletion and the collar would vanish
    // again a couple of seconds later, every time.
    clearPendingDeletedIds(getDogIdentifiers(newDog));

    const dogToAdd: Dog = {
      ...newDog,
      addedBy: newDog.addedBy || userNickname || currentUser?.displayName || 'Minä',
    };
    const updatedList = [...dogsRef.current.filter((d) => d.id !== newDog.id), dogToAdd];
    dogsRef.current = updatedList;
    setDogs(updatedList);
    setSelectedDogId(dogToAdd.id);

    // Persist immediately locally (bypasses the background throttle)
    persistDogsLocally(updatedList, sessionCode || 'DEFAULT');

    if (currentUser) {
      saveDogToUserFirebase(currentUser.uid, dogToAdd);
    }

    if (sessionCode) {
      // Tell the session this collar is live again. The deletion registry is otherwise a
      // one-way ratchet: the server keeps re-broadcasting the old deletion and every
      // client re-applies it, so the dog would disappear again within a couple of seconds.
      saveSessionDogs(sessionCode, updatedList, true, getDogIdentifiers(dogToAdd));
      try {
        const ch = new BroadcastChannel(`eratutka_channel_${sessionCode}`);
        ch.postMessage({ type: 'UPDATE_DOGS', dogs: updatedList });
        ch.close();
      } catch (e) {}
    }
  };

  /**
   * Removes a dog from the hunt. By default it is also removed from the user's saved
   * collars - with `keepSaved` it only leaves the hunt ("Ota pois jaosta"), so the
   * collar stays available in the library instead of having to be re-entered.
   */
  const handleDeleteDog = (dogId: string, options: { keepSaved?: boolean } = {}) => {
    const dogToDelete =
      dogsRef.current.find((d) => d.id === dogId) || dogs.find((d) => d.id === dogId);

    // 1. Mark all associated IDs (id, collarId, directGpsId, imei, tractive) as permanently deleted
    const idsToMark = [
      dogId,
      dogToDelete?.collarId,
      dogToDelete?.directGpsId,
      dogToDelete?.imei,
      dogToDelete?.tractiveTrackerId,
      dogToDelete?.tractiveShareUrl,
    ].filter(Boolean) as string[];
    markDogAsDeleted(dogToDelete, dogId, ...idsToMark);
    // The deletion has to reach the server as an event. Remembering it here means it is
    // still sent after a reload or a spell offline, instead of being retried as part of the
    // ever-growing registry that other clients also upload.
    addPendingDeletedIds(idsToMark);

    // 2. Filter local state and active selection
    const updatedList = dogsRef.current.filter((d) => {
      if (d.id === dogId) return false;
      if (isDogDeleted(d)) return false;
      if (dogToDelete?.collarId && d.collarId === dogToDelete.collarId) return false;
      if (dogToDelete?.directGpsId && d.directGpsId === dogToDelete.directGpsId) return false;
      if (dogToDelete?.imei && d.imei === dogToDelete.imei) return false;
      return true;
    });
    dogsRef.current = updatedList;
    setDogs(updatedList);
    if (selectedDogId === dogId || (dogToDelete && selectedDogId === dogToDelete.id)) {
      setSelectedDogId(updatedList.length > 0 ? updatedList[0].id : null);
    }

    // 3. Persist immediately to all local storage keys
    try {
      const activeCode = sessionCode || 'DEFAULT';
      persistDogsLocally(updatedList, activeCode);
      localStorage.setItem('eratutka_dogs_DEFAULT', JSON.stringify(updatedList));

      // Clean session storage objects
      // Strip any legacy dog list from the session blob; dogs live in
      // `eratutka_dogs_${code}` (already updated above) and in the DEFAULT key.
      const sessStr = localStorage.getItem(`eratutka_session_${activeCode}`);
      if (sessStr) {
        const sessObj = JSON.parse(sessStr);
        if (sessObj.dogs) {
          delete sessObj.dogs;
          localStorage.setItem(`eratutka_session_${activeCode}`, JSON.stringify(sessObj));
        }
      }
      const mainSessStr = localStorage.getItem('eratutka_session');
      if (mainSessStr) {
        const mainSess = JSON.parse(mainSessStr);
        if (mainSess.dogs && Array.isArray(mainSess.dogs)) {
          mainSess.dogs = updatedList;
          localStorage.setItem('eratutka_session', JSON.stringify(mainSess));
        }
      }

      if (currentUser?.uid && !options.keepSaved) {
        const userSavedKey = `eratutka_saved_dogs_${currentUser.uid}`;
        const raw = localStorage.getItem(userSavedKey);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            const filtered = parsed.filter((d: Dog) => !isDogDeleted(d));
            localStorage.setItem(userSavedKey, JSON.stringify(filtered));
          }
        }
      }
    } catch (e) {}

    // 4. Remove from Firebase user account collection for all IDs. Skipped when the dog
    //    is only being taken out of this hunt: the saved collar is the library entry.
    if (currentUser?.uid && !options.keepSaved) {
      removeDogFromUserFirebase(currentUser.uid, dogToDelete || dogId, idsToMark);
    }

    // 5. Purge from server in-memory session and direct GPS store.
    // 'DEFAULT' is a purely local bucket: there is no server session behind it, and
    // pushing to it would create a real Firestore document named DEFAULT.
    const codeToBroadcast = sessionCode || 'DEFAULT';
    const hasRemoteSession = Boolean(sessionCode) && sessionCode !== 'DEFAULT';

    if (hasRemoteSession) {
      fetch(`/api/session/${codeToBroadcast}/dogs/delete`, {
        method: 'POST',
        headers: relayAuthHeaders(),
        body: JSON.stringify({ dogId, deletedIds: idsToMark }),
      })
        .then((resp) => {
          // The server holds the deletion now, so stop retrying it on every later push.
          if (resp.ok) clearPendingDeletedIds(idsToMark);
        })
        .catch(() => {});

      // 6. Force an immediate cloud write so the deletion propagates to the whole party
      saveSessionDogs(codeToBroadcast, updatedList, true);
    }

    try {
      const ch = new BroadcastChannel(`eratutka_channel_${codeToBroadcast}`);
      ch.postMessage({ type: 'DELETE_DOG', dogId, deletedIds: idsToMark, dogs: updatedList });
      ch.postMessage({ type: 'UPDATE_DOGS', dogs: updatedList });
      ch.close();
    } catch (e) {}
    if (sessionCode && sessionCode !== 'DEFAULT') {
      try {
        const defCh = new BroadcastChannel('eratutka_channel_DEFAULT');
        defCh.postMessage({ type: 'DELETE_DOG', dogId, deletedIds: idsToMark, dogs: updatedList });
        defCh.postMessage({ type: 'UPDATE_DOGS', dogs: updatedList });
        defCh.close();
      } catch (e) {}
    }
  };

  const handleUpdateDogTelemetry = (dogId: string, updates: Partial<Dog>) => {
    // If dog has been deleted, never recreate it or update its telemetry
    if (isDogDeleted(dogId)) {
      return;
    }

    const currentDogs = dogsRef.current;
    const now = Date.now();
    const existingIndex = currentDogs.findIndex((d) => d.id === dogId);

    let updatedList: Dog[];
    if (existingIndex === -1) {
      // If dog is deleted, do not recreate it
      if (isDogDeleted(dogId)) return;
      // Find from saved dogs or construct new dog record
      let savedDogs: Dog[] = [];
      try {
        const saved = localStorage.getItem('eratutka_dogs');
        if (saved) savedDogs = JSON.parse(saved);
      } catch (err) {
        console.warn('Failed to parse saved dogs from localStorage:', err);
      }
      const baseDog = savedDogs.find((d) => d.id === dogId) || {
        id: dogId,
        name: 'Koiratutka',
        breed: 'Panta',
        collarId: dogId,
        color: '#f59e0b',
        status: 'paikallaan' as const,
        lat: updates.lat || 64.0,
        lng: updates.lng || 27.0,
        battery: 95,
        signal: 90,
        speed: 0,
        barkRate: 0,
        heading: 0,
        trackHistory: [],
        isActive: true,
        barkAlertEnabled: true,
        standAlertEnabled: true,
      };

      const newDog: Dog = {
        ...baseDog,
        ...updates,
        isActive: true,
        lastUpdated: updates.lastUpdated || now,
      };

      if (updates.lat !== undefined && updates.lng !== undefined && updates.lat !== 0 && updates.lng !== 0) {
        newDog.trackHistory = [
          {
            lat: updates.lat,
            lng: updates.lng,
            speed: updates.speed ?? 0,
            barkRate: updates.barkRate ?? 0,
            timestamp: updates.lastUpdated || now,
          },
        ];
      }
      updatedList = [...currentDogs, newDog];
    } else {
      updatedList = currentDogs.map((dog) => {
        if (dog.id !== dogId) return dog;
        const updatedDog: Dog = {
          ...dog,
          ...updates,
          isActive: updates.isActive !== undefined ? updates.isActive : (dog.isActive !== false),
          lastUpdated: updates.lastUpdated || now,
        };

        if (updates.trackHistory) {
          updatedDog.trackHistory = pruneExpiredTrackPoints(updates.trackHistory).slice(-5000);
        } else if (
          updates.lat !== undefined &&
          updates.lng !== undefined &&
          updates.lat !== 0 &&
          updates.lng !== 0 &&
          !isNaN(updates.lat) &&
          !isNaN(updates.lng)
        ) {
          const newLat = updates.lat;
          const newLng = updates.lng;
          const history = dog.trackHistory || [];
          const lastPt = history[history.length - 1];

          let shouldAppend = true;
          if (lastPt) {
            const dM = calculateDistance(lastPt.lat, lastPt.lng, newLat, newLng);
            const timeDiff = Math.abs(now - lastPt.timestamp);
            // If stationary (< 2m, speed < 1 km/h and recent update < 10s), don't duplicate stationary point
            if (dM < 2.0 && (updates.speed ?? dog.speed ?? 0) < 1 && timeDiff < 10000) {
              shouldAppend = false;
            }
          }

          if (shouldAppend) {
            updatedDog.trackHistory = pruneExpiredTrackPoints([
              ...history,
              {
                lat: newLat,
                lng: newLng,
                timestamp: updates.lastUpdated || now,
                speed: updates.speed ?? dog.speed ?? 0,
                barkRate: updates.barkRate ?? dog.barkRate ?? 0,
              },
            ]).slice(-5000);
          }
        }
        return updatedDog;
      });
    }

    dogsRef.current = updatedList;
    setDogs(updatedList);

    if (sessionCode) {
      persistDogsLocally(updatedList, sessionCode);
      saveSessionDogs(sessionCode, updatedList);
      try {
        const ch = new BroadcastChannel(`eratutka_channel_${sessionCode}`);
        ch.postMessage({ type: 'UPDATE_DOGS', dogs: updatedList });
        ch.close();
      } catch (e) {}
    }
  };

  const handleToggleDogAlert = (dogId: string, alertType: 'bark' | 'stand') => {
    const currentDogs = dogsRef.current;
    const updatedList = currentDogs.map((d) => {
      if (d.id !== dogId) return d;
      if (alertType === 'bark') return { ...d, barkAlertEnabled: !d.barkAlertEnabled };
      return { ...d, standAlertEnabled: !d.standAlertEnabled };
    });

    dogsRef.current = updatedList;
    setDogs(updatedList);

    if (sessionCode) {
      persistDogsLocally(updatedList, sessionCode);
      saveSessionDogs(sessionCode, updatedList);
      try {
        const ch = new BroadcastChannel(`eratutka_channel_${sessionCode}`);
        ch.postMessage({ type: 'UPDATE_DOGS', dogs: updatedList });
        ch.close();
      } catch (e) {}
    }
  };

  return {
    dogs,
    setDogs,
    selectedDogId,
    setSelectedDogId,
    dogsRef,
    handleAddDog,
    handleDeleteDog,
    handleUpdateDogTelemetry,
    handleToggleDogAlert,
  };
}
