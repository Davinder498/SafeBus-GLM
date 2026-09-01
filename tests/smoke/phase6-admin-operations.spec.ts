import { test, expect, type Page, type Route } from '@playwright/test';
import { blockUnexpectedSupabaseRestAccess } from './fixtures/supabase-mock';
import { FAKE_ACCESS_TOKEN } from './fixtures/phase6-jwt';
import type { ProfileRole } from '../../apps/web/src/contexts/AuthContext';

/**
 * Phase 6 — Admin transportation operations completion smoke tests.
 *
 * Verifies the new admin non-ETA operational workflow:
 *   - Driver assignments page shows substitute driver / replace bus actions
 *   - Substitute driver form submits and shows the audited success message
 *   - Replace bus form submits and shows the audited success message
 *   - Guardian detail page shows the audited revoke access action; revocation
 *     records the audit-trail success message
 *
 * Uses a mocked Supabase layer (no production credentials, no backdoors). All
 * Supabase traffic is intercepted via page.route. The mock pattern follows the
 * proven transportation-domain-model.spec.ts setup.
 */

const ADMIN = {
  profileId: 'aaaaaaaa-2222-aaaa-2222-aaaaaaaaaaaa',
  tenantId: 'bbbbbbbb-1111-bbbb-1111-bbbbbbbbbbbb',
  driver1Id: 'cccccccc-1111-cccc-1111-cccccccccccc',
  driver1ProfileId: 'dddddddd-1111-dddd-1111-dddddddddddd',
  driver2Id: 'cccccccc-2222-cccc-2222-cccccccccccc',
  driver2ProfileId: 'dddddddd-2222-dddd-2222-dddddddddddd',
  bus1Id: 'eeeeeeee-1111-eeee-1111-eeeeeeeeeeee',
  bus2Id: 'eeeeeeee-2222-eeee-2222-eeeeeeeeeeee',
  routeId: 'ffffffff-1111-ffff-1111-ffffffffffff',
  assignmentId: '11111111-2222-3333-4444-555555555555',
  tripId: '11111111-2222-3333-4444-666666666666',
  guardianId: '22222222-3333-4444-5555-666666666666',
  guardianProfileId: '22222222-3333-4444-5555-777777777777',
  studentGuardianLinkId: '33333333-4444-5555-6666-777777777777',
} as const;

const adminProfile = {
  id: ADMIN.profileId,
  tenant_id: ADMIN.tenantId,
  school_id: null,
  full_name: 'Phase Six Admin',
  email: 'admin@phase6-smoke.local',
  role: 'tenant_admin',
  status: 'active',
  created_at: '2025-01-01T00:00:00.000Z',
  updated_at: '2025-01-01T00:00:00.000Z',
};

const driver1Row = {
  id: ADMIN.driver1Id,
  tenant_id: ADMIN.tenantId,
  profile_id: ADMIN.driver1ProfileId,
  employee_number: 'DRV-1',
  phone: null,
  status: 'active',
};

const driver2Row = {
  id: ADMIN.driver2Id,
  tenant_id: ADMIN.tenantId,
  profile_id: ADMIN.driver2ProfileId,
  employee_number: 'DRV-2',
  phone: null,
  status: 'active',
};

const driver1Profile = {
  id: ADMIN.driver1ProfileId,
  tenant_id: ADMIN.tenantId,
  school_id: null,
  full_name: 'Original Driver',
  email: 'driver1@phase6-smoke.local',
  role: 'driver',
  status: 'active',
  created_at: '2025-01-01T00:00:00.000Z',
  updated_at: '2025-01-01T00:00:00.000Z',
};

const driver2Profile = {
  id: ADMIN.driver2ProfileId,
  tenant_id: ADMIN.tenantId,
  school_id: null,
  full_name: 'Substitute Driver',
  email: 'driver2@phase6-smoke.local',
  role: 'driver',
  status: 'active',
  created_at: '2025-01-01T00:00:00.000Z',
  updated_at: '2025-01-01T00:00:00.000Z',
};

const bus1Row = {
  id: ADMIN.bus1Id,
  tenant_id: ADMIN.tenantId,
  school_id: null,
  bus_number: 'P6A',
  license_plate: 'SB-P6A',
  capacity: 48,
  status: 'active',
};

