import type {
  Route,
  RouteDefinitionStopInput,
  RouteDirection,
  RouteOverlayStop,
} from '@/types/transportation';

export const ROUTE_COLOR_PALETTE = [
  '#2563EB',
  '#DC2626',
  '#059669',
  '#7C3AED',
  '#D97706',
  '#0891B2',
  '#BE185D',
  '#4F46E5',
  '#15803D',
  '#B45309',
  '#9333EA',
  '#0F766E',
] as const;

export function chooseRouteColor(routes: Route[], editingRouteId?: string): string {
  const used = new Set(
    routes
      .filter((route) => route.id !== editingRouteId && route.status === 'active')
      .map((route) => route.map_color?.toUpperCase())
      .filter((color): color is string => Boolean(color)),
  );
  return ROUTE_COLOR_PALETTE.find((color) => !used.has(color)) ?? ROUTE_COLOR_PALETTE[0];
}

export function normalizeStopOrders(
  stops: RouteDefinitionStopInput[],
): RouteDefinitionStopInput[] {
  return stops.map((stop, index) => ({ ...stop, stopOrder: index + 1 }));
}

export function orderedStopsForDirection<T extends { order: number }>(
  stops: T[],
  direction: RouteDirection,
): T[] {
  return [...stops].sort((a, b) =>
    direction === 'forward' ? a.order - b.order : b.order - a.order,
  );
}

export function isValidRouteCoordinate(
  latitude: number | null,
  longitude: number | null,
): boolean {
  return (
    latitude !== null &&
    longitude !== null &&
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180
  );
}

export function stopDraftIssue(stop: RouteDefinitionStopInput): string | null {
  const name = stop.stopName.trim();
  if (!name) return 'Enter a stop name.';
  if (name.length > 120) return 'Stop name must be 120 characters or fewer.';
  if (!isValidRouteCoordinate(stop.latitude, stop.longitude)) {
    return 'Enter valid latitude and longitude, or place the stop on the map.';
  }
  return null;
}

export function routeDefinitionIssue(
  stops: RouteDefinitionStopInput[],
): string | null {
  const activeStops = stops.filter((stop) => stop.status === 'active');
  if (activeStops.length < 2) return 'Add at least two active stops.';
  if (activeStops.some((stop) => !stop.stopName.trim())) {
    return 'Every active stop needs a name.';
  }
  if (activeStops.some((stop) => !isValidRouteCoordinate(stop.latitude, stop.longitude))) {
    return 'Place every active stop on the map or enter valid coordinates.';
  }
  const orders = activeStops.map((stop) => stop.stopOrder).sort((a, b) => a - b);
  if (orders.some((order, index) => order !== index + 1)) {
    return 'Active stop order must be contiguous, starting at 1.';
  }
  return null;
}

export function validOverlayStops(stops: RouteOverlayStop[]): RouteOverlayStop[] {
  return stops.filter((stop) => isValidRouteCoordinate(stop.latitude, stop.longitude));
}
