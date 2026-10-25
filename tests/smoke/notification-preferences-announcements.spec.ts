import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { installAdminWorkflowMock } from './fixtures/admin-workflow';
import { installLocalOnlyBoundary } from './fixtures/local-only';

const initial = {
  inAppEnabled: true,
  tripUpdates: true,
  operationalAlerts: true,
  deliveryHealth: true,
};
async function setup(
  page: Page,
  role: 'tenant_admin' | 'school_admin' | 'transportation_admin' = 'tenant_admin',
) {
  await installLocalOnlyBoundary(page);
  await installAdminWorkflowMock(page, role);
  let preferences = { ...initial };
  const saves: unknown[] = [];
  const sends: Record<string, unknown>[] = [];
  const history: Record<string, unknown>[] = [];
  await page.route('**/rest/v1/rpc/get_admin_inbox_preferences', (route) =>
    route.fulfill({ json: preferences }),
  );
  await page.route('**/rest/v1/rpc/set_admin_inbox_preferences', (route) => {
    preferences = route.request().postDataJSON().p_preferences;
    saves.push(preferences);
    return route.fulfill({ json: preferences });
  });
  await page.route('**/rest/v1/rpc/get_announcement_audience', (route) => {
    const audience = route.request().postDataJSON().p_audience;
    return route.fulfill({
      json: {
        guardians: audience === 'drivers' ? 0 : 3,
        drivers: audience === 'guardians' ? 0 : 2,
        total: audience === 'all' ? 5 : audience === 'drivers' ? 2 : 3,
      },
    });
  });
  await page.route('**/rest/v1/rpc/get_authority_announcements', (route) =>
    route.fulfill({ json: history }),
  );
  await page.route('**/rest/v1/rpc/send_authority_announcement', (route) => {
    const body = route.request().postDataJSON();
    sends.push(body);
    const row = {
      id: body.p_id,
      title: body.p_title,
      body: body.p_body,
      audience: body.p_audience,
      senderName: 'Test Admin',
      createdAt: '2026-10-25T10:00:00Z',
      recipientCount: body.p_expected_recipient_count,
      guardianCount: body.p_audience === 'drivers' ? 0 : 3,
      driverCount: body.p_audience === 'guardians' ? 0 : 2,
    };
    if (!history.some((item) => item.id === row.id)) history.unshift(row);
    return route.fulfill({ json: row });
  });
  return { saves, sends, history };
}

for (const role of ['tenant_admin', 'school_admin', 'transportation_admin'] as const) {
  test(`${role} controls personal inbox preferences without changing authority delivery`, async ({
    page,
  }) => {
    const { saves } = await setup(page, role);
    await page.goto('/notifications');
    await page.getByRole('link', { name: 'Notification settings', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Notification preferences', exact: true }),
    ).toBeVisible();
    await expect(page.getByText('Android push', { exact: true })).toHaveCount(0);
    await expect(page.getByText('Email and phone alerts', { exact: true })).toHaveCount(0);
    await page.getByRole('switch', { name: 'Operational alerts', exact: true }).click();
    await expect(page.getByRole('status')).toHaveText('Saved');
    expect(saves).toEqual([{ ...initial, operationalAlerts: false }]);
    await page.getByRole('switch', { name: 'In-app notifications', exact: true }).click();
    await expect(page.getByRole('switch', { name: 'Trip updates' })).toBeDisabled();
    await expect(page.getByRole('switch', { name: 'Trip updates' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(
      (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
        .violations,
    ).toEqual([]);
  });
}

test('broadcasts use Operational alerts and require a reviewed audience and message', async ({
  page,
}, testInfo) => {
  const { sends } = await setup(page);
  await page.goto('/admin/announcements');
  await expect(page.getByText('5 recipients · 3 guardians · 2 drivers')).toBeVisible();
  await page.getByLabel('Audience', { exact: true }).selectOption('guardians');
  await expect(page.getByText('3 recipients · 3 guardians · 0 drivers')).toBeVisible();
  await page.getByLabel('Audience', { exact: true }).selectOption('drivers');
  await expect(page.getByText('2 recipients · 0 guardians · 2 drivers')).toBeVisible();
  await page.getByLabel('Title', { exact: true }).fill('Service cancelled');
  await page.getByLabel('Message', { exact: true }).fill('No bus service tomorrow.');
  await page.getByRole('button', { name: 'Review announcement' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('Drivers only · 2 recipients')).toBeVisible();
  expect(sends).toHaveLength(0);
  await dialog.getByRole('button', { name: 'Back to edit' }).click();
  await page.getByLabel('Audience', { exact: true }).selectOption('all');
  await page.getByRole('button', { name: 'Review announcement' }).click();
  await dialog.getByRole('button', { name: 'Send announcement', exact: true }).click();
  await expect(page.getByText('Announcement sent to 5 recipients.')).toBeVisible();
  expect(sends).toHaveLength(1);
  expect(sends[0]).toMatchObject({
    p_audience: 'all',
    p_title: 'Service cancelled',
    p_body: 'No bus service tomorrow.',
    p_expected_recipient_count: 5,
  });
  await expect(page.getByRole('heading', { name: 'Service cancelled', exact: true })).toBeVisible();
  await expect(page.getByLabel('Title', { exact: true })).toHaveValue('');
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('announcements.png'), fullPage: true });
});

test('an ambiguous network failure can be retried with the same send identifier', async ({
  page,
}) => {
  await setup(page);
  const attempts: Record<string, unknown>[] = [];
  await page.route('**/rest/v1/rpc/send_authority_announcement', async (route) => {
    const body = route.request().postDataJSON();
    attempts.push(body);
    if (attempts.length === 1)
      return route.fulfill({ status: 503, json: { message: 'Connection interrupted' } });
    return route.fulfill({
      json: {
        id: body.p_id,
        title: body.p_title,
        body: body.p_body,
        audience: body.p_audience,
        senderName: 'Test Admin',
        createdAt: '2026-10-25T10:00:00Z',
        recipientCount: 5,
        guardianCount: 3,
        driverCount: 2,
      },
    });
  });
  await page.goto('/admin/announcements');
  await page.getByLabel('Title', { exact: true }).fill('Weather update');
  await page.getByLabel('Message', { exact: true }).fill('Check bus service before travelling.');
  for (let i = 0; i < 2; i++) {
    await page.getByRole('button', { name: 'Review announcement' }).click();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Send announcement', exact: true })
      .click();
    if (i === 0) await expect(page.getByRole('alert')).toBeVisible();
  }
  await expect(page.getByText('Announcement sent to 5 recipients.')).toBeVisible();
  expect(attempts[0].p_id).toBe(attempts[1].p_id);
});

test('an empty audience prevents sending and keeps the message available to edit', async ({
  page,
}) => {
  const { sends } = await setup(page, 'school_admin');
  await page.route('**/rest/v1/rpc/get_announcement_audience', (route) =>
    route.fulfill({ json: { guardians: 0, drivers: 0, total: 0 } }),
  );
  await page.goto('/admin/announcements');
  await expect(page.getByText('Your school only', { exact: false })).toBeVisible();
  await page.getByLabel('Title', { exact: true }).fill('Update');
  await page.getByLabel('Message', { exact: true }).fill('Service update.');
  await page.getByRole('button', { name: 'Review announcement' }).click();
  await expect(page.getByRole('alert')).toHaveText(
    'There are no active recipients for this audience.',
  );
  expect(sends).toHaveLength(0);
});
