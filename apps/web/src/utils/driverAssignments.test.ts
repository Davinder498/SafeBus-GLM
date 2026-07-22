import { describe, expect, it } from 'vitest';
import type { DriverAssignmentSummary } from '@/types/driverAssignments';
import { isDriverAssignmentCurrentOn, uniqueActiveAssignedBuses } from '@/utils/driverAssignments';

function assignment(
  busId: string,
  overrides: Partial<DriverAssignmentSummary> = {},
): DriverAssignmentSummary {
  return {
    id: `assignment-${busId}`,
    busId,
    routeId: 'route-1',
    tripPatternId: 'pattern-1',
    tripName: 'Morning run',
    busLabel: busId,
    routeName: 'Route 1',
    tripType: 'morning',
    status: 'active',
    ...overrides,
  };
}

describe('driver assigned bus list', () => {
  it('shows each active assigned bus once', () => {
    expect(
      uniqueActiveAssignedBuses([
        assignment('12'),
        assignment('12', { id: 'another-assignment' }),
        assignment('24'),
      ]).map((item) => item.busId),
    ).toEqual(['12', '24']);
  });

  it('does not expose inactive assignments as trip-start choices', () => {
    expect(
      uniqueActiveAssignedBuses([assignment('12', { status: 'inactive' }), assignment('24')]).map(
        (item) => item.busId,
      ),
    ).toEqual(['24']);
  });

  it('treats only assignments effective on the service date as current', () => {
    expect(
      isDriverAssignmentCurrentOn(
        { effective_from: '2026-07-01', effective_to: '2026-07-31' },
        '2026-07-22',
      ),
    ).toBe(true);
    expect(
      isDriverAssignmentCurrentOn(
        { effective_from: '2026-08-01', effective_to: null },
        '2026-07-22',
      ),
    ).toBe(false);
    expect(
      isDriverAssignmentCurrentOn(
        { effective_from: null, effective_to: '2026-07-21' },
        '2026-07-22',
      ),
    ).toBe(false);
  });
});
