import { ChevronRight, KeyRound, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router';
import { DashboardLayout, adminNavGroups, driverNavGroups, guardianNavGroups, platformNavGroups } from '@/components/layout/DashboardLayout';
import { Card } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { MfaSettingsCard } from '@/components/settings/MfaSettingsCard';
import { AppearanceSettingsCard } from '@/components/settings/AppearanceToggle';
import { useAuth } from '@/contexts/useAuth';
import { useAppSurface } from '@/contexts/AppSurfaceContext';

export function AccountSecurityPage() {
  const { profile } = useAuth();
  const surface = useAppSurface();
  const role = profile?.role;
  const portal = role === 'driver' ? 'driver' : role === 'guardian' ? 'parent' : 'admin';
  const groups = role === 'driver' ? driverNavGroups : role === 'guardian'
    ? guardianNavGroups : role === 'platform_super_admin' ? platformNavGroups : adminNavGroups;

  return (
    <DashboardLayout title="Account security" portal={portal} navItems={[]} navGroups={groups}>
      <div className="mx-auto max-w-2xl space-y-5" data-ui="account-security-page">
        <PageHeader eyebrow="Settings" title="Account security" description="Manage your password and sign-in security." />
        {surface !== 'native-mobile' && (role === 'driver' || role === 'guardian' || role === 'platform_super_admin') && (
          <AppearanceSettingsCard />
        )}
        <Card className="p-5">
          <Link
            to="/account/security/password"
            className="group flex min-h-11 items-center justify-between gap-3 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy-500"
          >
            <span className="flex min-w-0 items-start gap-3">
              <KeyRound className="mt-0.5 h-5 w-5 shrink-0 text-navy-700" aria-hidden />
              <span>
                <span className="block font-bold text-navy-900">Password</span>
                <span className="mt-1 block text-sm text-slate-600">
                  Change your password using your current password.
                </span>
                <span className="mt-2 block text-sm font-semibold text-navy-700">Change password</span>
              </span>
            </span>
            <ChevronRight className="h-5 w-5 shrink-0 text-slate-500" aria-hidden />
          </Link>
        </Card>
        <div aria-label="Multi-factor authentication settings">
          <MfaSettingsCard />
        </div>
        <p className="flex items-start gap-2 text-sm text-slate-600">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          {role === 'driver' || role === 'guardian'
            ? 'Multi-factor authentication is optional for your account.'
            : 'Multi-factor authentication is required for administrator accounts.'}
        </p>
      </div>
    </DashboardLayout>
  );
}
