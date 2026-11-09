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

for (const theme of ['light', 'dark'] as const) {
  test(`sign-in uses the shared action color and readable fields in ${theme}`, async ({
    page,
  }, info) => {
    const nativeDark = info.project.name === 'android-webview' && theme === 'dark';
    await page.addInitScript((value) => localStorage.setItem('safebus.theme', value), theme);
    await page.goto('/login');
    const submit = page.getByRole('button', { name: 'Sign in', exact: true });
    await expect(submit).toHaveCSS(
      'background-color',
      nativeDark ? 'rgb(156, 203, 255)' : 'rgb(29, 78, 216)',
    );
    await expect(submit).toHaveCSS('color', nativeDark ? 'rgb(16, 35, 60)' : 'rgb(255, 255, 255)');
    await expect(page.getByRole('textbox', { name: 'Email', exact: true })).toHaveCSS(
      'border-color',
      nativeDark ? 'rgb(130, 150, 174)' : 'rgb(123, 136, 153)',
    );
    await expectNoWcagAaViolations(page, `${info.project.name} ${theme} sign-in palette`);
    await page.screenshot({
      path: info.outputPath(`${theme}-sign-in-palette.png`),
      fullPage: true,
    });
  });
}

test('the pre-paint theme works under script-src self without React or inline script exceptions', async ({
  page,
}, info) => {
  const web = info.project.name === 'web';
  await page.emulateMedia({ colorScheme: 'light' });
  await page.addInitScript(() => localStorage.setItem('safebus.theme', 'dark'));
  const source = readFileSync('packages/config/theme-bootstrap.js', 'utf8');
  const digest = createHash('sha256').update(source).digest('hex').slice(0, 12);
  const startupScript = `/appearance-bootstrap.${digest}.js`;
  await page.route('**/login', async (route) => {
    const response = await route.fetch();
    const html = await response.text();
    expect(html).toContain(`<script src="${startupScript}"></script>`);
    if (web) expect(html).toContain('data-appearance-scope="public"');
    // A fixed page loads the real startup script without Vite's development
    // preamble or React. No fetched markup is sanitized or rendered as HTML.
    await route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: `<!doctype html><html lang="en"${web ? ' data-appearance-scope="public"' : ''}><head><meta name="theme-color" content="#F2F6F7"><script src="${startupScript}"></script></head><body></body></html>`,
      headers: {
        'content-security-policy': "script-src 'self'; style-src 'self' 'unsafe-inline'",
      },
    });
  });
  await page.goto('/login');
  await expect(page.locator('html')).toHaveAttribute('data-theme', web ? 'light' : 'dark');
  await expect(page.locator('script[src*="appearance-bootstrap"]')).toHaveCount(1);
});

test('the settings toggle has only Light and Dark, persists, and ignores device changes', async ({
  page,
}, info) => {
  const mobile = info.project.name === 'android-webview';
  if (mobile) await installGuardianVisibilityMock(page);
  else await installAdminWorkflowMock(page);
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto(mobile ? '/account/security' : '/admin/settings');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  const appBar = page.locator('[data-ui=app-bar]');
  await expect(appBar.getByRole('switch', { name: 'Dark mode' })).toHaveCount(0);
  await expect(appBar).toHaveCSS(
    'background-color',
    mobile ? 'rgb(23, 43, 58)' : 'rgb(255, 255, 255)',
  );
  await expect(appBar.getByTestId('safebus-wordmark')).toHaveCSS(
    'color',
    mobile ? 'rgb(255, 255, 255)' : 'rgb(23, 43, 58)',
  );
  if (!mobile) {
    await expect(page.locator('[data-portal="admin"] aside.sb-sidebar').first()).toHaveCSS(
      'background-color',
      'rgb(23, 43, 58)',
    );
  }
  const toggle = page
    .locator('[data-ui=appearance-settings]')
    .getByRole('switch', { name: 'Dark mode' });
  await expect(toggle).not.toBeChecked();
  await expect(page.getByRole('combobox', { name: 'Appearance' })).toHaveCount(0);
  await toggle.focus();
  await page.keyboard.press('Space');
  await expect(toggle).toBeChecked();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(appBar).toHaveCSS(
    'background-color',
    mobile ? 'rgb(23, 43, 58)' : 'rgb(24, 35, 47)',
  );
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
    info.project.name === 'android-webview' ? '/account/security' : '/admin/settings',
  );
  await page
    .locator('[data-ui=appearance-settings]')
    .getByRole('switch', { name: 'Dark mode' })
    .click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});

