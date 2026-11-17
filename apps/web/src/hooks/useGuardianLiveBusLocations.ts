import { useVerifiedGuardianData } from '@/hooks/useVerifiedGuardianData';
import type { TrackingConnectionState } from '@/hooks/useTrackingInvalidations';
import { fetchGuardianLiveBusLocations } from '@/services/guardianLiveBusLocationService';
import type { GuardianStudentLiveBusLocation } from '@/types/guardianLiveBusLocation';

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

/** Poll the scoped RPC and revalidate on private tracking invalidations. */
export function useGuardianLiveBusLocations(
  sharedTopics: readonly string[] = [],
  surface: 'summary' | 'map' = 'summary',
): UseGuardianLiveBusLocationsResult {
  const result = useVerifiedGuardianData(fetchGuardianLiveBusLocations, surface, {
    sharedTopics: surface === 'map' ? sharedTopics : [],
    intervalMs: surface === 'map' ? 15_000 : 30_000,
    jitterMs: surface === 'map' ? 0 : 5_000,
    liveMinIntervalMs: surface === 'map' ? 3_000 : 30_000,
    maxRetryMs: surface === 'map' ? 15_000 : 120_000,
    throttleLocationOnly: true,
  });
  return {
    ...result,
    state:
      result.state.kind === 'ready'
        ? { kind: 'ready', locations: result.state.data }
        : result.state,
  };
}
