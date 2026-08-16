import type { Page } from '@playwright/test';

const testTileUrl =
  'https://maps.geoapify.com/v1/tile/osm-bright/{z}/{x}/{y}.png?apiKey=smoke-test-public-key';

const attribution =
  'Powered by <a href="https://www.geoapify.com/">Geoapify</a> | <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>';

export async function installMapProviderOutage(page: Page): Promise<void> {
  await page.route('**/.netlify/functions/map-tile-config', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ tileUrl: testTileUrl, attribution }),
    });
  });
  await page.route('https://maps.geoapify.com/**', async (route) => {
    await route.fulfill({
      status: 503,
      contentType: 'text/plain',
      body: 'simulated map provider outage',
    });
  });
}
