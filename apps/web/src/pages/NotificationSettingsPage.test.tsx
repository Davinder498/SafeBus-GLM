import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GuardianDeliveryPreferences } from '@safebus/types';
import { NotificationSettingsPage } from './NotificationSettingsPage';

const mocks = vi.hoisted(() => ({ fetch: vi.fn(), save: vi.fn() }));
vi.mock('@/contexts/useAuth', () => ({ useAuth: () => ({ profile: { role: 'guardian' } }) }));
vi.mock('@/components/layout/DashboardLayout', () => ({
  DashboardLayout: ({ children }: { children: ReactNode }) => <>{children}</>,
  adminNavGroups: [],
  guardianNavGroups: [],
  platformNavGroups: [],
}));
vi.mock('@/services/notificationService', () => ({
  fetchGuardianDeliveryPreferences: mocks.fetch,
  saveGuardianDeliveryPreferences: mocks.save,
}));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

const initial: GuardianDeliveryPreferences = {
  inAppEnabled: true,
  pushEnabled: true,
  emailEnabled: true,
  pickupDropoff: { inApp: true, push: true, email: true },
  tripUpdates: { inApp: true, push: true, email: false },
  operationalAlerts: { inApp: true, push: true, email: false },
};
let root: Root;
let container: HTMLDivElement;
function control(label: string) {
  const button = container.querySelector<HTMLButtonElement>(
    `[role="switch"][aria-label="${label}"]`,
  );
  if (!button) throw new Error(`Missing switch: ${label}`);
  return button;
}
async function click(label: string) {
  await act(async () => control(label).click());
}
async function render() {
  await act(async () => root.render(<NotificationSettingsPage />));
}

beforeEach(() => {
  mocks.fetch.mockReset().mockResolvedValue(structuredClone(initial));
  mocks.save.mockReset().mockImplementation(async (value) => value);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

describe('guardian channel settings', () => {
  it('uses switches and retains category choices while a master is off', async () => {
    await render();
    expect(container.querySelectorAll('[role="switch"]')).toHaveLength(12);
    expect(container.querySelectorAll('input[type="checkbox"]')).toHaveLength(0);
    await click('In-app notifications');
    expect(control('Trip updates in-app').disabled).toBe(true);
    expect(control('Trip updates in-app').getAttribute('aria-checked')).toBe('true');
    const saved = mocks.save.mock.calls[0][0] as GuardianDeliveryPreferences;
    expect(saved).toEqual({ ...initial, inAppEnabled: false });
    expect(control('Email notifications').getAttribute('aria-checked')).toBe('true');
    expect(control('Push notifications').getAttribute('aria-checked')).toBe('true');
    await click('In-app notifications');
    expect(control('Trip updates in-app').disabled).toBe(false);
  });

  it('serializes rapid changes against the last successful save', async () => {
    let finish!: (value: GuardianDeliveryPreferences) => void;
    mocks.save.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    await render();
    await click('Trip updates in-app');
    await click('Operational alerts email');
    expect(mocks.save).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain('Saving');
    await act(async () => finish(mocks.save.mock.calls[0][0]));
    expect(mocks.save).toHaveBeenCalledTimes(2);
    const final = mocks.save.mock.calls[1][0] as GuardianDeliveryPreferences;
    expect(final.tripUpdates.inApp).toBe(false);
    expect(final.operationalAlerts.email).toBe(true);
    expect(final.tripUpdates.push).toBe(true);
    expect(container.textContent).toContain('Saved');
  });

  it('rolls back a failed selection before saving the next independent choice', async () => {
    mocks.save.mockRejectedValueOnce(new Error('Could not save preference'));
    await render();
    await click('Pickup & drop-off in-app');
    expect(control('Pickup & drop-off in-app').getAttribute('aria-checked')).toBe('true');
    expect(container.textContent).toContain('Could not save preference');
    await click('Trip updates email');
    expect(mocks.save.mock.calls[1][0].pickupDropoff.inApp).toBe(true);
    expect(mocks.save.mock.calls[1][0].tripUpdates.email).toBe(true);
  });
});
