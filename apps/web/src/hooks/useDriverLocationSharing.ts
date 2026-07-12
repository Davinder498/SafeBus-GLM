import { useCallback, useEffect, useRef, useState } from 'react';
import { isFatalLocationUpdateError, updateDriverTripLocation } from '@/services/driverLocationService';

export type LocationSharingState =
  | { kind: 'inactive' }
  | { kind: 'waiting' }
  | { kind: 'sharing'; lastUpdateAt: string; delivery: 'active' | 'delayed' }
  | { kind: 'offline'; lastUpdateAt: string | null }
  | { kind: 'denied'; message: string }
  | { kind: 'error'; message: string };

export interface UseDriverLocationSharingResult {
  state: LocationSharingState;
  supported: boolean;
  start: () => void;
  stop: () => void;
}

const MIN_UPDATE_INTERVAL_MS = 10_000;
const INITIAL_RETRY_MS = 5_000;
const MAX_RETRY_MS = 30_000;

interface GeolocationFix {
  latitude: number;
  longitude: number;
  accuracy: number | null;
  heading: number | null;
  speed: number | null;
}

export function useDriverLocationSharing(activeTripId: string | null): UseDriverLocationSharingResult {
  const supported = typeof navigator !== 'undefined' && 'geolocation' in navigator;
  const [state, setState] = useState<LocationSharingState>({ kind: 'inactive' });
  const watchIdRef = useRef<number | null>(null);
  const activeTripIdRef = useRef(activeTripId);
  const sharingRequestedRef = useRef(false);
  const latestFixRef = useRef<GeolocationFix | null>(null);
  const inFlightRef = useRef(false);
  const lastAttemptAtRef = useRef(0);
  const lastUpdateAtRef = useRef<string | null>(null);
  const retryAttemptRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);
  const flushRef = useRef<() => void>(() => undefined);
  activeTripIdRef.current = activeTripId;

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const clearWatcher = useCallback(() => {
    if (watchIdRef.current !== null && supported) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
  }, [supported]);

  const stop = useCallback(() => {
    sharingRequestedRef.current = false;
    latestFixRef.current = null;
    retryAttemptRef.current = 0;
    clearTimer();
    clearWatcher();
    if (mountedRef.current) setState({ kind: 'inactive' });
  }, [clearTimer, clearWatcher]);

  const scheduleFlush = useCallback((delayMs: number) => {
    clearTimer();
    timerRef.current = setTimeout(() => flushRef.current(), delayMs);
  }, [clearTimer]);

  const flush = useCallback(async () => {
    const tripId = activeTripIdRef.current;
    const fix = latestFixRef.current;
    if (!tripId || !fix || !sharingRequestedRef.current || inFlightRef.current) return;

    if (!navigator.onLine) {
      setState({ kind: 'offline', lastUpdateAt: lastUpdateAtRef.current });
      return;
    }

    const remaining = MIN_UPDATE_INTERVAL_MS - (Date.now() - lastAttemptAtRef.current);
    if (remaining > 0) {
      scheduleFlush(remaining);
      return;
    }

    latestFixRef.current = null;
    inFlightRef.current = true;
    lastAttemptAtRef.current = Date.now();

    try {
      const result = await updateDriverTripLocation({
        driverTripId: tripId,
        latitude: fix.latitude,
        longitude: fix.longitude,
        accuracyM: fix.accuracy,
        headingDeg: fix.heading,
        speedMps: fix.speed,
        source: 'browser',
      });
      retryAttemptRef.current = 0;
      lastUpdateAtRef.current = result.recorded_at;
      if (mountedRef.current && sharingRequestedRef.current) {
        setState({ kind: 'sharing', lastUpdateAt: result.recorded_at, delivery: 'active' });
      }
    } catch (error) {
      if (isFatalLocationUpdateError(error)) {
        sharingRequestedRef.current = false;
        clearWatcher();
        if (mountedRef.current) {
          setState({
            kind: 'error',
            message: error.message,
          });
        }
        return;
      }

      // Keep only the newest fix. If no newer fix arrived while this request
      // was in flight, retry the failed fix with bounded backoff.
      latestFixRef.current ??= fix;
      const delay = Math.min(INITIAL_RETRY_MS * 2 ** retryAttemptRef.current, MAX_RETRY_MS);
      retryAttemptRef.current += 1;
      if (mountedRef.current) {
        if (navigator.onLine && lastUpdateAtRef.current) {
          setState({
            kind: 'sharing',
            lastUpdateAt: lastUpdateAtRef.current,
            delivery: 'delayed',
          });
        } else {
          setState({ kind: 'offline', lastUpdateAt: lastUpdateAtRef.current });
        }
      }
      scheduleFlush(delay);
    } finally {
      inFlightRef.current = false;
      if (latestFixRef.current && retryAttemptRef.current === 0) {
        scheduleFlush(MIN_UPDATE_INTERVAL_MS);
      }
    }
  }, [clearWatcher, scheduleFlush]);
  flushRef.current = () => void flush();

  const start = useCallback(() => {
    if (!supported) {
      setState({ kind: 'error', message: 'Location sharing is not supported in this browser.' });
      return;
    }
    if (!activeTripIdRef.current) return;

    clearWatcher();
    clearTimer();
    sharingRequestedRef.current = true;
    retryAttemptRef.current = 0;
    lastAttemptAtRef.current = 0;
    setState({ kind: 'waiting' });

    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        latestFixRef.current = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy ?? null,
          heading: position.coords.heading ?? null,
          speed: position.coords.speed ?? null,
        };
        flushRef.current();
      },
      (error) => {
        clearWatcher();
        sharingRequestedRef.current = false;
        if (error.code === 1) {
          setState({
            kind: 'denied',
            message: 'Location permission was denied. Enable location access to share the bus location.',
          });
        } else if (error.code === 2) {
          setState({ kind: 'error', message: 'Location information is unavailable right now.' });
        } else if (error.code === 3) {
          setState({ kind: 'error', message: 'Location request timed out. Please try again.' });
        } else {
          setState({ kind: 'error', message: 'Location sharing could not be started.' });
        }
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 5_000 },
    );
  }, [clearTimer, clearWatcher, supported]);

  useEffect(() => {
    const handleOffline = () => {
      if (sharingRequestedRef.current) {
        clearTimer();
        setState({ kind: 'offline', lastUpdateAt: lastUpdateAtRef.current });
      }
    };
    const handleOnline = () => {
      if (sharingRequestedRef.current) {
        retryAttemptRef.current = 0;
        lastAttemptAtRef.current = 0;
        flushRef.current();
      }
    };
    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);
    return () => {
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
    };
  }, [clearTimer]);

  useEffect(() => {
    if (!activeTripId) stop();
  }, [activeTripId, stop]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      sharingRequestedRef.current = false;
      clearTimer();
      clearWatcher();
    };
  }, [clearTimer, clearWatcher]);

  return { state, supported, start, stop };
}
