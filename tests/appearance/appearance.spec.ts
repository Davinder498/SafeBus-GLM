import { expect, test } from '@playwright/test';
import { installLocalOnlyBoundary } from '../smoke/fixtures/local-only';
import { installGuardianVisibilityMock } from '../smoke/fixtures/guardian-bus-visibility';
import { guardianVisibilityRow } from '../smoke/fixtures/guardian-bus-visibility';
import { installMapProviderAvailable } from '../smoke/fixtures/map-provider';
import { installBilling } from '../smoke/fixtures/billing';
import { installAdminWorkflowMock } from '../smoke/fixtures/admin-workflow';
import { installInvitedUserMock } from '../smoke/fixtures/invitation';
import { expectNoWcagAaViolations } from '../smoke/fixtures/accessibility';

test.beforeEach(async ({ page }) => {
  await installLocalOnlyBoundary(page);
});

test('the pre-paint theme works under script-src self without React or inline script exceptions', async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.addInitScript(() => localStorage.setItem('safebus.theme', 'dark'));
  await page.route('**/login', async (route) => {
    const response = await route.fetch();
    // Remove Vite's development-only React preamble and module entrypoints.
    // Only the actual blocking bootstrap may set the document appearance.
    const html = (await response.text()).replace(
      /<script\b[^>]*type="module"[^>]*>[\s\S]*?<\/script>/g,
      '',
    );
    await route.fulfill({
      response,
      body: html,
      headers: {
        ...response.headers(),
        'content-security-policy': "script-src 'self'; style-src 'self' 'unsafe-inline'",
      },
    });
  });
  await page.goto('/login');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('script[src*="appearance-bootstrap"]')).toHaveCount(1);
});

test('System follows the device, explicit choice persists, and the compact selector fits', async ({
  page,
}, info) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/login');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.getByRole('heading', { name: 'Sign in', exact: true })).toHaveCSS(
    'color',
    'rgb(252, 214, 107)',
  );
  await expect(page.getByTestId('safebus-wordmark').last()).toHaveCSS(
    'color',
    'rgb(255, 255, 255)',
  );
  const selector = page.getByLabel('Appearance', { exact: true });
  await selector.selectOption('light');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await selector.selectOption('dark');
  await expect(page.locator('input[type=email]')).toHaveCSS('background-color', 'rgb(24, 35, 47)');
  await expect(page.locator('[data-variant=primary]')).toHaveCSS(
    'background-color',
    'rgb(252, 214, 107)',
  );
  await expectNoWcagAaViolations(page, info.project.name + ' dark login');
  await page.screenshot({ path: info.outputPath('dark-login.png'), fullPage: true });
  await selector.selectOption('system');
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expectNoWcagAaViolations(page, info.project.name + ' light login');
  await page.setViewportSize({ width: 320, height: 700 });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  expect(overflow).toBe(false);
});

test('invalid and unavailable storage keep the theme usable', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('safebus.theme', 'invalid');
    Object.defineProperty(Storage.prototype, 'setItem', {
      value: () => {
        throw new Error('blocked');
      },
    });
  });
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/login');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.getByLabel('Appearance', { exact: true }).selectOption('light');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
});

