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
): UseGuardianLiveBusLocationsResult {
  const result = useVerifiedGuardianData(fetchGuardianLiveBusLocations, '', { sharedTopics });
  return {
    ...result,
    state:
      result.state.kind === 'ready'
        ? { kind: 'ready', locations: result.state.data }
        : result.state,
  };
}
