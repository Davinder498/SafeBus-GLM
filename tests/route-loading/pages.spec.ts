import { expect, test } from '@playwright/test';
import { gzipSync } from 'node:zlib';

test.beforeEach(async ({ page }) => {
  // This suite never reads or writes a hosted project, regardless of build config.
  await page.route('https://**.supabase.co/**', (route) => route.abort());
});

test('sign-in downloads no operational page code', async ({ page }) => {
  const scripts: string[] = [];
  const compressedSizes: Promise<number>[] = [];
  page.on('request', (request) => {
    if (request.resourceType() === 'script') scripts.push(request.url());
  });
  page.on('response', (response) => {
    if (response.request().resourceType() === 'script') {
      compressedSizes.push(response.body().then((body) => gzipSync(body).length));
    }
  });
  await page.goto('/login');
  await expect(page.locator('[data-ui="login-card"]')).toBeVisible();
  // Includes every requested JS dependency, not just the entry chunk. This is
  // a compressed-size budget, not an assertion about the preview's wire encoding.
  expect((await Promise.all(compressedSizes)).reduce((sum, bytes) => sum + bytes, 0)).toBeLessThan(
    190000,
  );
  expect(scripts.some((url) => /\/LoginPage-[^/]+\.js$/.test(url))).toBe(true);
  expect(
    scripts.filter((url) => /\/(?:Admin|Driver|Guardian|Parent|Notifications).*Page-/.test(url)),
  ).toEqual([]);
});

test('unauthenticated deep links deny access before downloading the protected page', async ({
  page,
}, info) => {
  const scripts: string[] = [];
  page.on('request', (request) => {
    if (request.resourceType() === 'script') scripts.push(request.url());
  });
  const path = info.project.name === 'website' ? '/admin/buses' : '/guardian/live-map';
  await page.goto(path);
  await expect(page.getByRole('heading', { name: 'Sign in required' })).toBeVisible();
  expect(scripts.filter((url) => /\/(?:AdminBuses|GuardianLiveMap)Page-/.test(url))).toEqual([]);
});

test('a slow page download shows a loading status and then opens', async ({ page }) => {
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/LoginPage-*.js', async (route) => {
    await pending;
    await route.continue();
  });
  await page.goto('/login', { waitUntil: 'domcontentloaded' });
  try {
    const status = page.getByRole('status');
    await expect(status.getByText('Loading page...', { exact: true })).toBeVisible();
    await expect(status.getByTestId('safebus-wordmark')).toHaveText('SafeBus');
    await expect(status.getByTestId('safebus-wordmark')).toHaveCSS('color', 'rgb(23, 43, 58)');
    await expect(status.locator('img, svg')).toHaveCount(0);
  } finally {
    release();
  }
  await expect(page.locator('[data-ui="login-card"]')).toBeVisible();
});

test('a missing page chunk can recover with an explicit reload', async ({ page }) => {
  const failedChunk = '**/PrivacyPolicyPage-*.js';
  await page.route(failedChunk, (route) => route.abort('failed'));
  await page.goto('/privacy');
  await expect(page.getByRole('heading', { name: 'Unable to open this page' })).toBeVisible();
  await page.unroute(failedChunk);
  await page.getByRole('button', { name: 'Reload page' }).click();
  await expect(page.getByRole('heading', { name: 'Privacy policy', exact: false })).toBeVisible();
});

test('a failed page does not trap navigation to another route', async ({ page }) => {
  await page.route('**/PrivacyPolicyPage-*.js', (route) => route.abort('failed'));
  await page.goto('/privacy');
  await expect(page.getByRole('heading', { name: 'Unable to open this page' })).toBeVisible();
  await page.getByRole('link', { name: 'Back to start' }).click();
  await expect(page.getByRole('heading', { name: 'Unable to open this page' })).toHaveCount(0);
  await expect(
    page.locator('[data-ui="public-shell"], [data-ui="login-card"]').first(),
  ).toBeVisible();
});
