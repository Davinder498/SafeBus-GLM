import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { DistrictAgreementsPage } from './DistrictAgreementsPage';
import { getDistrictAgreement, acceptDistrictAgreement, type DistrictAgreement } from '@/services/districtAgreementService';
import type * as AgreementService from '@/services/districtAgreementService';

vi.mock('@/components/layout/DashboardLayout', () => ({
  DashboardLayout: ({ children }: { children: ReactNode }) => <>{children}</>, adminNavGroups: [],
}));
vi.mock('@/contexts/useAuth', () => ({ useAuth: () => ({
  profile: { role: 'tenant_admin' }, mfaStatus: { currentLevel: 'aal2' },
}) }));
vi.mock('@/services/districtAgreementService', async importOriginal => ({
  ...await importOriginal<typeof AgreementService>(),
  getDistrictAgreement: vi.fn(), listMyAgreementReceipts: vi.fn(async () => []),
  acceptDistrictAgreement: vi.fn(),
}));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root;
let container: HTMLDivElement;
function agreement(revision = 1): DistrictAgreement {
  return { id: `package-${revision}`, status: 'issued', tenant_name: 'Synthetic Authority',
    version: String(revision), bundle_sha256: String(revision).repeat(64),
    documents: ['msa','dpa','order_form','security','sla','acceptable_use','data_return','suppliers']
      .map(kind => ({ id: kind, kind, title: kind, version: String(revision),
        sha256: 'a'.repeat(64), body: `Synthetic ${kind} terms` })),
  };
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getDistrictAgreement).mockResolvedValue(agreement());
  container = document.createElement('div'); document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });
async function render() { await act(async () => root.render(<MemoryRouter><DistrictAgreementsPage /></MemoryRouter>)); }
async function refresh() {
  const button = [...container.querySelectorAll('button')].find(b => b.textContent === 'Refresh status')!;
  await act(async () => button.click());
}

it('requires fresh affirmative consent after refreshing to a replacement supplier package', async () => {
  await render();
  for (const box of container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')) {
    await act(async () => box.click());
  }
  expect(container.querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled).toBe(false);
  vi.mocked(getDistrictAgreement).mockResolvedValue(agreement(2));
  await refresh();
  expect(container.textContent).toContain('Package version 2');
  expect([...container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')].every(b => !b.checked)).toBe(true);
  expect(container.querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled).toBe(true);
  await act(async () => container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
  expect(acceptDistrictAgreement).not.toHaveBeenCalled();
});

it('removes stale acceptance controls when refreshed agreement verification fails', async () => {
  await render();
  vi.mocked(getDistrictAgreement).mockRejectedValue(new Error('Unable to securely load the agreement.'));
  await refresh();
  expect(container.textContent).toContain('Agreement unavailable');
  expect(container.textContent).not.toContain('Agreement not yet published');
  expect(container.querySelector('form')).toBeNull();
});

it.each(['unknown-kind', 'empty-body', 'invalid-digest', 'duplicate-id'])(
  'does not offer acceptance for an incomplete package: %s', async fault => {
    const value = agreement();
    if (fault === 'unknown-kind') value.documents[7].kind = 'unknown';
    if (fault === 'empty-body') value.documents[7].body = ' ';
    if (fault === 'invalid-digest') value.documents[7].sha256 = 'invalid';
    if (fault === 'duplicate-id') value.documents[7].id = value.documents[0].id;
    vi.mocked(getDistrictAgreement).mockResolvedValue(value);
    await render();
    expect(container.textContent).toContain('This agreement package is incomplete');
    expect(container.querySelector('form')).toBeNull();
  },
);
