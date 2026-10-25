import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AdminNotificationSettingsPage } from './AdminNotificationSettingsPage';
const mocks = vi.hoisted(() => ({ fetch: vi.fn(), save: vi.fn() }));
vi.mock('@/components/layout/DashboardLayout', () => ({
  DashboardLayout: ({ children }: { children: ReactNode }) => <>{children}</>,
  adminNavGroups: [],
}));
vi.mock('@/services/notificationService', () => ({
  fetchAdminInboxPreferences: mocks.fetch,
  saveAdminInboxPreferences: mocks.save,
}));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;
const initial = {
  inAppEnabled: true,
  tripUpdates: true,
  operationalAlerts: true,
  deliveryHealth: true,
};
let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
  mocks.fetch.mockReset().mockResolvedValue(initial);
  mocks.save.mockReset();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});
const render = () =>
  act(async () =>
    root.render(
      <MemoryRouter>
        <AdminNotificationSettingsPage />
      </MemoryRouter>,
    ),
  );
const toggle = (name: string) =>
  container.querySelector<HTMLButtonElement>(`[role="switch"][aria-label="${name}"]`)!;
it('edits only personal inbox preferences and keeps master-disabled choices saved', async () => {
  await render();
  expect(container.textContent).not.toMatch(
    /Android push|Email and phone|privacy approval|Delivery activity/,
  );
  expect(toggle('Operational alerts').getAttribute('aria-checked')).toBe('true');
  mocks.save.mockResolvedValue({ ...initial, inAppEnabled: false });
  await act(async () => toggle('In-app notifications').click());
  expect(mocks.save).toHaveBeenCalledWith({ ...initial, inAppEnabled: false });
  expect(toggle('Operational alerts').disabled).toBe(true);
  expect(toggle('Operational alerts').getAttribute('aria-checked')).toBe('true');
});
it('retains saved values and shows a failure when a preference cannot save', async () => {
  await render();
  mocks.save.mockRejectedValue(new Error('Connection failed'));
  await act(async () => toggle('Operational alerts').click());
  expect(container.querySelector('[role="alert"]')?.textContent).toBe('Connection failed');
  expect(toggle('Operational alerts').getAttribute('aria-checked')).toBe('true');
});
