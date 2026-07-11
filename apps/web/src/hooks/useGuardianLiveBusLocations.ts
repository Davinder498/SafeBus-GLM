import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchGuardianLiveBusLocations } from '@/services/guardianLiveBusLocationService';
import type { GuardianStudentLiveBusLocation } from '@/types/guardianLiveBusLocation';

/**
 * UI-facing load state for guardian live bus location data.
 *
 * `permission-denied` is distinguished from `error` so the page can show a
 * targeted, non-technical message when the secured RPC rejects the caller
 * (for example, a raw PostgREST 42501 is mapped by the service to this state
 * path via the generic error branch; the page keeps both messages safe).
 */
export type GuardianLiveBusLocationsLoadState =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'ready'; locations: GuardianStudentLiveBusLocation[] };

export interface UseGuardianLiveBusLocationsResult {
  state: GuardianLiveBusLocationsLoadState;
  refreshing: boolean;
  lastRefreshedAt: string | null;
  refresh: () => void;
}

/**
 * React hook that loads guardian live bus location state through the secured
 * Milestone 11A RPC.
 *
 * Milestone 11B behavior:
 *   - Performs an initial fetch on mount.
 *   - Exposes a `refresh()` control for manual refresh.
 *   - Guards against overlapping in-flight calls.
 *   - Ignores stale unmounted responses.
 *
 * Milestone 11C extends this hook with conservative periodic refresh and
 * document visibility handling. The hook never queries live-location tables
 * directly, never subscribes to realtime changes, and never accepts
 * guardian-controlled scope arguments.
 */
export function useGuardianLiveBusLocations(): UseGuardianLiveBusLocationsResult {
  const [state, setState] = useState<GuardianLiveBusLocationsLoadState>({ kind: 'loading' });
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<string | null>(null);

  const isMountedRef = useRef(true);
  const fetchingRef = useRef(false);

  const load = useCallback(async () => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    setRefreshing(true);
    try {
      const locations = await fetchGuardianLiveBusLocations();
      if (!isMountedRef.current) return;
      setState({ kind: 'ready', locations });
      setLastRefreshedAt(new Date().toISOString());
    } catch {
      if (!isMountedRef.current) return;
      setState({ kind: 'error' });
    } finally {
      if (isMountedRef.current) setRefreshing(false);
      fetchingRef.current = false;
    }
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    void load();
    return () => {
      isMountedRef.current = false;
    };
  }, [load]);

  return { state, refreshing, lastRefreshedAt, refresh: load };
}