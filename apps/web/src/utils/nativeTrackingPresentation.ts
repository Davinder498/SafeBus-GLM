import type { NativeTrackingStatus } from '@/types/nativeTracking';
import type { LocationSharingState } from '@/hooks/useDriverLocationSharing';

// Match the existing administrative/guardian two-minute GPS freshness boundary.
const FRESH_MS = 120_000;
const FUTURE_TOLERANCE_MS = 30_000;
const issues: Record<NonNullable<NativeTrackingStatus['issue']>, string> = {
  authorization_expired:
    'Tracking authorization expired. Reopen the active bus and scan again when authorized.',
  authorization_rejected:
    'Tracking authorization was rejected. Reopen the active bus and check your access.',
  authentication_expired: 'Tracking sign-in expired. Sign in again before restarting tracking.',
  queue_unavailable:
    'Location collection stopped because secure storage is unavailable. Reopen SafeBus before restarting tracking.',
  delivery_status_unavailable: 'Pending delivery status could not be confirmed. Reopen SafeBus.',
  location_permission:
    'Location collection is unavailable. Check precise background location permission and location services in Android settings.',
};

export function nativeTrackingPresentation(
  status: NativeTrackingStatus,
  browserOnline: boolean,
  now = Date.now(),
): LocationSharingState {
  if (status.statusVersion !== 2)
    return {
      kind: 'error',
      message: 'Update and reopen the SafeBus Android app to verify tracking status.',
    };
  const pending =
    status.pendingDelivery ??
    (Number.isSafeInteger(status.queuedEvents) && (status.queuedEvents ?? 0) > 0);
  if (status.issue)
    return {
      kind: 'error',
      message: issues[status.issue] ?? 'Tracking status is unavailable. Reopen SafeBus.',
      pendingDelivery: pending,
    };
  if (status.queuedEvents === null && status.pendingDelivery === undefined)
    return { kind: 'error', message: issues.delivery_status_unavailable };
  // Old native binaries do not scope acknowledgements to the current trip.
  // They may report collection, but cannot establish successful current delivery.
  const recorded = status.statusVersion === 2 ? Date.parse(status.lastAcceptedAt ?? '') : NaN;
  const valid = Number.isFinite(recorded) && recorded <= now + FUTURE_TOLERANCE_MS;
  const lastUpdateAt = valid ? status.lastAcceptedAt! : null;
  const offline = !browserOnline || status.connected === false;
  if (!status.collecting) {
    if (pending) return { kind: 'recovering', offline, lastUpdateAt };
    return { kind: 'inactive' };
  }
  if (!status.configured)
    return {
      kind: 'error',
      message: 'Tracking configuration is unavailable. Reopen the active bus.',
    };
  if (offline) return { kind: 'offline', lastUpdateAt };
  if (lastUpdateAt)
    return {
      kind: 'sharing',
      lastUpdateAt,
      delivery: !pending && now - recorded <= FRESH_MS ? 'active' : 'delayed',
    };
  return { kind: 'waiting' };
}
