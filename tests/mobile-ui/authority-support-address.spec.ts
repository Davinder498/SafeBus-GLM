import { expect, test } from '@playwright/test';
import { installLocalOnlyBoundary } from '../smoke/fixtures/local-only';
import { installGuardianVisibilityMock } from '../smoke/fixtures/guardian-bus-visibility';
import { expectNoWcagAaViolations } from '../smoke/fixtures/accessibility';

for (const role of ['guardian', 'driver'] as const) {
  test(role + ' sees only the published authority support address', async ({ page }, testInfo) => {
    await installLocalOnlyBoundary(page);
    await installGuardianVisibilityMock(page, { role });
    await page.route('**/rest/v1/rpc/get_support_directory_v2', (route) =>
      route.fulfill({
        json: {
          platform: null,
          tenant: {
            displayName: 'Transportation office',
            email: 'transport@example.test',
            phone: null,
            websiteUrl: null,
            supportHours: null,
            instructions: null,
            address: '123 School Road\nCalgary AB T1A 1A1',
            updatedAt: '2026-10-25T00:00:00Z',
          },
        },
      }),
    );
    await page.goto('/support');
    await expect(page.getByText('School authority address', { exact: true })).toBeVisible();
    await expect(page.getByText('123 School Road', { exact: false })).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'transport@example.test', exact: true }),
    ).toHaveAttribute('href', 'mailto:transport@example.test');
    await expect(page.getByText('walk-in', { exact: false })).toHaveCount(0);
    await expectNoWcagAaViolations(page);
    await page.screenshot({
      path: testInfo.outputPath(role + '-authority-support.png'),
      fullPage: true,
    });
  });
}
