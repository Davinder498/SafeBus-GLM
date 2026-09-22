import { useEffect, useState } from 'react';
import {
  DashboardLayout,
  driverNavGroups,
  guardianNavGroups,
} from '@/components/layout/DashboardLayout';
import { SupportContactCard } from '@/components/support/SupportContactCard';
import { DataState } from '@/components/ui/DataState';
import { PageHeader } from '@/components/ui/PageHeader';
import { useAuth } from '@/contexts/useAuth';
import { fetchSupportDirectory, type SupportContact } from '@/services/supportDirectoryService';

export function MobileSupportPage() {
  const { profile } = useAuth();
  const isDriver = profile?.role === 'driver';
  const [contact, setContact] = useState<SupportContact | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  useEffect(() => {
    let active = true;
    fetchSupportDirectory()
      .then((value) => {
        if (active) setContact(value.tenant);
      })
      .catch(() => {
        if (active) setError(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);
  return (
    <DashboardLayout
      title="Support"
      portal={isDriver ? 'driver' : 'parent'}
      navItems={[]}
      navGroups={isDriver ? driverNavGroups : guardianNavGroups}
    >
      <div className="mx-auto max-w-3xl space-y-5">
        <PageHeader
          eyebrow="Help"
          title="Support"
          description="Contact the transportation organization that manages your BusSafe account."
        />
        {loading && (
          <DataState
            title="Loading support"
            message="Checking your organization’s support details."
          />
        )}
        {error && (
          <DataState title="Support details are unavailable" message="Please try again later." />
        )}
        {!loading && !error && contact && (
          <SupportContactCard title="Your organization’s support team" contact={contact} />
        )}
        {!loading && !error && !contact && (
          <DataState
            title="Support contact is not configured yet"
            message="Contact your school transportation office using its usual contact information."
          />
        )}
      </div>
    </DashboardLayout>
  );
}
