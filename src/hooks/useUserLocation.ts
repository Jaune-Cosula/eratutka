import { useState, useEffect, useRef } from 'react';
import { UserLocation } from '../types';

interface UseUserLocationOptions {
  initialTracking?: boolean;
}

/**
 * Custom hook for managing the device's GPS geolocation tracking.
 * Includes throttling for battery optimization and high-accuracy continuous tracking.
 */
export function useUserLocation(options?: UseUserLocationOptions) {
  // Deliberately null until the device reports a real fix. Seeding this with a hardcoded
  // coordinate (it used to be a Helsinki-area position) meant that when the hunter denied
  // the location permission, the app silently placed them hundreds of kilometres away and
  // every distance and bearing to the dogs was wrong without any indication.
  const [userLocation, setUserLocation] = useState<UserLocation | null>(null);

  const [isGpsTracking, setIsGpsTracking] = useState<boolean>(options?.initialTracking ?? true);
  const watchIdRef = useRef<number | null>(null);
  const lastUserLocationTimeRef = useRef<number>(0);

  useEffect(() => {
    if (isGpsTracking && 'geolocation' in navigator) {
      lastUserLocationTimeRef.current = 0;

      const handleLocationSuccess = (pos: GeolocationPosition) => {
        const now = Date.now();
        // Battery optimization: Throttle state updates to at most once per 4.5 seconds
        if (lastUserLocationTimeRef.current > 0 && now - lastUserLocationTimeRef.current < 4500) {
          return;
        }
        lastUserLocationTimeRef.current = now;

        const newLoc: UserLocation = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy || 10,
          heading: pos.coords.heading,
          speed: pos.coords.speed,
          altitude: pos.coords.altitude,
          timestamp: pos.timestamp || now,
        };

        setUserLocation(newLoc);
      };

      const handleLocationError = (err: GeolocationPositionError) => {
        console.warn('GPS position error:', err.message);
      };

      // 1. Immediate high-priority position fix right upon turning GPS ON
      navigator.geolocation.getCurrentPosition(handleLocationSuccess, handleLocationError, {
        enableHighAccuracy: true,
        timeout: 8000,
        maximumAge: 0, // Force fresh hardware GPS fix
      });

      // 2. Continuous watch for ongoing tracking
      watchIdRef.current = navigator.geolocation.watchPosition(
        handleLocationSuccess,
        handleLocationError,
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 4000,
        }
      );
    } else if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
      lastUserLocationTimeRef.current = 0;
    }

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
  }, [isGpsTracking]);

  const toggleGps = () => setIsGpsTracking((prev) => !prev);

  return {
    userLocation,
    setUserLocation,
    isGpsTracking,
    setIsGpsTracking,
    toggleGps,
  };
}
