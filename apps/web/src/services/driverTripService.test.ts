import { describe, expect, it } from 'vitest';
import { mapStartTripError } from '@/services/driverTripService';

describe('driver trip start errors', () => {
  it('maps an existing active driver trip to the required actionable message', () => {
    expect(
      mapStartTripError('You already have an active trip. End it before starting another.'),
    ).toBe('You already have an active trip. End it before starting another.');
  });

  it('keeps bus-in-use and stale-assignment failures distinct', () => {
    expect(mapStartTripError('This bus already has an active trip.')).toContain(
      'This bus already has an active trip',
    );
    expect(mapStartTripError('This assignment is not active today.')).toBe(
      'This assignment is no longer available today. Refresh your assignments.',
    );
  });

  it('does not expose an unknown backend message', () => {
    expect(mapStartTripError('permission denied for secret internal function')).toBe(
      'We could not start this trip. Please try again or contact your transportation admin.',
    );
  });
});
