import type { RouteObject } from 'react-router-dom';
import { LandingPage } from '@/pages/LandingPage';
import { LoginPage } from '@/pages/LoginPage';
import { ResetPasswordPage } from '@/pages/ResetPasswordPage';
import { AdminDashboardPage } from '@/pages/AdminDashboardPage';
import { AdminPlaceholderPage } from '@/pages/AdminPlaceholderPage';
import { AdminSchoolsPage } from '@/pages/AdminSchoolsPage';
import { AdminSettingsPage } from '@/pages/AdminSettingsPage';
import { AdminUsersPage } from '@/pages/AdminUsersPage';
import { DriverDashboardPage } from '@/pages/DriverDashboardPage';
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
  ...[
    ['live-map', 'Live Map'],
    ['trips', 'Trips'],
    ['routes', 'Routes'],
    ['stops', 'Stops'],
    ['students', 'Students'],
    ['guardians', 'Guardians'],
    ['drivers', 'Drivers'],
    ['buses', 'Buses'],
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
    path: '/parent',
    element: (
      <ProtectedRoute allowedRoles={['guardian']}>
        <ParentDashboardPage />
      </ProtectedRoute>
    ),
  },
  { path: '*', element: <NotFoundPage /> },
];
