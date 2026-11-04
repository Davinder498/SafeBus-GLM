import { getVisibleProfiles, getVisibleSchools } from './adminOrganizationService';
import { fetchAdminAssignments } from './driverAssignmentService';
import { fetchAdminBusServices } from './studentBusAssignmentService';
import { getVisibleRouteServiceDays } from './phase6OperationsService';
import { getVisibleBuses, getVisibleDrivers, getVisibleRoutes, getVisibleRouteStops,
  getVisibleRouteTripPatterns, getVisibleRouteTripStopSchedules } from './transportationStructureService';

export async function fetchAdminRouteDetail(
  routeId: string,
  returned: { busId?: string | null; driverId?: string | null } = {},
) {
  const validId = (id: string | null | undefined) => id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) ? [id] : [];
  const [routes, stops, schools, assignments, busServices, tripPatterns, schedules, serviceDays] =
    await Promise.all([
      getVisibleRoutes([routeId]), getVisibleRouteStops([routeId]), getVisibleSchools(),
      fetchAdminAssignments(routeId), fetchAdminBusServices(routeId),
      getVisibleRouteTripPatterns([routeId]), getVisibleRouteTripStopSchedules([routeId]),
      getVisibleRouteServiceDays(routeId),
    ]);
  const route = routes.find((item) => item.id === routeId);
  if (!route) return null;
  const [buses, drivers] = await Promise.all([
    getVisibleBuses([...busServices.map((s) => s.bus_id), ...validId(returned.busId)]),
    getVisibleDrivers([...assignments.map((a) => a.driver_id), ...validId(returned.driverId)]),
  ]);
  const profiles = await getVisibleProfiles(drivers.map((d) => d.profile_id));
  return { route, stops: stops.filter((s) => s.status !== 'archived'), schools, buses, drivers,
    assignments: assignments.filter((a) => a.status === 'active'),
    busServices: busServices.filter((s) => s.status === 'active'), profiles, tripPatterns,
    schedules, serviceDays };
}
