import type { RouteObject } from 'react-router-dom';
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
import { AdminSchoolsPage } from '@/pages/AdminSchoolsPage';
import { AdminSettingsPage } from '@/pages/AdminSettingsPage';
import { AdminStopsPage } from '@/pages/AdminStopsPage';
import { AdminStudentsPage } from '@/pages/AdminStudentsPage';
import { AdminUsersPage } from '@/pages/AdminUsersPage';
import { AdminSetupPage } from '@/pages/AdminSetupPage';
import { AdminOperationsPage } from '@/pages/AdminOperationsPage';
import { AdminPeoplePage } from '@/pages/AdminPeoplePage';
import { AdminMorePage } from '@/pages/AdminMorePage';
import { AdminTripsPage } from '@/pages/AdminTripsPage';
import { DriverDashboardPage } from '@/pages/DriverDashboardPage';
import { DriverManifestPage } from '@/pages/DriverManifestPage';
import { GuardianLiveMapPage } from '@/pages/GuardianLiveMapPage';
import { GuardianLiveTripsPage } from '@/pages/GuardianLiveTripsPage';
import { GuardianRoutesPage } from '@/pages/GuardianRoutesPage';
import { GuardianTripEventsPage } from '@/pages/GuardianTripEventsPage';
import { ParentDashboardPage } from '@/pages/ParentDashboardPage';
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
  {
    path: '/admin/setup',
    element: <ProtectedRoute allowedRoles={[...adminRoles]}><AdminSetupPage /></ProtectedRoute>,
  },
  {
    path: '/admin/operations',
    element: <ProtectedRoute allowedRoles={[...adminRoles]}><AdminOperationsPage /></ProtectedRoute>,
  },
  {
    path: '/admin/people',
    element: <ProtectedRoute allowedRoles={[...adminRoles]}><AdminPeoplePage /></ProtectedRoute>,
  },
  {
    path: '/admin/more',
    element: <ProtectedRoute allowedRoles={[...adminRoles]}><AdminMorePage /></ProtectedRoute>,
  },
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
    path: '/admin/routes',
    element: (
      <ProtectedRoute allowedRoles={[...adminRoles]}>
        <AdminRoutesPage />
      </ProtectedRoute>
    ),
  },
  {
    path: '/admin/stops',
    element: (
      <ProtectedRoute allowedRoles={[...adminRoles]}>
        <AdminStopsPage />
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
