import { expect, test } from '@playwright/test';
import { installGuardianVisibilityMock } from '../smoke/fixtures/guardian-bus-visibility';
import { installLocalOnlyBoundary } from '../smoke/fixtures/local-only';
import { expectNoWcagAaViolations } from '../smoke/fixtures/accessibility';

test.beforeEach(async ({ page }) => { await installLocalOnlyBoundary(page); });

for (const role of ['guardian', 'driver'] as const) {
  test(`${role} account keeps preferences and security reachable at large text sizes`, async ({ page }, info) => {
    await installGuardianVisibilityMock(page, { role });
    await page.setViewportSize({ width: 320, height: 740 });
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('/account');
    await expect(page.getByRole('radio', { name: 'Follow phone settings' })).toBeChecked();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.emulateMedia({ colorScheme: 'light' });
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    // Stress layout reflow; actual Android font-scale propagation is native QA.
    await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });
    await expect(page.getByRole('link', { name: 'Password & sign-in security' })).toBeVisible();
    const nav = page.getByTestId('native-bottom-navigation');
    await expect(nav.getByRole('link')).toHaveCount(4);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expectNoWcagAaViolations(page, `${role} large-text account`);
    await page.screenshot({ path: info.outputPath(`${role}-large-text.png`), fullPage: true });
    await page.getByRole('link', { name: 'Password & sign-in security' }).click();
    await expect(page).toHaveURL('/account/security');
    await expect(nav.getByRole('link', { name: 'Account', exact: true })).toHaveAttribute('aria-current', 'page');
  });

  test(`${role} adapts navigation to a rail and preserves the current page when resized`, async ({ page }, info) => {
    await installGuardianVisibilityMock(page, { role });
    await page.goto('/account');
    await page.setViewportSize({ width: 1024, height: 768 });
    const nav = page.getByTestId('native-bottom-navigation');
    const box = await nav.boundingBox();
    expect(box!.width).toBeLessThan(160);
    await expect(nav.getByRole('link', { name: 'Account', exact: true })).toHaveAttribute('aria-current', 'page');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath(`${role}-tablet-account.png`), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page).toHaveURL('/account');
    expect((await nav.boundingBox())!.width).toBe(390);
    await page.screenshot({ path: info.outputPath(`${role}-phone-account.png`), fullPage: true });
  });
}