test('cross-tab preference updates and public screens use the shared theme', async ({
  page,
  context,
}) => {
  await page.goto('/login');
  const other = await context.newPage();
  await installLocalOnlyBoundary(other);
  await other.goto('/privacy');
  await page.getByLabel('Appearance', { exact: true }).selectOption('dark');
  await expect(other.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(other.locator('[data-ui=public-app-bar]')).toHaveCSS(
    'background-color',
    /rgba?\(24, 35, 47/,
  );
  await expectNoWcagAaViolations(other, 'dark privacy');
  await other.setViewportSize({ width: 320, height: 700 });
  expect(await other.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await other.close();
});

test('invitation and password screens inherit appearance before account activation', async ({
  page,
}, info) => {
  await installInvitedUserMock(page, {
    role: info.project.name === 'web' ? 'tenant_admin' : 'guardian',
  });
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/accept-invitation');
  await expect(page.getByRole('heading', { name: 'Create your password' })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expectNoWcagAaViolations(page, 'dark invitation');
  await page.goto('/update-password');
  await expect(page.getByRole('heading', { name: 'Choose a new password' })).toBeVisible();
  await expectNoWcagAaViolations(page, 'dark password');
});

for (const role of [
  'tenant_admin',
  'school_admin',
  'transportation_admin',
  'guardian',
  'driver',
] as const) {
  test(`${role} settings and navigation honor appearance`, async ({ page }, info) => {
    const mobile = info.project.name === 'android-webview';
    test.skip(mobile !== (role === 'guardian' || role === 'driver'));
    if (role === 'guardian' || role === 'driver')
      await installGuardianVisibilityMock(page, { role });
    else await installAdminWorkflowMock(page, role);
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto(
      role === 'driver'
        ? '/driver/settings'
        : role === 'guardian'
          ? '/notifications/settings'
          : '/admin/settings',
    );
    await expect(page.locator('[data-ui=appearance-settings]')).toBeVisible();
    await expect(page.locator('[data-ui=app-bar]')).toHaveCSS(
      'background-color',
      /rgba?\(24, 35, 47/,
    );
    await expect(page.locator('[data-ui=appearance-settings]')).toHaveCSS(
      'background-color',
      'rgb(24, 35, 47)',
    );
    await expectNoWcagAaViolations(page, `${role} dark settings`);
    await page.screenshot({ path: info.outputPath(role + '-dark-settings.png'), fullPage: true });
    await page.locator('[data-ui=dropdown] > button').click();
    await expect(page.locator('[data-ui=dropdown-panel]')).toHaveCSS(
      'background-color',
      'rgb(24, 35, 47)',
    );
    await page.keyboard.press('Escape');
    await page
      .locator('[data-ui=appearance-settings]')
      .getByLabel('Appearance', { exact: true })
      .selectOption('light');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await expect(page.locator('[data-ui=appearance-settings]')).toHaveCSS(
      'background-color',
      'rgb(255, 255, 255)',
    );
  });
}

test('platform pricing forms, dropdowns and confirmation dialogs use the same dark palette', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'web');
  await installBilling(page, false, null, { role: 'platform_super_admin' });
  await page.route('**/.netlify/functions/platform-pricing', (route) =>
    route.fulfill({
      json: {
        prices: [],
        discounts: [],
        priceCursor: null,
        discountCursor: null,
        pending: null,
      },
    }),
  );
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/admin/pricing');
  const form = page.getByRole('form', { name: 'New subscription price' });
  await form.getByLabel('Price name').fill('Synthetic preview only');
  await form.getByLabel('Price per bus (CAD)').fill('25');
  await form.getByRole('button', { name: 'Review price' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.locator('[data-ui=dialog-panel]')).toHaveCSS(
    'background-color',
    'rgb(24, 35, 47)',
  );
  await expectNoWcagAaViolations(page, 'dark platform confirmation');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.screenshot({ path: info.outputPath('platform-dark-pricing.png'), fullPage: true });
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('html')).toHaveCSS('color-scheme', 'light');
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
});

test('guardian map controls and popup stay dark without changing provider tiles', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'android-webview');
  await installGuardianVisibilityMock(page, { rows: [guardianVisibilityRow()] });
  await installMapProviderAvailable(page);
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/guardian/live-map?bus=42');
  await expect(page.getByTestId('guardian-fullscreen-map')).toBeVisible();
  await page.getByRole('button', { name: 'Bus 42', exact: true }).press('Enter');
  await expect(page.locator('.leaflet-popup-content-wrapper')).toHaveCSS(
    'background-color',
    'rgb(24, 35, 47)',
  );
  await expect(page.locator('.leaflet-tile').first()).toHaveCSS('filter', 'none');
  await expect(page.getByRole('link', { name: 'OpenStreetMap contributors' })).toBeVisible();
  await page.screenshot({ path: info.outputPath('guardian-dark-map.png'), fullPage: true });
});
