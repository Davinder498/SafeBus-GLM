import { expect, test } from '@playwright/test';
import { installGuardianVisibilityMock } from '../smoke/fixtures/guardian-bus-visibility';
import { installLocalOnlyBoundary } from '../smoke/fixtures/local-only';

for (const role of ['guardian', 'driver'] as const) {
  test(`${role} sees event titles and separate times in inbox and pushed detail`, async ({
    page,
  }, testInfo) => {
    await installLocalOnlyBoundary(page);
    await installGuardianVisibilityMock(page, { role });
    const id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    const notice = {
      id,
      event_type: 'trip_completed',
      category: 'trip_status',
      severity: 'info',
      title: 'Trip completed',
      body: 'Outbound trip for route Demo 01 has been completed by bus Demo 01.',
      occurred_at: '2026-10-27T12:00:00Z',
      created_at: '2026-10-27T12:00:00Z',
      read_at: null,
      archived_at: null,
      destination_path: `/notifications?notification=${id}`,
    };
    await page.route('**/rest/v1/rpc/get_user_notifications', (route) =>
      route.fulfill({ json: [notice] }),
    );
    await page.route('**/rest/v1/rpc/get_user_notification_detail', (route) =>
      route.fulfill({ json: route.request().postDataJSON().p_id === id ? [notice] : [] }),
    );
    await page.route('**/rest/v1/rpc/get_user_notification_unread_count', (route) =>
      route.fulfill({ json: 1 }),
    );
    await page.route('**/rest/v1/rpc/mark_user_notifications_read', (route) =>
      route.fulfill({ json: 1 }),
    );
    await page.goto('/notifications');
    const card = page.locator('[data-ui="notification-card"]');
    await expect(card.getByText(notice.title, { exact: true })).toBeVisible();
    await expect(card.getByText(notice.body, { exact: true })).toBeVisible();
    await expect(card.locator('time')).toHaveAttribute('datetime', notice.occurred_at);
    // Reproduce the destination retained by the native tap listener before app startup.
    await page.evaluate(
      (path) => sessionStorage.setItem('safebus.pendingNotificationPath', path),
      notice.destination_path,
    );
    await page.reload();
    await expect(page).toHaveURL(new RegExp(`notification=${id}`));
    const detail = page.locator('[data-ui="notification-detail-card"]');
    await expect(detail.getByRole('heading', { name: notice.title, exact: true })).toBeVisible();
    await expect(detail.locator('time')).toHaveAttribute('datetime', notice.occurred_at);
    await expect(page.locator('[data-ui="notification-card"]')).toHaveCount(0);
    await page.screenshot({
      path: testInfo.outputPath(`${role}-notification-template.png`),
      fullPage: true,
    });
    await page.goto('/notifications?notification=bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
    await expect(page.getByText('This notification is no longer available')).toBeVisible();
    await expect(page.locator('[data-ui="notification-detail-card"]')).toHaveCount(0);
  });
}
