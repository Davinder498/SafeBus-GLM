import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import {
  DashboardLayout,
  driverNavGroups,
  guardianNavGroups,
} from '@/components/layout/DashboardLayout';
import { SupportContactCard } from '@/components/support/SupportContactCard';
import { DataState } from '@/components/ui/DataState';
import { Button } from '@/components/ui/Button';
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
      <div className="mx-auto max-w-3xl space-y-5" data-ui="mobile-support-page">
        <PageHeader
          eyebrow="Help"
          title="Support"
          description="Contact your tenant administrator for help with your BusSafe account or transportation service."
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
          <SupportContactCard title="Support contact" contact={contact} />
        )}
        {!loading && !error && !contact && (
          <DataState
            title="Contact your transportation administrator"
            message="Use the verified contact from your invitation or school authority directory. You can also review the BusSafe privacy contact instructions."
            action={
              <Link to="/privacy#contact">
                <Button variant="secondary">View contact instructions</Button>
              </Link>
            }
          />
        )}
      </div>
    </DashboardLayout>
  );
}
