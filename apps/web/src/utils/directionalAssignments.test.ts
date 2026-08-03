import { describe, expect, it } from 'vitest';
import {
  directionScopeFromDirections,
  groupDirectionalAssignments,
  resolveReverseStops,
} from './directionalAssignments';

const base = {
  effective_from: '2026-09-01',
  effective_to: null,
  status: 'active',
};

describe('directional assignment grouping', () => {
  it('groups matching forward and reverse records as both directions', () => {
    const groups = groupDirectionalAssignments(
      [
        { ...base, id: 'forward', routeId: 'route-1', direction: 'forward' as const },
        { ...base, id: 'reverse', routeId: 'route-1', direction: 'reverse' as const },
      ],
      (assignment) => assignment.routeId,
      (assignment) => assignment.direction,
    );

    expect(groups).toHaveLength(1);
    expect(groups[0].directionScope).toBe('both');
    expect(groups[0].forward?.id).toBe('forward');
    expect(groups[0].reverse?.id).toBe('reverse');
  });

  it('keeps legacy records with different dates as separate one-way groups', () => {
    const groups = groupDirectionalAssignments(
      [
        { ...base, id: 'forward', routeId: 'route-1', direction: 'forward' as const },
        {
          ...base,
          id: 'reverse',
          routeId: 'route-1',
          direction: 'reverse' as const,
          effective_from: '2026-10-01',
        },
      ],
      (assignment) => assignment.routeId,
      (assignment) => assignment.direction,
    );

    expect(groups.map((group) => group.directionScope)).toEqual(['forward', 'reverse']);
  });

  it('defaults a single forward record to outbound only', () => {
    expect(directionScopeFromDirections(['forward'])).toBe('forward');
  });

  it('mirrors outbound endpoints for return unless an override is enabled', () => {
    expect(
      resolveReverseStops({
        customizeReturn: false,
        forwardPickupStopId: 'home',
        forwardDropoffStopId: 'school',
        reversePickupStopId: '',
        reverseDropoffStopId: '',
      }),
    ).toEqual({ pickupStopId: 'school', dropoffStopId: 'home' });

    expect(
      resolveReverseStops({
        customizeReturn: true,
        forwardPickupStopId: 'home',
        forwardDropoffStopId: 'school',
        reversePickupStopId: 'club',
        reverseDropoffStopId: 'caregiver',
      }),
    ).toEqual({ pickupStopId: 'club', dropoffStopId: 'caregiver' });
  });
});
