import type { Route, RouteDirection, RouteOverlay, RouteStop } from '@/types/transportation';
import { orderedStopsForDirection, validOverlayStops } from '@/utils/routeDefinition';

export type RouteStopTerminal = 'start' | 'end' | null;

export interface RouteStopMarkerEntry {
  id: string;
  routeKey: string;
  routeCode: string;
  routeName: string;
  tripName: string | null;
  direction: RouteDirection | null;
  stopName: string;
  stopNumber: number;
  latitude: number;
  longitude: number;
  color: string;
  terminal: RouteStopTerminal;
  plannedArrivalTime: string | null;
}

export interface RouteStopMarkerGroup {
  key: string;
  position: [number, number];
  entries: RouteStopMarkerEntry[];
}

export type RouteStopMarkerDensity = 'compact' | 'comfortable';

export interface RouteStopMarkerDimensions {
  size: number;
  borderWidth: number;
  fontSize: number;
  combinedLabelSize: number;
}

export interface RouteStopMarkerHoverDetails {
  heading: string;
  summary: string;
}

interface CanonicalRouteStopSource {
  route: Route;
  stops: RouteStop[];
}

const FALLBACK_ROUTE_COLOR = '#2563EB';
const HEX_COLOR_PATTERN = /^#[0-9A-Fa-f]{6}$/;

export function safeRouteColor(color: string | null | undefined): string {
  return color && HEX_COLOR_PATTERN.test(color) ? color.toUpperCase() : FALLBACK_ROUTE_COLOR;
}

export function readableMarkerTextColor(color: string): '#111827' | '#FFFFFF' {
  const safeColor = safeRouteColor(color);
  const red = Number.parseInt(safeColor.slice(1, 3), 16) / 255;
  const green = Number.parseInt(safeColor.slice(3, 5), 16) / 255;
  const blue = Number.parseInt(safeColor.slice(5, 7), 16) / 255;
  const linearize = (channel: number) =>
    channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  const luminance = 0.2126 * linearize(red) + 0.7152 * linearize(green) + 0.0722 * linearize(blue);

  return luminance > 0.179 ? '#111827' : '#FFFFFF';
}

export function buildCanonicalRouteStopMarkerEntries(
  routes: CanonicalRouteStopSource[],
): RouteStopMarkerEntry[] {
  return routes.flatMap(({ route, stops }) => {
    const orderedStops = [...stops]
      .filter(
        (stop) =>
          stop.status !== 'archived' &&
          typeof stop.latitude === 'number' &&
          typeof stop.longitude === 'number' &&
          Number.isFinite(stop.latitude) &&
          Number.isFinite(stop.longitude),
      )
      .sort((a, b) => a.stop_order - b.stop_order);

    return orderedStops.map((stop, stopIndex) => ({
      id: `route:${route.id}:stop:${stop.id}`,
      routeKey: route.id,
      routeCode: route.route_code,
      routeName: route.route_name,
      tripName: null,
      direction: null,
      stopName: stop.stop_name,
      stopNumber: stopIndex + 1,
      latitude: stop.latitude as number,
      longitude: stop.longitude as number,
      color: safeRouteColor(route.map_color),
      terminal: stopIndex === 0 ? 'start' : stopIndex === orderedStops.length - 1 ? 'end' : null,
      plannedArrivalTime: stop.planned_arrival_time,
    }));
  });
}

export function buildOverlayRouteStopMarkerEntries(
  overlays: RouteOverlay[],
): RouteStopMarkerEntry[] {
  return overlays
    .flatMap<RouteStopMarkerEntry>((overlay) => {
      const orderedStops = orderedStopsForDirection(
        validOverlayStops(overlay.stops),
        overlay.direction,
      );
      const routeKey = overlay.routeId ?? `${overlay.routeCode}:${overlay.routeName}`;
      const tripKey = overlay.tripPatternId ?? `${overlay.direction}:${overlay.tripName}`;

      return orderedStops.map((stop, stopIndex) => ({
        id: [
          'overlay',
          routeKey,
          tripKey,
          stop.id ?? `${stop.order}:${stop.latitude}:${stop.longitude}`,
        ].join(':'),
        routeKey,
        routeCode: overlay.routeCode,
        routeName: overlay.routeName,
        tripName: overlay.tripName,
        direction: overlay.direction,
        stopName: stop.name,
        stopNumber: stopIndex + 1,
        latitude: stop.latitude,
        longitude: stop.longitude,
        color: safeRouteColor(overlay.mapColor),
        terminal: stopIndex === 0 ? 'start' : stopIndex === orderedStops.length - 1 ? 'end' : null,
        plannedArrivalTime: stop.plannedArrivalTime,
      }));
    })
    .filter(
      (entry, index, entries) =>
        entries.findIndex((candidate) => candidate.id === entry.id) === index,
    );
}

export function groupRouteStopMarkerEntries(
  entries: RouteStopMarkerEntry[],
): RouteStopMarkerGroup[] {
  const groups = new Map<string, RouteStopMarkerGroup>();

  for (const entry of entries) {
    const coordinateKey = `${entry.latitude}|${entry.longitude}`;
    const existing = groups.get(coordinateKey);
    if (existing) {
      if (!existing.entries.some((candidate) => candidate.id === entry.id)) {
        existing.entries.push(entry);
      }
      continue;
    }

    groups.set(coordinateKey, {
      key: coordinateKey,
      position: [entry.latitude, entry.longitude],
      entries: [entry],
    });
  }

  return Array.from(groups.values());
}

export function routeStopMarkerDimensions(
  group: RouteStopMarkerGroup,
  density: RouteStopMarkerDensity,
): RouteStopMarkerDimensions {
  const isCombined = group.entries.length > 1;
  const isTerminal = group.entries.some((entry) => entry.terminal !== null);

  if (density === 'compact') {
    return {
      size: isCombined ? 28 : isTerminal ? 26 : 22,
      borderWidth: 2,
      fontSize: isCombined ? 10 : 11,
      combinedLabelSize: 18,
    };
  }

  return {
    size: isCombined ? 34 : isTerminal ? 32 : 26,
    borderWidth: 3,
    fontSize: isCombined ? 12 : 13,
    combinedLabelSize: 20,
  };
}

export function routeStopMarkerHoverDetails(
  group: RouteStopMarkerGroup,
): RouteStopMarkerHoverDetails {
  if (group.entries.length > 1) {
    const routeCodes = Array.from(
      new Set(group.entries.map((entry) => entry.routeCode)),
    );
    return {
      heading: `${group.entries.length} stops at this location`,
      summary: `Routes: ${routeCodes.join(', ')}`,
    };
  }

  const entry = group.entries[0];
  const terminalLabel =
    entry.terminal === 'start'
      ? 'Start'
      : entry.terminal === 'end'
        ? 'End'
        : 'Stop';
  const tripLabel = entry.tripName ? ` · ${entry.tripName}` : '';

  return {
    heading: `${terminalLabel}: ${entry.stopName}`,
    summary: `Stop ${entry.stopNumber} · ${entry.routeCode}${tripLabel}`,
  };
}