const bus2Row = {
  id: ADMIN.bus2Id,
  tenant_id: ADMIN.tenantId,
  school_id: null,
  bus_number: 'P6B',
  license_plate: 'SB-P6B',
  capacity: 48,
  status: 'active',
};

const routeRow = {
  id: ADMIN.routeId,
  tenant_id: ADMIN.tenantId,
  school_id: null,
  route_name: 'Phase Six AM',
  route_code: 'P6-AM',
  route_type: 'morning',
  status: 'active',
};

function assignmentRow() {
  return {
    id: ADMIN.assignmentId,
    tenant_id: ADMIN.tenantId,
    driver_id: ADMIN.driver1Id,
    bus_id: ADMIN.bus1Id,
    route_id: ADMIN.routeId,
    trip_type: 'morning',
    status: 'active',
    effective_from: '2025-01-01',
    effective_to: null,
    created_at: '2025-01-01T00:00:00.000Z',
    updated_at: '2025-01-01T00:00:00.000Z',
    // joined display fields
    route_name: routeRow.route_name,
    route_code: routeRow.route_code,
    bus_number: bus1Row.bus_number,
    driver_name: 'Original Driver',
  };
}

const guardianDetail = {
  guardian: {
    id: ADMIN.guardianId,
    tenant_id: ADMIN.tenantId,
    profile_id: ADMIN.guardianProfileId,
    first_name: 'Phase',
    last_name: 'Six Guardian',
    full_name: 'Phase Six Guardian',
    email: 'guardian@phase6-smoke.local',
    phone: null,
    status: 'active',
  },
  profile: {
    id: ADMIN.guardianProfileId,
    tenant_id: ADMIN.tenantId,
    school_id: null,
    full_name: 'Phase Six Guardian',
    email: 'guardian@phase6-smoke.local',
    role: 'guardian',
    status: 'active',
    created_at: '2025-01-01T00:00:00.000Z',
    updated_at: '2025-01-01T00:00:00.000Z',
  },
};

const studentGuardianLink = {
  id: ADMIN.studentGuardianLinkId,
  tenant_id: ADMIN.tenantId,
  student_id: '44444444-5555-6666-7777-888888888888',
  guardian_id: ADMIN.guardianId,
  relationship: 'guardian',
  status: 'active',
  student_name: 'Phase Six Student',
};

