import { expect, test, type Locator } from '@playwright/test';
import {
  guardianBusServiceLine,
  guardianVisibilityRow,
  installGuardianVisibilityMock,
} from '../smoke/fixtures/guardian-bus-visibility';
import { installLocalOnlyBoundary } from '../smoke/fixtures/local-only';

async function expectAlignedStops(line: Locator) {
  await expect
    .poll(async () => {
      return line.evaluate((element) => {
        const track = element
          .querySelector('.guardian-service-line__track')!
          .getBoundingClientRect();
        const anchors = Array.from(element.querySelectorAll('[data-service-stop-anchor]'));
        const centers = anchors.map((anchor) => {
          const rect = anchor.getBoundingClientRect();
          return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
        });
        return Math.max(
          ...centers.map((center) => Math.abs(center.x - (track.left + track.width / 2))),
          Math.abs(centers[0].y - track.top),
          Math.abs(centers.at(-1)!.y - track.bottom),
        );
      });
    })
    .toBeLessThan(1);
}

for (const direction of ['forward', 'reverse'] as const) {
  test(`service-line dots stay on the line through highlights and resizing (${direction})`, async ({
    page,
  }, testInfo) => {
    await installLocalOnlyBoundary(page);
    const base = guardianBusServiceLine();
    const stops = ['passed', 'at_stop', 'next', 'upcoming', 'unavailable'].map((state, index) => ({
      ...base.stops[2],
      name:
        index === 2
          ? 'Next stop with a long name that wraps on a small phone'
          : `Stop ${index + 1}`,
      order: direction === 'forward' ? index + 1 : 5 - index,
      serviceState: state as (typeof base.stops)[number]['serviceState'],
    }));
    const fixture = await installGuardianVisibilityMock(page, {
      rows: [guardianVisibilityRow()],
      serviceLines: [guardianBusServiceLine({ direction, stops, progressPosition: 1.5 })],
    });
    await page.goto('/guardian/buses/42');
    const card = page.locator('[data-ui="guardian-service-line-card"]');
    const line = card.locator('[data-ui="guardian-service-line"]');
    const marker = line.getByTestId('guardian-service-line-bus');
    await expect(line.locator('[data-service-stop-anchor]')).toHaveCount(5);
    await expect(marker).toBeVisible();
    await expect(marker.locator('svg')).toHaveCount(0);
    await expect(marker).toHaveCSS('width', '8px');
    await expect(marker).toHaveCSS('background-color', 'rgb(37, 99, 235)');
    await expect(line.locator('.guardian-service-line__travelled')).toHaveCSS(
      'background-color',
      'rgb(37, 99, 235)',
    );
    await expect(card.getByText(/Last location update|Bus is at|Service inactive/)).toHaveCount(0);
    await expect(card.locator('[data-ui="guardian-service-line-note"]')).toHaveCount(0);

    for (const width of [320, 390, 768, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      await expectAlignedStops(line);
      await expect
        .poll(async () =>
          line.evaluate((element) => {
            const track = element
              .querySelector('.guardian-service-line__track')!
              .getBoundingClientRect();
            const fill = element
              .querySelector('.guardian-service-line__travelled')!
              .getBoundingClientRect();
            const dot = element
              .querySelector('.guardian-service-line__bus')!
              .getBoundingClientRect();
            const anchors = Array.from(element.querySelectorAll('[data-service-stop-anchor]'));
            const lower = anchors[1].getBoundingClientRect();
            const upper = anchors[2].getBoundingClientRect();
            const expectedY = (lower.top + lower.height / 2 + upper.top + upper.height / 2) / 2;
            return Math.max(
              Math.abs(dot.left + dot.width / 2 - (track.left + track.width / 2)),
              Math.abs(dot.top + dot.height / 2 - expectedY),
              Math.abs(fill.top - track.top),
              Math.abs(fill.bottom - expectedY),
            );
          }),
        )
        .toBeLessThan(1);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
    }

    await page.setViewportSize({ width: 390, height: 1800 });
    await card.screenshot({ path: testInfo.outputPath(`service-line-${direction}.png`) });
    // An inactive run keeps the stops aligned without showing an old bus position or extra status.
    fixture.setServiceLines([
      guardianBusServiceLine({
        direction,
        stops,
        tripStatus: 'inactive',
        locationState: 'inactive',
        progressPosition: null,
        progressPercent: null,
      }),
    ]);
    await page.reload();
    await expect(line.locator('[data-service-stop-anchor]')).toHaveCount(5);
    await expectAlignedStops(line);
    await expect(marker).toHaveCount(0);
    await expect(line.locator('.guardian-service-line__travelled')).toHaveCount(0);
    await expect(card.locator('[data-ui="status-pill"]')).toHaveCount(0);
    await expect(card.getByText(/Last location update|Bus is at|Service inactive/)).toHaveCount(0);
  });
}

test('a single-stop service line keeps its position dot centered on its stop', async ({ page }) => {
  await installLocalOnlyBoundary(page);
  const base = guardianBusServiceLine();
  await installGuardianVisibilityMock(page, {
    rows: [guardianVisibilityRow()],
    serviceLines: [guardianBusServiceLine({ stops: [base.stops[2]], progressPosition: 0 })],
  });
  await page.goto('/guardian/buses/42');
  const line = page.locator('[data-ui="guardian-service-line"]');
  await expect(line.getByTestId('guardian-service-line-bus')).toBeVisible();
  await expectAlignedStops(line);
  const stop = await line.locator('[data-service-stop-anchor]').boundingBox();
  const dot = await line.getByTestId('guardian-service-line-bus').boundingBox();
  expect(Math.abs(stop!.y + stop!.height / 2 - dot!.y - dot!.height / 2)).toBeLessThan(1);
});
