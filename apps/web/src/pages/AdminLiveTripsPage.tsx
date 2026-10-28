import { DashboardLayout, adminNavGroups } from '@/components/layout/DashboardLayout';
import { AdminTripSearchSection } from '@/components/admin/AdminTripSearchSection';
import { PageHeader } from '@/components/ui/PageHeader';

export function AdminLiveTripsPage() {
  return (
    <DashboardLayout
      title="Live Operations"
      portal="admin"
      navItems={[]}
      navGroups={adminNavGroups}
    >
      <div className="space-y-5">
        <PageHeader eyebrow="Operations" title="Live Operations" />
        <AdminTripSearchSection />
      </div>
    </DashboardLayout>
  );
}
