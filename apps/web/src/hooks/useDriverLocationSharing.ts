import { useCallback, useEffect, useRef, useState } from 'react';
import {
  isFatalLocationUpdateError,
  updateBusTrackingLocation,
} from '@/services/driverLocationService';

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

const MIN_UPDATE_INTERVAL_MS = 3_000;
const INITIAL_RETRY_MS = 3_000;
const MAX_RETRY_MS = 30_000;

interface GeolocationFix {
  latitude: number;
  longitude: number;
  accuracy: number | null;
  heading: number | null;
  speed: number | null;
}

export function useDriverLocationSharing(
  trackingToken: string | null,
  autoStart = false,
): UseDriverLocationSharingResult {
  const nativeTracking = typeof window !== 'undefined' ? window.SafeBusNativeTracking : undefined;
  const supported = Boolean(nativeTracking) ||
    (typeof navigator !== 'undefined' && 'geolocation' in navigator);
  const [state, setState] = useState<LocationSharingState>({ kind: 'inactive' });
  const watchIdRef = useRef<number | null>(null);
  const trackingTokenRef = useRef(trackingToken);
  const sharingRequestedRef = useRef(false);
  const latestFixRef = useRef<GeolocationFix | null>(null);
  const inFlightRef = useRef(false);
  const lastAttemptAtRef = useRef(0);
  const lastUpdateAtRef = useRef<string | null>(null);
  const retryAttemptRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);
  const flushRef = useRef<() => void>(() => undefined);
  trackingTokenRef.current = trackingToken;

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
    if (nativeTracking) void nativeTracking.pause();
    if (mountedRef.current) setState({ kind: 'inactive' });
  }, [clearTimer, clearWatcher, nativeTracking]);

  const scheduleFlush = useCallback(
    (delayMs: number) => {
      clearTimer();
      timerRef.current = setTimeout(() => flushRef.current(), delayMs);
    },
    [clearTimer],
  );

  const flush = useCallback(async () => {
    const token = trackingTokenRef.current;
    const fix = latestFixRef.current;
    if (!token || !fix || !sharingRequestedRef.current || inFlightRef.current) return;

    if (!navigator.onLine) {
      setState({ kind: 'offline', lastUpdateAt: lastUpdateAtRef.current });
      return;
    }

    const remaining = MIN_UPDATE_INTERVAL_MS - (Date.now() - lastAttemptAtRef.current);
    if (remaining > 0) {
      scheduleFlush(remaining);
      return;
    }

    inFlightRef.current = true;
    lastAttemptAtRef.current = Date.now();

    try {
      const result = await updateBusTrackingLocation({
        trackingToken: token,
        latitude: fix.latitude,
        longitude: fix.longitude,
        accuracyM: fix.accuracy,
        headingDeg: fix.heading,
        speedMps: fix.speed,
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
    if (!trackingTokenRef.current) return;

    if (nativeTracking) {
      sharingRequestedRef.current = true;
      setState({ kind: 'waiting' });
      void nativeTracking.resume().then((status) => {
        if (!mountedRef.current || !sharingRequestedRef.current) return;
        if (status.collecting && status.lastAcceptedAt) {
          lastUpdateAtRef.current = status.lastAcceptedAt;
          setState({
            kind: 'sharing',
            lastUpdateAt: status.lastAcceptedAt,
            delivery: status.queuedEvents === 0 ? 'active' : 'delayed',
          });
        } else if (status.collecting) {
          setState({ kind: 'waiting' });
        }
      }).catch((error: unknown) => {
        if (mountedRef.current) {
          setState({
            kind: 'error',
            message: error instanceof Error ? error.message : 'Native location sharing could not be started.',
          });
        }
      });
      return;
    }

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
            message:
              'Location permission was denied. Enable location access to share the bus location.',
          });
        } else if (error.code === 2) {
          setState({ kind: 'error', message: 'Location information is unavailable right now.' });
        } else if (error.code === 3) {
          setState({ kind: 'error', message: 'Location request timed out. Please try again.' });
        } else {
          setState({ kind: 'error', message: 'Location sharing could not be started.' });
        }
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 3_000 },
    );
  }, [clearTimer, clearWatcher, nativeTracking, supported]);

  useEffect(() => {
    if (!nativeTracking || !trackingToken) return undefined;
    const updateNativeState = async () => {
      try {
        const status = await nativeTracking.getStatus();
        if (!mountedRef.current) return;
        if (!status.configured || !status.collecting) {
          setState({ kind: 'inactive' });
        } else if (status.lastAcceptedAt) {
          lastUpdateAtRef.current = status.lastAcceptedAt;
          setState({
            kind: 'sharing',
            lastUpdateAt: status.lastAcceptedAt,
            delivery: status.queuedEvents === 0 ? 'active' : 'delayed',
          });
        } else if (status.queuedEvents > 0) {
          setState({ kind: 'offline', lastUpdateAt: null });
        } else {
          setState({ kind: 'waiting' });
        }
      } catch {
        // The foreground notification remains authoritative while the WebView is suspended.
      }
    };
    void updateNativeState();
    const timer = window.setInterval(() => void updateNativeState(), 10_000);
    return () => window.clearInterval(timer);
  }, [nativeTracking, trackingToken]);

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
    if (!trackingToken) stop();
  }, [trackingToken, stop]);

  useEffect(() => {
    if (trackingToken && autoStart && !sharingRequestedRef.current) start();
  }, [trackingToken, autoStart, start]);

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
