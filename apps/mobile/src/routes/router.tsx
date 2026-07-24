import type { RouteObject } from 'react-router-dom';
import { Navigate } from 'react-router-dom';
/*
 * All page components, route guards, and auth helpers are imported from the
 * shared web app source (via the `@` → apps/web/src alias). This guarantees
 * zero logic drift: the mobile app renders the exact same components.
 */
import { AcceptInvitationPage } from '@/pages/AcceptInvitationPage';
import { DriverDashboardPage } from '@/pages/DriverDashboardPage';
import { DriverManifestPage } from '@/pages/DriverManifestPage';
import { DriverProfilePage } from '@/pages/DriverProfilePage';
import { DriverSettingsPage } from '@/pages/DriverSettingsPage';
import { DriverTripHistoryPage } from '@/pages/DriverTripHistoryPage';
import { GuardianLiveMapPage } from '@/pages/GuardianLiveMapPage';
import { GuardianLiveTripsPage } from '@/pages/GuardianLiveTripsPage';
import { GuardianRoutesPage } from '@/pages/GuardianRoutesPage';
import { GuardianTripEventsPage } from '@/pages/GuardianTripEventsPage';
import { LoginPage } from '@/pages/LoginPage';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { ParentDashboardPage } from '@/pages/ParentDashboardPage';
import { ResetPasswordPage } from '@/pages/ResetPasswordPage';
import { UpdatePasswordPage } from '@/pages/UpdatePasswordPage';
import { ProtectedRoute } from '@/routes/ProtectedRoute';
import { PublicOnlyRoute } from '@/routes/PublicOnlyRoute';
import { AdminNotAvailablePage } from '../pages/AdminNotAvailablePage';

/**
 * Mobile route table — a SUBSET of the web app routes.
 *
 * Included:  auth (login, reset, invite) + driver/* + guardian/*
 * Excluded:  admin/* (admins use the web app), landing page, platform tenants
 *
 * When an admin signs in, getDashboardPath() navigates to /admin. The mobile
 * app registers /admin/* catch-all → AdminNotAvailablePage so admin users see
 * a helpful message instead of a 404.
 */
export const appRoutes: RouteObject[] = [
  { path: '/', element: <Navigate to="/login" replace /> },
  {
    path: '/login',
    element: (
      <PublicOnlyRoute>
        <LoginPage />
      </PublicOnlyRoute>
    ),
  },
  { path: '/accept-invitation', element: <AcceptInvitationPage /> },
  { path: '/reset-password', element: <ResetPasswordPage /> },
  { path: '/update-password', element: <UpdatePasswordPage /> },

  /* ----------------------------- Driver routes ----------------------------- */
  {
    path: '/driver',
    element: (
      <ProtectedRoute allowedRoles={['driver']}>
        <DriverDashboardPage />
      </ProtectedRoute>
    ),
  },
  {
    path: '/driver/pickup-drop-off',
    element: (
      <ProtectedRoute allowedRoles={['driver']}>
        <DriverManifestPage />
      </ProtectedRoute>
    ),
  },
  { path: '/driver/manifest', element: <Navigate to="/driver/pickup-drop-off" replace /> },
  {
    path: '/driver/history',
    element: (
      <ProtectedRoute allowedRoles={['driver']}>
        <DriverTripHistoryPage />
      </ProtectedRoute>
    ),
  },
  {
    path: '/driver/settings',
    element: (
      <ProtectedRoute allowedRoles={['driver']}>
        <DriverSettingsPage />
      </ProtectedRoute>
    ),
  },
  {
    path: '/driver/profile',
    element: (
      <ProtectedRoute allowedRoles={['driver']}>
        <DriverProfilePage />
      </ProtectedRoute>
    ),
  },

  /* ---------------------------- Guardian routes ---------------------------- */
  {
    path: '/parent',
    element: (
      <ProtectedRoute allowedRoles={['guardian']}>
        <ParentDashboardPage />
      </ProtectedRoute>
    ),
  },
  {
    path: '/guardian/routes',
    element: (
      <ProtectedRoute allowedRoles={['guardian']}>
        <GuardianRoutesPage />
      </ProtectedRoute>
    ),
  },
  {
    path: '/guardian/live-map',
    element: (
      <ProtectedRoute allowedRoles={['guardian']}>
        <GuardianLiveMapPage />
      </ProtectedRoute>
    ),
  },
  {
    path: '/guardian/live',
    element: (
      <ProtectedRoute allowedRoles={['guardian']}>
        <GuardianLiveTripsPage />
      </ProtectedRoute>
    ),
  },
  {
    path: '/guardian/events',
    element: (
      <ProtectedRoute allowedRoles={['guardian']}>
        <GuardianTripEventsPage />
      </ProtectedRoute>
    ),
  },

  /* ----------- Admin catch-all → friendly "use web app" message ----------- */
  { path: '/admin/*', element: <AdminNotAvailablePage /> },
  { path: '/admin', element: <AdminNotAvailablePage /> },

  { path: '*', element: <NotFoundPage /> },
];