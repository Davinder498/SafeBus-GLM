import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/contexts/useAuth';
import {
  useTrackingInvalidations,
  type TrackingConnectionState,
} from '@/hooks/useTrackingInvalidations';
import { fetchGuardianLiveBusLocations } from '@/services/guardianLiveBusLocationService';
import type { GuardianStudentLiveBusLocation } from '@/types/guardianLiveBusLocation';

/**
 * UI-facing load state for guardian live bus location data.
 */
export type GuardianLiveBusLocationsLoadState =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'ready'; locations: GuardianStudentLiveBusLocation[] };

export interface UseGuardianLiveBusLocationsResult {
  state: GuardianLiveBusLocationsLoadState;
  refreshing: boolean;
  lastRefreshedAt: string | null;
  connectionState: TrackingConnectionState;
  refresh: () => void;
}

/**
 * Conservative auto-refresh interval for the guardian bus map.
 *
 * A school-bus guardian map does not need sub-second updates. 15 seconds is
 * frequent enough to reflect an active trip without generating excessive
 * database requests, and stays well below the 2-minute freshness threshold
 * enforced by the secured Milestone 11A RPC.
 */
const REFRESH_INTERVAL_MS = 15_000;

/**
 * React hook that loads guardian live bus location state through the secured
 * Milestone 11A RPC, with safe periodic refresh.
 *
 * Safety properties (Milestone 11C):
 *   - Conservative 15-second auto-refresh; no user-configurable high-frequency
 *     setting.
 *   - Guards against overlapping in-flight calls via `fetchingRef`.
 *   - Cleans up timers on unmount.
 *   - Pauses auto-refresh while the document is hidden and refreshes promptly
 *     when the page becomes visible again.
 *   - Prevents race conditions: a monotonically increasing request token
 *     ensures older responses can never replace newer results.
 *   - Fails safely: the server-provided state is authoritative. If the latest
 *     secured response is stale/missing/invalid/error, the hook transitions to
 *     that state and the previously fresh coordinates do NOT remain looking
 *     live. The server authorization/freshness rules are never recreated in
 *     the browser.
 *
 * The hook never queries live-location tables directly, never subscribes to
 * realtime changes, and never accepts guardian-controlled scope arguments.
 */
export function useGuardianLiveBusLocations(): UseGuardianLiveBusLocationsResult {
  const { user } = useAuth();
  const [state, setState] = useState<GuardianLiveBusLocationsLoadState>({ kind: 'loading' });
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<string | null>(null);

  const isMountedRef = useRef(true);
  const fetchingRef = useRef(false);
  const pendingLoadRef = useRef(false);
  const loadRef = useRef<() => void>(() => undefined);
  // Monotonic token to reject out-of-order responses (race protection).
  const latestRequestTokenRef = useRef(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    if (fetchingRef.current) {
      pendingLoadRef.current = true;
      return;
    }
    fetchingRef.current = true;
    const myToken = ++latestRequestTokenRef.current;
    setRefreshing(true);
    try {
      const locations = await fetchGuardianLiveBusLocations();
      // Race protection: ignore responses from older requests.
      if (myToken !== latestRequestTokenRef.current) return;
      if (!isMountedRef.current) return;
      // Server state is authoritative. This replaces any previous fresh state.
      // If the latest response is stale/missing/invalid, the map removes the
      // marker because the component renders only fresh rows.
      setState({ kind: 'ready', locations });
      setLastRefreshedAt(new Date().toISOString());
    } catch {
      if (myToken !== latestRequestTokenRef.current) return;
      if (!isMountedRef.current) return;
      // Fail safely: an error transitions to the error state, removing any
      // previously rendered fresh marker.
      setState({ kind: 'error' });
    } finally {
      if (myToken === latestRequestTokenRef.current && isMountedRef.current) {
        setRefreshing(false);
      }
      fetchingRef.current = false;
      if (pendingLoadRef.current && isMountedRef.current) {
        pendingLoadRef.current = false;
        queueMicrotask(() => loadRef.current());
      }
    }
  }, []);
  loadRef.current = () => void load();

  const clearUnverifiedLocation = useCallback(() => {
    latestRequestTokenRef.current += 1;
    setState({ kind: 'error' });
    setRefreshing(false);
  }, []);

  const connectionState = useTrackingInvalidations({
    topic: user ? `safebus:guardian:${user.id}` : null,
    onInvalidate: load,
    onDisconnected: clearUnverifiedLocation,
  });

  useEffect(() => {
    isMountedRef.current = true;

    // Initial fetch.
    void load();

    // Conservative periodic refresh.
    intervalRef.current = setInterval(() => {
      // Skip background work while the tab is hidden to avoid unnecessary
      // database requests. The visibility listener below triggers a prompt
      // refresh when the page becomes active again.
      if (document.visibilityState === 'visible') {
        void load();
      }
    }, REFRESH_INTERVAL_MS);

    // Refresh promptly when the page becomes visible again.
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && isMountedRef.current) {
        void load();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      isMountedRef.current = false;
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [load]);

  return { state, refreshing, lastRefreshedAt, connectionState, refresh: load };
}
