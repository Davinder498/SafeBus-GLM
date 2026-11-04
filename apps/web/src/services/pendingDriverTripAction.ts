import type { DriverTrip } from '@/types/trips';
import { operationalTextContainsProhibitedInformation } from './phase6OperationsService';

export type StopTripAction = 'pause' | 'end' | 'cancel';
export interface PendingTripAction {
  version: 1;
  id: string;
  ownerId: string;
  tenantId: string;
  driverId: string;
  tripId: string;
  expectedUpdatedAt: string;
  action: StopTripAction;
  reason: string | null;
  createdAt: number;
}
const prefix = 'safebus.pendingTripAction.v1:';
export const pendingTripActionEvent = 'safebus:pending-trip-action';
export const tripActionSyncedEvent = 'safebus:trip-action-synced';
const maxAge = 2 * 60 * 60 * 1000;
export function loadPendingTripAction(
  ownerId: string,
  storage = window.localStorage,
): PendingTripAction | null {
  const raw = storage.getItem(prefix + ownerId);
  if (!raw) return null;
  try {
    const item = JSON.parse(raw) as PendingTripAction;
    if (
      item.version !== 1 ||
      item.ownerId !== ownerId ||
      !item.id ||
      !item.tenantId ||
      !item.driverId ||
      !item.tripId ||
      !item.expectedUpdatedAt ||
      !['pause', 'end', 'cancel'].includes(item.action) ||
      !Number.isFinite(item.createdAt) ||
      (item.reason !== null &&
        (typeof item.reason !== 'string' ||
          item.reason.length > 120 ||
          operationalTextContainsProhibitedInformation(item.reason)))
    )
      throw new Error();
    return item;
  } catch {
    throw new Error(
      'The saved trip action could not be read. Review it before starting another trip.',
    );
  }
}
export function savePendingTripAction(
  ownerId: string,
  tenantId: string,
  trip: DriverTrip,
  action: StopTripAction,
  reason: string | null,
  storage = window.localStorage,
): PendingTripAction {
  if (
    trip.tenant_id !== tenantId ||
    !['active', 'paused'].includes(trip.status) ||
    (reason && (reason.length > 120 || operationalTextContainsProhibitedInformation(reason)))
  )
    throw new Error('This trip action is not valid. Refresh the active bus before retrying.');
  if (loadPendingTripAction(ownerId, storage))
    throw new Error(
      'A trip action is already pending. Retry or discard it before recording another action.',
    );
  const item: PendingTripAction = {
    version: 1,
    id: crypto.randomUUID(),
    ownerId,
    tenantId,
    driverId: trip.driver_id,
    tripId: trip.id,
    expectedUpdatedAt: trip.updated_at,
    action,
    reason,
    createdAt: Date.now(),
  };
  try {
    storage.setItem(prefix + ownerId, JSON.stringify(item));
  } catch {
    throw new Error(
      'Location sharing stopped, but this phone could not save the action for automatic retry. Keep this screen open and retry manually.',
    );
  }
  window.dispatchEvent(new Event(pendingTripActionEvent));
  return item;
}
export function removePendingTripAction(
  ownerId: string,
  id?: string,
  storage = window.localStorage,
) {
  if (id && loadPendingTripAction(ownerId, storage)?.id !== id) return;
  storage.removeItem(prefix + ownerId);
  window.dispatchEvent(new Event(pendingTripActionEvent));
}
export function pendingActionDisposition(
  item: PendingTripAction,
  trip: DriverTrip | null,
  now = Date.now(),
) {
  if (!trip || trip.id !== item.tripId) return 'obsolete';
  if (trip.tenant_id !== item.tenantId || trip.driver_id !== item.driverId) return 'review';
  if (trip.status === 'completed' || trip.status === 'cancelled') return 'obsolete';
  if (item.action === 'pause' && trip.status === 'paused') return 'confirmed';
  if (
    now < item.createdAt ||
    now - item.createdAt > maxAge ||
    trip.updated_at !== item.expectedUpdatedAt
  )
    return 'review';
  return 'send';
}
