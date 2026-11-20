import { expect, test } from '@playwright/test';
import { installLocalOnlyBoundary } from '../smoke/fixtures/local-only';
import {
  guardianVisibilityRow,
  installGuardianVisibilityMock,
} from '../smoke/fixtures/guardian-bus-visibility';
import { installSupabaseMock } from '../smoke/fixtures/supabase-mock';
import { installMapProviderAvailable } from '../smoke/fixtures/map-provider';
import { expectNoWcagAaViolations } from '../smoke/fixtures/accessibility';

for (const theme of ['light', 'dark']) {
  for (const role of ['guardian', 'driver']) {
    test(`${role} uses website brand colours consistently in ${theme}`, async ({ page }, info) => {
      await installLocalOnlyBoundary(page);
      await page.addInitScript((value) => localStorage.setItem('safebus.theme', value), theme);
      if (role === 'guardian')
        await installGuardianVisibilityMock(page, { rows: [guardianVisibilityRow()] });
      else await installSupabaseMock(page);
      const routes =
        role === 'guardian'
          ? ['/parent', '/guardian/routes', '/account', '/notifications/settings']
          : ['/driver', '/account', '/driver/settings'];
      for (const route of routes) {
        await page.goto(route);
        const bar = page.locator('[data-ui="app-bar"]');
        await expect(bar).toBeVisible();
        await expect(bar).toHaveCSS(
          'background-color',
          theme === 'dark' ? 'rgb(32, 52, 79)' : 'rgb(234, 241, 255)',
        );
        const notice = page.getByRole('button', { name: 'I understand', exact: true });
        if (await notice.isVisible()) await notice.click();
        await expectNoWcagAaViolations(page, `${role} ${theme} ${route}`);
        await page.screenshot({
          path: info.outputPath(`${role}-${theme}-${route.replaceAll('/', '-')}.png`),
        });
      }
    });
  }
  test(`map missing-location and stop-error messages are readable in ${theme}`, async ({
    page,
  }, info) => {
    await installLocalOnlyBoundary(page);
    await page.addInitScript((value) => localStorage.setItem('safebus.theme', value), theme);
    await installGuardianVisibilityMock(page, {
      rows: [
        guardianVisibilityRow({
          location_state: 'missing',
          location_recorded_at: null,
          latitude: null,
          longitude: null,
        }),
      ],
    });
    await installMapProviderAvailable(page);
    await page.route('**/rest/v1/rpc/get_guardian_bus_service_lines', (route) =>
      route.fulfill({ status: 503, json: { message: 'unavailable' } }),
    );
    await page.goto('/guardian/live-map?bus=42');
    const messages = page.locator('[data-ui="guardian-map-message"]');
    await expect(messages).toHaveCount(2);
    await expect(
      page.getByText('No current bus location to show right now.', { exact: true }),
    ).toBeVisible();
    for (const message of await messages.all()) {
      const contrast = await message.evaluate((element) => {
        const style = getComputedStyle(element);
        const luminance = (rgb: string) => {
          const channels = rgb
            .match(/[\d.]+/g)!
            .slice(0, 3)
            .map(Number)
            .map((value) => {
              const v = value / 255;
              return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
            });
          return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
        };
        const foreground = luminance(style.color);
        const background = luminance(style.backgroundColor);
        return (
          (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05)
        );
      });
      await expect(message).toHaveCSS('opacity', '1');
      await expect(message).toHaveCSS(
        'background-color',
        theme === 'dark' ? 'rgb(32, 52, 79)' : 'rgb(234, 241, 255)',
      );
      expect(contrast).toBeGreaterThanOrEqual(4.5);
    }
    await page.screenshot({ path: info.outputPath(`map-messages-${theme}.png`) });
  });
}
