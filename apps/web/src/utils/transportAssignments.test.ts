import { describe, expect, it } from 'vitest';
import type { DriverRouteAssignment } from '@/types/driverAssignments';
import type { BusServiceOption } from '@/services/studentBusAssignmentService';
import { activeDriverForBusService } from '@/utils/transportAssignments';

const service = {
  id: 'service-1',
  tenant_id: 'tenant-1',
  bus_id: 'bus-1',
  route_id: 'route-1',
  route_trip_pattern_id: 'pattern-1',
  trip_type: 'morning',
  trip_name: 'Outbound',
  direction: 'forward',
  effective_from: '2026-01-01',
  effective_to: null,
  status: 'active',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  bus_number: '42',
  route_name: 'West Route',
  route_code: 'WEST',
} satisfies BusServiceOption;

function assignment(overrides: Partial<DriverRouteAssignment> = {}): DriverRouteAssignment {
  return {
    id: 'assignment-1',
    tenant_id: 'tenant-1',
    driver_id: 'driver-1',
    bus_id: 'bus-1',
    route_id: 'route-1',
    route_trip_pattern_id: 'pattern-1',
    bus_route_assignment_id: 'service-1',
    trip_type: 'morning',
    status: 'active',
    effective_from: '2026-01-01',
    effective_to: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('transport assignment joins', () => {
  it('finds the active driver through the bus service reference', () => {
    expect(
      activeDriverForBusService(service, [
        assignment({ status: 'inactive' }),
        assignment({ id: 'active-assignment' }),
      ])?.id,
    ).toBe('active-assignment');
  });

  it('supports compatible legacy assignments without a bus service reference', () => {
    expect(
      activeDriverForBusService(service, [
        assignment({
          id: 'legacy-assignment',
          bus_route_assignment_id: null,
        }),
      ])?.id,
    ).toBe('legacy-assignment');
  });

  it('does not show a driver from another bus or named trip', () => {
    expect(
      activeDriverForBusService(service, [
        assignment({
          bus_route_assignment_id: null,
          bus_id: 'bus-2',
        }),
        assignment({
          id: 'other-trip',
          bus_route_assignment_id: null,
          route_trip_pattern_id: 'pattern-2',
        }),
      ]),
    ).toBeNull();
  });
});
