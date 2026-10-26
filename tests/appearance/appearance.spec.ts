import { expect, test } from '@playwright/test';
import { installLocalOnlyBoundary } from '../smoke/fixtures/local-only';
import { installGuardianVisibilityMock } from '../smoke/fixtures/guardian-bus-visibility';
import { guardianVisibilityRow } from '../smoke/fixtures/guardian-bus-visibility';
import { installMapProviderAvailable } from '../smoke/fixtures/map-provider';
import { installBilling } from '../smoke/fixtures/billing';
import { installAdminWorkflowMock } from '../smoke/fixtures/admin-workflow';
import { installInvitedUserMock } from '../smoke/fixtures/invitation';
import { expectNoWcagAaViolations } from '../smoke/fixtures/accessibility';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

test.beforeEach(async ({ page }) => {
  await installLocalOnlyBoundary(page);
});

test('the pre-paint theme works under script-src self without React or inline script exceptions', async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.addInitScript(() => localStorage.setItem('safebus.theme', 'dark'));
  const source = readFileSync('packages/config/theme-bootstrap.js', 'utf8');
  const digest = createHash('sha256').update(source).digest('hex').slice(0, 12);
  const startupScript = `/appearance-bootstrap.${digest}.js`;
  await page.route('**/login', async (route) => {
    const response = await route.fetch();
    expect(await response.text()).toContain(`<script src="${startupScript}"></script>`);
    // A fixed page loads the real startup script without Vite's development
    // preamble or React. No fetched markup is sanitized or rendered as HTML.
    await route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: `<!doctype html><html lang="en"><head><meta name="theme-color" content="#F2F6F7"><script src="${startupScript}"></script></head><body></body></html>`,
      headers: {
        'content-security-policy': "script-src 'self'; style-src 'self' 'unsafe-inline'",
      },
    });
  });
  await page.goto('/login');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('script[src*="appearance-bootstrap"]')).toHaveCount(1);
});

test('the settings toggle has only Light and Dark, persists, and ignores device changes', async ({
  page,
}, info) => {
  const mobile = info.project.name === 'android-webview';
  if (mobile) await installGuardianVisibilityMock(page);
  else await installAdminWorkflowMock(page);
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto(mobile ? '/notifications/settings' : '/admin/settings');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  const appBar = page.locator('[data-ui=app-bar]');
  await expect(appBar.getByRole('switch', { name: 'Dark mode' })).toHaveCount(0);
  await expect(appBar).toHaveCSS('background-color', 'rgb(23, 43, 58)');
  await expect(appBar.getByTestId('safebus-wordmark')).toHaveCSS('color', 'rgb(255, 255, 255)');
  const toggle = page
    .locator('[data-ui=appearance-settings]')
    .getByRole('switch', { name: 'Dark mode' });
  await expect(toggle).not.toBeChecked();
  await expect(page.getByRole('combobox', { name: 'Appearance' })).toHaveCount(0);
  await toggle.focus();
  await page.keyboard.press('Space');
  await expect(toggle).toBeChecked();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(appBar).toHaveCSS('background-color', 'rgb(23, 43, 58)');
  await page.reload();
  await expect(toggle).toBeChecked();
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expectNoWcagAaViolations(page, info.project.name + ' dark dashboard');
  await page.screenshot({ path: info.outputPath('dark-toggle.png'), fullPage: true });
  await toggle.press('Enter');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.setViewportSize({ width: 320, height: 700 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('unavailable preference storage keeps the settings toggle usable', async ({ page }, info) => {
  if (info.project.name === 'android-webview') await installGuardianVisibilityMock(page);
  else await installAdminWorkflowMock(page);
  await page.addInitScript(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === 'safebus.theme') throw new Error('blocked');
      return original.call(this, key, value);
    };
  });
  await page.goto(
    info.project.name === 'android-webview' ? '/notifications/settings' : '/admin/settings',
  );
  await page
    .locator('[data-ui=appearance-settings]')
    .getByRole('switch', { name: 'Dark mode' })
    .click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});

test('cross-tab changes update public pages without adding a public toggle', async ({
  page,
  context,
}, info) => {
  if (info.project.name === 'android-webview') await installGuardianVisibilityMock(page);
  else await installAdminWorkflowMock(page);
  await page.goto(
    info.project.name === 'android-webview' ? '/notifications/settings' : '/admin/settings',
  );
  const other = await context.newPage();
  await installLocalOnlyBoundary(other);
  await other.goto('/login');
  await expect(other.getByRole('switch', { name: 'Dark mode' })).toHaveCount(0);
  await page
    .locator('[data-ui=appearance-settings]')
    .getByRole('switch', { name: 'Dark mode' })
    .click();
  await expect(other.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expectNoWcagAaViolations(other, 'dark login');
  if (info.project.name === 'web') {
    await other.goto('/');
    await expect(other.getByRole('switch', { name: 'Dark mode' })).toHaveCount(0);
    await expect(other.getByText('School transportation visibility', { exact: true })).toHaveCount(
      0,
    );
    await other.screenshot({
      path: info.outputPath('landing-without-toggle-or-badge.png'),
      fullPage: true,
    });
  }
  await other.close();
});

test('invitation and password screens inherit appearance before account activation', async ({
  page,
}, info) => {
  await installInvitedUserMock(page, {
    role: info.project.name === 'web' ? 'tenant_admin' : 'guardian',
  });
  await page.addInitScript(() => localStorage.setItem('safebus.theme', 'dark'));
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
    await page.addInitScript(() => localStorage.setItem('safebus.theme', 'dark'));
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
      'rgb(23, 43, 58)',
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
      .getByRole('switch', { name: 'Dark mode' })
      .click();
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
  await page.addInitScript(() => localStorage.setItem('safebus.theme', 'dark'));
  await page.goto('/notifications/settings');
  const toggle = page
    .locator('[data-ui=appearance-settings]')
    .getByRole('switch', { name: 'Dark mode' });
  await expect(toggle).toBeChecked();
  await toggle.click();
  await expect(toggle).not.toBeChecked();
  await toggle.click();
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
  await page.addInitScript(() => localStorage.setItem('safebus.theme', 'dark'));
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
