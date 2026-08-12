import type { RouteObject } from 'react-router';
import { Navigate } from 'react-router';
import { AdminAssignmentsPage } from '@/pages/AdminAssignmentsPage';
import { AcceptInvitationPage } from '@/pages/AcceptInvitationPage';
import { AdminBusesPage } from '@/pages/AdminBusesPage';
import { AdminBusWorkspacePage } from '@/pages/AdminBusWorkspacePage';
import { LandingPage } from '@/pages/LandingPage';
import { LoginPage } from '@/pages/LoginPage';
import { ResetPasswordPage } from '@/pages/ResetPasswordPage';
import { UpdatePasswordPage } from '@/pages/UpdatePasswordPage';
import { AdminDriversPage } from '@/pages/AdminDriversPage';
import { AdminDriverDetailPage } from '@/pages/AdminDriverDetailPage';
import { AdminDriverAssignmentsPage } from '@/pages/AdminDriverAssignmentsPage';
import { AdminDashboardPage } from '@/pages/AdminDashboardPage';
import { AdminGuardiansPage } from '@/pages/AdminGuardiansPage';
import { AdminGuardianDetailPage } from '@/pages/AdminGuardianDetailPage';
import { AdminLiveTripsPage } from '@/pages/AdminLiveTripsPage';
import { AdminRoutesPage } from '@/pages/AdminRoutesPage';
import { AdminRouteDetailPage } from '@/pages/AdminRouteDetailPage';
import { AdminRouteManagePage } from '@/pages/AdminRouteManagePage';
import { AdminSchoolsPage } from '@/pages/AdminSchoolsPage';
import { AdminSettingsPage } from '@/pages/AdminSettingsPage';
import { AdminStudentDetailPage } from '@/pages/AdminStudentDetailPage';
import { AdminStudentsPage } from '@/pages/AdminStudentsPage';
import { AdminTripsPage } from '@/pages/AdminTripsPage';
import { AdminUsersPage } from '@/pages/AdminUsersPage';
import { AdminAdministratorsPage } from '@/pages/AdminAdministratorsPage';
import { AdminBulkImportPage } from '@/pages/AdminBulkImportPage';
import { AdminAuditSearchPage } from '@/pages/AdminAuditSearchPage';
import { DriverDashboardPage } from '@/pages/DriverDashboardPage';
import { DriverManifestPage } from '@/pages/DriverManifestPage';
import { DriverProfilePage } from '@/pages/DriverProfilePage';
import { DriverSettingsPage } from '@/pages/DriverSettingsPage';
import { DriverTripHistoryPage } from '@/pages/DriverTripHistoryPage';
import { GuardianLiveMapPage } from '@/pages/GuardianLiveMapPage';
import { GuardianLiveTripsPage } from '@/pages/GuardianLiveTripsPage';
import { GuardianNotificationPreferencesPage } from '@/pages/GuardianNotificationPreferencesPage';
import { GuardianRoutesPage } from '@/pages/GuardianRoutesPage';
import { GuardianTripEventsPage } from '@/pages/GuardianTripEventsPage';
import { ParentDashboardPage } from '@/pages/ParentDashboardPage';
import { PlatformTenantsPage } from '@/pages/PlatformTenantsPage';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { MfaPage } from '@/pages/MfaPage';
import { ProtectedRoute } from './ProtectedRoute';
import { PublicOnlyRoute } from './PublicOnlyRoute';
import { InvitationEntryRoute } from './InvitationEntryRoute';
import { adminRoles } from '@/contexts/AuthContext';

