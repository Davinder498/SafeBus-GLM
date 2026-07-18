import { expect, test, type Page, type Route } from '@playwright/test';
import { blockUnexpectedSupabaseRestAccess } from './fixtures/supabase-mock';

const IDS = {
  profile: 'a4400000-0000-0000-0000-000000000001',
  tenant: 'b4400000-0000-0000-0000-000000000001',
  school: 'c4400000-0000-0000-0000-000000000001',
} as const;

function profile(role: 'tenant_admin' | 'transportation_admin') {
  return {
    id: IDS.profile,
    tenant_id: IDS.tenant,
    school_id: null,
    first_name: 'CSV',
    last_name: 'Admin',
    full_name: 'CSV Admin',
    email: 'csv-admin@example.test',
    role,
    status: 'active',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  };
}

interface MockOptions {
  role?: 'tenant_admin' | 'transportation_admin';
  duplicateWarning?: boolean;
  failFirstCommit?: boolean;
}

async function installCsvImportMock(page: Page, options: MockOptions = {}) {
  const adminProfile = profile(options.role ?? 'tenant_admin');
  let previewCalls = 0;
  let commitCalls = 0;
  let failCommit = options.failFirstCommit ?? false;

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
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
      return;
    }

    if (!path.startsWith('/rest/v1/')) {
      await route.fallback();
      return;
    }

    const wantsSingle = (route.request().headers()['accept'] ?? '').includes(
      'application/vnd.pgrst.object+json',
    );
    if (method === 'GET' && path.includes('/profiles')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(wantsSingle ? adminProfile : [adminProfile]),
      });
      return;
    }
    if (method === 'GET' && path.includes('/schools')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: IDS.school,
            tenant_id: IDS.tenant,
            name: 'Central School',
            city: 'Calgary',
            province: 'AB',
            status: 'active',
            created_at: '2026-01-01T00:00:00Z',
            updated_at: '2026-01-01T00:00:00Z',
          },
        ]),
      });
      return;
    }
    if (method === 'POST' && path.includes('/rpc/get_admin_students_page')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ rows: [], totalCount: 0, page: 1, pageSize: 50 }),
      });
      return;
    }
    if (method === 'POST' && path.includes('/rpc/admin_process_student_csv_import')) {
      const body = route.request().postDataJSON() as {
        p_rows: Array<{ rowNumber: number }>;
        p_commit: boolean;
        p_acknowledge_warnings: boolean;
      };
      if (body.p_commit) {
        commitCalls += 1;
        if (failCommit) {
          failCommit = false;
          await route.fulfill({
            status: 400,
            contentType: 'application/json',
            body: JSON.stringify({ message: 'temporary failure' }),
          });
          return;
        }
      } else {
        previewCalls += 1;
      }
      const warnings = options.duplicateWarning
        ? [
            {
              rowNumber: 2,
              field: 'student',
              code: 'possible_existing_duplicate',
              message: 'Row 2 may duplicate a student already in the roster.',
            },
          ]
        : [];
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          rowCount: body.p_rows.length,
          importedCount: body.p_commit ? body.p_rows.length : 0,
          errors: [],
          warnings,
        }),
      });
      return;
    }

    await blockUnexpectedSupabaseRestAccess(route, method, path);
  });

  await page.addInitScript(() => {
    const session = {
      access_token: 'x',
      refresh_token: 'x',
      token_type: 'bearer',
      expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: {
        id: 'a4400000-0000-0000-0000-000000000001',
        email: 'csv-admin@example.test',
        aud: 'authenticated',
        role: 'authenticated',
        app_metadata: {},
        user_metadata: {},
        created_at: '2026-01-01T00:00:00Z',
      },
    };
    for (const key of [
      'supabase.auth.token',
      'sb-placeholder-auth-token',
      'sb-bppmqykkbhrmotcybxrh-auth-token',
      'sb-localhost-auth-token',
    ]) {
      window.localStorage.setItem(key, JSON.stringify(session));
    }
  });

  return {
    previewCalls: () => previewCalls,
    commitCalls: () => commitCalls,
  };
}

async function openImporter(page: Page) {
  await page.goto('/admin/students');
  await expect(page.getByRole('heading', { name: 'Students', level: 1 })).toBeVisible();
  await page.getByRole('button', { name: 'Import CSV' }).click();
  await expect(page.getByRole('heading', { name: 'Import students from CSV' })).toBeVisible();
}

