import { expect, test, type Page, type Route } from '@playwright/test';

const ids = {
  profile: 'a1000000-0000-0000-0000-000000000001',
  tenant: 'a1000000-0000-0000-0000-000000000002',
} as const;

const authUser = {
  id: ids.profile,
  email: 'invited-admin@example.test',
  aud: 'authenticated',
  role: 'authenticated',
  app_metadata: {},
  user_metadata: {},
  created_at: '2026-07-19T00:00:00.000Z',
};

async function installInvitedUserMock(page: Page) {
  let profileStatus: 'invited' | 'active' = 'invited';
  let passwordUpdated = false;
  let activationCalled = false;

  await page.addInitScript(
    ({ user }) => {
      const session = {
        access_token: 'invite-access-token',
        refresh_token: 'invite-refresh-token',
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
    { user: authUser },
  );

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
          body: JSON.stringify(authUser),
        });
        return;
      }
      if (path.endsWith('/user') && method === 'PUT') {
        passwordUpdated = true;
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(authUser),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ user: authUser }),
      });
      return;
    }

    if (path.includes('/rest/v1/rpc/complete_invited_account') && method === 'POST') {
      activationCalled = true;
      profileStatus = 'active';
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          profileId: ids.profile,
          role: 'tenant_admin',
          status: 'active',
        }),
      });
      return;
    }

    if (path.includes('/rest/v1/profiles') && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: ids.profile,
          tenant_id: ids.tenant,
          school_id: null,
          full_name: 'Invited Admin',
          email: authUser.email,
          role: 'tenant_admin',
          status: profileStatus,
          created_at: authUser.created_at,
          updated_at: authUser.created_at,
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
    passwordWasUpdated: () => passwordUpdated,
    activationWasCalled: () => activationCalled,
  };
}

test.describe('invited account password setup', () => {
  test('invited tenant admin creates a password before reaching the dashboard', async ({
    page,
  }) => {
    const state = await installInvitedUserMock(page);
    await page.goto('/accept-invitation');

    await expect(page.getByRole('heading', { name: 'Create your password' })).toBeVisible();
    await page.getByLabel('New password').fill('SafeBus!2026');
    await page.getByLabel('Confirm password').fill('SafeBus!2026');
    await page.getByRole('button', { name: 'Create password and activate account' }).click();

    await expect(page).toHaveURL('/admin');
    expect(state.passwordWasUpdated()).toBe(true);
    expect(state.activationWasCalled()).toBe(true);
  });

  test('an invited session on the login page is sent to password setup', async ({ page }) => {
    await installInvitedUserMock(page);
    await page.goto('/login');

    await expect(page).toHaveURL('/accept-invitation');
    await expect(page.getByRole('heading', { name: 'Create your password' })).toBeVisible();
  });

  test('missing or expired invitation session cannot open password setup', async ({ page }) => {
    await page.goto('/accept-invitation');

    await expect(page.getByText(/invitation link is invalid or expired/i)).toBeVisible({
      timeout: 15000,
    });
    await expect(page.getByLabel('New password')).toHaveCount(0);
  });
});
