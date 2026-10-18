import type { GuardianBusServiceStop } from '@/types/guardianLiveBusLocation';

export interface GuardianServiceStop {
  stop: GuardianBusServiceStop;
  /** Index in the full service's travel order, including hidden stops. */
  routeIndex: number;
}

/** Keep the start and linked students' stops, ending at their final drop-off. */
export function guardianServiceStops(stops: GuardianBusServiceStop[]): GuardianServiceStop[] {
  const hasDropoff = stops.some((stop) => stop.dropoffStudentNames.length > 0);
  return stops.flatMap((stop, routeIndex) =>
    routeIndex === 0 ||
    stop.pickupStudentNames.length > 0 ||
    stop.dropoffStudentNames.length > 0 ||
    (!hasDropoff && routeIndex === stops.length - 1)
      ? [{ stop, routeIndex }]
      : [],
  );
}

/** Project the verified full-route position onto the remaining stop anchors. */
export function guardianServicePosition(
  stops: GuardianServiceStop[],
  routePosition: number | null,
): number | null {
  if (routePosition === null || !Number.isFinite(routePosition) || stops.length === 0) return null;
  if (routePosition <= stops[0].routeIndex) return 0;
  for (let index = 1; index < stops.length; index++) {
    const lower = stops[index - 1].routeIndex;
    const upper = stops[index].routeIndex;
    if (routePosition <= upper) return index - 1 + (routePosition - lower) / (upper - lower);
  }
  return stops.length - 1;
}
