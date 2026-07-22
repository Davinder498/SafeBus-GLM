import { DashboardLayout, driverNavGroups } from '@/components/layout/DashboardLayout';
import { Card } from '@/components/ui/Card';
import { DataState } from '@/components/ui/DataState';
import { PageHeader } from '@/components/ui/PageHeader';
import { RoleBadge } from '@/components/ui/RoleBadge';
import { StatusPill } from '@/components/ui/StatusPill';
import { useAuth } from '@/contexts/useAuth';

function ProfileField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
      <dt className="text-xs font-semibold uppercase tracking-wider text-gray-500">{label}</dt>
      <dd className="mt-2 break-words text-base font-semibold text-navy-900">{value}</dd>
    </div>
  );
}

export function DriverProfilePage() {
  const { profile } = useAuth();

  return (
    <DashboardLayout
      title="Driver Profile"
      portal="driver"
      navItems={[]}
      navGroups={driverNavGroups}
    >
      <div className="mx-auto max-w-3xl space-y-5">
        <PageHeader
          eyebrow="Profile"
          title="Your driver profile"
          description="Review the account details used for your SafeBus access."
        />

        {!profile ? (
          <DataState
            title="Profile unavailable"
            message="Sign in again or contact your transportation admin."
          />
        ) : (
          <Card className="p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="text-xl font-bold text-navy-900">{profile.full_name ?? 'Driver'}</h2>
                <p className="mt-1 text-sm text-gray-600">SafeBus driver account</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <RoleBadge role={profile.role} />
                <StatusPill tone={profile.status === 'active' ? 'success' : 'neutral'}>
                  {profile.status}
                </StatusPill>
              </div>
            </div>

            <dl className="mt-5 grid gap-4 sm:grid-cols-2">
              <ProfileField label="Name" value={profile.full_name ?? 'Not provided'} />
              <ProfileField label="Email" value={profile.email} />
            </dl>

            <p className="mt-5 text-sm leading-6 text-gray-600">
              Contact your transportation admin if these details need to be updated.
            </p>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
