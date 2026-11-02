import { nativeTrackingPresentation } from '@/utils/nativeTrackingPresentation';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  isFatalLocationUpdateError,
  updateBusTrackingLocation,
} from '@/services/driverLocationService';

export type LocationSharingState =
  | { kind: 'inactive' }
  | { kind: 'waiting' }
  | { kind: 'recovering'; offline: boolean; lastUpdateAt: string | null }
  | { kind: 'sharing'; lastUpdateAt: string; delivery: 'active' | 'delayed' }
  | { kind: 'offline'; lastUpdateAt: string | null }
  | { kind: 'denied'; message: string }
  | { kind: 'error'; message: string; pendingDelivery?: boolean };

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
  const supported =
    Boolean(nativeTracking) || (typeof navigator !== 'undefined' && 'geolocation' in navigator);
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
  const nativeRefreshRef = useRef<() => void>(() => undefined);
  const nativeSequenceRef = useRef(0);
  const nativeActionRef = useRef(false);
  const nativeObservationRef = useRef(trackingToken);
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
    if (nativeTracking) {
      nativeActionRef.current = true;
      const token = trackingTokenRef.current;
      const request = ++nativeSequenceRef.current;
      void nativeTracking
        .pause()
        .then((status) => {
          if (
            mountedRef.current &&
            token === trackingTokenRef.current &&
            request === nativeSequenceRef.current
          )
            setState(nativeTrackingPresentation(status, navigator.onLine));
        })
        .catch(() => {
          if (
            mountedRef.current &&
            token === trackingTokenRef.current &&
            request === nativeSequenceRef.current
          )
            setState({
              kind: 'error',
              message: 'Could not verify native tracking status. Reopen SafeBus.',
            });
        })
        .finally(() => {
          if (request === nativeSequenceRef.current) nativeActionRef.current = false;
        });
      if (mountedRef.current) setState({ kind: 'waiting' });
      return;
    }
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
      nativeActionRef.current = true;
      sharingRequestedRef.current = true;
      setState({ kind: 'waiting' });
      const token = trackingTokenRef.current;
      const request = ++nativeSequenceRef.current;
      void nativeTracking
        .resume()
        .then((status) => {
          if (
            !mountedRef.current ||
            token !== trackingTokenRef.current ||
            request !== nativeSequenceRef.current
          )
            return;
          setState(nativeTrackingPresentation(status, navigator.onLine));
        })
        .catch(() => {
          if (
            mountedRef.current &&
            token === trackingTokenRef.current &&
            request === nativeSequenceRef.current
          )
            setState({
              kind: 'error',
              message: 'Could not verify native tracking status. Reopen SafeBus.',
            });
        })
        .finally(() => {
          if (request === nativeSequenceRef.current) nativeActionRef.current = false;
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
    if (!nativeTracking) return undefined;
    nativeObservationRef.current = trackingToken;
    nativeActionRef.current = false;
    lastUpdateAtRef.current = null;
    setState(trackingToken ? { kind: 'waiting' } : { kind: 'inactive' });
    if (!trackingToken) return undefined;
    let active = true;
    let inFlight = false;
    let watchdog: number | undefined;
    const updateNativeState = async () => {
      if (inFlight || nativeActionRef.current) return;
      inFlight = true;
      const request = ++nativeSequenceRef.current;
      watchdog = window.setTimeout(() => {
        if (
          active &&
          mountedRef.current &&
          trackingTokenRef.current === trackingToken &&
          request === nativeSequenceRef.current
        )
          setState({
            kind: 'error',
            message: 'Could not verify native tracking status. Reopen SafeBus.',
          });
      }, 15_000);
      try {
        const status = await nativeTracking.getStatus();
        if (
          !active ||
          !mountedRef.current ||
          trackingTokenRef.current !== trackingToken ||
          request !== nativeSequenceRef.current
        )
          return;
        const next = nativeTrackingPresentation(status, navigator.onLine);
        lastUpdateAtRef.current = 'lastUpdateAt' in next ? next.lastUpdateAt : null;
        setState(next);
      } catch {
        if (
          active &&
          mountedRef.current &&
          trackingTokenRef.current === trackingToken &&
          request === nativeSequenceRef.current
        )
          setState({
            kind: 'error',
            message: 'Could not verify native tracking status. Reopen SafeBus.',
          });
      } finally {
        window.clearTimeout(watchdog);
        inFlight = false;
      }
    };
    nativeRefreshRef.current = () => void updateNativeState();
    void updateNativeState();
    const timer = window.setInterval(() => void updateNativeState(), 10_000);
    return () => {
      active = false;
      nativeSequenceRef.current += 1;
      nativeRefreshRef.current = () => undefined;
      window.clearInterval(timer);
      window.clearTimeout(watchdog);
    };
  }, [nativeTracking, trackingToken]);

  useEffect(() => {
    if (!nativeTracking || state.kind !== 'sharing' || state.delivery !== 'active') return;
    const lastUpdateAt = state.lastUpdateAt;
    const timer = window.setTimeout(
      () =>
        setState((current) =>
          current.kind === 'sharing' && current.lastUpdateAt === lastUpdateAt
            ? { ...current, delivery: 'delayed' }
            : current,
        ),
      Math.max(0, Date.parse(lastUpdateAt) + 120_001 - Date.now()),
    );
    return () => window.clearTimeout(timer);
  }, [nativeTracking, state]);

  useEffect(() => {
    const handleOffline = () => {
      if (nativeTracking && trackingTokenRef.current) {
        setState((current) =>
          current.kind === 'recovering'
            ? { ...current, offline: true }
            : current.kind === 'error' || current.kind === 'inactive'
              ? current
              : {
                  kind: 'offline',
                  lastUpdateAt: 'lastUpdateAt' in current ? current.lastUpdateAt : null,
                },
        );
        nativeRefreshRef.current();
        return;
      }
      if (sharingRequestedRef.current) {
        clearTimer();
        setState({ kind: 'offline', lastUpdateAt: lastUpdateAtRef.current });
      }
    };
    const handleOnline = () => {
      if (nativeTracking) {
        nativeRefreshRef.current();
        return;
      }
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
  }, [clearTimer, nativeTracking]);

  useEffect(() => {
    if (!trackingToken && !nativeTracking) stop();
  }, [trackingToken, stop, nativeTracking]);

  useEffect(() => {
    if (!nativeTracking && trackingToken && autoStart && !sharingRequestedRef.current) start();
  }, [trackingToken, autoStart, start, nativeTracking]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      sharingRequestedRef.current = false;
      clearTimer();
      clearWatcher();
    };
  }, [clearTimer, clearWatcher]);

  const visibleState: LocationSharingState =
    nativeTracking && nativeObservationRef.current !== trackingToken
      ? trackingToken
        ? { kind: 'waiting' }
        : { kind: 'inactive' }
      : state;
  return { state: visibleState, supported, start, stop };
}
