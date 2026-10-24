import AxeBuilder from '@axe-core/playwright';
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
  outcome: 'success' | 'failure' | 'resend' | 'recovery' | 'expired',
) {
  let tenantCreated = ['resend', 'recovery', 'expired'].includes(outcome);
  let invitationStatus = outcome === 'expired' ? 'expired' : pendingInvitation.status;
  let resendRequests = 0;
  let recoveryRequests = 0;
  let administratorRecovered = false;

  await page.addInitScript(
    ({ user }) => {
      const session = {
        access_token: [
          'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9',
          'eyJzdWIiOiIwMDAwMDAwMC0wMDAwLTAwMDAtMDAwMC0wMDAwMDAwMDAwMDAiLCJyb2xlIjoiYXV0aGVudGljYXRlZCIsImFhbCI6ImFhbDIiLCJhbXIiOlt7Im1ldGhvZCI6InRvdHAiLCJ0aW1lc3RhbXAiOjQxMDI0NDAwMDB9XSwiZXhwIjo0MTAyNDQ0ODAwfQ',
          'smoke-test-signature',
        ].join('.'),
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
    if (body.kind === 'invitationAction' && body.action === 'reissue') {
      invitationStatus = 'pending';
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'pending' }),
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
            'The invitation email was not sent and no school authority was created. This email may already belong to another SafeBus account.',
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
        invitationStatus: 'sent',
        recipientEmail: createdTenant.first_tenant_admin_email,
      }),
    });
  });

  await page.route('**/.netlify/functions/platform-subscriptions', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ prices: [] }),
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
          : outcome === 'expired'
            ? {
                ...createdTenant,
                tenant_admin_status: invitationStatus === 'expired' ? 'disabled' : 'invited',
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

    if (path.includes('/rest/v1/rpc/get_platform_subscription_summaries')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(
          tenantCreated
            ? [
                {
                  tenant_id: createdTenant.tenant_id,
                  configured: false,
                  subscription_status: null,
                  licensed_bus_count: null,
                  active_bus_count: 0,
                  current_period_end: null,
                  billing_warning: false,
                },
              ]
            : [],
        ),
      });
      return;
    }

    if (path.includes('/rest/v1/rpc/get_platform_tenant_billing_detail')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          configured: false,
          tenant_id: createdTenant.tenant_id,
          tenant_name: createdTenant.tenant_name,
          tenant_type: createdTenant.tenant_type,
          tenant_status: createdTenant.tenant_status,
          active_bus_count: 0,
          billing_warning: false,
        }),
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
  await expect(page.getByLabel('School authority type')).toHaveValue('school_group');
  await expect(
    page.getByLabel('School authority type').locator('option[value="bus_contractor"]'),
  ).toHaveCount(0);
  await page.getByPlaceholder('School authority name').fill('Successful Transit');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByPlaceholder('School authority admin full name').fill('Successful Admin');
  await page.getByPlaceholder('School authority admin email').fill('successful.admin@example.test');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
}

