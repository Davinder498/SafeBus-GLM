import { defineConfig, devices } from '@playwright/test';

// Run against fresh production builds made with placeholder Supabase config.
// Browser requests to Supabase are blocked by the tests; no hosted fixtures run.
export default defineConfig({
  testDir: './tests/route-loading',
  outputDir: './test-results/route-loading',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'list',
  use: { trace: 'retain-on-failure' },
  projects: [
    {
      name: 'website',
      use: { ...devices['Desktop Chrome'], baseURL: 'http://localhost:4191' },
    },
    {
      name: 'mobile-entry',
      use: {
        browserName: 'chromium',
        viewport: { width: 390, height: 844 },
        baseURL: 'http://localhost:4192',
      },
    },
  ],
  webServer: [
    {
      command: 'pnpm --filter @safebus/web exec vite preview --port 4191 --strictPort',
      url: 'http://localhost:4191',
      reuseExistingServer: false,
    },
    {
      command: 'pnpm --filter @safebus/mobile exec vite preview --port 4192 --strictPort',
      url: 'http://localhost:4192',
      reuseExistingServer: false,
    },
  ],
});
