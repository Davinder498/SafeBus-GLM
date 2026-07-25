import { StatusPill } from '@/components/ui/StatusPill';
import type { LocationSharingState } from '@/hooks/useDriverLocationSharing';

export interface DriverLocationStatusProps {
  supported: boolean;
  state: LocationSharingState;
  compact?: boolean;
}

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

export function DriverLocationStatus({
  supported,
  state,
  compact = false,
}: DriverLocationStatusProps) {
  const tracking = state.kind === 'waiting' || state.kind === 'sharing' || state.kind === 'offline';
  const errorMessage = state.kind === 'error' || state.kind === 'denied' ? state.message : null;

  let statusMessage = 'Share your live bus location during this trip.';
  let statusTone: 'success' | 'warning' | 'neutral' = 'neutral';
  let statusLabel: string | null = null;
  if (state.kind === 'waiting') {
    statusMessage = 'Waiting for the first location update...';
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
      ? `Offline. Last successful update ${formatTimestamp(state.lastUpdateAt)}. Tracking will resume automatically.`
      : 'Offline. Waiting to send the first location when the connection returns.';
    statusTone = 'warning';
    statusLabel = 'offline';
  } else if (state.kind === 'denied') {
    statusMessage = 'Location permission denied.';
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
        </div>
        {statusLabel && <StatusPill tone={statusTone}>{statusLabel}</StatusPill>}
      </div>
      {!compact && !tracking && !errorMessage && (
        <p className="mt-2 text-sm text-gray-600">
          Location permission is being requested automatically.
        </p>
      )}
    </div>
  );
}
