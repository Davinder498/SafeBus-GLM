import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fetchGuardianDeliveryPreferences,
  fetchNotificationDetail,
  saveGuardianDeliveryPreferences,
} from './notificationService';

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('@/lib/supabase', () => ({ supabase: { rpc: mocks.rpc } }));
const snapshot = {
  in_app_enabled: false,
  push_enabled: true,
  email_enabled: false,
  pickup_dropoff: { in_app: true, push: false, email: true },
  trip_updates: { in_app: false, push: true, email: false },
  operational_alerts: { in_app: true, push: true, email: false },
};
beforeEach(() => mocks.rpc.mockReset());
describe('guardian preference v3 service', () => {
  it('round-trips independent channel selections without changing disabled master selections', async () => {
    mocks.rpc.mockResolvedValue({ data: snapshot, error: null });
    const preferences = await fetchGuardianDeliveryPreferences();
    expect(mocks.rpc).toHaveBeenCalledWith('get_guardian_delivery_preferences_v3');
    expect(preferences.inAppEnabled).toBe(false);
    expect(preferences.pickupDropoff).toEqual({ inApp: true, push: false, email: true });
    expect(await saveGuardianDeliveryPreferences(preferences)).toEqual(preferences);
    expect(mocks.rpc).toHaveBeenLastCalledWith('set_guardian_delivery_preferences_v3', {
      p_preferences: snapshot,
    });
  });
  it('propagates save failures so the page can roll back', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: snapshot, error: null });
    const preferences = await fetchGuardianDeliveryPreferences();
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: 'Save failed' } });
    await expect(saveGuardianDeliveryPreferences(preferences)).rejects.toThrow('Save failed');
  });
});
describe('recipient-scoped notification detail', () => {
  it('maps a detail independently of inbox pagination and filters', async () => {
    mocks.rpc.mockResolvedValue({
      data: [
        {
          id: 'event-1',
          event_type: 'student_picked_up',
          category: 'pickup_dropoff',
          severity: 'info',
          title: 'Pickup recorded',
          body: 'Pickup was recorded for Seerat on Bus 01, Route 01.',
          occurred_at: '2026-10-09T18:00:00Z',
          created_at: '2026-10-09T18:00:00Z',
          read_at: null,
          archived_at: null,
          destination_path: '/notifications?notification=event-1',
        },
      ],
      error: null,
    });
    expect(await fetchNotificationDetail('event-1')).toMatchObject({
      id: 'event-1',
      eventType: 'student_picked_up',
      readAt: null,
      body: 'Pickup was recorded for Seerat on Bus 01, Route 01.',
    });
    expect(mocks.rpc).toHaveBeenCalledWith('get_user_notification_detail', { p_id: 'event-1' });
  });
  it('returns no detail for unavailable or unauthorized IDs', async () => {
    mocks.rpc.mockResolvedValue({ data: [], error: null });
    expect(await fetchNotificationDetail('unauthorized')).toBeNull();
  });
});
