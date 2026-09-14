import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { Capacitor, SystemBars, SystemBarsStyle } from '@capacitor/core';
import App from './App.tsx';
import { AuthProvider } from '@/contexts/AuthContext';
import { AppSurfaceProvider } from '@/contexts/AppSurfaceContext';
import { DriverTrackingProvider } from '@/contexts/DriverTrackingContext';
import { NotificationProvider } from '@/contexts/NotificationContext';
import { installNativeDriverTrackingBridge } from './native/driverTracking';
import { installNativeAuthDeepLinks } from './native/authDeepLinks';
import { installNativePushBridge } from './native/pushNotifications';
import 'leaflet/dist/leaflet.css';
import './index.css';

/**
 * Mobile entry point.
 *
 * Uses the SAME providers as apps/web/src/main.tsx (BrowserRouter + AuthProvider)
 * so auth, session persistence, and role-based redirects work identically.
 *
 * The only mobile-specific additions are:
 * 1. Capacitor platform detection for deep-link handling.
 * 2. Edge-to-edge system-bar styling on native Android.
 */
async function bootstrap() {
  document.documentElement.dataset.appSurface = 'native-mobile';

  // Android 16 enforces edge-to-edge. Keep system controls visible against the light app shell.
  if (Capacitor.isNativePlatform()) {
    installNativeDriverTrackingBridge();
    await installNativeAuthDeepLinks().catch(() => undefined);
    await installNativePushBridge().catch(() => undefined);
    try {
      await SystemBars.setStyle({ style: SystemBarsStyle.Light });
    } catch {
      // The native system-bars bridge may not be available in a web preview.
    }
  }

  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <BrowserRouter>
        <AppSurfaceProvider surface="native-mobile">
          <AuthProvider>
            <NotificationProvider>
              <DriverTrackingProvider>
                <App />
              </DriverTrackingProvider>
            </NotificationProvider>
          </AuthProvider>
        </AppSurfaceProvider>
      </BrowserRouter>
    </React.StrictMode>,
  );
}

void bootstrap();
