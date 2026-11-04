import { applyQueuedTripStop } from '@/services/queuedTripStopService';
import type { DriverTrip } from '@/types/trips';
import { fetchActiveDriverTrip } from '@/services/driverTripService';
import {
  loadPendingTripAction,
  savePendingTripAction,
  removePendingTripAction,
  pendingActionDisposition,
  pendingTripActionEvent,
  tripActionSyncedEvent,
  type PendingTripAction,
  type StopTripAction,
} from '@/services/pendingDriverTripAction';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  useDriverLocationSharing,
  type UseDriverLocationSharingResult,
} from '@/hooks/useDriverLocationSharing';
import { useAuth } from '@/contexts/useAuth';

const STORAGE_KEY = 'safebus.activeBusTrackingToken';
const PAUSED_KEY = 'safebus.driverCollectionPaused';

interface DriverTrackingContextValue {
  trackingToken: string | null;
  location: UseDriverLocationSharingResult;
  activateTracking: (token: string) => Promise<void>;
  clearTracking: () => void;
  pendingTripAction: PendingTripAction | null;
  pendingTripActionError: string | null;
  saveTripAction: (trip: DriverTrip, action: StopTripAction, reason: string | null) => void;
  confirmTripAction: (tripId: string) => void;
  retryTripAction: (force?: boolean) => Promise<void>;
  discardTripAction: () => void;
}

const DriverTrackingContext = createContext<DriverTrackingContextValue | null>(null);

