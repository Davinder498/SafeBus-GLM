import { expect, test } from '@playwright/test';
import { installInvitedUserMock } from './fixtures/invitation';

test.describe('invited account password setup', () => {
  test('invited school authority admin creates a password before required MFA setup', async ({
    page,
  }) => {
    const state = await installInvitedUserMock(page);
    await page.goto('/accept-invitation');

    await expect(page.getByRole('heading', { name: 'Create your password' })).toBeVisible();
    await page.getByLabel('New password').fill('SafeBus!2026Trial');
    await page.getByLabel('Confirm password').fill('SafeBus!2026Trial');
    await page.getByRole('button', { name: 'Create password and activate account' }).click();

    await expect(page).toHaveURL('/mfa');
    await expect(
      page.getByRole('heading', { name: 'Protect this administrator account' }),
    ).toBeVisible();
    expect(state.passwordWasUpdated()).toBe(true);
    expect(state.activationWasCalled()).toBe(true);
  });

  test('an invited session on the login page is sent to password setup', async ({ page }) => {
    await installInvitedUserMock(page);
    await page.goto('/login');

    await expect(page).toHaveURL('/accept-invitation');
    await expect(page.getByRole('heading', { name: 'Create your password' })).toBeVisible();
  });

  test('an invited session sent to the site root recovers to password setup', async ({ page }) => {
    await installInvitedUserMock(page);
    await page.goto('/');

    await expect(page).toHaveURL('/accept-invitation');
    await expect(page.getByRole('heading', { name: 'Create your password' })).toBeVisible();
  });

  test('missing or expired invitation session cannot open password setup', async ({ page }) => {
    await page.goto('/accept-invitation');

    await expect(page.getByText(/invitation link is invalid or expired/i)).toBeVisible({
      timeout: 15000,
    });
    await expect(page.getByLabel('New password')).toHaveCount(0);
  });
});
