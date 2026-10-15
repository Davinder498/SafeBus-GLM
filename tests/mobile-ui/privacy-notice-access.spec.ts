import { expect, test } from '@playwright/test';
import { installLocalOnlyBoundary } from '../smoke/fixtures/local-only';
import { installSupabaseMock } from '../smoke/fixtures/supabase-mock';
import { installGuardianVisibilityMock } from '../smoke/fixtures/guardian-bus-visibility';
import { expectNoWcagAaViolations } from '../smoke/fixtures/accessibility';

test.beforeEach(async ({ page }) => {
  await installLocalOnlyBoundary(page);
});

for (const role of ['driver', 'guardian'] as const) {
  test(`${role} can read the privacy notice in the app and return through settings`, async ({
    page,
  }) => {
    if (role === 'driver') await installSupabaseMock(page);
    else await installGuardianVisibilityMock(page);
    await page.goto(role === 'driver' ? '/driver' : '/parent');
    await expect(page.getByTestId('native-bottom-navigation')).toBeVisible();
    await page.locator('header button[aria-haspopup="menu"]').click();
    await page.getByRole('menuitem', { name: 'Privacy notice', exact: true }).click();
    await expect(page).toHaveURL('/privacy');
    await expect(page.getByTestId('native-bottom-navigation')).toBeVisible();
    await expect(
      page.getByRole('heading', {
        name: role === 'driver' ? 'Driver privacy notice' : 'Guardian privacy notice',
      }),
    ).toBeVisible();
    await expectNoWcagAaViolations(page);

    await page.locator('header button[aria-haspopup="menu"]').click();
    await page.getByRole('menuitem', { name: 'Privacy & account', exact: true }).click();
    await expect(page).toHaveURL('/account');
    await expect(
      page.getByRole('heading', { name: 'Privacy and account', exact: true }),
    ).toBeVisible();
    const pagesBefore = page.context().pages().length;
    await page.getByRole('link', { name: 'Open privacy policy', exact: true }).click();
    await expect(page).toHaveURL('/privacy');
    expect(page.context().pages()).toHaveLength(pagesBefore);
    await page.getByRole('link', { name: 'Account deletion instructions', exact: true }).click();
    await expect(page).toHaveURL('/account-deletion');
    await expect(page.getByTestId('native-bottom-navigation')).toBeVisible();
  });
}

test('signed-out mobile user can read the notice and driver section', async ({ page }) => {
  await page.goto('/privacy#drivers');
  await expect(
    page.getByRole('heading', { name: 'Driver privacy notice', exact: true }),
  ).toBeInViewport();
  await page.goto('/login');
  await page.getByRole('link', { name: 'Privacy notice', exact: true }).click();
  await page
    .getByRole('navigation', { name: 'Privacy notice sections' })
    .getByRole('link', { name: 'Drivers', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Driver privacy notice', exact: true }),
  ).toBeInViewport();
  await expect(page.getByRole('heading', { name: 'Sign in required' })).toHaveCount(0);
});
