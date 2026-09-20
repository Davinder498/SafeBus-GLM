import { expect, test } from '@playwright/test';

test('landing page loads without third-party font requests', async ({ page }) => {
  const externalFontRequests: string[] = [];
  page.on('request', (request) => {
    const hostname = new URL(request.url()).hostname;
    if (hostname === 'fonts.googleapis.com' || hostname === 'fonts.gstatic.com') {
      externalFontRequests.push(request.url());
    }
  });

  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'BusSafe Alberta', level: 1 })).toBeVisible();
  await expect(page.getByRole('banner').getByRole('link', { name: 'Contact' })).toBeVisible();
  await expect(page.getByRole('banner').getByRole('link', { name: 'Sign in' })).toBeVisible();
  await expect(page.getByRole('link', { name: /demo login/i })).toHaveCount(0);
  expect(externalFontRequests).toEqual([]);
});

test('protected administrator route sends an unauthenticated user to sign in', async ({ page }) => {
  await page.goto('/admin');
  await expect(page.getByText('Sign in required')).toBeVisible();
  await page.getByRole('link', { name: 'Go to login' }).click();
  await expect(page).toHaveURL((url) => url.pathname === '/login');
  await expect(page.getByRole('heading', { name: 'Sign in', level: 1 })).toBeVisible();
});

test('web app does not register guardian or driver operational routes', async ({ page }) => {
  await page.goto('/guardian/live-map');
  await expect(page.getByRole('heading', { name: /page not found/i })).toBeVisible();
  await expect(page.getByTestId('guardian-live-map-student-card')).toHaveCount(0);

  await page.goto('/driver');
  await expect(page.getByRole('heading', { name: /page not found/i })).toBeVisible();
});

test('unknown route renders a controlled not-found page', async ({ page }) => {
  await page.goto('/not-a-real-safebus-route');
  await expect(page.getByRole('heading', { name: /page not found/i })).toBeVisible();
  await expect(page.getByRole('link', { name: /return home/i })).toBeVisible();
});

test('public contact, privacy and account-deletion pages are available without a session', async ({
  page,
}) => {
  await page.goto('/contact');
  await expect(
    page.getByRole('heading', { name: "Let's talk school transportation", level: 1 }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Send inquiry' })).toBeVisible();

  await page.goto('/privacy');
  await expect(
    page.getByRole('heading', { name: 'BusSafe Alberta privacy policy', level: 1 }),
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Contact', level: 2 })).toBeVisible();

  await page.goto('/account-deletion');
  await expect(
    page.getByRole('heading', { name: 'Request BusSafe account deletion', level: 1 }),
  ).toBeVisible();
  await expect(page.getByText(/even if you no longer have the app/i)).toBeVisible();
  await expect(page.getByText('Sign in required')).toHaveCount(0);
});

test('release shell has no horizontal overflow', async ({ page }) => {
  await page.goto('/login');
  const dimensions = await page.evaluate(() => ({
    body: document.body.scrollWidth,
    viewport: document.documentElement.clientWidth,
  }));
  expect(dimensions.body).toBeLessThanOrEqual(dimensions.viewport + 1);
});
