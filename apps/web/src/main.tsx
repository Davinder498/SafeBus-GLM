import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import App from './App.tsx';
import { initializeAppearance } from './theme/appearance';
import { AuthProvider } from './contexts/AuthContext.tsx';
import { DriverTrackingProvider } from './contexts/DriverTrackingContext.tsx';
import { NotificationProvider } from './contexts/NotificationContext.tsx';
import 'leaflet/dist/leaflet.css';
import './index.css';

initializeAppearance();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <NotificationProvider>
          <DriverTrackingProvider>
            <App />
          </DriverTrackingProvider>
        </NotificationProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
