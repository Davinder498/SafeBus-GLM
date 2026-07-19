import { expect, test, type Page, type Route } from '@playwright/test';

const tenantAdmin = {
  id: 'cb000000-0000-0000-0000-000000000001',
  email: 'tenant.admin@example.test',
  aud: 'authenticated',
  role: 'authenticated',
  app_metadata: {},
  user_metadata: {},
  created_at: '2026-07-19T00:00:00.000Z',
};

async function installTenantAdminMock(page: Page, outcome: 'success' | 'gateway') {
  await page.addInitScript(
    ({ user }) => {
      const session = {
        access_token: 'tenant-admin-access-token',
        refresh_token: 'tenant-admin-refresh-token',
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
    { user: tenantAdmin },
  );

  await page.route('**/.netlify/functions/safebus-onboarding', async (route) => {
    if (outcome === 'gateway') {
      await route.fulfill({
        status: 502,
        contentType: 'text/html',
        body: '<html><body>Bad Gateway</body></html>',
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        status: 'sent',
        guardianId: 'cb000000-0000-0000-0000-000000000020',
        driverId: null,
        recipientEmail: 'guardian@example.test',
      }),
    });
  });

  await page.route('**/*', async (route: Route) => {
    const url = new URL(route.request().url());
    if (!url.hostname.endsWith('.supabase.co')) {
      await route.fallback();
      return;
    }

    const path = url.pathname;
    const method = route.request().method();
    if (path.startsWith('/auth/v1/')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(
          path.endsWith('/user') && method === 'GET' ? tenantAdmin : { user: tenantAdmin },
        ),
      });
      return;
    }

    if (path.includes('/rest/v1/profiles') && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: tenantAdmin.id,
          tenant_id: 'cb000000-0000-0000-0000-000000000010',
          school_id: null,
          full_name: 'Tenant Admin',
          first_name: 'Tenant',
          last_name: 'Admin',
          email: tenantAdmin.email,
          role: 'tenant_admin',
          status: 'active',
          created_at: tenantAdmin.created_at,
          updated_at: tenantAdmin.created_at,
        }),
      });
      return;
    }

    if (path.includes('/rest/v1/rpc/get_admin_paginated_list')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          rows: [],
          totalCount: 0,
          page: 1,
          pageSize: 50,
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
}

async function fillGuardianForm(page: Page) {
  await page.getByRole('button', { name: 'Invite guardian' }).click();
  await page.getByLabel('First name').fill('Guardian');
  await page.getByLabel('Last name').fill('Example');
  await page.getByLabel('Email address').fill('guardian@example.test');
  await page.getByLabel('Phone number').fill('5878940568');
}

test.describe('guardian member invitation', () => {
  test('an HTML gateway failure is explicit and preserves the form', async ({ page }) => {
    await installTenantAdminMock(page, 'gateway');
    await page.goto('/admin/guardians');
    await fillGuardianForm(page);
    await page.getByRole('button', { name: 'Send invitation' }).click();

    await expect(page.getByRole('alert')).toContainText('HTTP 502');
    await expect(page.getByRole('alert')).toContainText('retry once');
    await expect(page.getByLabel('Email address')).toHaveValue('guardian@example.test');
  });

  test('a confirmed invitation names the recipient and closes the form', async ({ page }) => {
    await installTenantAdminMock(page, 'success');
    await page.goto('/admin/guardians');
    await fillGuardianForm(page);
    await page.getByRole('button', { name: 'Send invitation' }).click();

    await expect(page.getByRole('status')).toContainText(
      'Guardian invitation sent to guardian@example.test',
    );
    await expect(page.getByLabel('Email address')).toHaveCount(0);
  });
});
