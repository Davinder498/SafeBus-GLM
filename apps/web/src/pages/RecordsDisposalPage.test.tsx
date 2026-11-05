import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router';
import { it, expect, vi, beforeEach, afterEach } from 'vitest';
const m = vi.hoisted(() => ({
  role: 'tenant_admin',
  status: vi.fn(),
  holds: vi.fn(),
  candidates: vi.fn(),
  action: vi.fn(),
}));
vi.mock('@/contexts/useAuth', () => ({ useAuth: () => ({ profile: { role: m.role } }) }));
vi.mock('@/components/layout/DashboardLayout', () => ({
  DashboardLayout: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
  adminNavGroups: [],
  platformNavGroups: [],
}));
vi.mock('@/services/disposalService', () => ({
  fetchDisposalStatus: m.status,
  fetchDisposalHolds: m.holds,
  fetchDisposalCandidates: m.candidates,
  disposalAction: m.action,
}));
import { RecordsDisposalPage } from './RecordsDisposalPage';
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;
let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  m.role = 'tenant_admin';
  m.status.mockReset().mockResolvedValue({
    enabled: false,
    lastRun: null,
    activeHolds: 1,
    reviewDue: 1,
    pendingAccounts: 0,
    totals: [],
    extensions: [],
  });
  m.holds.mockReset().mockResolvedValue([
    {
      id: 'hold',
      policy_key: 'student_records',
      record_id: 'record',
      reference: 'CASE-1',
      minimum_until: '2020-01-01',
      review_at: '2020-01-01',
      released_at: null,
      created_at: '2020-01-01',
    },
  ]);
  m.candidates.mockReset().mockResolvedValue([]);
  m.action.mockReset();
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
        <RecordsDisposalPage />
      </MemoryRouter>,
    ),
  );
it.each(['guardian', 'driver', 'school_admin'])('no disposal access for %s', async (role) => {
  m.role = role;
  await render();
  expect(container.textContent).toBe('');
  expect(m.status).not.toHaveBeenCalled();
});
it('platform sees aggregate activity without customer exports or preservation', async () => {
  m.role = 'platform_super_admin';
  await render();
  expect(container.textContent).toContain('Automatic disposal');
  expect(container.textContent).not.toContain('Download selected record');
  expect(m.holds).not.toHaveBeenCalled();
  expect(m.candidates).not.toHaveBeenCalled();
});
it('keeps release explicit and shows failures rather than success', async () => {
  await render();
  expect(container.textContent).toContain('Not activated');
  const release = [...container.querySelectorAll('button')].find(
    (b) => b.textContent === 'Release record preservation',
  );
  await act(async () => release?.click());
  const confirm = [...container.querySelectorAll('button')].find(
    (b) => b.textContent === 'Confirm record release',
  );
  expect(confirm?.disabled).toBe(true);
  expect(m.action).not.toHaveBeenCalled();
});
it('clears cached lists and totals when authorization cannot be verified', async () => {
  await render();
  m.status.mockRejectedValue(new Error('Access unavailable'));
  await act(async () =>
    [...container.querySelectorAll('button')]
      .find((b) => b.textContent === 'Refresh disposal')
      ?.click(),
  );
  expect(container.textContent).toContain('Access unavailable');
  expect(container.textContent).not.toContain('CASE-1');
});
