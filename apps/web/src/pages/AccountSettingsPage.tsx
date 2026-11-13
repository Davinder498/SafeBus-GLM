import { Link, Navigate } from 'react-router';
import { useAuth } from '@/contexts/useAuth';
import { useAppSurface } from '@/contexts/AppSurfaceContext';
import { DashboardLayout, driverNavGroups, guardianNavGroups } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { AppearanceSettingsCard } from '@/components/settings/AppearanceToggle';
import { ChevronRight } from 'lucide-react';

/** Preserve old account links while keeping personal settings in one place. */
export function AccountSettingsPage() {
  const { profile } = useAuth();
  const surface = useAppSurface();
  if (surface === 'native-mobile' && (profile?.role === 'driver' || profile?.role === 'guardian')) {
    const driver = profile.role === 'driver';
    const links = [
      ['Notification preferences', driver ? '/driver/settings' : '/notifications/settings'],
      ['Password & sign-in security', '/account/security'],
      ...(driver ? [['Driver profile', '/driver/profile']] : []),
      ['Help & support', '/support'],
      ['Privacy notice', '/privacy'],
    ];
    return (
      <DashboardLayout title="Account" portal={driver ? 'driver' : 'parent'} navItems={[]}
        navGroups={driver ? driverNavGroups : guardianNavGroups}>
        <div className="mx-auto max-w-2xl space-y-5" data-ui="native-account-page">
          <PageHeader title="Account" />
          <AppearanceSettingsCard />
          <Card className="divide-y divide-[var(--color-border)] px-4">
            {links.map(([label, to]) => <Link key={to} to={to}
              className="flex min-h-14 items-center justify-between gap-3 rounded-lg py-4 font-semibold text-[var(--color-text)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-focus)]">
              <span>{label}</span><ChevronRight className="h-5 w-5 shrink-0" aria-hidden />
            </Link>)}
          </Card>
        </div>
      </DashboardLayout>
    );
  }
  return (
    <Navigate
      to={profile?.role === 'driver' ? '/driver/settings' : '/notifications/settings'}
      replace
    />
  );
}