export function DriverTrackingProvider({ children }: { children: ReactNode }) {
  const { loading, profile } = useAuth();
  const [trackingToken, setTrackingToken] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    if (window.SafeBusNativeTracking) return null;
    return window.sessionStorage.getItem(STORAGE_KEY);
  });
  const [collectionPaused, setCollectionPaused] = useState(
    () => typeof window !== 'undefined' && window.sessionStorage.getItem(PAUSED_KEY) === '1',
  );
  const [nativeRevision, setNativeRevision] = useState(0);
  const [queueRevision, setQueueRevision] = useState(0);
  const [retryError, setRetryError] = useState<string | null>(null);
  const flushing = useRef(false);
  const lastAttempt = useRef(0);
  const owner = useRef(profile);
  const authReady = useRef(!loading);
  owner.current = profile;
  authReady.current = !loading;
  const queued = useMemo(() => {
    void queueRevision; // Explicit invalidation after durable storage changes.
    if (loading || profile?.role !== 'driver' || profile.status !== 'active')
      return { item: null, error: null };
    try {
      return { item: loadPendingTripAction(profile.id), error: null };
    } catch (cause) {
      return {
        item: null,
        error: cause instanceof Error ? cause.message : 'Saved action unavailable.',
      };
    }
  }, [loading, profile?.id, profile?.role, profile?.status, queueRevision]);
  useEffect(() => {
    setRetryError(null);
    lastAttempt.current = 0;
  }, [profile?.id, profile?.tenant_id]);
  const pendingTripAction = queued.item;
  const pendingTripActionError = queued.error ?? retryError;
  useEffect(() => {
    const refresh = () => {
      setQueueRevision((value) => value + 1);
      setRetryError(null);
    };
    window.addEventListener(pendingTripActionEvent, refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener(pendingTripActionEvent, refresh);
      window.removeEventListener('storage', refresh);
    };
  }, []);
  const restorationSequence = useRef(0);
  const native = typeof window !== 'undefined' && !!window.SafeBusNativeTracking;
  const driverActive = profile?.role === 'driver' && profile.status === 'active';
  const observedToken = native
    ? !loading && driverActive && trackingToken
      ? `native:${profile.id}:${nativeRevision}:${trackingToken}`
      : null
    : trackingToken;
  const location = useDriverLocationSharing(
    observedToken,
    !loading && driverActive && !collectionPaused && !pendingTripAction && !queued.error,
  );

  const stopLocationAndConfirm = location.stopAndConfirm;

  const activateTracking = useCallback(async (token: string) => {
    if (
      !authReady.current ||
      owner.current?.role !== 'driver' ||
      owner.current.status !== 'active' ||
      loadPendingTripAction(owner.current.id)
    )
      throw new Error('Resolve the pending trip action before starting another trip.');
    if (window.SafeBusNativeTracking) {
      restorationSequence.current += 1;
      await window.SafeBusNativeTracking.activate(token);
      setNativeRevision((value) => value + 1);
      setTrackingToken('native-service-active');
    } else {
      window.sessionStorage.setItem(STORAGE_KEY, token);
      setTrackingToken(token);
    }
    window.sessionStorage.removeItem(PAUSED_KEY);
    setCollectionPaused(false);
  }, []);

  const clearTracking = useCallback(() => {
    setCollectionPaused(true);
    try {
      window.sessionStorage.setItem(PAUSED_KEY, '1');
      window.sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      /* Storage must never gate the native privacy action. */
    }
    restorationSequence.current += 1;
    if (window.SafeBusNativeTracking) {
      void window.SafeBusNativeTracking.stop()
        .finally(() => setNativeRevision((value) => value + 1))
        .catch(() => undefined);
      // Keep observing pending delivery after a trip ends, without resuming collection.
      setTrackingToken(driverActive ? 'native-service-active' : null);
    } else setTrackingToken(null);
  }, [driverActive]);

  useEffect(() => {
    const native = window.SafeBusNativeTracking;
    if (!native || loading || !driverActive) return;
    const request = ++restorationSequence.current;
    setTrackingToken('native-service-active');
    let active = true;
    void native
      .getStatus()
      .then((status) => {
        if (!active || request !== restorationSequence.current) return;
        if (
          status.configured ||
          status.pendingDelivery ||
          (status.queuedEvents ?? 0) > 0 ||
          status.issue
        )
          setTrackingToken('native-service-active');
        else {
          // Stop a possible former account's collector without exposing its status.
          void native.stop().catch(() => undefined);
          setTrackingToken(null);
        }
      })
      .catch(() => {
        if (active && request === restorationSequence.current)
          setTrackingToken('native-service-active'); // The hook shows a recoverable status error.
      });
    return () => {
      active = false;
    };
  }, [loading, profile?.id, driverActive]);

  useEffect(() => {
    if (location.state.kind === 'error' && location.state.message.includes('session ended')) {
      clearTracking();
    }
  }, [clearTracking, location.state]);

  useEffect(() => {
    if (!loading && !driverActive && (native || trackingToken)) clearTracking();
  }, [clearTracking, loading, driverActive, trackingToken, native]);

  const saveTripAction = useCallback(
    (trip: DriverTrip, action: StopTripAction, reason: string | null) => {
      const current = owner.current;
      if (
        !authReady.current ||
        current?.role !== 'driver' ||
        current.status !== 'active' ||
        !current.tenant_id ||
        current.id !== profile?.id
      )
        throw new Error('Sign in as the active driver before saving this trip action.');
      savePendingTripAction(current.id, current.tenant_id, trip, action, reason);
    },
    [profile?.id],
  );
  const confirmTripAction = useCallback((tripId: string) => {
    const current = owner.current;
    if (!current) return;
    const action = loadPendingTripAction(current.id);
    if (action?.tripId === tripId) removePendingTripAction(current.id, action.id);
  }, []);
  const discardTripAction = useCallback(() => {
    if (owner.current) removePendingTripAction(owner.current.id);
  }, []);
  const retryTripAction = useCallback(
    async (force = false) => {
      const current = owner.current;
      if (
        loading ||
        !current ||
        current.role !== 'driver' ||
        current.status !== 'active' ||
        !pendingTripAction ||
        flushing.current ||
        !navigator.onLine
      )
        return;
      // Do not race the foreground request immediately after its durable write.
      if (
        !force &&
        (Date.now() - pendingTripAction.createdAt < 30_000 ||
          Date.now() - lastAttempt.current < 30_000)
      )
        return;
      flushing.current = true;
      lastAttempt.current = Date.now();
      const stillCurrent = () =>
        authReady.current &&
        owner.current?.id === current.id &&
        owner.current?.role === 'driver' &&
        owner.current?.status === 'active' &&
        owner.current?.tenant_id === pendingTripAction.tenantId;
      try {
        const trip = await fetchActiveDriverTrip();
        if (!stillCurrent()) return;
        let disposition = pendingActionDisposition(pendingTripAction, trip);
        if (disposition === 'review') {
          setRetryError(
            'The trip changed or this action expired. Review the active bus, then discard the saved action before recording a new one.',
          );
          return;
        }
        if (disposition === 'send') {
          await stopLocationAndConfirm();
          if (!stillCurrent() || loadPendingTripAction(current.id)?.id !== pendingTripAction.id)
            return;
          const outcome = await applyQueuedTripStop(pendingTripAction);
          if (outcome === 'review') {
            if (stillCurrent())
              setRetryError(
                'The trip changed. Review the active bus before recording a new action.',
              );
            return;
          }
          if (outcome === 'obsolete') disposition = 'obsolete';
        }
        if (!stillCurrent()) return;
        removePendingTripAction(current.id, pendingTripAction.id);
        if (disposition !== 'obsolete' && pendingTripAction.action !== 'pause') clearTracking();
        setRetryError(null);
        window.dispatchEvent(new Event(tripActionSyncedEvent));
      } catch {
        if (stillCurrent())
          setRetryError(
            'Location sharing remains stopped. The trip action is saved on this phone and will retry when your connection and sign-in are available.',
          );
      } finally {
        flushing.current = false;
      }
    },
    [loading, pendingTripAction, stopLocationAndConfirm, clearTracking],
  );
  useEffect(() => {
    if (!pendingTripAction || !driverActive || loading) return;
    void retryTripAction();
    const retry = () => {
      void retryTripAction();
    };
    const timer = window.setInterval(retry, 30_000);
    window.addEventListener('online', retry);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('online', retry);
    };
  }, [pendingTripAction, driverActive, loading, retryTripAction]);
  const stopAndConfirm = useCallback(async () => {
    // Local privacy actions do not wait for storage, Auth or an RPC.
    const stopped = stopLocationAndConfirm();
    setCollectionPaused(true);
    try {
      window.sessionStorage.setItem(PAUSED_KEY, '1');
    } catch {
      /* The confirmed local stop still runs. */
    }
    await stopped;
  }, [stopLocationAndConfirm]);
  const guardedLocation = useMemo(
    () => ({
      ...location,
      stopAndConfirm,
      start: () => {
        if (owner.current?.role === 'driver' && !loadPendingTripAction(owner.current.id)) {
          window.sessionStorage.removeItem(PAUSED_KEY);
          setCollectionPaused(false);
          location.start();
        }
      },
    }),
    [location, stopAndConfirm],
  );

  const value = useMemo(
    () => ({
      trackingToken,
      location: guardedLocation,
      activateTracking,
      clearTracking,
      pendingTripAction,
      pendingTripActionError,
      saveTripAction,
      confirmTripAction,
      retryTripAction,
      discardTripAction,
    }),
    [
      activateTracking,
      clearTracking,
      guardedLocation,
      trackingToken,
      pendingTripAction,
      pendingTripActionError,
      saveTripAction,
      confirmTripAction,
      retryTripAction,
      discardTripAction,
    ],
  );

  return <DriverTrackingContext.Provider value={value}>{children}</DriverTrackingContext.Provider>;
}

export function useDriverTracking(): DriverTrackingContextValue {
  const context = useContext(DriverTrackingContext);
  if (!context) throw new Error('useDriverTracking must be used inside DriverTrackingProvider.');
  return context;
}
