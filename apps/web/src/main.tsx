import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import App from './App.tsx';
import { AuthProvider } from './contexts/AuthContext.tsx';
import { DriverTrackingProvider } from './contexts/DriverTrackingContext.tsx';
import 'leaflet/dist/leaflet.css';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <DriverTrackingProvider>
          <App />
        </DriverTrackingProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
