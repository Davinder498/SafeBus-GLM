import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { DriverTripActionsPage, DriverTripExceptionPage } from './DriverTripActionsPage';
import type { DriverTrip } from '@/types/trips';

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  pause: vi.fn(),
  end: vi.fn(),
  cancel: vi.fn(),
  resume: vi.fn(),
  stopAndConfirm: vi.fn(),
  start: vi.fn(),
  clearTracking: vi.fn(),
  confirmPreTrip: vi.fn(),
  getPreTripConfirmation: vi.fn(),
  recordException: vi.fn(),
  saveTripAction: vi.fn(),
  confirmTripAction: vi.fn(),
}));
vi.mock('@/components/layout/DashboardLayout', () => ({
  DashboardLayout: ({ children }: { children: ReactNode }) => <main>{children}</main>,
  driverNavGroups: [],
}));
vi.mock('@/contexts/DriverTrackingContext', () => ({
  useDriverTracking: () => ({
    trackingToken: 'native-service-active',
    location: { supported: true, stopAndConfirm: mocks.stopAndConfirm, start: mocks.start },
    clearTracking: mocks.clearTracking,
    saveTripAction: mocks.saveTripAction,
    confirmTripAction: mocks.confirmTripAction,
  }),
}));
vi.mock('@/services/driverTripService', () => ({
  fetchActiveDriverTrip: mocks.fetch,
  pauseDriverTrip: mocks.pause,
  endDriverTrip: mocks.end,
  cancelDriverTrip: mocks.cancel,
  resumeDriverTrip: mocks.resume,
}));
vi.mock('@/services/phase6OperationsService', () => ({
  getPreTripConfirmation: mocks.getPreTripConfirmation,
  confirmPreTrip: mocks.confirmPreTrip,
  recordTripException: mocks.recordException,
  operationalTextContainsProhibitedInformation: () => false,
}));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;
let root: Root;
let container: HTMLDivElement;
const trip = {
  id: 'trip-a',
  tenant_id: 'authority-a',
  driver_id: 'driver-a',
  bus_id: 'bus-a',
  route_id: 'route-a',
  route_trip_pattern_id: 'pattern-a',
  driver_route_assignment_id: null,
  bus_number_snapshot: '42',
  trip_name_snapshot: 'Outbound',
  trip_type: 'morning',
  status: 'active',
  service_date: '2026-11-03',
  started_at: '2026-11-03T14:00:00Z',
  ended_at: null,
  created_at: '2026-11-03T14:00:00Z',
  updated_at: '2026-11-03T14:00:00Z',
} satisfies DriverTrip;

beforeEach(() => {
  vi.resetAllMocks();
  mocks.fetch.mockResolvedValue(trip);
  mocks.stopAndConfirm.mockResolvedValue(undefined);
  mocks.pause.mockResolvedValue({ ...trip, status: 'paused' });
  mocks.end.mockResolvedValue({ ...trip, status: 'completed' });
  mocks.cancel.mockResolvedValue({ ...trip, status: 'cancelled' });
  mocks.resume.mockResolvedValue(trip);
  mocks.getPreTripConfirmation.mockResolvedValue(null);
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
    configurable: true,
    value: function (this: HTMLDialogElement) {
      this.setAttribute('open', '');
    },
  });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', {
    configurable: true,
    value: function (this: HTMLDialogElement) {
      this.removeAttribute('open');
    },
  });
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

