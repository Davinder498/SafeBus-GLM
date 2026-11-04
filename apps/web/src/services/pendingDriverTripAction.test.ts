import { beforeEach, afterEach, expect, it } from 'vitest';
import {
  loadPendingTripAction,
  savePendingTripAction,
  removePendingTripAction,
  pendingActionDisposition,
} from './pendingDriverTripAction';
import type { DriverTrip } from '@/types/trips';
const trip = {
  id: 'trip-a',
  tenant_id: 'authority-a',
  driver_id: 'driver-a',
  status: 'active',
  updated_at: '2026-11-03T14:00:00Z',
} as DriverTrip;
beforeEach(() => localStorage.clear());
afterEach(() => localStorage.clear());
it('survives a reload and is readable only through the original account key', () => {
  const item = savePendingTripAction('owner-a', 'authority-a', trip, 'cancel', 'Mechanical issue');
  expect(loadPendingTripAction('owner-a')).toEqual(item);
  expect(loadPendingTripAction('owner-b')).toBeNull();
  expect(localStorage.getItem('safebus.pendingTripAction.v1:owner-a')).not.toMatch(
    /accessToken|refreshToken|latitude|longitude/,
  );
  expect(() => savePendingTripAction('owner-a', 'authority-a', trip, 'end', null)).toThrow(
    'already pending',
  );
});
it('never applies an old action to a different trip, driver or authority', () => {
  const item = savePendingTripAction('owner-a', 'authority-a', trip, 'end', null);
  expect(pendingActionDisposition(item, { ...trip, id: 'trip-b' })).toBe('obsolete');
  expect(pendingActionDisposition(item, { ...trip, driver_id: 'driver-b' })).toBe('review');
  expect(pendingActionDisposition(item, { ...trip, tenant_id: 'authority-b' })).toBe('review');
  expect(pendingActionDisposition(item, trip)).toBe('send');
});
it('requires review for changed or expired trips without resending a completed pause', () => {
  const item = savePendingTripAction('owner-a', 'authority-a', trip, 'pause', null);
  expect(pendingActionDisposition(item, { ...trip, status: 'paused' })).toBe('confirmed');
  expect(pendingActionDisposition(item, { ...trip, updated_at: 'changed' })).toBe('review');
  expect(pendingActionDisposition(item, trip, item.createdAt + 3 * 60 * 60 * 1000)).toBe('review');
  expect(pendingActionDisposition(item, null)).toBe('obsolete');
});
it('does not remove a newer saved action when an older response returns', () => {
  const first = savePendingTripAction('owner-a', 'authority-a', trip, 'pause', null);
  removePendingTripAction('owner-a', first.id);
  const next = savePendingTripAction('owner-a', 'authority-a', trip, 'end', null);
  removePendingTripAction('owner-a', first.id);
  expect(loadPendingTripAction('owner-a')?.id).toBe(next.id);
});
it('fails visibly on corrupt storage, a foreign authority or prohibited details', () => {
  expect(() => savePendingTripAction('owner-a', 'authority-b', trip, 'end', null)).toThrow(
    'not valid',
  );
  expect(() =>
    savePendingTripAction('owner-a', 'authority-a', trip, 'cancel', 'student name'),
  ).toThrow('not valid');
  localStorage.setItem('safebus.pendingTripAction.v1:owner-a', '{');
  expect(() => loadPendingTripAction('owner-a')).toThrow('could not be read');
});
