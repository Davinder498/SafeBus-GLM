import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { StatusBar, Style } from '@capacitor/status-bar';
import App from './App.tsx';
import { AuthProvider } from '@/contexts/AuthContext';
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
 * 2. Status bar styling on native Android.
 */
async function bootstrap() {
  // Style the Android status bar to match the navy brand
  if (Capacitor.isNativePlatform()) {
    try {
      await StatusBar.setStyle({ style: Style.Dark });
      await StatusBar.setBackgroundColor({ color: '#1E3A8A' });
    } catch {
      // StatusBar plugin may not be available on web preview — safe to ignore.
    }
  }

  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <BrowserRouter>
        <AuthProvider>
          <App />
        </AuthProvider>
      </BrowserRouter>
    </React.StrictMode>,
  );
}

void bootstrap();