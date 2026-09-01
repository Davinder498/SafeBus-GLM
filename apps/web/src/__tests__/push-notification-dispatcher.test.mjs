import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildFcmMessage, classifyFcmError, retryDelaySeconds, runPushDispatcher } from '../../netlify/functions/push-notification-dispatcher.mjs';

describe('Android push dispatcher', () => {
  beforeEach(() => {
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-test';
    process.env.SAFEBUS_PUSH_DISPATCHER_SECRET = 'dispatch-test';
    process.env.SAFEBUS_FIREBASE_SERVICE_ACCOUNT_JSON = JSON.stringify({ project_id: 'test', client_email: 'test@example.com', private_key: 'test' });
  });

  it('uses private generic notification-plus-data payloads and stable collapse keys', () => {
    const message = buildFcmMessage({ fcm_token: 'token', notification_id: 'notification-id', event_type: 'trip_missing', category: 'operations', severity: 'urgent', title: 'SafeBus update', body: 'Open SafeBus to view this update.', android_channel: 'urgent_operations', collapse_key: 'notification-notification-id' });
    expect(message.notification).toEqual({ title: 'SafeBus update', body: 'Open SafeBus to view this update.' });
    expect(message.data).not.toHaveProperty('studentName');
    expect(message.android).toMatchObject({ priority: 'high', collapseKey: 'notification-notification-id', notification: { visibility: 'private', tag: 'notification-notification-id' } });
  });

  it('classifies invalid and transient FCM errors', () => {
    expect(classifyFcmError({ code: 'messaging/registration-token-not-registered' })).toMatchObject({ retry: false, invalidateDevice: true });
    expect(classifyFcmError({ code: 'messaging/quota-exceeded' })).toMatchObject({ retry: true, category: 'temporary_provider_error' });
    expect(retryDelaySeconds(2, 900)).toBe(900);
    expect(retryDelaySeconds(99, 999999)).toBe(86400);
  });

  it('rejects a manual dispatch request without the protected secret', async () => {
    const response = await runPushDispatcher({ headers: {} }, { supabase: {}, messaging: {} });
    expect(response.statusCode).toBe(401);
  });

  it('completes a claimed delivery through the leased worker contract', async () => {
    const claimed = { outbox_id: 'o1', tenant_id: 't1', fcm_token: 'token', notification_id: 'n1', event_type: 'trip_started', category: 'trip_status', severity: 'info', title: 'SafeBus update', body: 'Open SafeBus to view this update.', android_channel: 'trip_updates', collapse_key: 'notification-n1', attempt_count: 1 };
    const rpc = vi.fn()
      .mockResolvedValueOnce({ data: [claimed], error: null })
      .mockResolvedValueOnce({ data: [claimed], error: null })
      .mockResolvedValueOnce({ data: true, error: null });
    const send = vi.fn().mockResolvedValue('projects/test/messages/message-1');
    const response = await runPushDispatcher({ headers: { 'x-safebus-push-secret': 'dispatch-test' } }, { supabase: { rpc }, messaging: { send } });
    expect(response.statusCode).toBe(200);
    expect(send).toHaveBeenCalledOnce();
    expect(rpc.mock.calls[1][0]).toBe('resolve_push_notification_delivery');
    expect(rpc.mock.calls[2][0]).toBe('complete_push_notification_delivery');
  });
});
