import { describe, expect, it } from 'vitest';
import type { DriverAssignmentSummary } from '@/types/driverAssignments';
import { prepareDriverTripAssignments } from '@/utils/driverAssignments';

function assignment(
  id: string,
  overrides: Partial<DriverAssignmentSummary> = {},
): DriverAssignmentSummary {
  return {
    id,
    busId: 'bus-12',
    routeId: 'route-1',
    tripPatternId: 'pattern-1',
    tripName: 'Morning run',
    direction: 'forward',
    busLabel: '12',
    routeName: 'Route 1',
    routeCode: 'R1',
    scheduledStartTime: '07:30:00',
    status: 'active',
    ...overrides,
  };
}

describe('driver trip assignment list', () => {
  it('keeps multiple active trips assigned to the same bus', () => {
    expect(
      prepareDriverTripAssignments([
        assignment('outbound', { tripPatternId: 'outbound', tripName: 'Outbound' }),
        assignment('return', {
          tripPatternId: 'return',
          tripName: 'Return',
          direction: 'reverse',
          scheduledStartTime: '15:30:00',
        }),
      ]).map((item) => item.id),
    ).toEqual(['outbound', 'return']);
  });

  it('does not expose inactive assignments as trip-start choices', () => {
    expect(
      prepareDriverTripAssignments([
        assignment('inactive', { status: 'inactive' }),
        assignment('active'),
      ]).map((item) => item.id),
    ).toEqual(['active']);
  });

  it('sorts scheduled trips first and unscheduled trips last', () => {
    expect(
      prepareDriverTripAssignments([
        assignment('unscheduled', { tripName: 'Field trip', scheduledStartTime: null }),
        assignment('late', { tripName: 'Return', scheduledStartTime: '15:30:00' }),
        assignment('early', { tripName: 'Outbound', scheduledStartTime: '07:30:00' }),
      ]).map((item) => item.id),
    ).toEqual(['early', 'late', 'unscheduled']);
  });
});