test('cross-tab changes preserve fixed public web appearance and the saved dashboard choice', async ({
  page,
  context,
}, info) => {
  if (info.project.name === 'android-webview') await installGuardianVisibilityMock(page);
  else await installAdminWorkflowMock(page);
  await page.goto(
    info.project.name === 'android-webview' ? '/account/security' : '/admin/settings',
  );
  const other = await context.newPage();
  await installLocalOnlyBoundary(other);
  await other.goto(info.project.name === 'web' ? '/' : '/login');
  await expect(other.getByRole('switch', { name: 'Dark mode' })).toHaveCount(0);
  await page
    .locator('[data-ui=appearance-settings]')
    .getByRole('switch', { name: 'Dark mode' })
    .click();
  await expect(other.locator('html')).toHaveAttribute(
    'data-theme',
    info.project.name === 'web' ? 'light' : 'dark',
  );
  if (info.project.name === 'web') {
    await expect(other.locator('[data-ui=public-app-bar]')).toHaveCSS(
      'background-color',
      'rgba(255, 255, 255, 0.95)',
    );
    await other.goto('/login');
    await expect(other.locator('html')).toHaveAttribute('data-theme', 'light');
    await expectNoWcagAaViolations(other, 'login');
    await other.goto('/');
    await expect(other.locator('html')).toHaveAttribute('data-theme', 'light');
    await expect(other.getByRole('switch', { name: 'Dark mode' })).toHaveCount(0);
    await expect(other.getByText('School transportation visibility', { exact: true })).toHaveCount(
      0,
    );
    await other.screenshot({
      path: info.outputPath('landing-without-toggle-or-badge.png'),
      fullPage: true,
    });
    // Navigate out of the actual dashboard without reloading React, then back.
    await page.getByRole('link', { name: 'SafeBus home' }).click();
    await expect(page.locator('[data-ui=public-shell]')).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    expect(await page.evaluate(() => localStorage.getItem('safebus.theme'))).toBe('dark');
    await page.goBack();
    await expect(page.locator('[data-ui=appearance-settings]')).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  } else {
    await expectNoWcagAaViolations(other, 'native login');
  }
  await other.close();
});

