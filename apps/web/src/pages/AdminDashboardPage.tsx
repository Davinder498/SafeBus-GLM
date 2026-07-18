import { useCallback, useEffect, useMemo, useState } from 'react';
import { DashboardLayout, adminNavGroups } from '@/components/layout/DashboardLayout';
import { AdminRouteStatusTile } from '@/components/admin/AdminRouteStatusTile';
import { DataState } from '@/components/ui/DataState';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatCard } from '@/components/ui/StatCard';
import { Radio, AlertTriangle, MapPinOff, ListChecks } from 'lucide-react';
import { fetchAdminLiveTrips } from '@/services/adminLiveMonitoringService';
import { fetchBoundedAdminOverview, type AdminOverviewRoute } from '@/services/adminDashboardOverviewService';
import { fetchAdminSetupSnapshot, type AdminSetupSnapshot } from '@/services/adminSetupService';
import type { AdminLiveTrip } from '@/types/adminLiveMonitoring';

const emptySetupSnapshot: AdminSetupSnapshot = {
  buses: 0,
  drivers: 0,
  routes: 0,
  stops: 0,
  students: 0,
  guardians: 0,
  guardianLinks: 0,
  studentAssignments: 0,
  driverAssignments: 0,
};

const setupKeys: Array<{ label: string; key: keyof AdminSetupSnapshot; to: string }> = [
  { label: 'Buses', key: 'buses', to: '/admin/buses' },
  { label: 'Drivers', key: 'drivers', to: '/admin/drivers' },
  { label: 'Routes', key: 'routes', to: '/admin/routes' },
  { label: 'Students', key: 'students', to: '/admin/students' },
  { label: 'Guardians', key: 'guardians', to: '/admin/guardians' },
  { label: 'Guardian links', key: 'guardianLinks', to: '/admin/guardians' },
  { label: 'Student bus assignments', key: 'studentAssignments', to: '/admin/assignments' },
  { label: 'Driver and bus assignments', key: 'driverAssignments', to: '/admin/driver-assignments' },
];

interface OverviewData {
  setup: AdminSetupSnapshot;
  trips: AdminLiveTrip[];
  routes: AdminOverviewRoute[];
}

export function AdminDashboardPage() {
  const [data, setData] = useState<OverviewData | null>(null);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    // Overview degrades gracefully: the setup snapshot and live trips feed
    // the top status cards, while the rest enrich the routes map. If any
    // single query fails (e.g., an RLS hiccup on one supporting table),
    // we still show the rest of the overview instead of blanking the page.
    const [
      setupResult,
      tripsResult,
      overviewResult,
    ] = await Promise.allSettled([
      fetchAdminSetupSnapshot(),
      fetchAdminLiveTrips(),
      fetchBoundedAdminOverview(),
    ]);

    if (import.meta.env.DEV) {
      const names = [
        'setup snapshot',
        'live trips',
        'bounded route overview',
      ];
      [
        setupResult,
        tripsResult,
        overviewResult,
      ].forEach((result, index) => {
        if (result.status === 'rejected') {
          console.warn(
            `[AdminDashboardPage] Non-fatal failure loading ${names[index]}.`,
            result.reason,
          );
        }
      });
    }

    setData({
      setup:
        setupResult.status === 'fulfilled'
          ? setupResult.value
          : emptySetupSnapshot,
      trips: tripsResult.status === 'fulfilled' ? tripsResult.value : [],
      routes: overviewResult.status === 'fulfilled' ? overviewResult.value.routes : [],
    });
  }, []);

  useEffect(() => {
    void load().catch(() => setError(true));
  }, [load]);

  const setupComplete = useMemo(() => {
    if (!data) return 0;
    return setupKeys.filter((item) => data.setup[item.key] > 0).length;
  }, [data]);

  const activeTrips = data?.trips.length ?? 0;
  const staleTrips = data?.trips.filter((t) => t.locationStatus === 'stale').length ?? 0;
  const missingTrips = data?.trips.filter((t) => t.locationStatus === 'missing').length ?? 0;

  return (
    <DashboardLayout title="Admin Dashboard" portal="admin" navItems={[]} navGroups={adminNavGroups}>
      <div className="space-y-6">
        <PageHeader
          eyebrow="Overview"
          title="Transportation overview"
          description="Live operations, route status, and setup readiness at a glance."
        />

        {error && (
          <DataState
            title="Overview unavailable"
            message="Use the navigation to continue working with students, guardians, drivers, buses, or routes."
          />
        )}
        {!data && !error && (
          <DataState title="Loading overview" message="Checking transportation readiness and live operations." />
        )}

        {data && (
          <>
            {/* Live operations summary */}
            <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard
                label="Active trips"
                value={activeTrips}
                detail="Driver-started trips currently operating."
                tone="navy"
                icon={<Radio className="h-5 w-5" />}
              />
              <StatCard
                label="Stale locations"
                value={staleTrips}
                detail="Buses with GPS not updated recently."
                tone="warning"
                icon={<AlertTriangle className="h-5 w-5" />}
              />
              <StatCard
                label="Missing locations"
                value={missingTrips}
                detail="Active trips without GPS data."
                tone="danger"
                icon={<MapPinOff className="h-5 w-5" />}
              />
              <StatCard
                label="Setup readiness"
                value={`${setupComplete} of ${setupKeys.length}`}
                detail="Core setup steps complete."
                tone="navy"
                icon={<ListChecks className="h-5 w-5" />}
              />
            </section>

            {/* Clickable route tiles */}
            <section className="space-y-4">
              <div>
                <h2 className="text-xl font-bold text-navy-900">Routes</h2>
                <p className="mt-1 text-sm text-gray-600">
                  Active and inactive routes are shown below. Select any tile to open its details and map.
                </p>
              </div>

              {data.routes.length === 0 ? (
                <DataState
                  title="No routes yet"
                  message="Create your first route with stops to see it here."
                />
              ) : (
                <div className="grid gap-3">
                  {data.routes
                    .filter((r) => r.status !== 'archived')
                    .map((route) => {
                      return (
                        <AdminRouteStatusTile
                          key={route.id}
                          route={route}
                          schoolName={null}
                          stopCount={route.stop_count}
                          assignments={[]}
                          to={`/admin/routes/${route.id}`}
                        />
                      );
                    })}
                </div>
              )}

              <a href="/admin/routes" className="inline-flex text-sm font-semibold text-navy-700 hover:underline">View all routes &rarr;</a>

            </section>

            {/* Setup checklist */}
            <section className="space-y-3">
              <h2 className="text-xl font-bold text-navy-900">Setup checklist</h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {setupKeys.map((item) => {
                  const count = data.setup[item.key];
                  const complete = count > 0;
                  return (
                    <a
                      key={item.key}
                      href={item.to}
                      className="flex items-center justify-between rounded-lg border border-gray-200 bg-white p-4 text-sm hover:shadow-sm"
                    >
                      <span className="font-semibold text-navy-900">{item.label}</span>
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                          complete
                            ? 'bg-success-50 text-success-700'
                            : 'bg-warning-50 text-warning-700'
                        }`}
                      >
                        {complete ? `${count} active` : 'Needs setup'}
                      </span>
                    </a>
                  );
                })}
              </div>
            </section>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
