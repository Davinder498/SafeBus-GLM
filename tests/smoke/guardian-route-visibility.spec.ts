import { test, expect, type Page, type Route } from '@playwright/test';
import { blockUnexpectedSupabaseRestAccess } from './fixtures/supabase-mock';
import { installLocalOnlyBoundary } from './fixtures/local-only';

// Administrator guardian-student link management. Guardian app journeys run
// in tests/mobile-ui/assigned-bus-journeys.spec.ts through the mobile entry point.

const GUARDIAN = {
  profileId: '11111111-1111-1111-1111-111111111111',
  tenantId: '22222222-2222-2222-2222-222222222222',
  guardianId: '33333333-3333-3333-3333-333333333333',
  studentId: '44444444-4444-4444-4444-444444444444',
} as const;

const adminProfile = {
  id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  tenant_id: GUARDIAN.tenantId,
  school_id: null,
  full_name: 'Test Admin',
  email: 'admin@smoke-test.local',
  role: 'tenant_admin',
  status: 'active',
  created_at: '2025-01-01T00:00:00.000Z',
  updated_at: '2025-01-01T00:00:00.000Z',
};

// --- Admin mock for link management test ---

async function installAdminLinkMock(page: Page) {
  let links: Record<string, unknown>[] = [];

  await page.route('**/*', async (route: Route) => {
    const url = new URL(route.request().url());
    if (!url.hostname.endsWith('.supabase.co')) {
      await route.fallback();
      return;
    }
    const method = route.request().method();
    const path = url.pathname;

    if (path.startsWith('/auth/v1/')) {
      if (path.includes('/user') && method === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            id: adminProfile.id,
            aud: 'authenticated',
            role: 'authenticated',
            email: adminProfile.email,
            app_metadata: {},
            user_metadata: {},
            created_at: adminProfile.created_at,
          }),
        });
        return;
      }
      if (path.endsWith('/token')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            access_token: [
              'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9',
              'eyJzdWIiOiIwMDAwMDAwMC0wMDAwLTAwMDAtMDAwMC0wMDAwMDAwMDAwMDAiLCJyb2xlIjoiYXV0aGVudGljYXRlZCIsImFhbCI6ImFhbDIiLCJhbXIiOlt7Im1ldGhvZCI6InRvdHAiLCJ0aW1lc3RhbXAiOjQxMDI0NDAwMDB9XSwiZXhwIjo0MTAyNDQ0ODAwfQ',
              'smoke-test-signature',
            ].join('.'),
            refresh_token: 'x',
            token_type: 'bearer',
            expires_in: 3600,
            user: {
              id: adminProfile.id,
              email: adminProfile.email,
              aud: 'authenticated',
              role: 'authenticated',
            },
          }),
        });
        return;
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
      return;
    }

    if (path.startsWith('/rest/v1/')) {
      const accept = route.request().headers()['accept'] ?? '';
      const wantsSingle = accept.includes('application/vnd.pgrst.object+json');
      const fulfillRows = async (rows: Record<string, unknown>[]) => {
        if (wantsSingle) {
          if (rows.length === 0) {
            await route.fulfill({
              status: 406,
              contentType: 'application/json',
              body: JSON.stringify({ message: 'no rows' }),
            });
            return;
          }
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(rows[0]),
          });
          return;
        }
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(rows),
        });
      };

      if (method === 'GET') {
        if (path.includes('/profiles')) {
          await fulfillRows([adminProfile]);
          return;
        }
        if (path.includes('/guardians')) {
          await fulfillRows([
            {
              id: GUARDIAN.guardianId,
              tenant_id: GUARDIAN.tenantId,
              profile_id: GUARDIAN.profileId,
              first_name: 'Test',
              last_name: 'Guardian',
              full_name: 'Test Guardian',
              email: 'guardian@smoke-test.local',
              phone: null,
              status: 'active',
              created_at: '2025-01-01T00:00:00.000Z',
              updated_at: '2025-01-01T00:00:00.000Z',
            },
          ]);
          return;
        }
        if (path.includes('/student_guardians')) {
          await fulfillRows(links);
          return;
        }
        if (path.includes('/students')) {
          await fulfillRows([
            {
              id: GUARDIAN.studentId,
              tenant_id: GUARDIAN.tenantId,
              school_id: 'school-1',
              first_name: 'Avery',
              last_name: 'Johnson',
              preferred_name: null,
              grade: 'Grade 4',
              status: 'active',
              created_at: '2025-01-01T00:00:00.000Z',
              updated_at: '2025-01-01T00:00:00.000Z',
            },
          ]);
          return;
        }
        await blockUnexpectedSupabaseRestAccess(route, method, path);
        return;
      }
      if (method === 'POST' && path.includes('/rpc/get_admin_paginated_list')) {
        const guardian = {
          id: GUARDIAN.guardianId,
          tenant_id: GUARDIAN.tenantId,
          profile_id: GUARDIAN.profileId,
          first_name: 'Test',
          last_name: 'Guardian',
          full_name: 'Test Guardian',
          email: 'guardian@smoke-test.local',
          phone: null,
          status: 'active',
          created_at: '2025-01-01T00:00:00.000Z',
          updated_at: '2025-01-01T00:00:00.000Z',
          active_link_count: links.filter((link) => link.status === 'active').length,
        };
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ rows: [guardian], totalCount: 1, page: 1, pageSize: 50 }),
        });
        return;
      }
      if (method === 'POST' && path.includes('/rpc/search_admin_students')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([
            { id: GUARDIAN.studentId, label: 'Avery Johnson', school_name: 'Test School' },
          ]),
        });
        return;
      }
      if (method === 'POST' && path.includes('/rpc/get_admin_guardian_links')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(
            links.map((link) => ({
              id: link.id,
              student_id: link.student_id,
              student_name: 'Avery Johnson',
              relationship: link.relationship,
              status: link.status,
            })),
          ),
        });
        return;
      }
      if (method === 'POST' && path.includes('/rpc/admin_link_student_guardian')) {
        const newLink = {
          id: 'link-1',
          tenant_id: GUARDIAN.tenantId,
          student_id: GUARDIAN.studentId,
          guardian_id: GUARDIAN.guardianId,
          relationship: 'guardian',
          can_receive_notifications: true,
          status: 'active',
          created_at: '2025-01-01T00:00:00.000Z',
          updated_at: '2025-01-01T00:00:00.000Z',
        };
        links = [newLink];
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(newLink),
        });
        return;
      }
      if (method === 'POST' && path.includes('/rpc/admin_deactivate_student_guardian')) {
        links = [];
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ id: 'link-1', status: 'inactive' }),
        });
        return;
      }
      await blockUnexpectedSupabaseRestAccess(route, method, path);
      return;
    }
    await route.fallback();
  });

  await page.addInitScript(() => {
    const s = {
      access_token: [
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9',
        'eyJzdWIiOiIwMDAwMDAwMC0wMDAwLTAwMDAtMDAwMC0wMDAwMDAwMDAwMDAiLCJyb2xlIjoiYXV0aGVudGljYXRlZCIsImFhbCI6ImFhbDIiLCJhbXIiOlt7Im1ldGhvZCI6InRvdHAiLCJ0aW1lc3RhbXAiOjQxMDI0NDAwMDB9XSwiZXhwIjo0MTAyNDQ0ODAwfQ',
        'smoke-test-signature',
      ].join('.'),
      refresh_token: 'x',
      token_type: 'bearer',
      expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: {
        id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        email: 'admin@smoke-test.local',
        aud: 'authenticated',
        role: 'authenticated',
        app_metadata: {},
        user_metadata: {},
        created_at: '2025-01-01T00:00:00.000Z',
      },
    };
    for (const k of [
      'supabase.auth.token',
      'sb-placeholder-auth-token',
      'sb-bppmqykkbhrmotcybxrh-auth-token',
      'sb-localhost-auth-token',
    ]) {
      try {
        window.localStorage.setItem(k, JSON.stringify(s));
      } catch {
        /* ignore */
      }
    }
  });
}

