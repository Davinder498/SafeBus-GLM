import { defineConfig } from '@playwright/test';

const port = Number(process.env.PLAYWRIGHT_STORE_PORT ?? 4183);
const baseURL = `http://localhost:${port}`;

export default defineConfig({
  testDir: './tests/release-assets',
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL,
    browserName: 'chromium',
    viewport: { width: 360, height: 640 },
    deviceScaleFactor: 3,
    colorScheme: 'light',
    reducedMotion: 'reduce',
  },
  webServer: {
    command: `pnpm --filter @safebus/mobile exec vite --port ${port} --strictPort`,
    url: baseURL,
    env: {
      ...process.env,
      VITE_SUPABASE_URL: 'https://placeholder.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'placeholder-anon-key',
    },
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
