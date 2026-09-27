import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from '@playwright/test';

const baseUrl = process.env.SAFEBUS_REVIEW_BASE_URL ?? 'http://localhost:4190';
const outputDirectory = resolve(
  process.env.SAFEBUS_REVIEW_OUTPUT ?? '.codex-artifacts/ui-review',
);

await mkdir(outputDirectory, { recursive: true });

const browser = await chromium.launch();

try {
  const publicPage = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await publicPage.goto(baseUrl, { waitUntil: 'networkidle' });
  await publicPage.locator('[data-ui="public-app-bar"]').screenshot({
    path: resolve(outputDirectory, 'web-header.png'),
  });

  const loadingPage = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await loadingPage.addInitScript(() => {
    const session = {
      access_token: [
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9',
        'eyJzdWIiOiIwMDAwMDAwMC0wMDAwLTAwMDAtMDAwMC0wMDAwMDAwMDAwMDEiLCJyb2xlIjoiYXV0aGVudGljYXRlZCIsImV4cCI6NDEwMjQ0NDgwMH0',
        'review-signature',
      ].join('.'),
      refresh_token: 'review-refresh-token',
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      expires_in: 3600,
      token_type: 'bearer',
      user: {
        id: '00000000-0000-0000-0000-000000000001',
        email: 'review@example.invalid',
        aud: 'authenticated',
        role: 'authenticated',
      },
    };
    for (const key of ['supabase.auth.token', 'sb-placeholder-auth-token']) {
      localStorage.setItem(key, JSON.stringify(session));
    }
  });
  await loadingPage.route('**/rest/v1/profiles**', async (route) => {
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 5_000));
    await route.abort();
  });
  await loadingPage.goto(`${baseUrl}/support`, { waitUntil: 'domcontentloaded' });
  await loadingPage.getByText('Loading BusSafe', { exact: true }).waitFor({ state: 'visible' });
  await loadingPage.screenshot({
    path: resolve(outputDirectory, 'web-loading.png'),
    fullPage: true,
  });
} finally {
  await browser.close();
}
