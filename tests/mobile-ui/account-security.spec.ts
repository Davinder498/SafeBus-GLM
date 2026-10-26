import { expect, test, type Page } from '@playwright/test';
import { installGuardianVisibilityMock } from '../smoke/fixtures/guardian-bus-visibility';
import { installLocalOnlyBoundary } from '../smoke/fixtures/local-only';
import { expectNoWcagAaViolations } from '../smoke/fixtures/accessibility';

async function installMfa(page: Page, role: 'guardian' | 'driver', enrolled = false) {
  await installLocalOnlyBoundary(page);
  await installGuardianVisibilityMock(page, { role });
  if (role === 'driver') {
    await page.route('**/rest/v1/rpc/*_driver_delivery_preferences_v2', (route) =>
      route.fulfill({
        json: {
          in_app_enabled: true,
          push_enabled: false,
          email_enabled: false,
          assignment_alerts: { in_app: true, push: true, email: true },
          trip_updates: { in_app: true, push: true, email: false },
          operational_alerts: { in_app: true, push: true, email: false },
        },
      }),
    );
  }
  let hasFactor = enrolled;
  let aal = 'aal1';
  let removals = 0;
  const id = '11111111-1111-1111-1111-111111111111';
  const user = () => ({
    id,
    email: `${role}@smoke-test.local`,
    aud: 'authenticated',
    role: 'authenticated',
    factors: hasFactor
      ? [
          {
            id: 'test-factor',
            factor_type: 'totp',
            status: 'verified',
            friendly_name: 'SafeBus authenticator',
          },
        ]
      : [],
  });
  const token = () =>
    [
      Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url'),
      Buffer.from(
        JSON.stringify({
          sub: id,
          role: 'authenticated',
          aal,
          amr: [
            {
              method: aal === 'aal2' ? 'totp' : 'password',
              timestamp: Math.floor(Date.now() / 1000),
            },
          ],
          exp: Math.floor(Date.now() / 1000) + 3600,
        }),
      ).toString('base64url'),
      'synthetic-signature',
    ].join('.');
  const session = () => ({
    access_token: token(),
    refresh_token: 'synthetic-refresh',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    token_type: 'bearer',
    user: user(),
  });
  await page.addInitScript((value) => {
    for (const key of [
      'supabase.auth.token',
      'sb-placeholder-auth-token',
      'sb-bppmqykkbhrmotcybxrh-auth-token',
      'sb-localhost-auth-token',
    ])
      localStorage.setItem(key, JSON.stringify(value));
  }, session());
  await page.route('**/auth/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    const method = route.request().method();
    if (path.endsWith('/user')) return route.fulfill({ json: user() });
    if (path.endsWith('/factors') && method === 'POST')
      return route.fulfill({
        json: {
          id: 'test-factor',
          type: 'totp',
          totp: {
            qr_code: '<svg xmlns="http://www.w3.org/2000/svg"/>',
            secret: 'synthetic-enrollment-key',
            uri: 'otpauth://totp/SafeBus?secret=SYNTHETIC',
          },
        },
      });
    if (path.endsWith('/challenge'))
      return route.fulfill({
        json: { id: 'test-challenge', expires_at: Math.floor(Date.now() / 1000) + 60 },
      });
    if (path.endsWith('/verify')) {
      if (route.request().postDataJSON()?.code !== '123456')
        return route.fulfill({
          status: 422,
          json: { msg: 'Invalid authenticator code', code: 'mfa_verification_failed' },
        });
      hasFactor = true;
      aal = 'aal2';
      return route.fulfill({ json: session() });
    }
    if (path.endsWith('/factors/test-factor') && method === 'DELETE') {
      removals++;
      hasFactor = false;
      aal = 'aal1';
      return route.fulfill({ json: { id: 'test-factor' } });
    }
    if (path.endsWith('/token')) return route.fulfill({ json: session() });
    return route.fallback();
  });
  return { removals: () => removals };
}

for (const role of ['guardian', 'driver'] as const) {
  test(`${role} can enable optional MFA, then verify before removing it`, async ({
    page,
  }, testInfo) => {
    const fixture = await installMfa(page, role);
    await page.goto('/account');
    await expect(
      page.getByRole('link', { name: 'Enable multi-factor authentication', exact: true }),
    ).toBeVisible();
    await page.locator('header button[aria-haspopup="menu"]').click();
    await expect(page.getByRole('menuitem', { name: 'Account security', exact: true })).toHaveCount(
      0,
    );
    await page.keyboard.press('Escape');
    await page
      .getByRole('link', { name: 'Enable multi-factor authentication', exact: true })
      .click();
    await expect(page.locator('[data-ui="app-bar"]')).toBeVisible();
    await expect(page.getByTestId('native-bottom-navigation')).toBeVisible();
    await expect(page.locator('[data-ui="public-app-bar"]')).toHaveCount(0);
    await expect(page.locator('[data-ui="top-notifications"]')).toHaveCount(
      role === 'driver' ? 1 : 0,
    );
    await page.getByRole('button', { name: 'Set up authenticator app', exact: true }).click();
    await expect(page.getByAltText('Authenticator enrollment QR code')).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(`${role}-mfa-setup.png`), fullPage: true });
    await expectNoWcagAaViolations(page);
    await page.locator('#mfa-code').fill('123456');
    await page.getByRole('button', { name: 'Enable MFA', exact: true }).click();
    await expect(page).toHaveURL(
      role === 'driver' ? '/driver/settings' : '/notifications/settings',
    );
    await expect(
      page.getByRole('link', { name: 'Manage multi-factor authentication', exact: true }),
    ).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath(`${role}-account-security.png`),
      fullPage: true,
      animations: 'disabled',
    });
    if (role === 'driver') {
      await page.getByRole('switch', { name: 'Multi-factor authentication', exact: true }).click();
    } else {
      await page
        .getByRole('link', { name: 'Manage multi-factor authentication', exact: true })
        .click();
      await page.getByRole('button', { name: 'Remove authenticator', exact: true }).click();
    }
    expect(fixture.removals()).toBe(0);
    await page.locator('#mfa-code').fill('111111');
    await page
      .getByRole('button', { name: 'Verify and remove authenticator', exact: true })
      .click();
    await expect(page.getByRole('alert')).toContainText('Invalid authenticator code');
    expect(fixture.removals()).toBe(0);
    await page.locator('#mfa-code').fill('123456');
    await page
      .getByRole('button', { name: 'Verify and remove authenticator', exact: true })
      .click();
    await expect(page).toHaveURL(
      role === 'driver' ? '/driver/settings' : '/notifications/settings',
    );
    await expect(
      page.getByRole('link', { name: 'Enable multi-factor authentication', exact: true }),
    ).toBeVisible();
    expect(fixture.removals()).toBe(1);
  });

  test(`${role} who enrolled in MFA must verify before opening preferences`, async ({ page }) => {
    await installMfa(page, role, true);
    await page.goto('/account?from=profile');
    await expect(page).toHaveURL('/mfa');
    await page.locator('#mfa-code').fill('123456');
    await page.getByRole('button', { name: 'Verify and continue', exact: true }).click();
    await expect(page).toHaveURL(
      role === 'driver' ? '/driver/settings' : '/notifications/settings',
    );
    await expect(
      page.getByRole('link', { name: 'Manage multi-factor authentication', exact: true }),
    ).toBeVisible();
  });
}

