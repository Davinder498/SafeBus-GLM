import { test, expect } from '@playwright/test';
import { installInvitedUserMock } from './fixtures/invitation';
import { installLocalOnlyBoundary } from './fixtures/local-only';
import { expectUsableMobileLayout } from './fixtures/responsive';

for (const viewport of [
  { width: 320, height: 568 },
  { width: 375, height: 667 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
  { width: 768, height: 1024 },
  { width: 667, height: 375 },
]) {
  test(`account setup remains usable at ${viewport.width}×${viewport.height}`, async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== 'mobile-chromium',
      'Viewport sweep runs once in the mobile project.',
    );
    test.setTimeout(60000);
    await page.setViewportSize(viewport);
    await installLocalOnlyBoundary(page);
    const state = await installInvitedUserMock(page);
    await page.goto('/accept-invitation');
    await expect(page.getByRole('heading', { name: 'Create your password' })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('create-password.png'), fullPage: true });
    await expectUsableMobileLayout(page);
    await page.getByLabel('New password').fill('Synthetic!Password42');
    await page.getByLabel('Confirm password').fill('Different!Password42');
    await page.getByRole('button', { name: 'Create password and activate account' }).click();
    await expect(page.getByRole('alert')).toContainText('passwords do not match');
    expect(state.passwordWasUpdated()).toBe(false);
    await expectUsableMobileLayout(page);
    await page.getByLabel('Confirm password').fill('Synthetic!Password42');
    await page.getByRole('button', { name: 'Create password and activate account' }).click();
    await expect(page).toHaveURL('/mfa');
    await expect(
      page.getByRole('heading', { name: 'Protect this administrator account' }),
    ).toBeVisible();
    await expectUsableMobileLayout(page);
    await page.getByRole('button', { name: 'Set up authenticator app' }).click();
    await expect(page.getByRole('img', { name: 'Authenticator enrollment QR code' })).toBeVisible();
    await expect(page.getByLabel('Six-digit authenticator code')).toBeVisible();
    await expectUsableMobileLayout(page);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: testInfo.outputPath('authenticator-setup.png'), fullPage: true });
    await page.goto('/update-password');
    await expect(page.getByRole('heading', { name: 'Choose a new password' })).toBeVisible();
    await expectUsableMobileLayout(page);
  });
}
