import { StatusPill } from '@/components/ui/StatusPill';
import type { LocationSharingState } from '@/hooks/useDriverLocationSharing';
import { formatAdminTripTimestamp } from '@/utils/adminTripDates';

export interface DriverLocationStatusProps {
  supported: boolean;
  state: LocationSharingState;
  compact?: boolean;
}

function formatTimestamp(iso: string): string {
  return formatAdminTripTimestamp(iso);
}

export function DriverLocationStatus({ supported, state }: DriverLocationStatusProps) {
  const errorMessage = state.kind === 'error' || state.kind === 'denied' ? state.message : null;

  let statusMessage = 'Location collection is off.';
  let statusTone: 'success' | 'warning' | 'neutral' = 'neutral';
  let statusLabel: string | null = null;
  if (state.kind === 'waiting') {
    statusMessage = 'Waiting for a successful location update...';
    statusLabel = 'waiting';
  } else if (state.kind === 'sharing') {
    statusMessage =
      state.delivery === 'active'
        ? `Location sharing active. Last update ${formatTimestamp(state.lastUpdateAt)}.`
        : `Location updates are delayed. Last successful update ${formatTimestamp(state.lastUpdateAt)}.`;
    statusTone = state.delivery === 'active' ? 'success' : 'warning';
    statusLabel = state.delivery === 'active' ? 'active' : 'delayed';
  } else if (state.kind === 'offline') {
    statusMessage = state.lastUpdateAt
      ? `Offline. Last successful update ${formatTimestamp(state.lastUpdateAt)}. Delivery can retry when the connection returns while tracking remains authorized.`
      : 'Offline. Waiting to send the first location when the connection returns.';
    statusTone = 'warning';
    statusLabel = 'offline';
  } else if (state.kind === 'recovering') {
    statusMessage = state.offline
      ? 'Location collection is off. Queued updates remain on this phone while offline.'
      : 'Location collection is off. Queued updates remain on this phone.';
    if (state.lastUpdateAt)
      statusMessage += ` Last successful update ${formatTimestamp(state.lastUpdateAt)}.`;
    statusTone = 'warning';
    statusLabel = state.offline ? 'offline · pending' : 'pending delivery';
  } else if (state.kind === 'denied') {
    statusMessage = 'Location permission denied.';
  } else if (state.kind === 'error') {
    statusMessage = 'Location status could not be confirmed.';
  }

  if (!supported) {
    return (
      <div data-testid="driver-location-panel">
        <h3 className="font-bold text-navy-900">Location status</h3>
        <p data-testid="driver-location-error" className="mt-2 text-sm text-danger-700">
          Location sharing is not supported in this browser.
        </p>
      </div>
    );
  }

  return (
    <div data-testid="driver-location-panel">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="font-bold text-navy-900">Location status</h3>
          <p data-testid="driver-location-status" className="mt-1 text-sm text-gray-600">
            {statusMessage}
          </p>
          {errorMessage && (
            <p
              data-testid="driver-location-error"
              role="alert"
              className="mt-2 text-sm text-danger-700"
            >
              {errorMessage}
            </p>
          )}
          {state.kind === 'error' && state.pendingDelivery && (
            <p className="mt-1 text-sm text-gray-600">
              Queued location updates remain on this phone.
            </p>
          )}
        </div>
        {statusLabel && <StatusPill tone={statusTone}>{statusLabel}</StatusPill>}
      </div>
    </div>
  );
}
