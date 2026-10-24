import { expect, test, type Page } from '@playwright/test';
import { installGuardianVisibilityMock } from '../smoke/fixtures/guardian-bus-visibility';
import { installLocalOnlyBoundary } from '../smoke/fixtures/local-only';
import { expectNoWcagAaViolations } from '../smoke/fixtures/accessibility';

async function installMfa(page: Page, role: 'guardian' | 'driver', enrolled = false) {
  await installLocalOnlyBoundary(page);
  await installGuardianVisibilityMock(page, { role });
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
    await expect(page.getByRole('link', { name: 'Enable MFA', exact: true })).toBeVisible();
    await page.locator('header button[aria-haspopup="menu"]').click();
    await page.getByRole('menuitem', { name: 'Account security', exact: true }).click();
    await page.getByRole('link', { name: 'Enable MFA', exact: true }).click();
    await page.getByRole('button', { name: 'Set up authenticator app', exact: true }).click();
    await expect(page.getByAltText('Authenticator enrollment QR code')).toBeVisible();
    await expectNoWcagAaViolations(page);
    await page.locator('#mfa-code').fill('123456');
    await page.getByRole('button', { name: 'Enable MFA', exact: true }).click();
    await expect(page).toHaveURL('/account');
    await expect(page.getByRole('link', { name: 'Manage MFA', exact: true })).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath(`${role}-account-security.png`),
      fullPage: true,
      animations: 'disabled',
    });
    await page.getByRole('link', { name: 'Manage MFA', exact: true }).click();
    await page.getByRole('button', { name: 'Remove authenticator', exact: true }).click();
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
    await expect(page).toHaveURL('/account');
    await expect(page.getByRole('link', { name: 'Enable MFA', exact: true })).toBeVisible();
    expect(fixture.removals()).toBe(1);
  });

  test(`${role} who enrolled in MFA must verify before opening preferences`, async ({ page }) => {
    await installMfa(page, role, true);
    await page.goto('/account?from=profile');
    await expect(page).toHaveURL('/mfa');
    await page.locator('#mfa-code').fill('123456');
    await page.getByRole('button', { name: 'Verify and continue', exact: true }).click();
    await expect(page).toHaveURL('/account?from=profile');
    await expect(page.getByRole('link', { name: 'Manage MFA', exact: true })).toBeVisible();
  });
}
