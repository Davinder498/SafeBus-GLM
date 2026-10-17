import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { DirectionalStudentBusAssignmentForm } from './DirectionalStudentBusAssignmentForm';
import { StudentBusAssignmentForm } from './StudentBusAssignmentForm';
import type { BusServiceOption } from '@/services/studentBusAssignmentService';
import type { StudentBusAssignment } from '@/types/transportation';

vi.mock('./StudentSearchPicker', () => ({ StudentSearchPicker: () => null }));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;
const services = ['forward', 'reverse'].map((direction) => ({
  id: direction,
  tenant_id: 'tenant',
  bus_id: 'bus',
  route_id: 'route',
  direction,
  route_trip_pattern_id: direction,
  bus_capacity: 20,
  bus_number: 'B1',
  route_code: 'R1',
  route_name: 'Route',
})) as BusServiceOption[];
const assignments = (seat = 12): StudentBusAssignment[] =>
  services.map((s) => ({
    id: `assignment-${s.id}`,
    tenant_id: 'tenant',
    student_id: 'student',
    seat_number: seat,
    bus_route_assignment_id: s.id,
    route_trip_pattern_id: s.id,
    effective_from: '2090-01-01',
    effective_to: null,
    pickup_stop_id: null,
    dropoff_stop_id: null,
    status: 'active',
    created_at: '',
    updated_at: '',
  }));
let container: HTMLDivElement;
let root: Root;
const save = vi.fn();
beforeEach(() => {
  save.mockReset().mockResolvedValue(undefined);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});
async function render(rows: StudentBusAssignment[] = []) {
  await act(async () =>
    root.render(
      <DirectionalStudentBusAssignmentForm
        services={services}
        stops={[]}
        assignments={rows}
        fixedStudentId="student"
        studentLabel="Avery"
        fixedRouteId="route"
        onSubmit={save}
        onCancel={() => undefined}
      />,
    ),
  );
}
async function seat(value: string) {
  const input = container.querySelector('input[inputmode="numeric"]') as HTMLInputElement;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
async function submit() {
  await act(async () =>
    container
      .querySelector('form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })),
  );
}
it('assigns both directions with an optional seat and persists the edit value on remount', async () => {
  await render();
  await submit();
  expect(save).toHaveBeenLastCalledWith(
    expect.objectContaining({ seatNumber: null, directionScope: 'both' }),
  );
  await seat('12');
  await submit();
  expect(save).toHaveBeenLastCalledWith(expect.objectContaining({ seatNumber: 12 }));
  await act(async () => root.unmount());
  root = createRoot(container);
  await render(assignments());
  expect((container.querySelector('input[inputmode="numeric"]') as HTMLInputElement).value).toBe(
    '12',
  );
  await seat('15');
  await submit();
  expect(save).toHaveBeenLastCalledWith(expect.objectContaining({ seatNumber: 15 }));
  await seat('');
  await submit();
  expect(save).toHaveBeenLastCalledWith(expect.objectContaining({ seatNumber: null }));
});
it('rejects invalid and above-capacity numbers and keeps server conflict errors visible', async () => {
  await render();
  await seat('21');
  await submit();
  expect(save).not.toHaveBeenCalled();
  expect(container.textContent).toContain('capacity (20)');
  await seat('1.5');
  await submit();
  expect(save).not.toHaveBeenCalled();
  save.mockRejectedValueOnce(new Error('That seat is already assigned.'));
  await seat('12');
  await submit();
  expect(container.textContent).toContain('That seat is already assigned.');
});
it('requires an explicit decision for mixed direction seats, including clearing both', async () => {
  const rows = assignments();
  rows[1].seat_number = 15;
  await render(rows);
  await submit();
  expect(save).not.toHaveBeenCalled();
  const clear = [...container.querySelectorAll('button')].find(
    (b) => b.textContent === 'Clear both seats',
  )!;
  await act(async () => clear.click());
  await submit();
  expect(save).toHaveBeenLastCalledWith(expect.objectContaining({ seatNumber: null }));
});
it('covers the older single-service editor with explicit clearing', async () => {
  await act(async () =>
    root.render(
      <StudentBusAssignmentForm
        assignment={assignments()[0]}
        fixedStudentId="student"
        studentLabel="Avery"
        services={services}
        stops={[]}
        defaultTenantId="tenant"
        onSubmit={save}
        onCancel={() => undefined}
      />,
    ),
  );
  await seat('');
  await submit();
  expect(save).toHaveBeenLastCalledWith(expect.objectContaining({ seat_number: null }));
});