test.describe('Tenant admin student CSV import', () => {
  test('downloads the strict CSV template', async ({ page }) => {
    await installCsvImportMock(page);
    await openImporter(page);
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download template' }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe('safebus-student-import-template.csv');
  });

  test('previews and atomically imports valid student rows', async ({ page }) => {
    const mock = await installCsvImportMock(page);
    await openImporter(page);
    await page.getByLabel('Student CSV file').setInputFiles({
      name: 'students.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(
        'first_name,last_name,preferred_name,grade,school_name\nAvery,Johnson,,4,Central School\nSam,Lee,Sammy,,\n',
      ),
    });

    await expect(page.getByRole('heading', { name: 'Preview 2 students' })).toBeVisible();
    expect(mock.previewCalls()).toBe(1);
    await page.getByRole('button', { name: 'Import 2 students' }).click();
    await expect(page.getByText('2 students imported.')).toBeVisible();
    expect(mock.commitCalls()).toBe(1);
  });

  test('blocks unsupported columns before calling the database', async ({ page }) => {
    const mock = await installCsvImportMock(page);
    await openImporter(page);
    await page.getByLabel('Student CSV file').setInputFiles({
      name: 'private-data.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from('first_name,last_name,address\nAvery,Johnson,Private\n'),
    });

    await expect(page.getByText('The "address" column is not supported.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Import 1 students' })).toBeDisabled();
    expect(mock.previewCalls()).toBe(0);
  });

  test('requires duplicate acknowledgement before commit', async ({ page }) => {
    const mock = await installCsvImportMock(page, { duplicateWarning: true });
    await openImporter(page);
    await page.getByLabel('Student CSV file').setInputFiles({
      name: 'duplicate.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from('first_name,last_name\nExisting,Student\n'),
    });

    const importButton = page.getByRole('button', { name: 'Import 1 students' });
    await expect(page.getByText('1 possible duplicate warning')).toBeVisible();
    await expect(importButton).toBeDisabled();
    await page
      .getByLabel(/I reviewed the possible duplicates/)
      .check();
    await expect(importButton).toBeEnabled();
    await importButton.click();
    await expect(page.getByText('1 student imported.')).toBeVisible();
    expect(mock.commitCalls()).toBe(1);
  });

  test('paginates a 5,000-row preview without rendering every row', async ({ page }) => {
    await installCsvImportMock(page);
    await openImporter(page);
    const rows = Array.from(
      { length: 5_000 },
      (_, index) => `First${index},Last${index}`,
    ).join('\n');
    await page.getByLabel('Student CSV file').setInputFiles({
      name: 'large.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(`first_name,last_name\n${rows}`),
    });

    const importer = page.getByTestId('student-csv-import');
    await expect(importer.getByRole('row')).toHaveCount(51);
    await expect(page.getByTestId('student-csv-pagination')).toContainText(
      'Showing 1-50 of 5,000',
    );
    await page.getByTestId('student-csv-pagination').getByRole('button', { name: 'Next' }).click();
    await expect(page.getByTestId('student-csv-pagination')).toContainText(
      'Showing 51-100 of 5,000',
    );
  });

  test('keeps the preview available for a safe commit retry', async ({ page }) => {
    const mock = await installCsvImportMock(page, { failFirstCommit: true });
    await openImporter(page);
    await page.getByLabel('Student CSV file').setInputFiles({
      name: 'retry.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from('first_name,last_name\nRetry,Student\n'),
    });

    const importButton = page.getByRole('button', { name: 'Import 1 students' });
    await importButton.click();
    await expect(page.getByText('No student rows were saved.')).toBeVisible();
    await expect(importButton).toBeEnabled();
    await importButton.click();
    await expect(page.getByText('1 student imported.')).toBeVisible();
    expect(mock.commitCalls()).toBe(2);
  });

  test('does not show CSV import to transportation admins', async ({ page }) => {
    await installCsvImportMock(page, { role: 'transportation_admin' });
    await page.goto('/admin/students');
    await expect(page.getByRole('heading', { name: 'Students', level: 1 })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Import CSV' })).toHaveCount(0);
  });
});
