import { expect, test } from '@playwright/test';
import { installAdminWorkflowMock } from './fixtures/admin-workflow';

const rows = [
  {
    id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    event_type: 'trip_late',
    category: 'operations',
    severity: 'warning',
    title: 'Bus reported late',
    body: 'Bus 01 on Route 01 was reported late at 1:48 PM on Oct 9, 2026.',
    occurred_at: '2026-10-09T19:48:00Z',
    created_at: '2026-10-09T19:48:00Z',
    read_at: null,
    archived_at: null,
    destination_path: '/notifications?notification=aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  },
  {
    id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    event_type: 'mechanical_disruption',
    category: 'operations',
    severity: 'urgent',
    title: 'Mechanical disruption',
    body: 'Bus 02 on Route 02 has a reported mechanical problem at 1:45 PM on Oct 9, 2026.',
    occurred_at: '2026-10-09T19:45:00Z',
    created_at: '2026-10-09T19:45:00Z',
    read_at: null,
    archived_at: null,
    destination_path: '/notifications?notification=bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  },
];

test('tenant exception inbox has compact cards and descriptive, accessible detail links', async ({
  page,
}, testInfo) => {
  await installAdminWorkflowMock(page);
  let archived = false;
  await page.route('**/rest/v1/rpc/get_user_notifications', (route) =>
    route.fulfill({
      json:
        route.request().postDataJSON()?.p_category === 'trip_status'
          ? []
          : rows.filter((_, index) => !archived || index !== 0),
    }),
  );
  await page.route('**/rest/v1/rpc/get_user_notification_unread_count', (route) =>
    route.fulfill({ json: archived ? 1 : 2 }),
  );
  await page.route('**/rest/v1/rpc/get_user_notification_detail', (route) =>
    route.fulfill({ json: rows.filter((row) => row.id === route.request().postDataJSON()?.p_id) }),
  );
  await page.route('**/rest/v1/rpc/mark_user_notifications_read', (route) =>
    route.fulfill({ json: 1 }),
  );
  await page.route('**/rest/v1/rpc/archive_user_notifications', (route) => {
    archived = true;
    return route.fulfill({ json: 1 });
  });
  await page.goto('/notifications');
  const cards = page.locator('[data-ui="notification-card"]');
  await expect(cards).toHaveCount(2);
  await expect(cards.first()).toHaveCSS('padding', '12px 16px');
  await expect(page.locator('[data-ui="notification-filters"]')).toHaveCSS('margin-top', '24px');
  await expect(page.locator('[data-ui="notification-list"]')).toHaveCSS('margin-top', '0px');
  await expect(page.getByText(rows[0].body, { exact: true })).toBeVisible();
  await expect(page.getByText(rows[1].body, { exact: true })).toBeVisible();
  const gap = await cards.evaluateAll(
    (elements) =>
      elements[1].getBoundingClientRect().top - elements[0].getBoundingClientRect().bottom,
  );
  expect(gap).toBe(8);
  await expect(page.getByText('Pickup was recorded', { exact: false })).toHaveCount(0);
  await expect(page.getByText('was completed', { exact: false })).toHaveCount(0);
  await page.getByRole('button', { name: `Open notification: ${rows[0].body}` }).click();
  await expect(page.getByRole('heading', { name: 'Notification details' })).toBeFocused();
  await page.getByRole('button', { name: 'Archive', exact: true }).click();
  await expect(cards).toHaveCount(1);
  await expect(page.getByRole('heading', { name: 'Notification details' })).toHaveCount(0);
  await expect(page.locator('[data-ui="notification-toast"]')).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath('compact-tenant-notifications.png'),
    fullPage: true,
  });
});