export const appRoutes: RouteObject[] = [
  {
    path: '/',
    element: (
      <InvitationEntryRoute>
        <LandingPage />
      </InvitationEntryRoute>
    ),
  },
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
  {
    path: '/mfa',
    element: (
      <ProtectedRoute allowedRoles={[...adminRoles]} requireMfa={false}>
        <MfaPage />
      </ProtectedRoute>
    ),
  },
  {
    path: '/admin',
    element: (
      <ProtectedRoute allowedRoles={adminRoles.filter((role) => role !== 'platform_super_admin')}>
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
  {
    path: '/admin/tenants',
    element: (
      <ProtectedRoute allowedRoles={['platform_super_admin']}>
        <PlatformTenantsPage />
      </ProtectedRoute>
    ),
  },
  {
    path: '/admin/trips',
    element: (
      <ProtectedRoute allowedRoles={adminRoles.filter((role) => role !== 'platform_super_admin')}>
        <AdminTripsPage />
      </ProtectedRoute>
    ),
  },
  {
    path: '/admin/settings',
    element: (
      <ProtectedRoute allowedRoles={adminRoles.filter((role) => role !== 'platform_super_admin')}>
        <AdminSettingsPage />
      </ProtectedRoute>
    ),
  },
  {
    path: '/admin/schools',
    element: (
      <ProtectedRoute allowedRoles={adminRoles.filter((role) => role !== 'platform_super_admin')}>
        <AdminSchoolsPage />
      </ProtectedRoute>
    ),
  },
  {
    path: '/admin/users',
    element: (
      <ProtectedRoute allowedRoles={adminRoles.filter((role) => role !== 'platform_super_admin')}>
        <AdminUsersPage />
      </ProtectedRoute>
    ),
  },
  {
    path: '/admin/administrators',
    element: (
      <ProtectedRoute allowedRoles={['tenant_admin']}>
        <AdminAdministratorsPage />
      </ProtectedRoute>
    ),
  },
  {
    path: '/admin/bulk-import',
    element: (
      <ProtectedRoute allowedRoles={['tenant_admin']}>
        <AdminBulkImportPage />
      </ProtectedRoute>
    ),
  },
  {
    path: '/admin/audit-search',
    element: (
      <ProtectedRoute allowedRoles={['tenant_admin']}>
        <AdminAuditSearchPage />
      </ProtectedRoute>
    ),
  },
  {
    path: '/admin/students/:studentId',
    element: (
      <ProtectedRoute allowedRoles={adminRoles.filter((role) => role !== 'platform_super_admin')}>
        <AdminStudentDetailPage />
      </ProtectedRoute>
    ),
  },
  {
    path: '/admin/students',
    element: (
      <ProtectedRoute allowedRoles={adminRoles.filter((role) => role !== 'platform_super_admin')}>
        <AdminStudentsPage />
      </ProtectedRoute>
    ),
  },
  {
    path: '/admin/guardians/:guardianId',
    element: (
      <ProtectedRoute allowedRoles={adminRoles.filter((role) => role !== 'platform_super_admin')}>
        <AdminGuardianDetailPage />
      </ProtectedRoute>
    ),
  },
  {
    path: '/admin/guardians',
    element: (
      <ProtectedRoute allowedRoles={adminRoles.filter((role) => role !== 'platform_super_admin')}>
        <AdminGuardiansPage />
      </ProtectedRoute>
    ),
  },
  {
    path: '/admin/buses/new',
    element: (
      <ProtectedRoute allowedRoles={adminRoles.filter((role) => role !== 'platform_super_admin')}>
        <AdminBusWorkspacePage />
      </ProtectedRoute>
    ),
  },
  {
    path: '/admin/buses/:busId',
    element: (
      <ProtectedRoute allowedRoles={adminRoles.filter((role) => role !== 'platform_super_admin')}>
        <AdminBusWorkspacePage />
      </ProtectedRoute>
    ),
  },
  {
    path: '/admin/buses',
    element: (
      <ProtectedRoute allowedRoles={adminRoles.filter((role) => role !== 'platform_super_admin')}>
        <AdminBusesPage />
      </ProtectedRoute>
    ),
  },
  {
    path: '/admin/drivers/:driverId',
    element: (
      <ProtectedRoute allowedRoles={adminRoles.filter((role) => role !== 'platform_super_admin')}>
        <AdminDriverDetailPage />
      </ProtectedRoute>
    ),
  },
  {
    path: '/admin/drivers',
    element: (
      <ProtectedRoute allowedRoles={adminRoles.filter((role) => role !== 'platform_super_admin')}>
        <AdminDriversPage />
      </ProtectedRoute>
    ),
  },
  {
    path: '/admin/routes/:routeId/manage',
    element: (
      <ProtectedRoute allowedRoles={adminRoles.filter((role) => role !== 'platform_super_admin')}>
        <AdminRouteManagePage />
      </ProtectedRoute>
    ),
  },
  {
    path: '/admin/routes/:routeId',
    element: (
      <ProtectedRoute allowedRoles={adminRoles.filter((role) => role !== 'platform_super_admin')}>
        <AdminRouteDetailPage />
      </ProtectedRoute>
    ),
  },
  {
    path: '/admin/routes',
    element: (
      <ProtectedRoute allowedRoles={adminRoles.filter((role) => role !== 'platform_super_admin')}>
        <AdminRoutesPage />
      </ProtectedRoute>
    ),
  },
  {
    path: '/admin/driver-assignments',
    element: (
      <ProtectedRoute allowedRoles={adminRoles.filter((role) => role !== 'platform_super_admin')}>
        <AdminDriverAssignmentsPage />
      </ProtectedRoute>
    ),
  },
  {
    path: '/admin/assignments',
    element: (
      <ProtectedRoute allowedRoles={adminRoles.filter((role) => role !== 'platform_super_admin')}>
        <AdminAssignmentsPage />
      </ProtectedRoute>
    ),
  },
  {
    path: '/admin/live-trips',
    element: (
      <ProtectedRoute allowedRoles={adminRoles.filter((role) => role !== 'platform_super_admin')}>
        <AdminLiveTripsPage />
      </ProtectedRoute>
    ),
  },
  {
    path: '/admin/live-fleet',
    element: (
      <ProtectedRoute allowedRoles={adminRoles.filter((role) => role !== 'platform_super_admin')}>
        <AdminLiveTripsPage />
      </ProtectedRoute>
    ),
  },
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
    path: '/guardian/notifications',
    element: (
      <ProtectedRoute allowedRoles={['guardian']}>
        <GuardianNotificationPreferencesPage />
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
