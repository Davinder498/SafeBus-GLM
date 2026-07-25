import { useCallback, useEffect, useState } from 'react';
import { AdminTripsOverview } from '@/components/admin/AdminTripsOverview';
import { DashboardLayout, adminNavGroups } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/Button';
import { DataState } from '@/components/ui/DataState';
import { PageHeader } from '@/components/ui/PageHeader';
import { fetchAdminTripOverview } from '@/services/adminTripOverviewService';
import type { AdminTripOverviewItem } from '@/types/adminTripOverview';

type State =
  { kind: 'loading' } | { kind: 'error' } | { kind: 'ready'; trips: AdminTripOverviewItem[] };

export function AdminTripsPage() {
  const [state, setState] = useState<State>({ kind: 'loading' });
  const load = useCallback(async () => {
    setState({ kind: 'loading' });
    try {
      setState({ kind: 'ready', trips: await fetchAdminTripOverview(200) });
    } catch {
      setState({ kind: 'error' });
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  return (
    <DashboardLayout title="Trips" portal="admin" navItems={[]} navGroups={adminNavGroups}>
      <div className="space-y-5">
        <PageHeader
          eyebrow="Operations"
          title="Trip history"
          description="Review recent dated trip executions separately from reusable routes and trip patterns."
          action={
            <Button
              variant="secondary"
              onClick={() => void load()}
              disabled={state.kind === 'loading'}
            >
              Refresh
            </Button>
          }
        />
        {state.kind === 'loading' && (
          <DataState title="Loading trips" message="Loading recent operational runs." />
        )}
        {state.kind === 'error' && (
          <DataState title="Could not load trips" message="Try refreshing the trip history." />
        )}
        {state.kind === 'ready' && <AdminTripsOverview trips={state.trips} showAllLink={false} />}
      </div>
    </DashboardLayout>
  );
}
