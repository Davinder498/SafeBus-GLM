import { DashboardLayout, adminNavItems } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/ui/PageHeader';
import { PlaceholderCard } from '@/components/ui/PlaceholderCard';

interface AdminPlaceholderPageProps {
  title: string;
}

export function AdminPlaceholderPage({ title }: AdminPlaceholderPageProps) {
  return (
    <DashboardLayout title="Admin Dashboard" portal="admin" navItems={adminNavItems}>
      <div className="space-y-6">
        <PageHeader
          eyebrow="Placeholder"
          title={title}
          description="This admin section is intentionally a placeholder for a later milestone."
        />
        <PlaceholderCard
          title={`${title} placeholder`}
          description="No transportation business data or workflows are added in Milestone 3A."
        />
      </div>
    </DashboardLayout>
  );
}
