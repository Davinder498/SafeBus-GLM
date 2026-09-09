import { CircleHelp, ExternalLink, ShieldCheck, Trash2 } from 'lucide-react';
import {
  DashboardLayout,
  driverNavGroups,
  guardianNavGroups,
} from '@/components/layout/DashboardLayout';
import { Card } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { useAuth } from '@/contexts/useAuth';

export function AccountSettingsPage() {
  const { profile } = useAuth();
  const isDriver = profile?.role === 'driver';

  return (
    <DashboardLayout
      title="Privacy and account"
      portal={isDriver ? 'driver' : 'parent'}
      navItems={[]}
      navGroups={isDriver ? driverNavGroups : guardianNavGroups}
    >
      <div className="mx-auto max-w-3xl space-y-5">
        <PageHeader
          eyebrow="Account"
          title="Privacy and account"
          description="Review SafeBus privacy information and find the account-deletion process."
        />

        <Card className="p-5">
          <div className="flex items-start gap-3">
            <CircleHelp className="mt-0.5 h-5 w-5 shrink-0 text-navy-600" aria-hidden />
            <div>
              <h2 className="font-bold text-slate-950">Support</h2>
              <p className="mt-1 text-sm leading-6 text-slate-600">
                Contact the school authority that issued your account, or use the verified developer
                contact on the Google Play listing.
              </p>
              <a
                className="mt-3 inline-flex items-center gap-1.5 font-semibold text-navy-700 underline underline-offset-4"
                href="/privacy#contact"
                target="_blank"
                rel="noreferrer"
              >
                View support contacts <ExternalLink className="h-4 w-4" aria-hidden />
              </a>
            </div>
          </div>
        </Card>

        <Card className="p-5">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-navy-600" aria-hidden />
            <div>
              <h2 className="font-bold text-slate-950">Privacy policy</h2>
              <p className="mt-1 text-sm leading-6 text-slate-600">
                Learn what SafeBus handles, how bus location is limited to active trips, and how to
                exercise privacy choices.
              </p>
              <a
                className="mt-3 inline-flex items-center gap-1.5 font-semibold text-navy-700 underline underline-offset-4"
                href="/privacy"
                target="_blank"
                rel="noreferrer"
              >
                Open privacy policy <ExternalLink className="h-4 w-4" aria-hidden />
              </a>
            </div>
          </div>
        </Card>

        <Card className="p-5">
          <div className="flex items-start gap-3">
            <Trash2 className="mt-0.5 h-5 w-5 shrink-0 text-danger-600" aria-hidden />
            <div>
              <h2 className="font-bold text-slate-950">Request account deletion</h2>
              <p className="mt-1 text-sm leading-6 text-slate-600">
                SafeBus accounts are issued by participating school authorities. The public request
                page remains available even after you sign out or remove the app.
              </p>
              <a
                className="mt-3 inline-flex items-center gap-1.5 font-semibold text-navy-700 underline underline-offset-4"
                href="/account-deletion"
                target="_blank"
                rel="noreferrer"
              >
                View deletion instructions <ExternalLink className="h-4 w-4" aria-hidden />
              </a>
            </div>
          </div>
        </Card>
      </div>
    </DashboardLayout>
  );
}
