import { act, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Routes, Route } from 'react-router';
import { expect, it, vi } from 'vitest';
import { PlatformTenantDetailPage } from './PlatformTenantDetailPage';
import { downloadExecutedAgreementPdf } from '@/services/districtAgreementService';

vi.mock('@/components/layout/DashboardLayout', () => ({
  DashboardLayout: ({ children }: { children: ReactNode }) => <>{children}</>,
  platformNavItems: [],
}));
vi.mock('@/components/subscription/SubscriptionOverview', () => ({
  SubscriptionOverview: () => null,
}));
vi.mock('@/components/subscription/InvoiceBillingPlatformCard', () => ({
  InvoiceBillingPlatformCard: () => null,
}));
vi.mock('@/services/onboardingService', () => ({
  fetchPlatformTenantSummaries: vi.fn(async () => [
    { tenant_id: 'authority-a', tenant_name: 'Authority A', tenant_status: 'active' },
  ]),
  fetchPlatformFirstAdminInvitations: vi.fn(async () => []),
  emergencyRecovery: vi.fn(),
  updateInvitation: vi.fn(),
  updateTenantLifecycle: vi.fn(),
}));
vi.mock('@/services/subscriptionService', () => ({
  fetchPlatformTenantBillingDetail: vi.fn(async () => {
    throw new Error('Billing unavailable');
  }),
  mutatePlatformSubscription: vi.fn(),
}));
vi.mock('@/services/districtAgreementService', () => ({
  getPlatformAgreement: vi.fn(async () => ({
    status: 'issued',
    version: '2.1',
    receipts: [
      {
        id: 'accepted-old',
        signed_at: '2026-11-01T12:00:00Z',
        receipt_sha256: 'a'.repeat(64),
        bundle_sha256: 'b'.repeat(64),
        actor_email: 'admin@example.test',
      },
    ],
  })),
  downloadExecutedAgreementPdf: vi.fn(async () => {}),
  downloadExecutedAgreementArchive: vi.fn(async () => {}),
}));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;
it('keeps the selected authority agreement downloadable when billing details fail', async () => {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/admin/tenants/authority-a']}>
          <Routes>
            <Route path="/admin/tenants/:tenantId" element={<PlatformTenantDetailPage />} />
          </Routes>
        </MemoryRouter>,
      );
    });
    expect(container.textContent).toContain('Accepted agreements');
    const button = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent === 'Download executed PDF',
    );
    expect(button).toBeTruthy();
    await act(async () => {
      button!.click();
    });
    expect(downloadExecutedAgreementPdf).toHaveBeenCalledWith('accepted-old');
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
});
