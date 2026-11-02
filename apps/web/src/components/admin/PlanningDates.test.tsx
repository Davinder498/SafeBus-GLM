import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { BusWorkspaceDriverForm, DriverPlannedBusAssignmentForm } from './BusWorkspaceForms';
import { RouteDriverSetupForm } from './RouteDriverSetupForm';
import type { AdminBusRouteAssignment } from '@/services/adminBusWorkspaceService';
import type { BusServiceOption } from '@/services/studentBusAssignmentService';
import type { PlannedDriverAssignment } from '@/types/driverAssignments';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;
const service: AdminBusRouteAssignment & BusServiceOption = {
  id: 'service',
  tenant_id: 'authority',
  bus_id: 'bus',
  route_id: 'route',
  route_trip_pattern_id: 'outbound',
  trip_type: 'morning',
  status: 'active',
  effective_from: null,
  effective_to: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  route_name: 'Rural',
  route_code: 'R1',
  route_status: 'active',
  trip_name: 'Outbound',
  direction: 'forward',
  has_active_trip: false,
  bus_number: '12',
};
const noop = () => undefined;
let container: HTMLDivElement;
let root: Root;
async function render(form: ReactNode) {
  await act(async () => root.render(form));
}
function dates() {
  return [...container.querySelectorAll<HTMLInputElement>('input[type=date]')].map(
    (input) => input.value,
  );
}
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.useRealTimers();
});

it.each([
  ['2026-01-16T01:00:00Z', '2026-01-15'],
  ['2026-07-16T01:00:00Z', '2026-07-15'],
  ['2026-11-03T01:00:00Z', '2026-11-02'],
  ['2026-11-02T06:30:00Z', '2026-11-02'],
])('defaults both planning workspaces and route setup to Alberta today at %s', async (at, day) => {
  vi.setSystemTime(new Date(at));
  await render(
    <BusWorkspaceDriverForm
      service={service}
      drivers={[]}
      profiles={[]}
      canInviteDriver={false}
      onAddDriver={noop}
      onSubmit={vi.fn()}
      onCancel={noop}
    />,
  );
  expect(dates()).toEqual([day, '']);
  await render(
    <DriverPlannedBusAssignmentForm
      driverId="driver"
      services={[service]}
      onSubmit={vi.fn()}
      onCancel={noop}
    />,
  );
  expect(dates()).toEqual([day, '']);
  await render(
    <RouteDriverSetupForm
      service={service}
      drivers={[]}
      names={new Map()}
      assignments={[]}
      onSaved={noop}
    />,
  );
  expect(dates()).toEqual([day, '']);
});

it('keeps a service starting tomorrow available and defaults the driver plan within its bounds', async () => {
  vi.setSystemTime(new Date('2026-11-03T01:00:00Z'));
  const future = { ...service, effective_from: '2026-11-03', effective_to: '2026-11-30' };
  await render(
    <DriverPlannedBusAssignmentForm
      driverId="driver"
      services={[future]}
      onSubmit={vi.fn()}
      onCancel={noop}
    />,
  );
  expect(dates()).toEqual(['2026-11-03', '2026-11-30']);
});

it('preserves saved calendar dates instead of converting or replacing them with today', async () => {
  vi.setSystemTime(new Date('2026-11-03T01:00:00Z'));
  const assignment: PlannedDriverAssignment = {
    ...service,
    id: 'plan',
    driver_id: 'driver',
    license_plate: null,
    bus_route_assignment_id: service.id,
    effective_from: '2024-02-29',
    effective_to: '2026-11-02',
  };
  await render(
    <DriverPlannedBusAssignmentForm
      driverId="driver"
      assignment={assignment}
      services={[service]}
      onSubmit={vi.fn()}
      onCancel={noop}
    />,
  );
  expect(dates()).toEqual(['2024-02-29', '2026-11-02']);
});
