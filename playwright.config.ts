import { defineConfig, devices } from '@playwright/test';

const playwrightPort = Number(process.env.PLAYWRIGHT_PORT ?? 4173);
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
  // Native UI tests require the mobile entry point and its dedicated config.
  // Driver and guardian operational journeys run through the mobile-entry
  // suite. The website suite is limited to public and administrative surfaces.
  testIgnore: [
    /release-assets/,
    /mobile-ui/,
    /driver-active-trip-student-manifest\.spec\.ts/,
    /driver-assignment\.spec\.ts/,
    /driver-dashboard(?:-authenticated)?\.spec\.ts/,
    /driver-trip-history\.spec\.ts/,
    /guardian-live-bus-map\.spec\.ts/,
    /guardian-live-trip-status\.spec\.ts/,
    /guardian-trip-event-status\.spec\.ts/,
    /guardian-verification-recovery\.spec\.ts/,
    /notifications-inbox\.spec\.ts/,
    /phase-16a-student-qr\.spec\.ts/,
    /phase6-driver-operations\.spec\.ts/,
  ],
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
    command: `pnpm --filter @safebus/web exec vite --port ${playwrightPort} --strictPort`,
    url: playwrightBaseUrl,
    env: {
      ...process.env,
      VITE_SUPABASE_URL: 'https://placeholder.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'placeholder-anon-key',
    },
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
