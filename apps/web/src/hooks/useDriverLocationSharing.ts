import { useCallback, useEffect, useRef, useState } from 'react';
import { updateDriverTripLocation } from '@/services/driverLocationService';

/**
 * Driver location sharing hook for Milestone 4B.
 *
 * Wraps navigator.geolocation.watchPosition, throttles updates, calls the
 * secure update_driver_trip_location RPC on each accepted fix, and cleans up
 * the watcher on stop/unmount or when the active trip becomes null.
 *
 * The hook is intentionally inert while `activeTripId` is null: location
 * sharing is only available during an active trip.
 */

export type LocationSharingState =
  | { kind: 'inactive' }
  | { kind: 'sharing'; lastUpdateAt: string | null }
  | { kind: 'error'; message: string };

export interface UseDriverLocationSharingResult {
  state: LocationSharingState;
  /** Whether browser geolocation is supported in this environment. */
  supported: boolean;
  /** Start watching position and sending updates for the active trip. */
  start: () => void;
  /** Stop watching position and reset to inactive. */
  stop: () => void;
}

/** Minimum interval between RPC calls, to avoid flooding the backend. */
const MIN_UPDATE_INTERVAL_MS = 3000;

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
  const lastSentAtRef = useRef<number>(0);
  // Keep the latest activeTripId in a ref so the watcher callback (created once)
  // always reads the current value without needing to be re-created.
  const activeTripIdRef = useRef<string | null>(activeTripId);
  activeTripIdRef.current = activeTripId;

  const clearWatcher = useCallback(() => {
    if (watchIdRef.current !== null && supported) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
  }, [supported]);

  const stop = useCallback(() => {
    clearWatcher();
    setState({ kind: 'inactive' });
  }, [clearWatcher]);

  const sendUpdate = useCallback(async (fix: GeolocationFix) => {
    const tripId = activeTripIdRef.current;
    if (!tripId) return;

    const now = Date.now();
    if (now - lastSentAtRef.current < MIN_UPDATE_INTERVAL_MS) return;
    lastSentAtRef.current = now;

    try {
      await updateDriverTripLocation({
        driverTripId: tripId,
        latitude: fix.latitude,
        longitude: fix.longitude,
        accuracyM: fix.accuracy,
        headingDeg: fix.heading,
        speedMps: fix.speed,
        source: 'browser',
      });
      setState({ kind: 'sharing', lastUpdateAt: new Date().toISOString() });
    } catch (err) {
      // Surface a friendly error but keep the watcher running so a transient
      // RPC failure doesn't kill location sharing. A fatal trip-end error will
      // be surfaced and the caller (dashboard) will flip activeTripId to null,
      // which the effect below handles by stopping.
      const message = err instanceof Error ? err.message : 'Location update failed.';
      setState({ kind: 'error', message });
    }
  }, []);

  const start = useCallback(() => {
    if (!supported) {
      setState({
        kind: 'error',
        message: 'Location sharing is not supported in this browser.',
      });
      return;
    }
    if (!activeTripIdRef.current) {
      // No active trip: the dashboard should not offer the start button, but
      // guard anyway.
      return;
    }

    // Clear any existing watcher before starting a new one.
    clearWatcher();

    setState({ kind: 'sharing', lastUpdateAt: null });

    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        const coords = position.coords;
        void sendUpdate({
          latitude: coords.latitude,
          longitude: coords.longitude,
          accuracy: coords.accuracy ?? null,
          heading: coords.heading ?? null,
          speed: coords.speed ?? null,
        });
      },
      (err) => {
        // Map geolocation errors to friendly messages. Use numeric codes
        // (GeolocationPositionError.PERMISSION_DENIED === 1, etc.) rather than
        // err.PERMISSION_DENIED, because some error-shaped objects may not
        // carry the static constants.
        let message: string;
        switch (err.code) {
          case 1: // PERMISSION_DENIED
            message =
              'Location permission was denied. Enable location access in your browser to share your bus location.';
            break;
          case 2: // POSITION_UNAVAILABLE
            message = 'Location information is unavailable right now.';
            break;
          case 3: // TIMEOUT
            message = 'Location request timed out.';
            break;
          default:
            message = 'Location sharing is not supported in this browser.';
            break;
        }
        clearWatcher();
        setState({ kind: 'error', message });
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 },
    );
  }, [supported, clearWatcher, sendUpdate]);

  // If the active trip goes away (ended / refresh), stop sharing automatically.
  useEffect(() => {
    if (!activeTripId) {
      stop();
    }
  }, [activeTripId, stop]);

  // Cleanup on unmount.
  useEffect(() => {
    return () => {
      clearWatcher();
    };
  }, [clearWatcher]);

  return { state, supported, start, stop };
}
