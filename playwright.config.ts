import { defineConfig, devices } from '@playwright/test';

const playwrightPort = Number(process.env.PLAYWRIGHT_PORT ?? 5173);
const playwrightBaseUrl = `http://localhost:${playwrightPort}`;

/**
 * Playwright config for SafeBus smoke tests.
 *
 * Smoke tests live in tests/smoke/ and exercise the unauthenticated/protected
 * route behaviour of the web app. They do NOT use production Supabase data or
 * credentials, and they do NOT add any test backdoors to the production app.
 *
 * The web app is started via Vite on port 5173 with placeholder Supabase env
 * vars (see apps/web/.env, gitignored) so the auth client initialises and the
 * ProtectedRoute renders its "Sign in required" state for unauthenticated users.
 */
export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    baseURL: playwrightBaseUrl,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'desktop-chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      // Phone-sized viewport on chromium (avoids requiring a webkit download).
      name: 'mobile-chromium',
      use: {
        browserName: 'chromium',
        viewport: { width: 390, height: 844 },
      },
    },
  ],
  webServer: {
    command: `pnpm --filter @safebus/web exec vite --port ${playwrightPort}`,
    url: playwrightBaseUrl,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
