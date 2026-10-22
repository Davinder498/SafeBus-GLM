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
  await expect(page.getByRole('heading', { name: 'SafeBus', level: 1 })).toBeVisible();
  const header = page.getByRole('banner');
  const wordmark = header.getByRole('link', { name: 'SafeBus home' });
  await expect(wordmark).toHaveText('SafeBus');
  await expect(wordmark.locator('img')).toHaveCount(0);
  await expect(wordmark.getByTestId('safebus-wordmark')).toHaveCSS('color', 'rgb(23, 43, 58)');
  await expect(wordmark.locator('svg')).toHaveCount(0);
  await expect(header.getByRole('link', { name: 'Sign in' })).toHaveCSS(
    'background-color',
    'rgb(23, 43, 58)',
  );
  await expect(header).toHaveCSS('position', 'fixed');
  await expect(header).toHaveCSS('border-radius', '20px');
  const headerBounds = await header.boundingBox();
  const bodyContent = page.locator('section[aria-labelledby="features-heading"] > div');
  const contentBounds = await bodyContent.boundingBox();
  const padding = await bodyContent.evaluate((element) => {
    const style = getComputedStyle(element);
    return { left: parseFloat(style.paddingLeft), right: parseFloat(style.paddingRight) };
  });
  expect(headerBounds?.x).toBe(contentBounds!.x + padding.left);
  expect(headerBounds?.width).toBe(contentBounds!.width - padding.left - padding.right);
  const heroImage = page.locator('main > section').first().locator('img');
  const heroBounds = await heroImage.boundingBox();
  expect(heroBounds?.x).toBe(0);
  expect(heroBounds?.y).toBe(0);
  expect(heroBounds?.width).toBe(page.viewportSize()!.width);
  await expect(page.getByRole('banner').getByRole('link', { name: 'Contact' })).toHaveCount(0);
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
    page.getByRole('heading', { name: 'SafeBus privacy policy', level: 1 }),
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Contact', level: 2 })).toBeVisible();

  await page.goto('/account-deletion');
  await expect(
    page.getByRole('heading', { name: 'Request SafeBus account deletion', level: 1 }),
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