async function render(exceptions = false) {
  await act(async () =>
    root.render(
      <MemoryRouter initialEntries={['/driver/actions']}>
        <Routes>
          <Route
            path="/driver/actions"
            element={exceptions ? <DriverTripExceptionPage /> : <DriverTripActionsPage />}
          />
          <Route path="/driver" element={<p data-testid="driver-home">Driver home</p>} />
        </Routes>
      </MemoryRouter>,
    ),
  );
}
async function choose(action: string) {
  await act(async () =>
    container.querySelector<HTMLButtonElement>(`[data-testid="driver-${action}-trip"]`)!.click(),
  );
}
async function confirm() {
  await act(async () =>
    document
      .querySelector<HTMLFormElement>('dialog form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })),
  );
}

it.each(['pause', 'end', 'cancel'] as const)(
  'awaits local %s stop before any network request and keeps it off on failure',
  async (action) => {
    await render();
    let resolve!: () => void;
    mocks.stopAndConfirm.mockReturnValue(
      new Promise<void>((done) => {
        resolve = done;
      }),
    );
    await choose(action);
    await confirm();
    expect(mocks.stopAndConfirm).toHaveBeenCalledOnce();
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    expect(mocks.saveTripAction).not.toHaveBeenCalled();
    expect(mocks[action]).not.toHaveBeenCalled();
    mocks.fetch.mockRejectedValueOnce(new Error('Offline'));
    await act(async () => resolve());
    expect(mocks.saveTripAction).toHaveBeenCalledWith(trip, action, null);
    expect(document.querySelector('dialog')?.textContent).toContain(
      'Location sharing stopped on this phone. The trip action has not been confirmed. It is saved for automatic retry while you are signed in. Offline',
    );
    expect(mocks[action]).not.toHaveBeenCalled();
    expect(mocks.start).not.toHaveBeenCalled();
    expect(mocks.clearTracking).not.toHaveBeenCalled();
  },
);

it.each(['pause', 'end', 'cancel'] as const)(
  'completes the authorized %s after the local stop succeeds',
  async (action) => {
    await render();
    await choose(action);
    await confirm();
    expect(mocks[action]).toHaveBeenCalledWith('trip-a', ...(action === 'cancel' ? [null] : []));
    expect(mocks.stopAndConfirm.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.fetch.mock.invocationCallOrder[1],
    );
    expect(container.querySelector('[data-testid="driver-home"]')).not.toBeNull();
    expect(mocks.start).not.toHaveBeenCalled();
    expect(mocks.clearTracking).toHaveBeenCalledTimes(action === 'pause' ? 0 : 1);
  },
);

it('blocks the server operation when the local collector cannot confirm a stop', async () => {
  await render();
  mocks.stopAndConfirm.mockRejectedValue(
    new Error('Could not confirm that location sharing stopped.'),
  );
  await choose('end');
  await confirm();
  expect(mocks.fetch).toHaveBeenCalledTimes(1);
  expect(mocks.end).not.toHaveBeenCalled();
  expect(document.querySelector('dialog [role="alert"]')?.textContent).toContain(
    'Could not confirm',
  );
  expect(document.body.textContent).not.toContain('Location sharing stopped on this phone.');
});

it('keeps local confirmation visible while server preflight is hung', async () => {
  await render();
  mocks.fetch.mockReturnValueOnce(new Promise(() => undefined));
  await choose('end');
  await confirm();
  expect(document.querySelector('dialog [role="status"]')?.textContent).toContain(
    'Location sharing stopped on this phone',
  );
  expect(mocks.end).not.toHaveBeenCalled();
});

it('stops locally but does not mutate a stale or replacement trip', async () => {
  await render();
  mocks.fetch.mockResolvedValueOnce({ ...trip, id: 'replacement-trip' });
  await choose('cancel');
  await confirm();
  expect(mocks.stopAndConfirm).toHaveBeenCalledOnce();
  expect(mocks.cancel).not.toHaveBeenCalled();
  expect(document.querySelector('dialog [role="alert"]')?.textContent).toContain(
    'The trip action has not been confirmed',
  );
});

it('leaves collection off and supports explicit retry when the server mutation fails', async () => {
  await render();
  mocks.end.mockRejectedValueOnce(new Error('Connection lost'));
  await choose('end');
  await confirm();
  expect(document.querySelector('dialog [role="alert"]')?.textContent).toContain(
    'The trip action has not been confirmed',
  );
  expect(mocks.clearTracking).not.toHaveBeenCalled();
  expect(mocks.start).not.toHaveBeenCalled();
  await confirm();
  expect(mocks.end).toHaveBeenCalledTimes(2);
  expect(container.querySelector('[data-testid="driver-home"]')).not.toBeNull();
});

it.each(['failed', 'pending'] as const)(
  'keeps local stop reachable when initial trip loading is %s',
  async (load) => {
    mocks.fetch.mockImplementation(() =>
      load === 'failed' ? Promise.reject(new Error('Offline')) : new Promise(() => undefined),
    );
    await render();
    const stop = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent === 'Stop location sharing on this phone',
    );
    expect(stop).toBeDefined();
    await act(async () => stop!.click());
    expect(mocks.stopAndConfirm).toHaveBeenCalledOnce();
    expect(container.querySelector('[role="status"]')?.textContent).toContain(
      'Location sharing stopped on this phone',
    );
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    expect(mocks.start).not.toHaveBeenCalled();
  },
);

it('does not stop collection when the driver dismisses a confirmation', async () => {
  await render();
  await choose('pause');
  const cancel = Array.from(document.querySelectorAll<HTMLButtonElement>('dialog button')).find(
    (button) => button.textContent === 'Go back',
  )!;
  await act(async () => cancel.click());
  expect(mocks.stopAndConfirm).not.toHaveBeenCalled();
  expect(mocks.pause).not.toHaveBeenCalled();
});

it('preserves explicit resume behavior and requires server confirmation first', async () => {
  mocks.fetch.mockResolvedValue({ ...trip, status: 'paused' });
  await render();
  await choose('resume');
  await confirm();
  expect(mocks.stopAndConfirm).not.toHaveBeenCalled();
  expect(mocks.resume).toHaveBeenCalledWith('trip-a');
  expect(mocks.start).toHaveBeenCalledOnce();
  expect(mocks.resume.mock.invocationCallOrder[0]).toBeLessThan(
    mocks.start.mock.invocationCallOrder[0],
  );
});

it('does not stop the collector for pre-trip inspection', async () => {
  await render();
  await choose('confirm-pre');
  await confirm();
  expect(mocks.stopAndConfirm).not.toHaveBeenCalled();
  expect(mocks.confirmPreTrip).toHaveBeenCalledWith('trip-a');
});

it('keeps collection off and reports a durable-storage failure before any trip write', async () => {
  await render();
  mocks.saveTripAction.mockImplementationOnce(() => { throw new Error('This phone could not save the action.'); });
  await choose('end');
  await confirm();
  expect(mocks.stopAndConfirm).toHaveBeenCalledOnce();
  expect(mocks.fetch).toHaveBeenCalledTimes(1);
  expect(mocks.end).not.toHaveBeenCalled();
  expect(mocks.start).not.toHaveBeenCalled();
  expect(document.querySelector('dialog')?.textContent).toContain('Location sharing stopped on this phone');
  expect(document.querySelector('dialog')?.textContent).toContain('could not save');
  expect(document.querySelector('dialog')?.textContent).not.toContain('saved for automatic retry');
});
