import type { ProfileRole } from '@/contexts/AuthContext';
import { StatusPill } from './StatusPill';

interface RoleBadgeProps {
  role: ProfileRole;
}

const roleLabels: Record<ProfileRole, string> = {
  platform_super_admin: 'Platform super admin',
  tenant_admin: 'Tenant admin',
  school_admin: 'School admin',
  transportation_admin: 'Transportation admin',
  driver: 'Driver',
  guardian: 'Guardian',
};

export function getRoleLabel(role: ProfileRole) {
  return roleLabels[role];
}

export function RoleBadge({ role }: RoleBadgeProps) {
  const adminRole =
    role === 'platform_super_admin' ||
    role === 'tenant_admin' ||
    role === 'school_admin' ||
    role === 'transportation_admin';

  return <StatusPill tone={adminRole ? 'info' : 'neutral'}>{getRoleLabel(role)}</StatusPill>;
}
