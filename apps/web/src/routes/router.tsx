import type { RouteObject } from 'react-router';
import { Navigate } from 'react-router';
import { AcceptInvitationPage } from '@/pages/AcceptInvitationPage';
import { AdminBusesPage } from '@/pages/AdminBusesPage';
import { AdminBusWorkspacePage } from '@/pages/AdminBusWorkspacePage';
import { LandingPage } from '@/pages/LandingPage';
import { ContactPage } from '@/pages/ContactPage';
import { LoginPage } from '@/pages/LoginPage';
import { ResetPasswordPage } from '@/pages/ResetPasswordPage';
import { UpdatePasswordPage } from '@/pages/UpdatePasswordPage';
import { AdminDriversPage } from '@/pages/AdminDriversPage';
import { AdminDriverDetailPage } from '@/pages/AdminDriverDetailPage';
import { AdminDashboardPage } from '@/pages/AdminDashboardPage';
import { AdminGuardiansPage } from '@/pages/AdminGuardiansPage';
import { AdminGuardianDetailPage } from '@/pages/AdminGuardianDetailPage';
import { AdminLiveTripsPage } from '@/pages/AdminLiveTripsPage';
import { AdminRoutesPage } from '@/pages/AdminRoutesPage';
import { AdminRouteDetailPage } from '@/pages/AdminRouteDetailPage';
import { AdminRouteManagePage } from '@/pages/AdminRouteManagePage';
import { AdminSchoolsPage } from '@/pages/AdminSchoolsPage';
import { AdminSettingsPage } from '@/pages/AdminSettingsPage';
import { AdminSubscriptionPage } from '@/pages/AdminSubscriptionPage';
import { AdminStudentDetailPage } from '@/pages/AdminStudentDetailPage';
import { AdminStudentsPage } from '@/pages/AdminStudentsPage';
import { AdminTripsPage } from '@/pages/AdminTripsPage';
import { AdminUsersPage } from '@/pages/AdminUsersPage';
import { AdminAdministratorsPage } from '@/pages/AdminAdministratorsPage';
import { AdminBulkImportPage } from '@/pages/AdminBulkImportPage';
import { AdminAuditSearchPage } from '@/pages/AdminAuditSearchPage';
import { NotificationsPage } from '@/pages/NotificationsPage';
import { NotificationSettingsPage } from '@/pages/NotificationSettingsPage';
import { PlatformTenantsPage } from '@/pages/PlatformTenantsPage';
import { PlatformTenantDetailPage } from '@/pages/PlatformTenantDetailPage';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { MfaPage } from '@/pages/MfaPage';
import { PrivacyPolicyPage } from '@/pages/PrivacyPolicyPage';
import { AccountDeletionPage } from '@/pages/AccountDeletionPage';
import { AdminSupportPage } from '@/pages/AdminSupportPage';
import { PlatformSupportPage } from '@/pages/PlatformSupportPage';
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
  { path: '/contact', element: <ContactPage /> },
  { path: '/accept-invitation', element: <AcceptInvitationPage /> },
  { path: '/reset-password', element: <ResetPasswordPage /> },
  { path: '/update-password', element: <UpdatePasswordPage /> },
  { path: '/privacy', element: <PrivacyPolicyPage /> },
  { path: '/account-deletion', element: <AccountDeletionPage /> },
  {
    path: '/mfa',
    element: (
      <ProtectedRoute allowedRoles={[...adminRoles]} requireMfa={false}>
        <MfaPage />
      </ProtectedRoute>
    ),
  },
  {
    path: '/notifications',
    element: (
      <ProtectedRoute allowedRoles={[...adminRoles]}>
        <NotificationsPage />
      </ProtectedRoute>
    ),
  },
  {
    path: '/notifications/settings',
    element: (
      <ProtectedRoute allowedRoles={[...adminRoles]}>
        <NotificationSettingsPage />
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
    path: '/admin/platform-support',
    element: (
      <ProtectedRoute allowedRoles={['platform_super_admin']}>
        <PlatformSupportPage />
      </ProtectedRoute>
    ),
  },
  {
    path: '/admin/settings/support',
    element: (
      <ProtectedRoute allowedRoles={adminRoles.filter((role) => role !== 'platform_super_admin')}>
        <AdminSupportPage />
      </ProtectedRoute>
    ),
  },
  {
    path: '/admin/tenants/:tenantId',
    element: (
      <ProtectedRoute allowedRoles={['platform_super_admin']}>
        <PlatformTenantDetailPage />
      </ProtectedRoute>
    ),
  },
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
    path: '/admin/subscription',
    element: (
      <ProtectedRoute allowedRoles={['tenant_admin']}>
        <Navigate to="/admin/settings/billing" replace />
      </ProtectedRoute>
    ),
  },
  {
    path: '/admin/settings/billing',
    element: (
      <ProtectedRoute allowedRoles={['tenant_admin']}>
        <AdminSubscriptionPage />
      </ProtectedRoute>
    ),
  },
  {
    path: '/admin/settings/schools',
    element: (
      <ProtectedRoute allowedRoles={adminRoles.filter((role) => role !== 'platform_super_admin')}>
        <AdminSchoolsPage />
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
        <Navigate to="/admin/settings/schools" replace />
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
  { path: '/admin/driver-assignments', element: <Navigate to="/admin/drivers" replace /> },
  { path: '/admin/assignments', element: <Navigate to="/admin/students" replace /> },
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
  { path: '*', element: <NotFoundPage /> },
];
