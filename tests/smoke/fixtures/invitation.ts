import { type Page, type Route } from '@playwright/test';

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

export async function installInvitedUserMock(
  page: Page,
  options: {
    status?: 'invited' | 'active';
    aal?: 'aal1' | 'aal2';
    role?: 'tenant_admin' | 'guardian' | 'driver';
  } = {},
) {
  let profileStatus: 'invited' | 'active' = options.status ?? 'invited';
  let passwordUpdated = false;
  let activationCalled = false;

  await page.addInitScript(
    ({ user, aal }) => {
      const session = {
        access_token: [
          'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9',
          btoa(
            JSON.stringify({
              sub: user.id,
              role: 'authenticated',
              aal,
              amr: [{ method: 'otp', timestamp: 4102440000 }],
              exp: 4102444800,
            }),
          ),
          'smoke-test-signature',
        ].join('.'),
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
    { user: authUser, aal: options.aal ?? 'aal1' },
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
      if (path.endsWith('/factors') && method === 'POST') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            id: 'a1000000-0000-4000-8000-000000000003',
            type: 'totp',
            totp: {
              // Synthetic enrollment only; this key cannot authenticate to a service.
              secret: 'SYNTHETICMFASETUPKEY',
              qr_code:
                'data:image/svg+xml,' +
                encodeURIComponent(
                  '<svg xmlns="http://www.w3.org/2000/svg" width="264" height="264"><rect width="264" height="264" fill="white"/><path d="M24 24h72v72H24zM168 24h72v72h-72zM24 168h72v72H24z"/></svg>',
                ),
            },
          }),
        });
        return;
      }
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
          role: options.role ?? 'tenant_admin',
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
          role: options.role ?? 'tenant_admin',
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