test.beforeEach(async ({ page }) => {
  await installLocalOnlyBoundary(page);
});

test.describe('Milestone 5A/5B — Admin guardian-student link management', () => {
  test('admin can create guardian-student link', async ({ page }) => {
    await installAdminLinkMock(page);
    await page.goto(`/admin/guardians/${GUARDIAN.guardianId}`);

    await expect(page.getByRole('heading', { name: 'Linked students' })).toBeVisible({
      timeout: 10000,
    });

    // Search for a student without downloading the full roster.
    await page.getByRole('searchbox', { name: 'Search students' }).fill('Avery');
    await page.getByRole('button', { name: /Avery Johnson/ }).click();

    // Save.
    await page.getByRole('button', { name: 'Link student' }).click();

    // Success message appears.
    await expect(page.getByText('Student linked to this guardian.')).toBeVisible({
      timeout: 10000,
    });
  });

  test('admin can view linked students by expanding a guardian card', async ({ page }) => {
    await installAdminLinkMock(page);
    await page.goto(`/admin/guardians/${GUARDIAN.guardianId}`);

    await expect(page.getByRole('heading', { name: 'Linked students' })).toBeVisible({
      timeout: 10000,
    });
    await expect(page.getByText('No students are linked.')).toBeVisible();
  });
});
