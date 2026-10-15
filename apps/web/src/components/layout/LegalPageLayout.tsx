import type { ReactNode } from 'react';
import { useAuth } from '@/contexts/useAuth';
import { useAppSurface } from '@/contexts/AppSurfaceContext';
import { adminRoles } from '@/contexts/AuthContext';
import {
  DashboardLayout,
  adminNavGroups,
  platformNavGroups,
  driverNavGroups,
  guardianNavGroups,
} from './DashboardLayout';
import { PublicLayout } from './PublicLayout';

export function LegalPageLayout({ title, children }: { title: string; children: ReactNode }) {
  const { user, profile } = useAuth();
  const surface = useAppSurface();

  if (
    surface === 'web' &&
    user &&
    profile?.status === 'active' &&
    adminRoles.some((role) => role === profile.role)
  ) {
    return (
      <DashboardLayout
        title={title}
        portal="admin"
        navItems={[]}
        navGroups={profile.role === 'platform_super_admin' ? platformNavGroups : adminNavGroups}
      >
        {children}
      </DashboardLayout>
    );
  }

  if (
    surface === 'native-mobile' &&
    user &&
    (profile?.role === 'guardian' || profile?.role === 'driver')
  ) {
    const isDriver = profile.role === 'driver';
    return (
      <DashboardLayout
        title={title}
        portal={isDriver ? 'driver' : 'parent'}
        navItems={[]}
        navGroups={isDriver ? driverNavGroups : guardianNavGroups}
      >
        {children}
      </DashboardLayout>
    );
  }

  return (
    <PublicLayout>
      <main>{children}</main>
    </PublicLayout>
  );
}
