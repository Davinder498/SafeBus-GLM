import { test, expect } from '@playwright/test';
import { installInvitedUserMock } from '../smoke/fixtures/invitation';
import { installLocalOnlyBoundary } from '../smoke/fixtures/local-only';
import { expectUsableMobileLayout } from '../smoke/fixtures/responsive';

for (const viewport of [
  { width: 320, height: 568 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
  { width: 667, height: 375 },
]) {
  test(`native account forms fit ${viewport.width}×${viewport.height}`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize(viewport);
    await installLocalOnlyBoundary(page);
    const state = await installInvitedUserMock(page, { role: 'guardian' });
    await page.goto('/accept-invitation');
    await expect(page.getByRole('heading', { name: 'Create your password' })).toBeVisible();
    await expectUsableMobileLayout(page);
    await page.getByLabel('New password').fill('Synthetic!Password42');
    await page.getByLabel('Confirm password').fill('Mismatched!Password42');
    await page.getByRole('button', { name: 'Create password and activate account' }).click();
    await expect(page.getByRole('alert')).toContainText('passwords do not match');
    expect(state.passwordWasUpdated()).toBe(false);
    await expectUsableMobileLayout(page);
    await page.screenshot({
      path: testInfo.outputPath('native-create-password.png'),
      fullPage: true,
    });
    await page.goto('/update-password');
    await expect(page.getByRole('heading', { name: 'Choose a new password' })).toBeVisible();
    await expectUsableMobileLayout(page);
  });
}
