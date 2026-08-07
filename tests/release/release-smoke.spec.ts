import { expect, test } from '@playwright/test';

test('landing page loads without third-party font requests', async ({ page }) => {
  const externalFontRequests: string[] = [];
  page.on('request', (request) => {
    if (/fonts\.(googleapis|gstatic)\.com/.test(request.url())) {
      externalFontRequests.push(request.url());
    }
  });

  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'SafeBus Alberta', level: 1 })).toBeVisible();
  await expect(page.getByRole('link', { name: /demo login/i })).toBeVisible();
  expect(externalFontRequests).toEqual([]);
});

test('protected driver route sends an unauthenticated user to sign in', async ({ page }) => {
  await page.goto('/driver');
  await expect(page.getByText('Sign in required')).toBeVisible();
  await page.getByRole('link', { name: 'Go to login' }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('heading', { name: 'Sign in', level: 1 })).toBeVisible();
});

test('protected guardian route does not expose student data without a session', async ({
  page,
}) => {
  await page.goto('/guardian/live-map');
  await expect(page.getByText('Sign in required')).toBeVisible();
  await expect(page.getByTestId('guardian-live-map-student-card')).toHaveCount(0);
});

test('unknown route renders a controlled not-found page', async ({ page }) => {
  await page.goto('/not-a-real-safebus-route');
  await expect(page.getByRole('heading', { name: /page not found/i })).toBeVisible();
  await expect(page.getByRole('link', { name: /return home/i })).toBeVisible();
});

test('release shell has no horizontal overflow', async ({ page }) => {
  await page.goto('/login');
  const dimensions = await page.evaluate(() => ({
    body: document.body.scrollWidth,
    viewport: document.documentElement.clientWidth,
  }));
  expect(dimensions.body).toBeLessThanOrEqual(dimensions.viewport + 1);
});
