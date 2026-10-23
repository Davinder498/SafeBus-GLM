import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { useAuth } from '@/contexts/useAuth';
import { fetchBusSubscriptionAccess } from '@/services/subscriptionService';
import type { BusSubscriptionAccess } from '@/types/subscription';

export function useBusSubscriptionAccess(enabled = true) {
  const [access, setAccess] = useState<BusSubscriptionAccess | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    void fetchBusSubscriptionAccess()
      .then((data) => {
        if (active) setAccess(data);
      })
      .catch((e: unknown) => {
        if (active) setError(e instanceof Error ? e.message : 'Unable to verify capacity.');
      });
    return () => {
      active = false;
    };
  }, [enabled]);
  return { access, error };
}

export function BusSubscriptionGate({
  access,
  error,
}: {
  access: BusSubscriptionAccess | null;
  error: string | null;
}) {
  const { profile } = useAuth();
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
      <p className="font-semibold">
        {error ??
          (!access
            ? 'Checking your bus allowance…'
            : access.exempt && access.eligible
              ? 'Test school authority · no subscription required'
              : access.eligible
                ? `${access.active} of ${access.limit} active-bus licences in use`
                : 'A subscription is required to configure new buses')}
      </p>
      <p className="mt-1 leading-6">
        {access?.exempt && access.eligible
          ? `${access.active} active buses. Testing access has no subscription bus limit.`
          : access?.eligible
            ? 'Inactive buses do not consume capacity. Activation must fit your subscribed allowance.'
            : 'Existing transportation operations continue. Start or resolve your subscription to create or activate buses.'}
      </p>
      {access?.exempt ? null : profile?.role === 'tenant_admin' ? (
        <Link
          className="mt-2 inline-block font-semibold text-navy-700 underline"
          to="/admin/settings/billing"
        >
          Manage subscription
        </Link>
      ) : (
        <p className="mt-2">Your school authority administrator manages the subscription.</p>
      )}
    </div>
  );
}
