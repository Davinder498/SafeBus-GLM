/**
 * SafeBus Alberta — User roles.
 *
 * Role hierarchy (high → low privilege within a tenant):
 *   platform_super_admin > tenant_admin > school_admin / transportation_admin > driver / guardian
 *
 * Platform super admin is cross-tenant. All other roles are scoped to a single tenant.
 */

export type UserRole =
  | 'platform_super_admin'
  | 'tenant_admin'
  | 'school_admin'
  | 'transportation_admin'
  | 'driver'
  | 'guardian';

export const USER_ROLES: readonly UserRole[] = [
  'platform_super_admin',
  'tenant_admin',
  'school_admin',
  'transportation_admin',
  'driver',
  'guardian',
] as const;

export const ROLE_LABELS: Record<UserRole, string> = {
  platform_super_admin: 'Platform Super Admin',
  tenant_admin: 'Tenant Admin',
  school_admin: 'School Admin',
  transportation_admin: 'Transportation Admin',
  driver: 'Driver',
  guardian: 'Guardian',
};

/**
 * Roles that can access the admin web portal.
 */
export const ADMIN_ROLES: readonly UserRole[] = [
  'platform_super_admin',
  'tenant_admin',
  'school_admin',
  'transportation_admin',
] as const;

export function isAdminRole(role: UserRole): boolean {
  return (ADMIN_ROLES as readonly string[]).includes(role);
}

/**
 * Permission keys used by the frontend to gate UI.
 * The backend enforces these via RLS — this is for UX only.
 */
export type Permission =
  | 'tenant:create'
  | 'tenant:manage'
  | 'school:manage'
  | 'student:read'
  | 'student:write'
  | 'guardian:read'
  | 'guardian:write'
  | 'bus:read'
  | 'bus:write'
  | 'driver:read'
  | 'driver:write'
  | 'route:read'
  | 'route:write'
  | 'trip:read'
  | 'trip:write'
  | 'trip:start'
  | 'trip:end'
  | 'location:ingest'
  | 'scan:perform'
  | 'scan:manual_override'
  | 'badge:generate'
  | 'badge:revoke'
  | 'import:run'
  | 'report:read'
  | 'audit:read'
  | 'notification:read'
  | 'notification:send'
  | 'settings:manage'
  | 'dsar:manage';

export const ROLE_PERMISSIONS: Record<UserRole, readonly Permission[]> = {
  platform_super_admin: [
    'tenant:create',
    'tenant:manage',
    'school:manage',
    'student:read',
    'guardian:read',
    'bus:read',
    'driver:read',
    'route:read',
    'trip:read',
    'report:read',
    'audit:read',
    'settings:manage',
  ],
  tenant_admin: [
    'tenant:manage',
    'school:manage',
    'student:read',
    'student:write',
    'guardian:read',
    'guardian:write',
    'bus:read',
    'bus:write',
    'driver:read',
    'driver:write',
    'route:read',
    'route:write',
    'trip:read',
    'trip:write',
    'badge:generate',
    'badge:revoke',
    'import:run',
    'report:read',
    'audit:read',
    'notification:read',
    'settings:manage',
    'dsar:manage',
  ],
  school_admin: [
    'student:read',
    'student:write',
    'guardian:read',
    'guardian:write',
    'bus:read',
    'driver:read',
    'route:read',
    'trip:read',
    'badge:generate',
    'import:run',
    'report:read',
    'notification:read',
  ],
  transportation_admin: [
    'student:read',
    'guardian:read',
    'bus:read',
    'bus:write',
    'driver:read',
    'driver:write',
    'route:read',
    'route:write',
    'trip:read',
    'trip:write',
    'badge:generate',
    'import:run',
    'report:read',
    'notification:read',
  ],
  driver: [
    'trip:read',
    'trip:start',
    'trip:end',
    'location:ingest',
    'scan:perform',
    'scan:manual_override',
    'notification:read',
  ],
  guardian: ['student:read', 'trip:read', 'notification:read'],
};

export function hasPermission(role: UserRole, permission: Permission): boolean {
  return (ROLE_PERMISSIONS[role] as readonly string[]).includes(permission);
}
