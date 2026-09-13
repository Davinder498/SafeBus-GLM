import { defineConfig } from '@playwright/test';

const port = Number(process.env.PLAYWRIGHT_MOBILE_UI_PORT ?? 4184);

export default defineConfig({
  testDir: './tests/mobile-ui',
  outputDir: './test-results/mobile-ui',
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: `http://localhost:${port}`,
    browserName: 'chromium',
    viewport: { width: 390, height: 844 },
    colorScheme: 'light',
    reducedMotion: 'reduce',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: `pnpm --filter @safebus/mobile exec vite --port ${port} --strictPort`,
    url: `http://localhost:${port}`,
    env: {
      ...process.env,
      VITE_SUPABASE_URL: 'https://placeholder.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'placeholder-anon-key',
    },
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
