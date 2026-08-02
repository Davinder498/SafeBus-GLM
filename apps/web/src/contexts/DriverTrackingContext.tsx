import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
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
  activateTracking: (token: string) => void;
  clearTracking: () => void;
}

const DriverTrackingContext = createContext<DriverTrackingContextValue | null>(null);

export function DriverTrackingProvider({ children }: { children: ReactNode }) {
  const { loading, profile } = useAuth();
  const [trackingToken, setTrackingToken] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    return window.sessionStorage.getItem(STORAGE_KEY);
  });
  const location = useDriverLocationSharing(trackingToken, true);

  const activateTracking = useCallback((token: string) => {
    window.sessionStorage.setItem(STORAGE_KEY, token);
    setTrackingToken(token);
  }, []);

  const clearTracking = useCallback(() => {
    window.sessionStorage.removeItem(STORAGE_KEY);
    setTrackingToken(null);
  }, []);

  useEffect(() => {
    if (location.state.kind === 'error' && location.state.message.includes('session ended')) {
      clearTracking();
    }
  }, [clearTracking, location.state]);

  useEffect(() => {
    if (!loading && profile?.role !== 'driver' && trackingToken) clearTracking();
  }, [clearTracking, loading, profile?.role, trackingToken]);

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
