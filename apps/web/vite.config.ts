import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';
import { netlifyFunctionsPlugin } from './vite-plugin-netlify-functions';

const webRoot = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig(({ mode }) => {
  // Vite returns file-based env values but does not copy them into process.env.
  // Populate only missing keys so shell/CI values keep precedence and the local
  // function runtime can read server-only values without exposing them to the client.
  const fileEnv = loadEnv(mode, webRoot, '');
  for (const [key, value] of Object.entries(fileEnv)) {
    if (process.env[key] === undefined) process.env[key] = value;
  }

  return {
    plugins: [react(), netlifyFunctionsPlugin()],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    server: {
      port: 5173,
      strictPort: false,
    },
    build: {
      outDir: 'dist',
      // Public deploy artifacts must never contain source maps. If private
      // error-monitoring maps are introduced later, generate and upload them
      // in a protected release job and delete them before deployment.
      sourcemap: false,
    },
    test: {
      globals: true,
      environment: 'jsdom',
    },
  };
});