test('web invitation and password screens stay light while native screens retain app appearance', async ({
  page,
}, info) => {
  await installInvitedUserMock(page, {
    role: info.project.name === 'web' ? 'tenant_admin' : 'guardian',
  });
  await page.addInitScript(() => localStorage.setItem('safebus.theme', 'dark'));
  await page.goto('/accept-invitation');
  await expect(page.getByRole('heading', { name: 'Create your password' })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute(
    'data-theme',
    info.project.name === 'web' ? 'light' : 'dark',
  );
  await expectNoWcagAaViolations(page, 'invitation');
  await page.goto('/update-password');
  await expect(page.getByRole('heading', { name: 'Choose a new password' })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute(
    'data-theme',
    info.project.name === 'web' ? 'light' : 'dark',
  );
  await expectNoWcagAaViolations(page, 'password');
});

for (const width of [1280, 390]) {
  test(`public pages have one fixed appearance with a saved dark preference at ${width}px`, async ({
    page,
  }, info) => {
    test.skip(info.project.name !== 'web');
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.addInitScript(() => localStorage.setItem('safebus.theme', 'dark'));
    await page.goto('/');
    const shell = page.locator('[data-ui=public-shell]');
    await expect(shell).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await expect(page.locator('html')).toHaveCSS('color-scheme', 'light');
    await expect(page.locator('[data-ui=public-app-bar]')).toHaveCSS(
      'background-color',
      'rgba(255, 255, 255, 0.95)',
    );
    await expect(page.locator('[data-ui=public-app-bar] .sb-primary-action')).toHaveCSS('background-color', 'rgb(29, 78, 216)');
    await expect(page.getByRole('switch', { name: 'Dark mode' })).toHaveCount(0);
    for (const name of ['Contact', 'Privacy']) {
      await page.locator('footer').getByRole('link', { name, exact: true }).click();
      await expect(shell).toBeVisible();
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    }
    await page.goto('/missing-public-page');
    await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    expect(await page.evaluate(() => localStorage.getItem('safebus.theme'))).toBe('dark');
  });
}

for (const role of ['tenant_admin', 'transportation_admin', 'guardian', 'driver'] as const) {
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
    if (!mobile) {
      await expect(page.getByRole('navigation', { name: 'Settings sections' }).getByRole('link', { name: 'Account', exact: true })).toHaveAttribute('aria-current', 'page');
      await expect(page.locator('[data-ui=account-security-card]')).toHaveCount(1);
      await page.goto('/admin/settings/notifications');
      await expect(page.getByRole('heading', { name: 'Notification preferences', exact: true })).toBeVisible();
      await expect(page.locator('[data-ui=appearance-settings]')).toHaveCount(0);
      await expect(page.locator('[data-ui=account-security-card]')).toHaveCount(0);
      await page.goto('/admin/settings');
    }
    await expect(page.locator('[data-ui=appearance-settings]')).toHaveCount(mobile ? 0 : 1);
    await expect(page.locator('[data-ui=app-bar]')).toHaveCSS(
      'background-color',
      mobile ? 'rgb(23, 43, 58)' : 'rgb(24, 35, 47)',
    );
    if (!mobile) {
      await expect(page.locator('[data-ui=appearance-settings]')).toHaveCSS(
        'background-color',
        'rgb(24, 35, 47)',
      );
    }
    await expectNoWcagAaViolations(page, `${role} dark settings`);
    await page.screenshot({ path: info.outputPath(role + '-dark-settings.png'), fullPage: true });
    await page.locator('[data-ui=dropdown] > button').click();
    await expect(page.locator('[data-ui=dropdown-panel]')).toHaveCSS(
      'background-color',
      'rgb(24, 35, 47)',
    );
    await page.keyboard.press('Escape');
    if (mobile) {
      await page.getByTestId('native-bottom-navigation').getByRole('link', { name: 'Account', exact: true }).click();
      await expect(page.locator('[data-ui=appearance-settings]')).toBeVisible();
    }
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
  await expect(page.locator('[data-ui=appearance-settings]')).toHaveCount(0);
  await expect(page.locator('[data-ui=account-security-card]')).toHaveCount(0);
  await page.locator('header button[aria-haspopup="menu"]').click();
  await expect(page.getByRole('menuitem', { name: 'Account security', exact: true })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await page.getByRole('navigation', { name: 'Primary', exact: true }).getByRole('link', { name: 'Account', exact: true }).click();
  await expect(page).toHaveURL('/account/security');
  await expect(page.getByRole('heading', { name: 'Account security', exact: true })).toBeVisible();
  const toggle = page.locator('[data-ui=appearance-settings]').getByRole('switch', { name: 'Dark mode' });
  await expect(toggle).toBeChecked();
  await toggle.click();
  await expect(toggle).not.toBeChecked();
  await toggle.click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.goto('/admin/pricing');
  const form = page.getByRole('form', { name: 'New subscription price' });
  await form.getByLabel('Price name').fill('Synthetic preview only');
  // The final owner-approved tariff is read-only; the appearance test must
  // not try to edit that locked business decision.
  await expect(form.getByLabel('Price per bus (CAD)')).toHaveValue('1.99');
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
