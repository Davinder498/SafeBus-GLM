import { MemoryRouter } from 'react-router';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { RetentionPanel } from './RetentionPanel';
const mocks = vi.hoisted(() => ({ role: 'tenant_admin', list: vi.fn(), action: vi.fn() }));
vi.mock('@/contexts/useAuth', () => ({ useAuth: () => ({ profile: { role: mocks.role } }) }));
vi.mock('@/services/retentionService', () => ({
  listRetentionCases: mocks.list,
  retentionAction: mocks.action,
}));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;
let root: Root;
let container: HTMLDivElement;
const row = {
  id: 'case1',
  reference: 'CASE-1',
  reason: 'incident',
  window_start: '2026-01-01T00:00:00Z',
  window_end: '2026-01-01T01:00:00Z',
  minimum_until: '2026-01-01T00:00:00Z',
  review_at: '2026-01-02T00:00:00Z',
  released_at: null,
  verified_chunks: 0,
};
beforeEach(() => {
  mocks.role = 'tenant_admin';
  mocks.list.mockReset().mockResolvedValue([row]);
  mocks.action.mockReset().mockResolvedValue({});
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});
const click = async (text: string) => {
  const button = [...container.querySelectorAll('button')].find((b) => b.textContent === text);
  expect(button).toBeTruthy();
  await act(async () => button?.click());
};
it.each(['guardian', 'driver', 'school_admin', 'platform_super_admin'])(
  'denies preservation controls to %s',
  async (role) => {
    mocks.role = role;
    await act(async () =>
      root.render(
        <MemoryRouter>
          <RetentionPanel tripId="trip1" />
        </MemoryRouter>,
      ),
    );
    expect(container.textContent).toBe('');
    expect(mocks.list).not.toHaveBeenCalled();
  },
);
it('shows preservation and overdue review without releasing records', async () => {
  await act(async () =>
    root.render(
      <MemoryRouter>
        <RetentionPanel tripId="trip1" />
      </MemoryRouter>,
    ),
  );
  expect(container.textContent).toContain('Preserved');
  expect(container.textContent).toContain('Review due');
  expect(mocks.action).not.toHaveBeenCalled();
});
it('requires explicit release confirmation and respects server results', async () => {
  await act(async () =>
    root.render(
      <MemoryRouter>
        <RetentionPanel tripId="trip1" />
      </MemoryRouter>,
    ),
  );
  await click('Release preservation');
  const release = [...container.querySelectorAll('button')].find(
    (b) => b.textContent === 'Release preservation' && !b.closest('.border-gray-200'),
  );
  expect(release?.disabled).toBe(true);
  const check = container.querySelector<HTMLInputElement>('input[type=checkbox]');
  await act(async () => check?.click());
  const buttons = [...container.querySelectorAll('button')].filter(
    (b) => b.textContent === 'Release preservation',
  );
  await act(async () => buttons.at(-1)?.click());
  expect(mocks.action).toHaveBeenCalledWith('release', { id: 'case1', confirm: 'release' });
  expect(container.textContent).toContain(
    'Normal expiry and other preservation requests still apply.',
  );
});
it('keeps release unavailable before minimum retention and displays failed loading', async () => {
  mocks.list.mockResolvedValue([{ ...row, minimum_until: '2030-01-01T00:00:00Z' }]);
  await act(async () =>
    root.render(
      <MemoryRouter>
        <RetentionPanel />
      </MemoryRouter>,
    ),
  );
  expect(
    [...container.querySelectorAll('button')].find((b) => b.textContent === 'Release preservation')
      ?.disabled,
  ).toBe(true);
  mocks.list.mockRejectedValue(new Error('Preservation unavailable'));
  await click('Refresh');
  expect(container.querySelector('[role=alert]')?.textContent).toBe('Preservation unavailable');
});
