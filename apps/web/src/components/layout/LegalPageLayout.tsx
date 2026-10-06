import type { ReactNode } from 'react';
import { useAuth } from '@/contexts/useAuth';
import { useAppSurface } from '@/contexts/AppSurfaceContext';
import { DashboardLayout, driverNavGroups, guardianNavGroups } from './DashboardLayout';
import { PublicLayout } from './PublicLayout';

export function LegalPageLayout({ title, children }: { title: string; children: ReactNode }) {
  const { user, profile } = useAuth();
  const surface = useAppSurface();

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
