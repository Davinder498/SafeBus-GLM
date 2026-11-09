import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { installTripOperationsMock, tripId } from './fixtures/admin-trip-operations';
import { installLocalOnlyBoundary } from './fixtures/local-only';

for (const role of ['tenant_admin', 'transportation_admin'] as const) {
  test(
    role + ' preserves operational trip records without GPS history controls',
    async ({ page }, testInfo) => {
      await installLocalOnlyBoundary(page);
      await installTripOperationsMock(page, '2026-10-28T14:01:00Z', role);
      let saved = false;
      const actions: string[] = [];
      await page.route('**/.netlify/functions/retention-cases', (route) => {
        const { action, data } = route.request().postDataJSON();
        actions.push(action);
        if (action === 'create') {
          expect(data).not.toHaveProperty('windowStart');
          expect(data).not.toHaveProperty('windowEnd');
          saved = true;
          return route.fulfill({ json: { result: { id: 'case1' } } });
        }
        return route.fulfill({
          json: {
            result: saved
              ? [
                  {
                    id: 'case1',
                    driver_trip_id: tripId(1),
                    reference: 'CASE-1',
                    reason: 'incident',
                    window_start: '2026-10-28T14:00:00Z',
                    window_end: '2026-10-28T14:01:00Z',
                    minimum_until: '2026-10-28T14:01:00Z',
                    review_at: '2026-11-27T14:01:00Z',
                    created_at: '2026-10-28T14:01:00Z',
                    reviewed_at: null,
                    released_at: null,
                  },
                ]
              : [],
          },
        });
      });
      await page.goto('/admin/trips/' + tripId(1));
      await expect(
        page.getByRole('heading', { name: 'Preserved records', exact: true }),
      ).toBeVisible();
      await page.getByRole('button', { name: 'Preserve trip records', exact: true }).click();
      await expect(page.getByLabel('Window start (optional)')).toHaveCount(0);
      await expect(page.getByRole('button', { name: /GPS archive/i })).toHaveCount(0);
      await page.getByLabel('Case reference', { exact: true }).fill('CASE-1');
      await page.getByRole('button', { name: 'Save preservation', exact: true }).click();
      await expect(
        page.getByRole('status').filter({ hasText: 'Preservation saved.' }),
      ).toBeVisible();
      await expect(page.getByText('CASE-1 · Preserved', { exact: true })).toBeVisible();
      // StrictMode may repeat the initial read; the preservation write must be unique.
      expect(actions.filter((action) => action !== 'list')).toEqual(['create']);
      expect(actions.at(-1)).toBe('list');
      await expect(page.getByText(/Verified GPS archive chunks/i)).toHaveCount(0);
      const accessibility = await new AxeBuilder({ page }).analyze();
      expect(accessibility.violations).toEqual([]);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBe(true);
      await page.screenshot({
        path: testInfo.outputPath('operational-preservation.png'),
        fullPage: true,
      });
    },
  );
}
