import { DashboardLayout, adminNavGroups } from '@/components/layout/DashboardLayout';
import { AdminTripSearchSection } from '@/components/admin/AdminTripSearchSection';
import { AdminFleetOperationsSection } from '@/components/admin/AdminFleetOperationsSection';
import { PageHeader } from '@/components/ui/PageHeader';
import { useAuth } from '@/contexts/useAuth';

export function AdminLiveTripsPage() {
  const { profile } = useAuth();
  // School-admin fleet UI remains disabled pending complete spatial-surface
  // acceptance. The deployed base/viewport fleet RPCs are already school-
  // scoped, but route overlays still require separate server-side hardening.
  // The display gate itself is not an authorization boundary.
  const canSeeTenantFleet =
    profile?.role === 'tenant_admin' || profile?.role === 'transportation_admin';

  return (
    <DashboardLayout
      title="Live Operations"
      portal="admin"
      navItems={[]}
      navGroups={adminNavGroups}
    >
      <div className="space-y-6">
        <PageHeader
          eyebrow="Operations"
          title="Live Operations"
          description="Review current bus tracking, GPS freshness, and operational trip history."
        />
        {canSeeTenantFleet ? (
          <AdminFleetOperationsSection />
        ) : (
          <p className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 text-sm text-[var(--color-text-muted)]" data-testid="school-admin-fleet-restricted">
            Fleet-wide monitoring is not available for school-level accounts. Review authorized trips below.
          </p>
        )}
        <div className="space-y-3">
          <div>
            <h2 className="text-xl font-bold text-[var(--color-text)]">Trip operations and history</h2>
            <p className="mt-1 text-sm text-[var(--color-text-muted)]">
              Use the existing secured trip search for route history, status and detailed review.
            </p>
          </div>
          <AdminTripSearchSection />
        </div>
      </div>
    </DashboardLayout>
  );
}
