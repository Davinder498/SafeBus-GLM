import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { RouteWithStopsForm } from '@/components/admin/RouteWithStopsForm';
import { AdminWriteError } from '@/components/admin/TransportationAdminForms';
import { DashboardLayout, adminNavGroups } from '@/components/layout/DashboardLayout';
import { Card } from '@/components/ui/Card';
import { DataState } from '@/components/ui/DataState';
import { PageHeader } from '@/components/ui/PageHeader';
import { useAuth } from '@/contexts/useAuth';
import { getVisibleSchools } from '@/services/adminOrganizationService';
import { saveRouteServiceDays } from '@/services/phase6OperationsService';
import { getVisibleRoutes, saveRouteDefinition } from '@/services/transportationStructureService';
import type { School } from '@/types/organization';
import type { Route, SaveRouteDefinitionInput } from '@/types/transportation';

export function AdminRouteCreatePage() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const pendingCreatedRouteId = useRef<string | null>(null);
  const [settings, setSettings] = useState<{ routes: Route[]; schools: School[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    setError(null);
    void Promise.all([getVisibleRoutes(), getVisibleSchools()])
      .then(([routes, schools]) => {
        if (active) setSettings({ routes, schools });
      })
      .catch(() => {
        if (active) setError('Could not load route settings. Please retry.');
      });
    return () => {
      active = false;
    };
  }, [revision]);

  async function save(payload: SaveRouteDefinitionInput) {
    if (!profile?.tenant_id) throw new Error('An active tenant is required.');
    const saveId = pendingCreatedRouteId.current;
    const input = saveId ? { ...payload, route: { ...payload.route, id: saveId } } : payload;
    const result = await saveRouteDefinition(input);
    if (saveId && result.routeId !== saveId)
      throw new Error('The route update returned an unexpected route. Reload and try again.');
    pendingCreatedRouteId.current = result.routeId;
    try {
      await saveRouteServiceDays({
        tenantId: profile.tenant_id,
        routeId: result.routeId,
        activeDays: payload.serviceDays,
      });
    } catch {
      throw new Error(
        'Route details saved, but operating days were not saved. Retry saving to finish this route.',
      );
    }
    navigate(`/admin/routes/${result.routeId}#setup`, { replace: true });
  }

  return (
    <DashboardLayout
      title="Admin Dashboard"
      portal="admin"
      navItems={[]}
      navGroups={adminNavGroups}
    >
      <div className="space-y-6">
        <Link to="/admin/routes" className="text-sm font-semibold text-navy-700">
          &larr; Back to routes
        </Link>
        <PageHeader
          eyebrow="Routes"
          title="New route"
          description="Start with route details and stops. Save to continue with the road path, bus, driver and students on this route."
        />
        {profile?.role !== 'tenant_admin' ? (
          <DataState title="View only" message="Only tenant administrators can create routes." />
        ) : (
          <>
            <AdminWriteError message={error} />
            {error && (
              <button type="button" onClick={() => setRevision((n) => n + 1)}>
                Retry route loading
              </button>
            )}
            {!settings && !error && (
              <DataState title="Loading route" message="Fetching route settings." />
            )}
            {settings && !error && (
              <Card className="p-5" id="route-details">
                <h2 className="mb-4 text-lg font-bold text-navy-900">Route details and stops</h2>
                <RouteWithStopsForm
                  route={null}
                  existingStops={[]}
                  existingTripPatterns={[]}
                  existingSchedules={[]}
                  existingServiceDays={[]}
                  existingRoutes={settings.routes}
                  schools={settings.schools}
                  onSubmit={save}
                  onCancel={() => navigate('/admin/routes')}
                />
              </Card>
            )}
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
