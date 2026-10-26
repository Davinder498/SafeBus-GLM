import { defineConfig } from '@playwright/test';

const env = {
  ...process.env,
  VITE_SUPABASE_URL: 'https://placeholder.supabase.co',
  VITE_SUPABASE_ANON_KEY: 'placeholder-anon-key',
};
export default defineConfig({
  testDir: './tests/appearance',
  outputDir: './test-results/appearance',
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: 'list',
  use: {
    browserName: 'chromium',
    serviceWorkers: 'block',
    reducedMotion: 'reduce',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'web',
      use: { baseURL: 'http://localhost:4203', viewport: { width: 1280, height: 900 } },
    },
    {
      name: 'android-webview',
      use: { baseURL: 'http://localhost:4204', viewport: { width: 390, height: 844 } },
    },
  ],
  webServer: [
    {
      command: 'pnpm --filter @safebus/web exec vite --port 4203 --strictPort',
      url: 'http://localhost:4203',
      env,
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: 'pnpm --filter @safebus/mobile exec vite --port 4204 --strictPort',
      url: 'http://localhost:4204',
      env,
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});
