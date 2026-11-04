import { useState } from 'react';
import { useDriverTracking } from '@/contexts/DriverTrackingContext';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';

export function DriverPendingTripAction({ busy = false }: { busy?: boolean }) {
  const tracking = useDriverTracking();
  const [retrying, setRetrying] = useState(false);
  const pending = tracking.pendingTripAction;
  if (!pending && !tracking.pendingTripActionError) return null;
  return (
    <Card className="space-y-3 border-warning-200 bg-warning-50 p-4">
      <p role="status" className="text-sm font-semibold text-navy-900">
        {pending
          ? `${{ pause: 'Pause', end: 'End', cancel: 'Cancellation' }[pending.action]} saved on this phone. Awaiting server confirmation.`
          : 'Saved trip action needs review.'}
      </p>
      <p className="text-sm text-navy-800">
        {tracking.pendingTripActionError ??
          'Location collection stays off. This action retries when your connection and sign-in are available.'}
      </p>
      <div className="flex flex-wrap gap-2">
        {pending && (
          <Button
            variant="secondary"
            disabled={busy}
            loading={retrying}
            onClick={() => {
              setRetrying(true);
              void tracking.retryTripAction(true).finally(() => setRetrying(false));
            }}
          >
            Retry saved action
          </Button>
        )}
        <Button
          variant="secondary"
          disabled={busy || retrying}
          onClick={() => {
            if (
              window.confirm(
                'Remove this saved retry? A request already sent may still complete. Location sharing will stay off; the server trip status will not be changed by removing the retry.',
              )
            )
              tracking.discardTripAction();
          }}
        >
          Discard saved action
        </Button>
      </div>
    </Card>
  );
}