for (const role of ['guardian', 'driver'] as const) {
  test(role + ' can open MFA when notification preferences fail', async ({ page }) => {
    await installMfa(page, role);
    await page.route('**/rest/v1/rpc/get_*_delivery_preferences_*', (route) =>
      route.fulfill({ status: 503, json: { message: 'Settings unavailable' } }),
    );
    await page.goto('/account');
    await expect(page.getByRole('button', { name: 'Try again', exact: true })).toBeVisible();
    await expect(page.locator('[data-ui="account-security-card"]')).toBeVisible();
    await page
      .getByRole('link', { name: 'Enable multi-factor authentication', exact: true })
      .click();
    await expect(page.getByRole('button', { name: 'Set up authenticator app' })).toBeVisible();
    await page.getByRole('link', { name: 'Back to settings', exact: true }).click();
    await expect(page).toHaveURL(
      role === 'driver' ? '/driver/settings' : '/notifications/settings',
    );
  });
}

for (const role of ['guardian', 'driver'] as const) {
  test(
    role + ' settings keep appearance inline and notification navigation available',
    async ({ page }, testInfo) => {
      await installMfa(page, role);
      await page.setViewportSize({ width: 320, height: 844 });
      await page.goto('/account');
      const settingsPath = role === 'driver' ? '/driver/settings' : '/notifications/settings';
      const appBar = page.locator('[data-ui="app-bar"]');
      const appearance = page.locator('[data-ui="appearance-settings"]');
      await expect(appBar.getByRole('switch', { name: 'Dark mode' })).toHaveCount(0);
      await expect(appBar).toHaveCSS('background-color', 'rgb(23, 43, 58)');
      await expect(appBar.getByTestId('safebus-wordmark')).toHaveCSS('color', 'rgb(255, 255, 255)');
      const heading = await appearance.getByRole('heading', { name: 'Appearance' }).boundingBox();
      const toggle = await appearance.getByRole('switch', { name: 'Dark mode' }).boundingBox();
      expect(
        heading &&
          toggle &&
          Math.abs(heading.y + heading.height / 2 - toggle.y - toggle.height / 2),
      ).toBeLessThan(2);
      await appearance.getByRole('switch', { name: 'Dark mode' }).click();
      await expect(appearance.getByRole('switch', { name: 'Dark mode' })).toBeChecked();
      await expect(appBar).toHaveCSS('background-color', 'rgb(23, 43, 58)');
      await expect(page.getByTestId('native-bottom-navigation')).toHaveCSS(
        'background-color',
        'rgb(23, 43, 58)',
      );
      await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(23, 43, 58)');
      await expect(page.getByRole('heading', { name: 'Location access' })).toHaveCount(0);
      await expect(page.getByRole('heading', { name: 'Using your personal phone' })).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Try again', exact: true })).toHaveCount(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        320,
      );
      await page.screenshot({
        path: testInfo.outputPath(role + '-settings-dark.png'),
        fullPage: true,
      });
      if (role === 'guardian') {
        await expect(appBar.locator('[data-ui="top-notifications"]')).toHaveCount(0);
        await page
          .getByTestId('native-bottom-navigation')
          .getByRole('link', { name: /^Notification/ })
          .click();
      } else {
        await appBar.getByRole('link', { name: /^Notifications/ }).click();
      }
      await expect(page).toHaveURL('/notifications');
      await expect(page.getByRole('heading', { name: 'Notification', exact: true })).toBeVisible();
      await page.getByRole('link', { name: 'Notification settings', exact: true }).click();
      await expect(page).toHaveURL(settingsPath);
      await page.getByRole('switch', { name: 'Multi-factor authentication', exact: true }).click();
      await expect(page).toHaveURL('/account/security');
      await expect(page.getByRole('button', { name: 'Set up authenticator app' })).toBeVisible();
      const dimensions = await page.evaluate(() => ({
        width: document.documentElement.clientWidth,
        scroll: document.documentElement.scrollWidth,
      }));
      expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.width);
    },
  );
}
