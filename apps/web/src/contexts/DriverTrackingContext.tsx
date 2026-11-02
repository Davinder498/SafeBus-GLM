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

interface DriverTrackingContextValue {
  trackingToken: string | null;
  location: UseDriverLocationSharingResult;
  activateTracking: (token: string) => Promise<void>;
  clearTracking: () => void;
}

const DriverTrackingContext = createContext<DriverTrackingContextValue | null>(null);

export function DriverTrackingProvider({ children }: { children: ReactNode }) {
  const { loading, profile } = useAuth();
  const [trackingToken, setTrackingToken] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    if (window.SafeBusNativeTracking) return null;
    return window.sessionStorage.getItem(STORAGE_KEY);
  });
  const [nativeRevision, setNativeRevision] = useState(0);
  const restorationSequence = useRef(0);
  const native = typeof window !== 'undefined' && !!window.SafeBusNativeTracking;
  const driverActive = profile?.role === 'driver' && profile.status === 'active';
  const observedToken = native
    ? !loading && driverActive && trackingToken
      ? `native:${profile.id}:${nativeRevision}:${trackingToken}`
      : null
    : trackingToken;
  const location = useDriverLocationSharing(observedToken, true);

  const activateTracking = useCallback(async (token: string) => {
    if (window.SafeBusNativeTracking) {
      restorationSequence.current += 1;
      await window.SafeBusNativeTracking.activate(token);
      setNativeRevision((value) => value + 1);
      setTrackingToken('native-service-active');
    } else {
      window.sessionStorage.setItem(STORAGE_KEY, token);
      setTrackingToken(token);
    }
  }, []);

  const clearTracking = useCallback(() => {
    restorationSequence.current += 1;
    window.sessionStorage.removeItem(STORAGE_KEY);
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

  const value = useMemo(
    () => ({ trackingToken, location, activateTracking, clearTracking }),
    [activateTracking, clearTracking, location, trackingToken],
  );

  return <DriverTrackingContext.Provider value={value}>{children}</DriverTrackingContext.Provider>;
}

export function useDriverTracking(): DriverTrackingContextValue {
  const context = useContext(DriverTrackingContext);
  if (!context) throw new Error('useDriverTracking must be used inside DriverTrackingProvider.');
  return context;
}
