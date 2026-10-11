import { lazy } from 'react';
import type { RouteObject } from 'react-router';
import { Navigate } from 'react-router';
import { ProtectedRoute } from './ProtectedRoute';
import { PublicOnlyRoute } from './PublicOnlyRoute';
import { InvitationEntryRoute } from './InvitationEntryRoute';
import { adminRoles } from '@/contexts/AuthContext';

const AcceptInvitationPage = lazy(() =>
  import('@/pages/AcceptInvitationPage').then((page) => ({ default: page.AcceptInvitationPage })),
);
const AdminBusesPage = lazy(() =>
  import('@/pages/AdminBusesPage').then((page) => ({ default: page.AdminBusesPage })),
);
const AdminBusWorkspacePage = lazy(() =>
  import('@/pages/AdminBusWorkspacePage').then((page) => ({ default: page.AdminBusWorkspacePage })),
);
const LandingPage = lazy(() =>
  import('@/pages/LandingPage').then((page) => ({ default: page.LandingPage })),
);
const ContactPage = lazy(() =>
  import('@/pages/ContactPage').then((page) => ({ default: page.ContactPage })),
);
const LoginPage = lazy(() =>
  import('@/pages/LoginPage').then((page) => ({ default: page.LoginPage })),
);
const ResetPasswordPage = lazy(() =>
  import('@/pages/ResetPasswordPage').then((page) => ({ default: page.ResetPasswordPage })),
);
const UpdatePasswordPage = lazy(() =>
  import('@/pages/UpdatePasswordPage').then((page) => ({ default: page.UpdatePasswordPage })),
);
const AdminDriversPage = lazy(() =>
  import('@/pages/AdminDriversPage').then((page) => ({ default: page.AdminDriversPage })),
);
const AdminDriverDetailPage = lazy(() =>
  import('@/pages/AdminDriverDetailPage').then((page) => ({ default: page.AdminDriverDetailPage })),
);
const AdminDashboardPage = lazy(() =>
  import('@/pages/AdminDashboardPage').then((page) => ({ default: page.AdminDashboardPage })),
);
const AdminGuardiansPage = lazy(() =>
  import('@/pages/AdminGuardiansPage').then((page) => ({ default: page.AdminGuardiansPage })),
);
const AdminGuardianDetailPage = lazy(() =>
  import('@/pages/AdminGuardianDetailPage').then((page) => ({
    default: page.AdminGuardianDetailPage,
  })),
);
const AdminLiveTripsPage = lazy(() =>
  import('@/pages/AdminLiveTripsPage').then((page) => ({ default: page.AdminLiveTripsPage })),
);
const AdminRoutesPage = lazy(() =>
  import('@/pages/AdminRoutesPage').then((page) => ({ default: page.AdminRoutesPage })),
);
const AdminRouteDetailPage = lazy(() =>
  import('@/pages/AdminRouteDetailPage').then((page) => ({ default: page.AdminRouteDetailPage })),
);
const AdminRouteCreatePage = lazy(() =>
  import('@/pages/AdminRouteCreatePage').then((page) => ({ default: page.AdminRouteCreatePage })),
);
const AdminRouteManagePage = lazy(() =>
  import('@/pages/AdminRouteManagePage').then((page) => ({ default: page.AdminRouteManagePage })),
);
const AdminSchoolsPage = lazy(() =>
  import('@/pages/AdminSchoolsPage').then((page) => ({ default: page.AdminSchoolsPage })),
);
const AdminSettingsPage = lazy(() =>
  import('@/pages/AdminSettingsPage').then((page) => ({ default: page.AdminSettingsPage })),
);
const AdminNotificationSettingsPage = lazy(() =>
  import('@/pages/AdminNotificationSettingsPage').then((page) => ({
    default: page.AdminNotificationSettingsPage,
  })),
);
const AdminSubscriptionPage = lazy(() =>
  import('@/pages/AdminSubscriptionPage').then((page) => ({ default: page.AdminSubscriptionPage })),
);
const AdminStudentDetailPage = lazy(() =>
  import('@/pages/AdminStudentDetailPage').then((page) => ({
    default: page.AdminStudentDetailPage,
  })),
);
const AdminStudentsPage = lazy(() =>
  import('@/pages/AdminStudentsPage').then((page) => ({ default: page.AdminStudentsPage })),
);
const AdminTripsPage = lazy(() =>
  import('@/pages/AdminTripsPage').then((page) => ({ default: page.AdminTripsPage })),
);
const AdminUsersPage = lazy(() =>
  import('@/pages/AdminUsersPage').then((page) => ({ default: page.AdminUsersPage })),
);
const AdminAdministratorsPage = lazy(() =>
  import('@/pages/AdminAdministratorsPage').then((page) => ({
    default: page.AdminAdministratorsPage,
  })),
);
const AdminBulkImportPage = lazy(() =>
  import('@/pages/AdminBulkImportPage').then((page) => ({ default: page.AdminBulkImportPage })),
);
const AdminAuditSearchPage = lazy(() =>
  import('@/pages/AdminAuditSearchPage').then((page) => ({ default: page.AdminAuditSearchPage })),
);
const NotificationsPage = lazy(() =>
  import('@/pages/NotificationsPage').then((page) => ({ default: page.NotificationsPage })),
);
const NotificationSettingsPage = lazy(() =>
  import('@/pages/NotificationSettingsPage').then((page) => ({
    default: page.NotificationSettingsPage,
  })),
);
const PlatformTenantsPage = lazy(() =>
  import('@/pages/PlatformTenantsPage').then((page) => ({ default: page.PlatformTenantsPage })),
);
const PlatformTenantDetailPage = lazy(() =>
  import('@/pages/PlatformTenantDetailPage').then((page) => ({
    default: page.PlatformTenantDetailPage,
  })),
);
const NotFoundPage = lazy(() =>
  import('@/pages/NotFoundPage').then((page) => ({ default: page.NotFoundPage })),
);
const MfaPage = lazy(() => import('@/pages/MfaPage').then((page) => ({ default: page.MfaPage })));
const PrivacyPolicyPage = lazy(() =>
  import('@/pages/PrivacyPolicyPage').then((page) => ({ default: page.PrivacyPolicyPage })),
);
const AccountDeletionPage = lazy(() =>
  import('@/pages/AccountDeletionPage').then((page) => ({ default: page.AccountDeletionPage })),
);
const SupportPage = lazy(() =>
  import('@/pages/SupportPage').then((page) => ({ default: page.SupportPage })),
);
const AdminSupportPage = lazy(() =>
  import('@/pages/AdminSupportPage').then((page) => ({ default: page.AdminSupportPage })),
);
const PlatformSupportPage = lazy(() =>
  import('@/pages/PlatformSupportPage').then((page) => ({ default: page.PlatformSupportPage })),
);

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
    path: '/support',
    element: (
      <ProtectedRoute allowedRoles={['tenant_admin', 'driver', 'guardian']}>
        <SupportPage />
      </ProtectedRoute>
    ),
  },
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
      <ProtectedRoute allowedRoles={['tenant_admin']}>
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
    path: '/admin/settings/notifications',
    element: (
      <ProtectedRoute allowedRoles={['tenant_admin']}>
        <AdminNotificationSettingsPage />
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
    path: '/admin/routes/new',
    element: (
      <ProtectedRoute allowedRoles={['tenant_admin']}>
        <AdminRouteCreatePage />
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
