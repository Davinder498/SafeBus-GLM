import { Link } from 'react-router';
import { CircleHelp, ExternalLink, ShieldCheck, Trash2 } from 'lucide-react';
import {
  DashboardLayout,
  driverNavGroups,
  guardianNavGroups,
} from '@/components/layout/DashboardLayout';
import { Card } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { GuardianIconTile } from '@/components/ui/GuardianIconTile';
import { useAuth } from '@/contexts/useAuth';

export function AccountSettingsPage() {
  const { profile, mfaStatus } = useAuth();
  const isDriver = profile?.role === 'driver';
  const mfaEnabled = mfaStatus.verifiedFactors.length > 0;

  return (
    <DashboardLayout
      title="Account settings"
      portal={isDriver ? 'driver' : 'parent'}
      navItems={[]}
      navGroups={isDriver ? driverNavGroups : guardianNavGroups}
    >
      <div className="mx-auto max-w-3xl space-y-5" data-ui="guardian-account-page">
        <PageHeader eyebrow="Account" title="Account settings" />

        <Card className="p-5" data-ui="account-security-card">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="font-bold text-slate-950">Multi-factor authentication</h2>
              <p className="mt-1 text-sm text-slate-600">{mfaEnabled ? 'On' : 'Off'}</p>
            </div>
            <Link
              to="/account/security"
              className="inline-flex min-h-11 items-center rounded-lg border border-slate-200 px-4 text-sm font-semibold text-navy-700 hover:bg-slate-50"
            >
              {mfaEnabled ? 'Manage MFA' : 'Enable MFA'}
            </Link>
          </div>
        </Card>

        <Card className="p-5" data-ui="guardian-account-card">
          <div className="flex items-start gap-3" data-ui="guardian-card-row">
            <GuardianIconTile>
              <CircleHelp className="h-5 w-5" />
            </GuardianIconTile>
            <div className="min-w-0">
              <h2 className="font-bold text-slate-950">Support</h2>

              <a
                className="mt-3 inline-flex items-center gap-1.5 font-semibold text-navy-700 underline underline-offset-4"
                href="/support"
              >
                Open support <ExternalLink className="h-4 w-4" aria-hidden />
              </a>
              <p className="mt-3 text-xs text-slate-500">
                If your school authority has not published a contact, use the developer contact in
                the{' '}
                <a className="font-semibold underline underline-offset-2" href="/privacy#contact">
                  privacy policy
                </a>
                .
              </p>
            </div>
          </div>
        </Card>

        <Card className="p-5" data-ui="guardian-account-card">
          <div className="flex items-start gap-3" data-ui="guardian-card-row">
            <GuardianIconTile>
              <ShieldCheck className="h-5 w-5" />
            </GuardianIconTile>
            <div className="min-w-0">
              <h2 className="font-bold text-slate-950">Privacy policy</h2>

              <Link
                className="mt-3 inline-flex items-center gap-1.5 font-semibold text-navy-700 underline underline-offset-4"
                to="/privacy"
              >
                Open privacy policy <ExternalLink className="h-4 w-4" aria-hidden />
              </Link>
            </div>
          </div>
        </Card>

        <Card className="p-5" data-ui="guardian-account-card">
          <div className="flex items-start gap-3" data-ui="guardian-card-row">
            <GuardianIconTile>
              <Trash2 className="h-5 w-5" />
            </GuardianIconTile>
            <div className="min-w-0">
              <h2 className="font-bold text-slate-950">Request account deletion</h2>
              <p className="mt-1 text-sm leading-6 text-slate-600">
                SafeBus accounts are issued by participating school authorities. The public request
                page remains available even after you sign out or remove the app.
              </p>
              <Link
                className="mt-3 inline-flex items-center gap-1.5 font-semibold text-navy-700 underline underline-offset-4"
                to="/account-deletion"
              >
                View deletion instructions <ExternalLink className="h-4 w-4" aria-hidden />
              </Link>
            </div>
          </div>
        </Card>
      </div>
    </DashboardLayout>
  );
}
