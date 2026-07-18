import { describe, expect, it } from 'vitest';
import type { Route, RouteDefinitionStopInput } from '@/types/transportation';
import {
  chooseRouteColor,
  normalizeStopOrders,
  orderedStopsForDirection,
  routeDefinitionIssue,
} from './routeDefinition';

function stop(
  clientKey: string,
  stopOrder: number,
  latitude: number | null = 51,
  longitude: number | null = -114,
): RouteDefinitionStopInput {
  return {
    clientKey,
    schoolId: null,
    stopName: clientKey,
    stopOrder,
    latitude,
    longitude,
    status: 'active',
  };
}

function route(id: string, color: string): Route {
  return {
    id,
    tenant_id: 'tenant-1',
    school_id: null,
    route_name: id,
    route_code: id,
    route_type: 'special',
    route_kind: 'regular',
    map_color: color,
    definition_status: 'ready',
    status: 'active',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  };
}

describe('route definition model', () => {
  it('normalizes stop order after accessible move/remove operations', () => {
    expect(normalizeStopOrders([stop('B', 9), stop('A', 4)]).map((item) => item.stopOrder))
      .toEqual([1, 2]);
  });

  it('derives reverse traversal without duplicating route geometry', () => {
    const canonical = [
      { name: 'A', order: 1 },
      { name: 'Middle', order: 2 },
      { name: 'B', order: 3 },
    ];
    expect(orderedStopsForDirection(canonical, 'forward').map((item) => item.name))
      .toEqual(['A', 'Middle', 'B']);
    expect(orderedStopsForDirection(canonical, 'reverse').map((item) => item.name))
      .toEqual(['B', 'Middle', 'A']);
  });

  it('requires two coordinate-complete contiguous active stops for activation', () => {
    expect(routeDefinitionIssue([stop('A', 1)])).toBe('Add at least two active stops.');
    expect(routeDefinitionIssue([stop('A', 1), stop('B', 2, null, null)]))
      .toContain('valid coordinates');
    expect(routeDefinitionIssue([stop('A', 1), stop('B', 3)]))
      .toContain('contiguous');
    expect(routeDefinitionIssue([stop('A', 1), stop('B', 2)])).toBeNull();
  });

  it('chooses an unused persistent color and ignores the route being edited', () => {
    const routes = [route('one', '#2563EB'), route('two', '#DC2626')];
    expect(chooseRouteColor(routes)).toBe('#059669');
    expect(chooseRouteColor(routes, 'one')).toBe('#2563EB');
  });
});
