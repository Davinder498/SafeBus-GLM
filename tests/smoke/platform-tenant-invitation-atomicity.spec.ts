import { expect, test, type Page, type Route } from '@playwright/test';

const platformUser = {
  id: 'aa000000-0000-0000-0000-000000000001',
  email: 'platform-admin@example.test',
  aud: 'authenticated',
  role: 'authenticated',
  app_metadata: {},
  user_metadata: {},
  created_at: '2026-07-19T00:00:00.000Z',
};

const createdTenant = {
  tenant_id: 'aa000000-0000-0000-0000-000000000010',
  tenant_name: 'Successful Transit',
  tenant_type: 'bus_contractor',
  tenant_status: 'active',
  tenant_created_at: '2026-07-19T00:00:00.000Z',
  first_tenant_admin_profile_id: 'aa000000-0000-0000-0000-000000000011',
  first_tenant_admin_name: 'Successful Admin',
  first_tenant_admin_email: 'successful.admin@example.test',
  tenant_admin_status: 'invited',
  active_tenant_admin_count: 0,
  latest_invitation_status: 'pending',
  latest_invitation_at: '2026-07-19T00:00:00.000Z',
  setup_readiness: 'not_started',
  has_buses: false,
  has_drivers: false,
  has_routes: false,
  has_students: false,
  last_onboarding_activity_at: '2026-07-19T00:00:00.000Z',
};

const pendingInvitation = {
  invitation_id: 'aa000000-0000-0000-0000-000000000012',
  tenant_id: createdTenant.tenant_id,
  status: 'pending',
  invited_profile_id: createdTenant.first_tenant_admin_profile_id,
  last_sent_at: '2026-07-19T00:00:00.000Z',
  expires_at: '2026-07-26T00:00:00.000Z',
  delivery_status: 'sent',
};

async function installPlatformMock(
  page: Page,
  outcome: 'success' | 'failure' | 'resend' | 'recovery',
) {
  let tenantCreated = outcome === 'resend' || outcome === 'recovery';
  let invitationStatus = pendingInvitation.status;
  let resendRequests = 0;
  let recoveryRequests = 0;
  let administratorRecovered = false;

  await page.addInitScript(
    ({ user }) => {
      const session = {
        access_token: ['eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9', 'eyJzdWIiOiIwMDAwMDAwMC0wMDAwLTAwMDAtMDAwMC0wMDAwMDAwMDAwMDAiLCJyb2xlIjoiYXV0aGVudGljYXRlZCIsImFhbCI6ImFhbDIiLCJhbXIiOlt7Im1ldGhvZCI6InRvdHAiLCJ0aW1lc3RhbXAiOjQxMDI0NDAwMDB9XSwiZXhwIjo0MTAyNDQ0ODAwfQ', 'smoke-test-signature'].join('.'),
        refresh_token: 'platform-refresh-token',
        token_type: 'bearer',
        expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        user,
      };
      for (const key of [
        'supabase.auth.token',
        'sb-placeholder-auth-token',
        'sb-bppmqykkbhrmotcybxrh-auth-token',
        'sb-localhost-auth-token',
      ]) {
        window.localStorage.setItem(key, JSON.stringify(session));
      }
    },
    { user: platformUser },
  );

  await page.route('**/.netlify/functions/safebus-onboarding', async (route) => {
    const body = route.request().postDataJSON() as {
      kind?: string;
      action?: string;
      invitationId?: string;
      profileId?: string;
    };
    if (body.kind === 'invitationAction' && body.action === 'resend') {
      resendRequests += 1;
      invitationStatus = 'resent';
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'resent' }),
      });
      return;
    }
    if (body.kind === 'emergencyRecovery') {
      recoveryRequests += 1;
      administratorRecovered = true;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          status: 'active',
          profileId: body.profileId,
          tenantId: createdTenant.tenant_id,
        }),
      });
      return;
    }

    if (outcome === 'failure') {
      await route.fulfill({
        status: 409,
        contentType: 'application/json',
        body: JSON.stringify({
          error:
            'The invitation email was not sent and no tenant was created. This email may already belong to another SafeBus account.',
        }),
      });
      return;
    }

    tenantCreated = true;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        tenant: {
          id: createdTenant.tenant_id,
          name: createdTenant.tenant_name,
          status: 'active',
        },
        school: null,
        invitationStatus: 'sent',
        recipientEmail: createdTenant.first_tenant_admin_email,
      }),
    });
  });

  await page.route('**/*', async (route: Route) => {
    const url = new URL(route.request().url());
    if (!url.hostname.endsWith('.supabase.co')) {
      await route.fallback();
      return;
    }

    const method = route.request().method();
    const path = url.pathname;
    if (path.startsWith('/auth/v1/')) {
      if (path.endsWith('/user') && method === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(platformUser),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ user: platformUser }),
      });
      return;
    }

    if (path.includes('/rest/v1/profiles') && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: platformUser.id,
          tenant_id: null,
          school_id: null,
          full_name: 'Platform Admin',
          email: platformUser.email,
          role: 'platform_super_admin',
          status: 'active',
          created_at: platformUser.created_at,
          updated_at: platformUser.created_at,
        }),
      });
      return;
    }

    if (path.includes('/rest/v1/rpc/get_platform_tenant_onboarding_summary_secure')) {
      const tenantSummary =
        outcome === 'recovery'
          ? {
              ...createdTenant,
              tenant_admin_status: administratorRecovered ? 'active' : 'disabled',
              active_tenant_admin_count: administratorRecovered ? 1 : 0,
            }
          : createdTenant;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(tenantCreated ? [tenantSummary] : []),
      });
      return;
    }

    if (path.includes('/rest/v1/rpc/get_platform_first_admin_invitation_status')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(
          tenantCreated ? [{ ...pendingInvitation, status: invitationStatus }] : [],
        ),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: path.includes('/rpc/') ? '{}' : '[]',
    });
  });

  return {
    resendRequestCount: () => resendRequests,
    recoveryRequestCount: () => recoveryRequests,
  };
}