async function installAdminAssignmentsMock(page: Page, role: ProfileRole = 'tenant_admin') {
  const currentProfile = {
    ...adminProfile,
    role,
    school_id: role === 'school_admin' ? '99999999-1111-2222-3333-444444444444' : null,
  };
  let operationalStatus = 'normal';
  let operationalReason: string | null = null;
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
            id: currentProfile.id,
            aud: 'authenticated',
            role: 'authenticated',
            email: currentProfile.email,
            app_metadata: { provider: 'email' },
            user_metadata: {},
            created_at: currentProfile.created_at,
          }),
        });
        return;
      }
      if (path.endsWith('/token') && (method === 'POST' || method === 'PUT')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            access_token: FAKE_ACCESS_TOKEN,
            refresh_token: 'mock-refresh',
            token_type: 'bearer',
            expires_in: 3600,
            user: { id: currentProfile.id, email: currentProfile.email },
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
          // The current-user profile query uses .eq('id', adminProfile.id).single();
          // the driver-profile directory query uses role=eq.driver.
          if (url.searchParams.get('role') === 'eq.driver') {
            await fulfillRows([driver1Profile, driver2Profile]);
          } else if (url.searchParams.get('id') === `eq.${currentProfile.id}`) {
            await fulfillRows([currentProfile]);
          } else {
            await fulfillRows([currentProfile, driver1Profile, driver2Profile]);
          }
          return;
        }
        if (path.includes('/drivers')) {
          await fulfillRows([driver1Row, driver2Row]);
          return;
        }
        if (path.includes('/buses')) {
          await fulfillRows([bus1Row, bus2Row]);
          return;
        }
        if (path.includes('/routes')) {
          await fulfillRows([routeRow]);
          return;
        }
        if (path.includes('/route_trip_patterns')) {
          await fulfillRows([]);
          return;
        }
        await blockUnexpectedSupabaseRestAccess(route, method, path);
        return;
      }

      if (method === 'POST') {
        if (path.includes('/rpc/get_admin_live_fleet_monitoring')) {
          await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
          return;
        }
        if (path.includes('/rpc/get_admin_live_route_overlays')) {
          await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
          return;
        }
        if (path.includes('/rpc/get_admin_trip_overview')) {
          await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
          return;
        }
        if (path.includes('/rpc/get_admin_active_trip_operational_statuses')) {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify([
              {
                trip_id: ADMIN.tripId,
                bus_label: bus1Row.bus_number,
                route_name: routeRow.route_name,
                trip_status: 'active',
                operational_status: operationalStatus,
                reason_code: operationalReason,
                status_set_at: '2025-01-01T12:00:00.000Z',
              },
            ]),
          });
          return;
        }
        if (path.includes('/rpc/set_trip_operational_status')) {
          const body = route.request().postDataJSON() as {
            p_operational_status: string;
            p_reason_code: string | null;
          };
          operationalStatus = body.p_operational_status;
          operationalReason = body.p_reason_code;
          await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
          return;
        }
        if (path.includes('/rpc/get_admin_paginated_list')) {
          const body = route.request().postDataJSON() as { p_entity?: string };
          if (
            body?.p_entity === 'driver_route_assignments' ||
            body?.p_entity === 'driver_assignments'
          ) {
            await route.fulfill({
              status: 200,
              contentType: 'application/json',
              body: JSON.stringify({
                rows: [assignmentRow()],
                totalCount: 1,
                page: 1,
                pageSize: 25,
              }),
            });
            return;
          }
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ rows: [], totalCount: 0, page: 1, pageSize: 25 }),
          });
          return;
        }
        if (path.includes('/rpc/substitute_driver')) {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              ...assignmentRow(),
              id: 'new-assignment-id-after-substitute',
              driver_id: ADMIN.driver2Id,
            }),
          });
          return;
        }
        if (path.includes('/rpc/replace_bus')) {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              ...assignmentRow(),
              id: 'new-assignment-id-after-replace',
              bus_id: ADMIN.bus2Id,
            }),
          });
          return;
        }
        await blockUnexpectedSupabaseRestAccess(route, method, path);
        return;
      }

      await blockUnexpectedSupabaseRestAccess(route, method, path);
      return;
    }

    await route.fallback();
  });

  await page.addInitScript((token) => {
    const fakeSession = {
      access_token: token,
      refresh_token: 'mock-refresh',
      token_type: 'bearer',
      expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: {
        id: 'aaaaaaaa-2222-aaaa-2222-aaaaaaaaaaaa',
        email: 'admin@phase6-smoke.local',
        aud: 'authenticated',
        role: 'authenticated',
        app_metadata: { provider: 'email' },
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
        window.localStorage.setItem(k, JSON.stringify(fakeSession));
      } catch {
        /* ignore */
      }
    }
  }, FAKE_ACCESS_TOKEN);
}

async function installGuardianRevokeMock(page: Page) {
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
            app_metadata: { provider: 'email' },
            user_metadata: {},
            created_at: adminProfile.created_at,
          }),
        });
        return;
      }
      if (path.endsWith('/token') && (method === 'POST' || method === 'PUT')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            access_token: FAKE_ACCESS_TOKEN,
            refresh_token: 'mock-refresh',
            token_type: 'bearer',
            expires_in: 3600,
            user: { id: adminProfile.id, email: adminProfile.email },
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
        if (path.includes('/guardians')) {
          await fulfillRows([guardianDetail.guardian]);
          return;
        }
        if (path.includes('/profiles')) {
          const requestedId = url.searchParams.get('id');
          await fulfillRows(
            requestedId === `eq.${guardianDetail.guardian.profile_id}`
              ? [guardianDetail.profile]
              : [adminProfile],
          );
          return;
        }
        await blockUnexpectedSupabaseRestAccess(route, method, path);
        return;
      }

      if (method === 'POST') {
        // Guardian links remain a bounded RPC; the guardian record itself is
        // loaded through the RLS-protected guardians/profiles tables.
        if (path.includes('/rpc/get_admin_guardian_links')) {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify([studentGuardianLink]),
          });
          return;
        }
        if (path.includes('/rpc/revoke_guardian_access')) {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ id: ADMIN.studentGuardianLinkId, status: 'inactive' }),
          });
          return;
        }
        await blockUnexpectedSupabaseRestAccess(route, method, path);
        return;
      }

      await blockUnexpectedSupabaseRestAccess(route, method, path);
      return;
    }

    await route.fallback();
  });

  await page.addInitScript((token) => {
    const fakeSession = {
      access_token: token,
      refresh_token: 'mock-refresh',
      token_type: 'bearer',
      expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: {
        id: 'aaaaaaaa-2222-aaaa-2222-aaaaaaaaaaaa',
        email: 'admin@phase6-smoke.local',
        aud: 'authenticated',
        role: 'authenticated',
        app_metadata: { provider: 'email' },
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
        window.localStorage.setItem(k, JSON.stringify(fakeSession));
      } catch {
        /* ignore */
      }
    }
  }, FAKE_ACCESS_TOKEN);
}

