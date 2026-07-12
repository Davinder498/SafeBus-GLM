import { useEffect, useMemo, useState } from 'react';
import { DashboardLayout, adminNavItems } from '@/components/layout/DashboardLayout';
import { AdminTaskCard } from '@/components/admin/AdminTaskCard';
import { Card } from '@/components/ui/Card';
import { DataState } from '@/components/ui/DataState';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatusPill } from '@/components/ui/StatusPill';
import { fetchAdminSetupSnapshot, type AdminSetupSnapshot } from '@/services/adminSetupService';

const steps = [
  ['Buses', 'buses', '/admin/buses', 'Add or manage buses'],
  ['Drivers', 'drivers', '/admin/drivers', 'Connect driver accounts'],
  ['Routes and stops', 'routes', '/admin/routes', 'Create routes and add their ordered pickup and drop-off stops'],
  ['Students', 'students', '/admin/students', 'Build the student roster'],
  ['Guardians', 'guardians', '/admin/guardians', 'Manage guardians and links'],
  ['Guardian links', 'guardianLinks', '/admin/guardians', 'Link guardians to students'],
  ['Student routes and stops', 'studentAssignments', '/admin/assignments', 'Assign pickup and drop-off stops'],
  ['Driver and bus assignments', 'driverAssignments', '/admin/driver-assignments', 'Make routes ready for drivers'],
] as const;

function isStepComplete(snapshot: AdminSetupSnapshot, key: (typeof steps)[number][1]) {
  return key === 'routes' ? snapshot.routes > 0 && snapshot.stops > 0 : snapshot[key] > 0;
}

export function AdminSetupPage() {
  const [snapshot, setSnapshot] = useState<AdminSetupSnapshot | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => { void fetchAdminSetupSnapshot().then(setSnapshot).catch(() => setError(true)); }, []);
  const complete = useMemo(() => snapshot ? steps.filter(([, key]) => isStepComplete(snapshot, key)).length : 0, [snapshot]);
  return <DashboardLayout title="Admin Dashboard" portal="admin" navItems={adminNavItems}>
    <div className="space-y-6">
      <PageHeader eyebrow="Setup" title="Transportation setup" description="Complete each practical step. Return here anytime to see what still needs attention." />
      {error && <DataState title="Setup check unavailable" message="Open a setup area below to continue managing transportation." />}
      {!snapshot && !error && <DataState title="Checking setup" message="Reviewing active transportation records." />}
      {snapshot && <Card className="p-5" data-testid="admin-setup-progress">
        <p className="text-sm font-semibold text-gray-600">Transportation setup</p>
        <p className="mt-1 text-3xl font-bold text-navy-900">{complete} of {steps.length} steps complete</p>
        <p className="mt-2 text-sm text-gray-600">{complete === steps.length ? 'Core setup is ready. Review trip readiness before operations begin.' : `Next step: ${steps.find(([, key]) => !isStepComplete(snapshot, key))?.[0] ?? 'Review setup'}`}</p>
      </Card>}
      <section className="grid gap-4 md:grid-cols-2">
        {steps.map(([title, key, to, description], index) => <Card key={key} className="p-5">
          <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-wide text-gray-500">Step {index + 1}</p><h2 className="mt-1 text-lg font-bold text-navy-900">{title}</h2></div>{snapshot && <StatusPill tone={isStepComplete(snapshot, key) ? 'success' : 'warning'}>{isStepComplete(snapshot, key) ? 'Complete' : 'Needs setup'}</StatusPill>}</div>
          <p className="mt-2 text-sm text-gray-600">{description}</p><div className="mt-4"><AdminTaskCard title={`Manage ${title.toLowerCase()}`} description="Open the existing focused management page." to={to} action="Open" /></div>
        </Card>)}
      </section>
    </div>
  </DashboardLayout>;
}