test.describe('platform tenant invitation atomicity', () => {
  test('review supports editing, accessible hints and a recoverable configuration error', async ({
    page,
  }, testInfo) => {
    // This full journey includes two accessibility scans and three screenshots.
    test.setTimeout(60_000);
    await installPlatformMock(page, 'success');
    let attempts = 0;
    await page.route('**/.netlify/functions/safebus-onboarding', async (route) => {
      attempts += 1;
      if (attempts > 1) return route.fallback();
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 'invitation_redirect_not_allowed',
          error: 'The account setup address has not been approved. No invitation was sent.',
        }),
      });
    });
    await page.goto('/admin/tenants');
    await fillTenantForm(page);
    const wizard = page.getByRole('form', { name: 'Invite a school authority' });
    await wizard.getByRole('button', { name: 'Edit school authority admin', exact: true }).click();
    await expect(wizard.getByLabel('School authority admin full name')).toHaveValue(
      'Successful Admin',
    );
    await expect(wizard.getByLabel('School authority admin email')).toHaveAccessibleDescription(
      'A secure account setup link will be sent to this address.',
    );
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: testInfo.outputPath('onboarding-admin.png'), fullPage: true });
    expect(
      (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()).violations,
    ).toEqual([]);
    await wizard.getByRole('button', { name: 'Continue', exact: true }).click();
    await expect(wizard.getByRole('heading', { name: 'Review invitation' })).toBeFocused();
    await wizard.getByRole('button', { name: 'Edit school authority', exact: true }).click();
    await expect(wizard.getByLabel('School authority name')).toHaveValue('Successful Transit');
    await wizard.getByLabel('School authority name').fill('Successful School Division');
    await wizard.getByRole('button', { name: 'Continue', exact: true }).click();
    await wizard.getByRole('button', { name: 'Continue', exact: true }).click();
    await expect(wizard).toContainText('Successful School Division');
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: testInfo.outputPath('onboarding-ready.png'), fullPage: true });
    await wizard.getByRole('button', { name: 'Send invitation', exact: true }).click();
    await expect(wizard.getByRole('alert')).toContainText('No invitation was sent');
    expect(attempts).toBe(1);
    await expect(wizard).toContainText('Successful School Division');
    await expect(wizard).toContainText('successful.admin@example.test');
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: testInfo.outputPath('onboarding-review.png'), fullPage: true });
    expect(
      (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()).violations,
    ).toEqual([]);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await wizard.getByRole('button', { name: 'Send invitation', exact: true }).click();
    await expect(wizard.getByRole('status')).toContainText(
      'Invitation accepted by the email provider',
    );
    expect(attempts).toBe(2);
  });

  test('failed invitation shows the provider error without adding a tenant card', async ({
    page,
  }) => {
    await installPlatformMock(page, 'failure');
    await page.goto('/admin/tenants');
    await fillTenantForm(page);
    await page.getByRole('button', { name: 'Send invitation' }).click();

    await expect(page.getByRole('alert')).toContainText(
      'invitation email was not sent and no school authority was created',
    );
    await expect(page.getByRole('link', { name: 'Successful Transit', exact: true })).toHaveCount(
      0,
    );
  });

  test('successful invitation displays confirmation and then adds the tenant card', async ({
    page,
  }) => {
    await installPlatformMock(page, 'success');
    await page.goto('/admin/tenants');
    await fillTenantForm(page);
    const createRequest = page.waitForRequest(
      (request) =>
        request.url().endsWith('/.netlify/functions/safebus-onboarding') &&
        request.method() === 'POST' &&
        request.postDataJSON().kind === 'createTenant',
    );
    await page.getByRole('button', { name: 'Send invitation' }).click();
    expect((await createRequest).postDataJSON()).toMatchObject({
      kind: 'createTenant',
      tenantType: 'school_group',
      tenantName: 'Successful Transit',
    });

    await expect(page.getByRole('status')).toContainText(
      'Invitation accepted by the email provider for successful.admin@example.test',
    );
    await expect(page.getByRole('link', { name: 'Successful Transit', exact: true })).toBeVisible();
    await expect(page.getByText(/Password setup pending/)).toBeVisible();
  });

  test('platform super admin can resend a pending tenant-admin invitation', async ({ page }) => {
    const state = await installPlatformMock(page, 'resend');
    await page.goto('/admin/tenants');
    await page.getByRole('link', { name: 'View school authority' }).click();

    await page.getByRole('button', { name: 'Resend invitation' }).click();

    await expect(page.getByRole('status')).toContainText(
      `A new password setup email was sent to ${createdTenant.first_tenant_admin_email}`,
    );
    expect(state.resendRequestCount()).toBe(1);
    await expect(page.getByText(/Invitation resent · delivery sent/)).toBeVisible();
  });

  test('platform super admin can perform emergency recovery for the first administrator', async ({
    page,
  }) => {
    const state = await installPlatformMock(page, 'recovery');
    await page.goto('/admin/tenants');
    await page.getByRole('link', { name: 'View school authority' }).click();

    await page.getByRole('button', { name: 'Emergency recovery' }).click();

    await expect(page.getByRole('status')).toContainText(
      `Emergency access restored for ${createdTenant.first_tenant_admin_email}`,
    );
    expect(state.recoveryRequestCount()).toBe(1);
    await expect(page.getByRole('button', { name: 'Emergency recovery' })).toHaveCount(0);
  });
});

test('expired first administrator invitation can be reissued', async ({ page }) => {
  await installPlatformMock(page, 'expired');
  await page.goto('/admin/tenants/' + createdTenant.tenant_id);
  await page.getByRole('button', { name: 'Reissue expired invitation' }).click();
  await expect(page.getByRole('status')).toContainText('Account activation is pending');
  await expect(page.getByRole('button', { name: 'Resend invitation' })).toBeVisible();
});

test('tenant directory filters, keyboard labels, and responsive layout are accessible', async ({
  page,
}, testInfo) => {
  await installPlatformMock(page, 'resend');
  await page.goto('/admin/tenants');
  await expect(page.getByRole('link', { name: 'Successful Transit', exact: true })).toBeVisible();
  await page.getByLabel('Search school authorities').fill('no matching organization');
  await expect(page.getByText('No matching school authorities')).toBeVisible();
  await page.getByLabel('Search school authorities').clear();
  await page.getByLabel('Invitation', { exact: true }).selectOption('activated');
  await expect(page.getByText('No matching school authorities')).toBeVisible();
  await page.getByLabel('Invitation', { exact: true }).selectOption('all');
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()).violations,
  ).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('onboarding.png'), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});
