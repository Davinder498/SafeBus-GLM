import { beforeEach, expect, it, vi } from 'vitest';
import { fetchAdminRouteDetail } from './adminRouteDetailService';
const mocks = vi.hoisted(() => ({
  getVisibleRoutes: vi.fn(), getVisibleRouteStops: vi.fn(), getVisibleSchools: vi.fn(),
  fetchAdminAssignments: vi.fn(), fetchAdminBusServices: vi.fn(),
  getVisibleRouteTripPatterns: vi.fn(), getVisibleRouteTripStopSchedules: vi.fn(),
  getVisibleRouteServiceDays: vi.fn(), getVisibleBuses: vi.fn(), getVisibleDrivers: vi.fn(),
  getVisibleProfiles: vi.fn(),
}));
vi.mock('./adminOrganizationService', () => mocks);
vi.mock('./driverAssignmentService', () => mocks);
vi.mock('./studentBusAssignmentService', () => mocks);
vi.mock('./phase6OperationsService', () => mocks);
vi.mock('./transportationStructureService', () => mocks);
beforeEach(() => {
  vi.clearAllMocks();
  for (const mock of Object.values(mocks)) mock.mockResolvedValue([]);
  mocks.getVisibleRoutes.mockResolvedValue([{ id: 'route' }]);
  mocks.fetchAdminAssignments.mockResolvedValue([{ id: 'plan', driver_id: 'driver', status: 'active' }]);
  mocks.fetchAdminBusServices.mockResolvedValue([{ id: 'service', bus_id: 'bus', status: 'active' }]);
  mocks.getVisibleDrivers.mockResolvedValue([{ id: 'driver', profile_id: 'profile' }]);
});
it('scopes route data at the server and loads only related references', async () => {
  await fetchAdminRouteDetail('route');
  for (const method of ['getVisibleRoutes', 'getVisibleRouteStops', 'getVisibleRouteTripPatterns',
    'getVisibleRouteTripStopSchedules'] as const) expect(mocks[method]).toHaveBeenCalledWith(['route']);
  expect(mocks.fetchAdminAssignments).toHaveBeenCalledWith('route');
  expect(mocks.fetchAdminBusServices).toHaveBeenCalledWith('route');
  expect(mocks.getVisibleRouteServiceDays).toHaveBeenCalledWith('route');
  expect(mocks.getVisibleBuses).toHaveBeenCalledWith(['bus']);
  expect(mocks.getVisibleDrivers).toHaveBeenCalledWith(['driver']);
  expect(mocks.getVisibleProfiles).toHaveBeenCalledWith(['profile']);
});
it('returns unavailable without fetching reference directories for an inaccessible route', async () => {
  mocks.getVisibleRoutes.mockResolvedValue([]);
  expect(await fetchAdminRouteDetail('missing')).toBeNull();
  expect(mocks.getVisibleBuses).not.toHaveBeenCalled();
  expect(mocks.getVisibleDrivers).not.toHaveBeenCalled();
});
it('does not submit malformed returned references to the database', async () => {
  await fetchAdminRouteDetail('route', { busId: 'invalid', driverId: 'invalid' });
  expect(mocks.getVisibleBuses).toHaveBeenCalledWith(['bus']);
  expect(mocks.getVisibleDrivers).toHaveBeenCalledWith(['driver']);
});
