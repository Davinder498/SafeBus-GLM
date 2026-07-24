import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

/**
 * Mobile app Vite configuration.
 *
 * The `@` alias points to `apps/web/src` so the mobile app reuses ALL
 * existing pages, services, hooks, contexts, components, and types
 * without duplication. The mobile app only provides its own router
 * (driver + guardian + auth routes) and Capacitor wrapper.
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('../web/src', import.meta.url)),
    },
  },
  server: {
    port: 5174,
    strictPort: false,
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
  test: {
    globals: true,
    environment: 'jsdom',
  },
});