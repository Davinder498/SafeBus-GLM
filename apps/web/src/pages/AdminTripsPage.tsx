import { DashboardLayout, adminNavGroups } from '@/components/layout/DashboardLayout';
import { AdminTripSearchSection } from '@/components/admin/AdminTripSearchSection';
import { PageHeader } from '@/components/ui/PageHeader';

export function AdminTripsPage() {
  return (
    <DashboardLayout title="All trips" portal="admin" navItems={[]} navGroups={adminNavGroups}>
      <div className="space-y-5">
        <PageHeader eyebrow="Operations" title="All trips" />
        <AdminTripSearchSection />
      </div>
    </DashboardLayout>
  );
}
