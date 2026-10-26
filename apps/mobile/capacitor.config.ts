import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Capacitor configuration for the SafeBus mobile app.
 *
 * - appId:           com.safebusalberta.app (Android application ID)
 * - appName:         SafeBus
 * - webDir:          dist (Vite build output → synced into Android assets)
 * - server.androidScheme: hcpp (HTTPS scheme for secure-context APIs:
 *                     geolocation)
 *
 * This wraps the existing Vite-built React app (driver + guardian routes)
 * without modifying any web app source.
 */
const config: CapacitorConfig = {
  appId: 'com.safebusalberta.app',
  appName: 'SafeBus',
  webDir: 'dist',
  backgroundColor: '#f2f6f7',
  server: {
    androidScheme: 'https',
  },
  android: {
    allowMixedContent: false,
    captureInput: true,
    // Never expose the production WebView through Chrome remote debugging.
    webContentsDebuggingEnabled: false,
  },
  plugins: {
    PushNotifications: {
      // Also present incoming pushes while SafeBus is open. The receive listener
      // still refreshes the inbox; Android channels control sound and visibility.
      presentationOptions: ['alert', 'sound'],
    },
    SystemBars: {
      insetsHandling: 'css',
      style: 'DEFAULT',
      hidden: false,
    },
    SplashScreen: {
      launchShowDuration: 1000,
      backgroundColor: '#f2f6f7',
      androidSplashResourceName: 'launch_background',
      showSpinner: false,
    },
  },
};

export default config;
