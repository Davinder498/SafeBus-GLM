import { describe, expect, it } from 'vitest';
import { nativeTrackingPresentation as present } from './nativeTrackingPresentation';
import type { NativeTrackingStatus } from '@/types/nativeTracking';

const now = Date.parse('2026-11-01T09:00:00Z');
const status: NativeTrackingStatus = {
  statusVersion: 2,
  configured: true,
  collecting: true,
  connected: true,
  queuedEvents: 0,
  lastAcceptedAt: new Date(now).toISOString(),
};
describe('truthful native delivery presentation', () => {
  it('requires a fresh current-session acknowledgement and an empty queue for active delivery', () => {
    expect(present(status, true, now)).toMatchObject({ kind: 'sharing', delivery: 'active' });
    expect(present({ ...status, queuedEvents: 1 }, true, now)).toMatchObject({
      kind: 'sharing',
      delivery: 'delayed',
    });
    expect(present(status, true, now + 120_000)).toMatchObject({ delivery: 'active' });
    expect(present(status, true, now + 120_001)).toMatchObject({ delivery: 'delayed' });
  });
  it.each([undefined, 'invalid', new Date(now + 30_001).toISOString()])(
    'does not invent delivery from %s',
    (lastAcceptedAt) => {
      expect(present({ ...status, lastAcceptedAt }, true, now)).toEqual({ kind: 'waiting' });
    },
  );
  it('does not trust an unscoped acknowledgement from an older Android binary', () => {
    expect(present({ ...status, statusVersion: undefined }, true, now)).toEqual({
      kind: 'error',
      message: 'Update and reopen the SafeBus Android app to verify tracking status.',
    });
  });
  it('uses bounded native pending evidence without claiming an exact queue count', () => {
    expect(
      present({ ...status, queuedEvents: null, pendingDelivery: true }, true, now),
    ).toMatchObject({ kind: 'sharing', delivery: 'delayed' });
    expect(
      present(
        { ...status, collecting: false, queuedEvents: null, pendingDelivery: true },
        true,
        now,
      ),
    ).toMatchObject({ kind: 'recovering' });
    expect(present({ ...status, queuedEvents: null }, true, now)).toMatchObject({ kind: 'error' });
  });
  it('gives both browser and native offline signals precedence over an acknowledgement', () => {
    expect(present(status, false, now)).toMatchObject({ kind: 'offline' });
    expect(present({ ...status, connected: false }, true, now)).toMatchObject({ kind: 'offline' });
  });
  it('distinguishes stopped collection with pending delivery from a fully drained queue', () => {
    expect(present({ ...status, collecting: false, queuedEvents: 2 }, false, now)).toMatchObject({
      kind: 'recovering',
      offline: true,
    });
    expect(present({ ...status, collecting: false }, false, now)).toEqual({ kind: 'inactive' });
  });
  it.each([
    'authentication_expired',
    'authorization_expired',
    'authorization_rejected',
    'queue_unavailable',
    'location_permission',
  ] as const)('shows %s even with a recent acknowledgement', (issue) => {
    expect(present({ ...status, issue, queuedEvents: 1 }, true, now)).toMatchObject({
      kind: 'error',
      pendingDelivery: true,
    });
  });
  it('does not claim active delivery when configuration is missing', () => {
    expect(present({ ...status, configured: false }, true, now)).toMatchObject({ kind: 'error' });
  });
});
