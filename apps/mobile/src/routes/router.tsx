import { lazy } from 'react';
import type { RouteObject } from 'react-router';
import { Navigate } from 'react-router';
/*
 * All page components, route guards, and auth helpers are imported from the
 * shared web app source (via the `@` → apps/web/src alias). This guarantees
 * zero logic drift: the mobile app renders the exact same components.
 */
import { ProtectedRoute } from '@/routes/ProtectedRoute';
import { PublicOnlyRoute } from '@/routes/PublicOnlyRoute';

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
const AcceptInvitationPage = lazy(() =>
  import('@/pages/AcceptInvitationPage').then((page) => ({ default: page.AcceptInvitationPage })),
);
const DriverDashboardPage = lazy(() =>
  import('@/pages/DriverDashboardPage').then((page) => ({ default: page.DriverDashboardPage })),
);
const DriverTripActionsPage = lazy(() =>
  import('@/pages/DriverTripActionsPage').then((page) => ({ default: page.DriverTripActionsPage })),
);
const DriverTripExceptionPage = lazy(() =>
  import('@/pages/DriverTripActionsPage').then((page) => ({
    default: page.DriverTripExceptionPage,
  })),
);
const DriverManifestPage = lazy(() =>
  import('@/pages/DriverManifestPage').then((page) => ({ default: page.DriverManifestPage })),
);
const DriverProfilePage = lazy(() =>
  import('@/pages/DriverProfilePage').then((page) => ({ default: page.DriverProfilePage })),
);
const DriverSettingsPage = lazy(() =>
  import('@/pages/DriverSettingsPage').then((page) => ({ default: page.DriverSettingsPage })),
);
const DriverTripHistoryPage = lazy(() =>
  import('@/pages/DriverTripHistoryPage').then((page) => ({ default: page.DriverTripHistoryPage })),
);
const GuardianLiveMapPage = lazy(() =>
  import('@/pages/GuardianLiveMapPage').then((page) => ({ default: page.GuardianLiveMapPage })),
);
const GuardianLiveTripsPage = lazy(() =>
  import('@/pages/GuardianLiveTripsPage').then((page) => ({ default: page.GuardianLiveTripsPage })),
);
const GuardianBusDetailPage = lazy(() =>
  import('@/pages/GuardianBusDetailPage').then((page) => ({ default: page.GuardianBusDetailPage })),
);
const NotificationsPage = lazy(() =>
  import('@/pages/NotificationsPage').then((page) => ({ default: page.NotificationsPage })),
);
const NotificationSettingsPage = lazy(() =>
  import('@/pages/NotificationSettingsPage').then((page) => ({
    default: page.NotificationSettingsPage,
  })),
);
const GuardianRoutesPage = lazy(() =>
  import('@/pages/GuardianRoutesPage').then((page) => ({ default: page.GuardianRoutesPage })),
);
const GuardianTripEventsPage = lazy(() =>
  import('@/pages/GuardianTripEventsPage').then((page) => ({
    default: page.GuardianTripEventsPage,
  })),
);
const LoginPage = lazy(() =>
  import('@/pages/LoginPage').then((page) => ({ default: page.LoginPage })),
);
const NotFoundPage = lazy(() =>
  import('@/pages/NotFoundPage').then((page) => ({ default: page.NotFoundPage })),
);
const ParentDashboardPage = lazy(() =>
  import('@/pages/ParentDashboardPage').then((page) => ({ default: page.ParentDashboardPage })),
);
const ResetPasswordPage = lazy(() =>
  import('@/pages/ResetPasswordPage').then((page) => ({ default: page.ResetPasswordPage })),
);
const UpdatePasswordPage = lazy(() =>
  import('@/pages/UpdatePasswordPage').then((page) => ({ default: page.UpdatePasswordPage })),
);
const PrivacyPolicyPage = lazy(() =>
  import('@/pages/PrivacyPolicyPage').then((page) => ({ default: page.PrivacyPolicyPage })),
);
const AccountDeletionPage = lazy(() =>
  import('@/pages/AccountDeletionPage').then((page) => ({ default: page.AccountDeletionPage })),
);
const AccountSettingsPage = lazy(() =>
  import('@/pages/AccountSettingsPage').then((page) => ({ default: page.AccountSettingsPage })),
);
const MfaPage = lazy(() => import('@/pages/MfaPage').then((page) => ({ default: page.MfaPage })));
const MobileSupportPage = lazy(() =>
  import('@/pages/MobileSupportPage').then((page) => ({ default: page.MobileSupportPage })),
);
const AdminNotAvailablePage = lazy(() =>
  import('../pages/AdminNotAvailablePage').then((page) => ({
    default: page.AdminNotAvailablePage,
  })),
);

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
  { path: '/privacy', element: <PrivacyPolicyPage /> },
  { path: '/account-deletion', element: <AccountDeletionPage /> },
  {
    path: '/mfa',
    element: (
      <ProtectedRoute allowedRoles={['driver', 'guardian']} requireMfa={false}>
        <MfaPage />
      </ProtectedRoute>
    ),
  },
  {
    path: '/account/security',
    element: (
      <ProtectedRoute allowedRoles={['driver', 'guardian']}>
        <MfaPage />
      </ProtectedRoute>
    ),
  },
  {
    path: '/support',
    element: (
      <ProtectedRoute allowedRoles={['driver', 'guardian']}>
        <MobileSupportPage />
      </ProtectedRoute>
    ),
  },
  {
    path: '/account',
    element: (
      <ProtectedRoute allowedRoles={['driver', 'guardian']}>
        <AccountSettingsPage />
      </ProtectedRoute>
    ),
  },
  {
    path: '/notifications',
    element: (
      <ProtectedRoute allowedRoles={['driver', 'guardian']}>
        <NotificationsPage />
      </ProtectedRoute>
    ),
  },
  {
    path: '/notifications/settings',
    element: (
      <ProtectedRoute allowedRoles={['driver', 'guardian']}>
        <NotificationSettingsPage />
      </ProtectedRoute>
    ),
  },
  {
    path: '/notifications/settings/email',
    element: <Navigate to="/notifications/settings" replace />,
  },

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
  {
    path: '/driver/trip-actions',
    element: (
      <ProtectedRoute allowedRoles={['driver']}>
        <DriverTripActionsPage />
      </ProtectedRoute>
    ),
  },
  {
    path: '/driver/record-exception',
    element: (
      <ProtectedRoute allowedRoles={['driver']}>
        <DriverTripExceptionPage />
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
    path: '/guardian/buses/:busNumber',
    element: (
      <ProtectedRoute allowedRoles={['guardian']}>
        <GuardianBusDetailPage />
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
    path: '/guardian/notifications',
    element: <Navigate to="/notifications/settings" replace />,
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
