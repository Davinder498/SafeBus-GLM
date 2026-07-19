import { describe, expect, it } from 'vitest';
import type { Route, RouteOverlay, RouteStop } from '@/types/transportation';
import {
  buildCanonicalRouteStopMarkerEntries,
  buildOverlayRouteStopMarkerEntries,
  groupRouteStopMarkerEntries,
  readableMarkerTextColor,
  safeRouteColor,
} from '@/utils/routeStopMarkers';

const route = {
  id: 'route-1',
  tenant_id: 'tenant-1',
  school_id: null,
  route_name: 'West Loop',
  route_code: 'WEST',
  route_type: 'morning',
  route_kind: 'regular',
  map_color: '#2563EB',
  definition_status: 'ready',
  status: 'active',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
} satisfies Route;

function routeStop(
  id: string,
  name: string,
  order: number,
  latitude: number,
  longitude: number,
): RouteStop {
  return {
    id,
    tenant_id: 'tenant-1',
    route_id: route.id,
    school_id: null,
    stop_name: name,
    stop_order: order,
    planned_arrival_time: null,
    latitude,
    longitude,
    status: 'active',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  };
}

describe('route stop marker models', () => {
  it('numbers canonical route stops and identifies both terminals', () => {
    const entries = buildCanonicalRouteStopMarkerEntries([
      {
        route,
        stops: [
          routeStop('stop-b', 'Point B', 2, 51.05, -114.05),
          routeStop('stop-a', 'Point A', 1, 51.04, -114.07),
          routeStop('stop-c', 'Point C', 3, 51.06, -114.03),
        ],
      },
    ]);

    expect(entries.map((entry) => [entry.stopName, entry.stopNumber, entry.terminal])).toEqual([
      ['Point A', 1, 'start'],
      ['Point B', 2, null],
      ['Point C', 3, 'end'],
    ]);
  });

  it('numbers overlay stops in the selected trip direction', () => {
    const baseOverlay: RouteOverlay = {
      routeId: route.id,
      routeCode: route.route_code,
      routeName: route.route_name,
      mapColor: route.map_color,
      tripPatternId: 'trip-reverse',
      tripName: 'Home',
      direction: 'reverse',
      stops: [
        {
          id: 'stop-a',
          name: 'Point A',
          order: 1,
          latitude: 51.04,
          longitude: -114.07,
          plannedArrivalTime: '08:00:00',
        },
        {
          id: 'stop-b',
          name: 'Point B',
          order: 2,
          latitude: 51.05,
          longitude: -114.05,
          plannedArrivalTime: '08:10:00',
        },
        {
          id: 'stop-c',
          name: 'Point C',
          order: 3,
          latitude: 51.06,
          longitude: -114.03,
          plannedArrivalTime: '08:20:00',
        },
      ],
    };

    const entries = buildOverlayRouteStopMarkerEntries([baseOverlay]);

    expect(entries.map((entry) => [entry.stopName, entry.stopNumber, entry.terminal])).toEqual([
      ['Point C', 1, 'start'],
      ['Point B', 2, null],
      ['Point A', 3, 'end'],
    ]);
  });

  it('groups exact shared coordinates without moving them', () => {
    const secondRoute = { ...route, id: 'route-2', route_code: 'EAST', map_color: '#DC2626' };
    const entries = buildCanonicalRouteStopMarkerEntries([
      { route, stops: [routeStop('shared-1', 'School', 1, 51.04, -114.07)] },
      {
        route: secondRoute,
        stops: [
          { ...routeStop('shared-2', 'School', 1, 51.04, -114.07), route_id: secondRoute.id },
        ],
      },
    ]);

    const groups = groupRouteStopMarkerEntries(entries);

    expect(groups).toHaveLength(1);
    expect(groups[0].position).toEqual([51.04, -114.07]);
    expect(groups[0].entries.map((entry) => entry.color)).toEqual(['#2563EB', '#DC2626']);
  });

  it('deduplicates the same authorized overlay returned for multiple linked students', () => {
    const overlay: RouteOverlay = {
      routeId: route.id,
      routeCode: route.route_code,
      routeName: route.route_name,
      mapColor: route.map_color,
      tripPatternId: 'trip-forward',
      tripName: 'Outbound',
      direction: 'forward',
      stops: [
        {
          id: 'stop-a',
          name: 'Point A',
          order: 1,
          latitude: 51.04,
          longitude: -114.07,
          plannedArrivalTime: null,
        },
        {
          id: 'stop-b',
          name: 'Point B',
          order: 2,
          latitude: 51.05,
          longitude: -114.05,
          plannedArrivalTime: null,
        },
      ],
    };

    expect(
      buildOverlayRouteStopMarkerEntries([
        { ...overlay, studentId: 'student-1' },
        { ...overlay, studentId: 'student-2' },
      ]),
    ).toHaveLength(2);
  });

  it('uses safe route colors and readable number text', () => {
    expect(safeRouteColor('not-a-color')).toBe('#2563EB');
    expect(readableMarkerTextColor('#2563EB')).toBe('#FFFFFF');
    expect(readableMarkerTextColor('#FDE68A')).toBe('#111827');
  });
});
