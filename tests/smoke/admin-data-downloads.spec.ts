import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { ADMIN_IDS, installAdminWorkflowMock } from './fixtures/admin-workflow';
import { installLocalOnlyBoundary } from './fixtures/local-only';

async function install(page: Page, entity: string, count = 101) {
  await installLocalOnlyBoundary(page);
  await installAdminWorkflowMock(page);
  const records = Array.from({ length: count }, (_, index) => ({
    id: `record-${index}`,
    tenant_id: ADMIN_IDS.tenant,
    first_name: `Student${index}`,
    last_name: 'Johnson',
    full_name: `Member${index}`,
    preferred_name: null,
    grade: '4',
    school_name: 'Prairie',
    status: 'active',
    email: `person${index}@example.test`,
    phone: '+14035550100',
    active_link_count: 1,
    license_expiry_date: '2090-01-01',
    employee_number: `EMP${index}`,
    bus_number: `B${index}`,
    fleet_number: `F${index}`,
    capacity: 50,
    license_plate: `PLATE${index}`,
    profile_id: `profile-${index}`,
    school_id: null,
    license_number: 'DO-NOT-EXPORT-LICENCE',
    address_line1: 'DO-NOT-EXPORT-ADDRESS',
    token_hash: 'DO-NOT-EXPORT-TOKEN',
  }));
  const calls: Array<{ page: number; pageSize: number; search: string }> = [];
  const qrTokens = new Map<string, string>();
  await page.route('**/rest/v1/rpc/*', async (route) => {
    const name = new URL(route.request().url()).pathname.split('/').at(-1);
    const args = route.request().postDataJSON();
    if (
      ['get_admin_students_page', 'get_admin_buses_page', 'get_admin_paginated_list'].includes(
        name ?? '',
      ) &&
      (name !== 'get_admin_paginated_list' || args.p_entity === entity)
    ) {
      const filtered = records.filter(
        (row) =>
          !args.p_search ||
          JSON.stringify(row).toLowerCase().includes(String(args.p_search).toLowerCase()),
      );
      calls.push({ page: args.p_page, pageSize: args.p_page_size, search: args.p_search });
      return route.fulfill({
        json: {
          rows: filtered.slice(
            (args.p_page - 1) * args.p_page_size,
            args.p_page * args.p_page_size,
          ),
          totalCount: filtered.length,
          page: args.p_page,
          pageSize: args.p_page_size,
        },
      });
    }
    if (name === 'admin_get_printable_qr') {
      if (!qrTokens.has(args.p_entity_id))
        qrTokens.set(
          args.p_entity_id,
          `${args.p_kind === 'student' ? 'sbus_qr_v1_' : 'sbus_bus_v1_'}${String(args.p_entity_id)
            .replace(/[^A-Za-z0-9]/g, '')
            .padEnd(43, 'A')}`,
        );
      return route.fulfill({
        json: [
          {
            credential_id: `credential-${args.p_entity_id}`,
            raw_token: qrTokens.get(args.p_entity_id),
            print_status: 'ready',
          },
        ],
      });
    }
    await route.fallback();
  });
  return { calls, qrTokens };
}

for (const entity of ['students', 'guardians', 'drivers', 'buses']) {
  test(`${entity}: CSV includes filtered records across pages and excludes private fields`, async ({
    page,
  }) => {
    const fixture = await install(page, entity);
    await page.goto(`/admin/${entity}`);
    const exportButton = page.getByRole('button', { name: 'Download CSV', exact: true });
    await expect(exportButton).toBeEnabled();
    const [download] = await Promise.all([page.waitForEvent('download'), exportButton.click()]);
    expect(download.suggestedFilename()).toMatch(
      new RegExp(`^SafeBus-${entity}-\\d{4}-\\d{2}-\\d{2}\\.csv$`),
    );
    const csv = await readFile((await download.path())!, 'utf8');
    expect(csv).toContain(
      entity === 'students' ? 'Student100' : entity === 'buses' ? 'B100' : 'Member100',
    );
    expect(csv).not.toContain('DO-NOT-EXPORT');
    expect(fixture.calls.some((call) => call.page === 2 && call.pageSize === 100)).toBe(true);
    const search = page.getByRole('searchbox');
    await search.fill(
      entity === 'students' ? 'Student100' : entity === 'buses' ? 'B100' : 'Member100',
    );
    await expect(exportButton).toBeEnabled();
    const [filtered] = await Promise.all([page.waitForEvent('download'), exportButton.click()]);
    const filteredCsv = await readFile((await filtered.path())!, 'utf8');
    expect(filteredCsv.split('\r\n').filter(Boolean)).toHaveLength(2);
  });
}

test('bulk student sheets reuse the same QR codes and print twelve passes per page', async ({
  page,
}) => {
  const fixture = await install(page, 'students', 13);
  await page.goto('/admin/students');
  await expect(page.getByRole('button', { name: 'Prepare QR sheets' })).toBeEnabled();
  await page.getByRole('button', { name: 'Prepare QR sheets' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Prepare sheets' }).click();
  await expect(page.getByText('13 QR codes ready.', { exact: false })).toBeVisible();
  const tokens = Array.from(fixture.qrTokens.values());
  expect(tokens).toHaveLength(13);
  await page.evaluate(() => {
    window.print = () => undefined;
  });
  await page.getByRole('button', { name: 'Print QR sheets', exact: true }).click();
  await expect(page.locator('body')).toHaveClass(/printing-qr-batch/);
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('.qr-batch-print-page')).toHaveCount(2);
  await expect(page.locator('.qr-batch-print-page').first().locator('article')).toHaveCount(12);
  await page
    .locator('.qr-batch-print-page')
    .first()
    .screenshot({ path: '.codex-artifacts/downloads-qr-sheet.png' });
  await page.emulateMedia({ media: 'screen' });
  await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
  await page.getByRole('button', { name: 'Dismiss QR sheets' }).click();
  await page.getByRole('button', { name: 'Prepare QR sheets' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Prepare sheets' }).click();
  await expect(page.getByText('13 QR codes ready.', { exact: false })).toBeVisible();
  expect(Array.from(fixture.qrTokens.values())).toEqual(tokens);
});

test('bulk bus sheets use the same issued bus QR codes', async ({ page }) => {
  const fixture = await install(page, 'buses', 2);
  await page.goto('/admin/buses');
  await page.getByRole('button', { name: 'Prepare QR sheets' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Prepare sheets' }).click();
  await expect(page.getByText('2 QR codes ready.', { exact: false })).toBeVisible();
  await expect(page.getByRole('img', { name: 'QR for Bus B0' })).toBeVisible();
  expect(
    Array.from(fixture.qrTokens.values()).every((token) => token.startsWith('sbus_bus_v1_')),
  ).toBe(true);
  const issued = Array.from(fixture.qrTokens.values());
  await page.getByRole('button', { name: 'Dismiss QR sheets' }).click();
  await page.getByRole('button', { name: 'Prepare QR sheets' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Prepare sheets' }).click();
  await expect(page.getByText('2 QR codes ready.', { exact: false })).toBeVisible();
  expect(Array.from(fixture.qrTokens.values())).toEqual(issued);
});
