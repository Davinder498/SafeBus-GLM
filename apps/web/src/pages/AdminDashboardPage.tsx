import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { AdminTripSearchSection } from '@/components/admin/AdminTripSearchSection';
import { DashboardLayout, adminNavGroups } from '@/components/layout/DashboardLayout';
import { Button, buttonClass } from '@/components/ui/Button';
import { DataState } from '@/components/ui/DataState';
import { PageHeader } from '@/components/ui/PageHeader';
import { fetchAdminSetupSnapshot, type AdminSetupSnapshot } from '@/services/adminSetupService';

const summaryItems: Array<{ label: string; key: keyof AdminSetupSnapshot; to: string }> = [
  { label: 'Buses', key: 'buses', to: '/admin/buses' },
  { label: 'Drivers', key: 'drivers', to: '/admin/drivers' },
  { label: 'Routes', key: 'routes', to: '/admin/routes' },
  { label: 'Students', key: 'students', to: '/admin/students' },
  { label: 'Guardians', key: 'guardians', to: '/admin/guardians' },
  { label: 'Guardian links', key: 'guardianLinks', to: '/admin/guardians' },
  { label: 'Student bus assignments', key: 'studentAssignments', to: '/admin/students' },
];

type SummaryState =
  { kind: 'loading' } | { kind: 'error' } | { kind: 'ready'; snapshot: AdminSetupSnapshot };

export function AdminDashboardPage() {
  const [summary, setSummary] = useState<SummaryState>({ kind: 'loading' });
  const sequence = useRef(0);
  const loadSummary = useCallback(async () => {
    const request = ++sequence.current;
    setSummary({ kind: 'loading' });
    try {
      const snapshot = await fetchAdminSetupSnapshot();
      if (request === sequence.current) setSummary({ kind: 'ready', snapshot });
    } catch {
      if (request === sequence.current) setSummary({ kind: 'error' });
    }
  }, []);

  useEffect(() => {
    void loadSummary();
    return () => {
      sequence.current += 1;
    };
  }, [loadSummary]);

  return (
    <DashboardLayout
      title="Admin Dashboard"
      portal="admin"
      navItems={[]}
      navGroups={adminNavGroups}
    >
      <div className="space-y-6" data-testid="tenant-admin-overview">
        <PageHeader
          eyebrow="Overview"
          title="Transportation overview"
          description="Review trips and your transportation records at a glance."
          action={
            <Link to="/admin/live-trips" className={buttonClass({ variant: 'secondary' })}>
              Open Live Operations
            </Link>
          }
        />

        <AdminTripSearchSection />

        <section
          className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"
          aria-labelledby="transportation-summary-heading"
          data-testid="transportation-summary"
        >
          <h2 id="transportation-summary-heading" className="text-xl font-bold text-navy-900">
            Transportation summary
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Active records and links in your transportation network.
          </p>
          <div className="mt-4" aria-live="polite" aria-busy={summary.kind === 'loading'}>
            {summary.kind === 'loading' && (
              <DataState
                title="Loading transportation summary"
                message="Checking your active transportation records."
              />
            )}
            {summary.kind === 'error' && (
              <div data-testid="transportation-summary-error">
                <DataState
                  title="Transportation summary unavailable"
                  message="Try loading this section again."
                />
                <Button type="button" variant="secondary" onClick={() => void loadSummary()}>
                  Retry summary
                </Button>
              </div>
            )}
            {summary.kind === 'ready' && (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {summaryItems.map((item) => (
                  <Link
                    key={item.key}
                    to={item.to}
                    className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm hover:border-navy-200 hover:bg-navy-50/50 focus:outline-none focus:ring-2 focus:ring-navy-500 focus:ring-offset-2"
                  >
                    <span className="font-semibold text-navy-900">{item.label}</span>
                    <span className="shrink-0 whitespace-nowrap rounded-full bg-white px-2.5 py-1 text-sm font-semibold text-slate-700">
                      {summary.snapshot[item.key]} active
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>
    </DashboardLayout>
  );
}
