import type { RouteObject } from 'react-router-dom';
import { Navigate } from 'react-router-dom';
import { AdminAssignmentsPage } from '@/pages/AdminAssignmentsPage';
import { AdminBusesPage } from '@/pages/AdminBusesPage';
import { LandingPage } from '@/pages/LandingPage';
import { LoginPage } from '@/pages/LoginPage';
import { ResetPasswordPage } from '@/pages/ResetPasswordPage';
import { AdminDriversPage } from '@/pages/AdminDriversPage';
import { AdminDashboardPage } from '@/pages/AdminDashboardPage';
import { AdminDriverAssignmentsPage } from '@/pages/AdminDriverAssignmentsPage';
import { AdminGuardiansPage } from '@/pages/AdminGuardiansPage';
import { AdminLiveTripsPage } from '@/pages/AdminLiveTripsPage';
import { AdminPlaceholderPage } from '@/pages/AdminPlaceholderPage';
import { AdminRoutesPage } from '@/pages/AdminRoutesPage';
import { AdminRouteDetailPage } from '@/pages/AdminRouteDetailPage';
import { AdminRouteManagePage } from '@/pages/AdminRouteManagePage';
import { AdminSchoolsPage } from '@/pages/AdminSchoolsPage';
import { AdminSettingsPage } from '@/pages/AdminSettingsPage';
import { AdminStudentsPage } from '@/pages/AdminStudentsPage';
import { AdminUsersPage } from '@/pages/AdminUsersPage';
import { AdminTripsPage } from '@/pages/AdminTripsPage';
import { DriverDashboardPage } from '@/pages/DriverDashboardPage';
import { DriverManifestPage } from '@/pages/DriverManifestPage';
import { GuardianLiveMapPage } from '@/pages/GuardianLiveMapPage';
import { GuardianLiveTripsPage } from '@/pages/GuardianLiveTripsPage';
import { GuardianRoutesPage } from '@/pages/GuardianRoutesPage';
import { GuardianTripEventsPage } from '@/pages/GuardianTripEventsPage';
import { ParentDashboardPage } from '@/pages/ParentDashboardPage';
import { PlatformTenantsPage } from '@/pages/PlatformTenantsPage';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { ProtectedRoute } from './ProtectedRoute';
import { PublicOnlyRoute } from './PublicOnlyRoute';
import { adminRoles } from '@/contexts/AuthContext';

export const appRoutes: RouteObject[] = [
  { path: '/', element: <LandingPage /> },
  {
    path: '/login',
    element: (
      <PublicOnlyRoute>
        <LoginPage />
      </PublicOnlyRoute>
    ),
  },
  { path: '/reset-password', element: <ResetPasswordPage /> },
  {
    path: '/admin',
    element: (
      <ProtectedRoute allowedRoles={[...adminRoles]}>
        <AdminDashboardPage />
      </ProtectedRoute>
    ),
  },
  // Redirects for removed hub pages
  { path: '/admin/setup', element: <Navigate to="/admin" replace /> },
  { path: '/admin/operations', element: <Navigate to="/admin" replace /> },
  { path: '/admin/people', element: <Navigate to="/admin" replace /> },
  { path: '/admin/more', element: <Navigate to="/admin" replace /> },
  { path: '/admin/stops', element: <Navigate to="/admin/routes" replace /> },
  { path: '/admin/tenants', element: <ProtectedRoute allowedRoles={['platform_super_admin']}><PlatformTenantsPage /></ProtectedRoute> },
  {
    path: '/admin/trips',
    element: <ProtectedRoute allowedRoles={[...adminRoles]}><AdminTripsPage /></ProtectedRoute>,
  },
  {
    path: '/admin/settings',
    element: (
      <ProtectedRoute allowedRoles={[...adminRoles]}>
        <AdminSettingsPage />
      </ProtectedRoute>
    ),
  },
  {
    path: '/admin/schools',
    element: (
      <ProtectedRoute allowedRoles={[...adminRoles]}>
        <AdminSchoolsPage />
      </ProtectedRoute>
    ),
  },
  {
    path: '/admin/users',
    element: (
      <ProtectedRoute allowedRoles={[...adminRoles]}>
        <AdminUsersPage />
      </ProtectedRoute>
    ),
  },
  {
    path: '/admin/students',
    element: (
      <ProtectedRoute allowedRoles={[...adminRoles]}>
        <AdminStudentsPage />
      </ProtectedRoute>
    ),
  },
  {
    path: '/admin/guardians',
    element: (
      <ProtectedRoute allowedRoles={[...adminRoles]}>
        <AdminGuardiansPage />
      </ProtectedRoute>
    ),
  },
  {
    path: '/admin/buses',
    element: (
      <ProtectedRoute allowedRoles={[...adminRoles]}>
        <AdminBusesPage />
      </ProtectedRoute>
    ),
  },
  {
    path: '/admin/drivers',
    element: (
      <ProtectedRoute allowedRoles={[...adminRoles]}>
        <AdminDriversPage />
      </ProtectedRoute>
    ),
  },
  {
    path: '/admin/routes/:routeId/manage',
    element: (
      <ProtectedRoute allowedRoles={[...adminRoles]}>
        <AdminRouteManagePage />
      </ProtectedRoute>
    ),
  },
  {
    path: '/admin/routes/:routeId',
    element: (
      <ProtectedRoute allowedRoles={[...adminRoles]}>
        <AdminRouteDetailPage />
      </ProtectedRoute>
    ),
  },
  {
    path: '/admin/routes',
    element: (
      <ProtectedRoute allowedRoles={[...adminRoles]}>
        <AdminRoutesPage />
      </ProtectedRoute>
    ),
  },
  {
    path: '/admin/assignments',
    element: (
      <ProtectedRoute allowedRoles={[...adminRoles]}>
        <AdminAssignmentsPage />
      </ProtectedRoute>
    ),
  },
  {
    path: '/admin/live-trips',
    element: (
      <ProtectedRoute allowedRoles={[...adminRoles]}>
        <AdminLiveTripsPage />
      </ProtectedRoute>
    ),
  },
  {
    path: '/admin/live-fleet',
    element: (
      <ProtectedRoute allowedRoles={[...adminRoles]}>
        <AdminLiveTripsPage />
      </ProtectedRoute>
    ),
  },
  {
    path: '/admin/driver-assignments',
    element: (
      <ProtectedRoute allowedRoles={[...adminRoles]}>
        <AdminDriverAssignmentsPage />
      </ProtectedRoute>
    ),
  },
  ...[
    ['live-map', 'Live Map'],
    ['imports', 'Imports'],
    ['alerts', 'Alerts'],
    ['reports', 'Reports'],
  ].map(([path, title]) => ({
    path: `/admin/${path}`,
    element: (
      <ProtectedRoute allowedRoles={[...adminRoles]}>
        <AdminPlaceholderPage title={title} />
      </ProtectedRoute>
    ),
  })),
  {
    path: '/driver',
    element: (
      <ProtectedRoute allowedRoles={['driver']}>
        <DriverDashboardPage />
      </ProtectedRoute>
    ),
  },
  {
    path: '/driver/manifest',
    element: (
      <ProtectedRoute allowedRoles={['driver']}>
        <DriverManifestPage />
      </ProtectedRoute>
    ),
  },
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
  { path: '*', element: <NotFoundPage /> },
];
