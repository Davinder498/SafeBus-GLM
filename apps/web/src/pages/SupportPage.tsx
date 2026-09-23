import { AlertTriangle, CircleHelp, ExternalLink, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router';
import {
  DashboardLayout,
  adminNavGroups,
  driverNavGroups,
  guardianNavGroups,
} from '@/components/layout/DashboardLayout';
import { Card } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { useAuth } from '@/contexts/useAuth';

export function SupportPage() {
  const { profile } = useAuth();
  const isDriver = profile?.role === 'driver';
  const isGuardian = profile?.role === 'guardian';
  const portal = isDriver ? 'driver' : isGuardian ? 'parent' : 'admin';
  const navGroups = isDriver ? driverNavGroups : isGuardian ? guardianNavGroups : adminNavGroups;

  return (
    <DashboardLayout title="Support" portal={portal} navItems={[]} navGroups={navGroups}>
      <div className="mx-auto max-w-3xl space-y-5">
        <PageHeader
          eyebrow="Help"
          title="Support"
          description="Find the right contact for account, transportation, privacy, or safety questions."
        />

        <Card className="p-5 sm:p-6">
          <div className="flex items-start gap-3">
            <CircleHelp className="mt-0.5 h-5 w-5 shrink-0 text-navy-600" aria-hidden />
            <div>
              <h2 className="font-bold text-slate-950">Contact your school authority</h2>
              <p className="mt-1 text-sm leading-6 text-slate-600">
                For sign-in help, account changes, bus assignments, route details, or day-to-day
                transportation questions, contact the school authority or transportation office that
                issued your BusSafe account.
              </p>
              <p className="mt-3 text-sm leading-6 text-slate-600">
                Include your name and school authority, but do not send student health information,
                a home address, custody details, or other unnecessary sensitive information.
              </p>
            </div>
          </div>
        </Card>

        <Card className="border-amber-200 bg-amber-50 p-5 sm:p-6">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" aria-hidden />
            <div>
              <h2 className="font-bold text-slate-950">Urgent safety concerns</h2>
              <p className="mt-1 text-sm leading-6 text-slate-700">
                BusSafe is not an emergency service. For an immediate danger or emergency, call 911.
                For a late or missing bus without immediate danger, use your school authority&apos;s
                transportation contact.
              </p>
            </div>
          </div>
        </Card>

        <Card className="p-5 sm:p-6">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-navy-600" aria-hidden />
            <div>
              <h2 className="font-bold text-slate-950">Privacy and account requests</h2>
              <p className="mt-1 text-sm leading-6 text-slate-600">
                Review how BusSafe handles information and how to request access, correction, or
                account deletion.
              </p>
              <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm font-semibold">
                <Link className="text-navy-700 underline underline-offset-4" to="/privacy">
                  Privacy policy
                </Link>
                <Link
                  className="inline-flex items-center gap-1 text-navy-700 underline underline-offset-4"
                  to="/account-deletion"
                >
                  Account deletion <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                </Link>
              </div>
            </div>
          </div>
        </Card>
      </div>
    </DashboardLayout>
  );
}
