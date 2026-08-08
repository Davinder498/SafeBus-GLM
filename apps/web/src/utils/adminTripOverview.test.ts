import { describe, expect, it } from 'vitest';
import { directionLabel } from '@/services/adminTripOverviewService';
import type { AdminTripOverviewItem } from '@/types/adminTripOverview';
import { filterAdminTrips } from './adminTripOverview';

const trips = (['active', 'paused', 'completed', 'cancelled'] as const).map((status, index) => ({
  id: String(index),
  serviceDate: '2026-07-25',
  status,
  startedAt: '2026-07-25T08:00:00Z',
  endedAt: status === 'active' || status === 'paused' ? null : '2026-07-25T09:00:00Z',
  routeName: 'Route 1',
  routeCode: 'R1',
  tripPatternName: 'Pattern',
  direction: index === 1 ? 'return' : 'outbound',
  busLabel: 'Bus 1',
  driverLabel: 'Driver',
})) satisfies AdminTripOverviewItem[];

describe('admin trip overview categories', () => {
  it('treats non-active as completed and cancelled without inventing a status', () => {
    expect(filterAdminTrips(trips, 'non-active').map(({ status }) => status)).toEqual([
      'completed',
      'cancelled',
    ]);
    expect(filterAdminTrips(trips, 'active')).toHaveLength(1);
    expect(filterAdminTrips(trips, 'paused')).toHaveLength(1);
    expect(filterAdminTrips(trips, 'completed')).toHaveLength(1);
    expect(filterAdminTrips(trips, 'cancelled')).toHaveLength(1);
  });

  it('returns an empty category and labels configured pattern directions', () => {
    expect(filterAdminTrips([], 'all')).toEqual([]);
    expect(directionLabel('outbound')).toBe('Outbound');
    expect(directionLabel('return')).toBe('Return');
  });
});
