import { expect, test } from '@playwright/test';
import { installGuardianVisibilityMock } from '../smoke/fixtures/guardian-bus-visibility';
import { installLocalOnlyBoundary } from '../smoke/fixtures/local-only';
import { expectNoWcagAaViolations } from '../smoke/fixtures/accessibility';

for (const role of ['guardian', 'driver'] as const) {
  test(`${role} announcement push opens one card with normal read and archive actions`, async ({
    page,
  }, testInfo) => {
    await installLocalOnlyBoundary(page);
    await installGuardianVisibilityMock(page, { role });
    let read = false;
    let archived = false;
    let available = false;
    const id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    const notice = () => ({
      id,
      event_type: 'authority_announcement',
      category: 'operations',
      severity: 'info',
      title: 'Service update',
      body: 'Please check the revised bus departure time.\nThank you.',
      occurred_at: '2026-10-26T12:00:00Z',
      created_at: '2026-10-26T12:00:00Z',
      read_at: read ? '2026-10-26T12:01:00Z' : null,
      archived_at: null,
      destination_path: `/notifications?notification=${id}`,
    });
    await page.route('**/rest/v1/rpc/get_user_notifications', (route) =>
      route.fulfill({ json: !available || archived ? [] : [notice()] }),
    );
    await page.route('**/rest/v1/rpc/get_user_notification_detail', (route) =>
      route.fulfill({ json: !available || archived ? [] : [notice()] }),
    );
    await page.route('**/rest/v1/rpc/get_user_notification_unread_count', (route) =>
      route.fulfill({ json: !available || read || archived ? 0 : 1 }),
    );
    await page.route('**/rest/v1/rpc/mark_user_notifications_read', (route) => {
      read = route.request().postDataJSON().p_read;
      return route.fulfill({ json: 1 });
    });
    await page.route('**/rest/v1/rpc/archive_user_notifications', (route) => {
      archived = true;
      return route.fulfill({ json: 1 });
    });
    await page.goto('/notifications');
    await expect(page.getByText(/all caught up/)).toBeVisible();
    available = true;
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('safebus:push-received')));
    await expect(page.locator('[data-ui="notification-card"]')).toHaveCount(1);
    await page.goto(`/notifications?notification=${id}`);
    const detail = page.locator('[data-ui="notification-detail-card"]');
    await expect(detail).toBeVisible();
    await expect(detail.locator('time')).toHaveAttribute('datetime', notice().occurred_at);
    await expect(page.getByRole('heading', { name: 'Service update' })).toHaveCount(1);
    await expect(page.getByText(notice().body, { exact: true })).toHaveCount(1);
    await expect(page.locator('[data-ui="notification-card"]')).toHaveCount(0);
    await expect(detail.getByRole('button', { name: 'Mark unread', exact: true })).toBeVisible();
    await expectNoWcagAaViolations(page);
    await page.screenshot({
      path: testInfo.outputPath(`${role}-announcement-detail.png`),
      fullPage: true,
    });
    await detail.getByRole('button', { name: 'Mark unread', exact: true }).click();
    await expect(detail.getByRole('button', { name: 'Mark read', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Close notification details' }).click();
    const card = page.locator('[data-ui="notification-card"]');
    await expect(card).toHaveCount(1);
    await expect(card.getByText('Service update', { exact: true })).toBeVisible();
    await card.getByRole('button', { name: `Update: ${notice().body}` }).click();
    await expect(card.getByText('Read', { exact: true })).toBeVisible();
    await card.getByRole('button', { name: 'Archive Service update', exact: true }).click();
    await expect(card).toHaveCount(0);
    expect(archived).toBe(true);
  });
}
