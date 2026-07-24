import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Capacitor configuration for the SafeBus Alberta mobile app.
 *
 * - appId:           com.safebusalberta.app (Android application ID)
 * - appName:         SafeBus Alberta
 * - webDir:          dist (Vite build output → synced into Android assets)
 * - server.androidScheme: hcpp (HTTPS scheme for secure-context APIs:
 *                     geolocation, camera, BarcodeDetector)
 *
 * This wraps the existing Vite-built React app (driver + guardian routes)
 * without modifying any web app source.
 */
const config: CapacitorConfig = {
  appId: 'com.safebusalberta.app',
  appName: 'SafeBus Alberta',
  webDir: 'dist',
  backgroundColor: '#1e3a8a',
  server: {
    androidScheme: 'https',
    // Use a deep-link scheme for Supabase auth redirects (password reset, OAuth).
    // The web app URL (VITE_APP_ORIGIN) is used for email deep-links so they
    // always open in a browser where the full admin experience is available.
  },
  android: {
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: true,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1000,
      backgroundColor: '#1e3a8a',
      showSpinner: false,
    },
  },
};

export default config;