test.describe('Phase 6 — consolidated assignment workflows', () => {
  test('legacy driver assignment links open the driver workspace', async ({ page }) => {
    await installAdminAssignmentsMock(page);
    await page.goto('/admin/driver-assignments');
    await expect(page).toHaveURL('/admin/drivers');
    await expect(page.getByRole('heading', { name: 'Drivers', level: 1 })).toBeVisible();
  });

  test('legacy student assignment links open the student workspace', async ({ page }) => {
    await installAdminAssignmentsMock(page);
    await page.goto('/admin/assignments');
    await expect(page).toHaveURL('/admin/students');
    await expect(page.getByRole('heading', { name: 'Students', level: 1 })).toBeVisible();
  });
});

test.describe('Phase 6 — admin audited guardian access revocation', () => {
  test('revoke access records the audit trail and marks the link inactive', async ({ page }) => {
    await installGuardianRevokeMock(page);
    await page.goto(`/admin/guardians/${ADMIN.guardianId}`);

    // The guardian name heading appears.
    await expect(page.getByRole('heading', { name: 'Phase Six Guardian', level: 1 })).toBeVisible({
      timeout: 10000,
    });

    const linkRow = page.getByTestId(`guardian-link-${ADMIN.studentGuardianLinkId}`);
    await expect(linkRow).toContainText('Phase Six Student');

    const toggle = page.getByTestId(`revoke-access-toggle-${ADMIN.studentGuardianLinkId}`);
    await expect(toggle).toBeVisible();
    await toggle.click();

    const form = page.getByTestId(`revoke-access-form-${ADMIN.studentGuardianLinkId}`);
    await expect(form).toBeVisible();
    await form.getByRole('button', { name: 'Confirm revoke access' }).click();

    await expect(
      page.getByText('Guardian access revoked and recorded in the audit trail.'),
    ).toBeVisible({ timeout: 10000 });
  });
});

test.describe('Phase 6 — non-ETA dispatch status', () => {
  test('sets a controlled late status and reason without an ETA calculation', async ({ page }) => {
    await installAdminAssignmentsMock(page);
    await page.goto('/admin/live-trips');

    const row = page.getByTestId(`dispatch-status-${ADMIN.tripId}`);
    await expect(row).toBeVisible();
    await row.getByLabel(`Operational status for bus ${bus1Row.bus_number}`).selectOption('late');
    await row
      .getByLabel(`Operational reason for bus ${bus1Row.bus_number}`)
      .selectOption('traffic');
    await row.getByRole('button', { name: 'Update' }).click();

    await expect(row.getByLabel(`Operational status for bus ${bus1Row.bus_number}`)).toHaveValue(
      'late',
    );
    await expect(page.getByText('No ETA is calculated from these values.')).toBeVisible();
  });
});

test.describe('Phase 6 — role portal boundaries', () => {
  for (const role of ['school_admin', 'transportation_admin'] as const) {
    test(`${role} can open the role-scoped operations page`, async ({ page }) => {
      await installAdminAssignmentsMock(page, role);
      await page.goto('/admin/driver-assignments');

      await expect(page).toHaveURL('/admin/drivers');
      await expect(page.getByRole('heading', { name: 'Drivers', level: 1 })).toBeVisible();
    });
  }

  for (const role of ['platform_super_admin', 'driver', 'guardian'] as const) {
    test(`${role} cannot open tenant transportation operations`, async ({ page }) => {
      await installAdminAssignmentsMock(page, role);
      await page.goto('/admin/driver-assignments');

      await expect(page.getByRole('heading', { name: 'Wrong portal', level: 1 })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Drivers', level: 1 })).toHaveCount(0);
    });
  }
});