async function fillTenantForm(page: Page) {
  await page.getByPlaceholder('Tenant name').fill('Successful Transit');
  await page.getByPlaceholder('Tenant admin full name').fill('Successful Admin');
  await page.getByPlaceholder('Tenant admin email').fill('successful.admin@example.test');
}

test.describe('platform tenant invitation atomicity', () => {
  test('failed invitation shows the provider error without adding a tenant card', async ({
    page,
  }) => {
    await installPlatformMock(page, 'failure');
    await page.goto('/admin/tenants');
    await fillTenantForm(page);
    await page.getByRole('button', { name: 'Create tenant and send invitation' }).click();

    await expect(page.getByRole('alert')).toContainText(
      'invitation email was not sent and no tenant was created',
    );
    await expect(page.getByRole('heading', { name: 'Successful Transit' })).toHaveCount(0);
  });

  test('successful invitation displays confirmation and then adds the tenant card', async ({
    page,
  }) => {
    await installPlatformMock(page, 'success');
    await page.goto('/admin/tenants');
    await fillTenantForm(page);
    await page.getByRole('button', { name: 'Create tenant and send invitation' }).click();

    await expect(page.getByRole('status')).toContainText(
      'Invitation email sent to successful.admin@example.test',
    );
    await expect(page.getByRole('heading', { name: 'Successful Transit' })).toBeVisible();
    await expect(page.getByText('Password setup pending')).toBeVisible();
  });

  test('platform super admin can resend a pending tenant-admin invitation', async ({ page }) => {
    const state = await installPlatformMock(page, 'resend');
    await page.goto('/admin/tenants');

    await page.getByRole('button', { name: 'Resend' }).click();

    await expect(page.getByRole('status')).toContainText(
      `A new password setup email was sent to ${createdTenant.first_tenant_admin_email}`,
    );
    expect(state.resendRequestCount()).toBe(1);
    await expect(page.getByText(/First administrator · resent/)).toBeVisible();
  });

  test('platform super admin can perform emergency recovery for the first administrator', async ({ page }) => {
    const state = await installPlatformMock(page, 'recovery');
    await page.goto('/admin/tenants');

    await page.getByRole('button', { name: 'Emergency recovery' }).click();

    await expect(page.getByRole('status')).toContainText(
      `Emergency access restored for ${createdTenant.first_tenant_admin_email}`,
    );
    expect(state.recoveryRequestCount()).toBe(1);
    await expect(page.getByRole('button', { name: 'Emergency recovery' })).toHaveCount(0);
  });
});
