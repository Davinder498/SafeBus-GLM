import { useVerifiedGuardianData } from '@/hooks/useVerifiedGuardianData';
import { fetchGuardianBusVisibility } from '@/services/guardianLiveBusLocationService';
import { fetchGuardianStudentStops } from '@/services/guardianStudentStopsService';

// Home shows assignments and service status. The map owns frequent GPS refreshes.
export const GUARDIAN_HOME_REFRESH_POLICY = {
  intervalMs: 30_000,
  jitterMs: 5_000,
  liveMinIntervalMs: 30_000,
  maxRetryMs: 120_000,
};

async function fetchHome(signal: AbortSignal) {
  const [buses, stops] = await Promise.all([
    fetchGuardianBusVisibility(signal),
    fetchGuardianStudentStops(signal).catch(() => null),
  ]);
  return { buses, stops };
}

export function useGuardianHomeData() {
  return useVerifiedGuardianData(fetchHome, 'home', GUARDIAN_HOME_REFRESH_POLICY);
}
