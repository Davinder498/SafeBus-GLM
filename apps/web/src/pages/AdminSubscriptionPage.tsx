import { useEffect, useState } from 'react';
import { CreditCard, ExternalLink } from 'lucide-react';
import { DashboardLayout, adminNavGroups } from '@/components/layout/DashboardLayout';
import { AdminSettingsNav } from '@/components/settings/AdminSettingsNav';
import { SubscriptionOverview } from '@/components/subscription/SubscriptionOverview';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { DataState } from '@/components/ui/DataState';
import { PageHeader } from '@/components/ui/PageHeader';
import {
  createBillingPortalSession,
  fetchTenantSubscription,
} from '@/services/subscriptionService';
import type { TenantSubscription } from '@/types/subscription';
import { useAuth } from '@/contexts/useAuth';

export function AdminSubscriptionPage() {
  const { profile } = useAuth();
  const [subscription, setSubscription] = useState<TenantSubscription | null>(null);
  const [loading, setLoading] = useState(true);
  const [portalLoading, setPortalLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetchTenantSubscription()
      .then((value) => {
        if (active) setSubscription(value);
      })
      .catch((cause) => {
        if (active) setError(cause instanceof Error ? cause.message : 'Unable to load billing.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  async function openPortal() {
    setPortalLoading(true);
    setError(null);
    try {
      window.location.assign(await createBillingPortalSession());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to open the billing portal.');
      setPortalLoading(false);
    }
  }

  return (
    <DashboardLayout
      title="Admin Dashboard"
      portal="admin"
      navItems={[]}
      navGroups={adminNavGroups}
    >
      <div className="space-y-6">
        <PageHeader
          eyebrow="Settings"
          title="Subscription & billing"
          description="Review your annual per-bus contract, fleet allowance, renewal, and invoice status. Contract changes are handled by the SafeBus platform team."
          icon={<CreditCard className="h-6 w-6" />}
          action={
            subscription?.configured ? (
              <Button
                type="button"
                variant="secondary"
                loading={portalLoading}
                onClick={() => void openPortal()}
                rightIcon={<ExternalLink className="h-4 w-4" />}
              >
                View invoices & payment details
              </Button>
            ) : undefined
          }
        />

        <AdminSettingsNav role={profile?.role} />

        {error && (
          <Card className="border-danger-200 bg-danger-50 p-4">
            <p className="text-sm font-semibold text-danger-700" role="alert">
              {error}
            </p>
          </Card>
        )}
        {loading && (
          <DataState title="Loading subscription" message="Checking the current billing summary." />
        )}
        {!loading && subscription && <SubscriptionOverview subscription={subscription} />}

        <Card className="border-navy-100 bg-navy-50 p-5">
          <p className="text-sm font-semibold text-navy-900">
            Billing status and operational access are separate. An overdue invoice will never
            automatically disable driver, guardian, or transportation operations.
          </p>
        </Card>
      </div>
    </DashboardLayout>
  );
}
