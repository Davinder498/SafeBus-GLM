import { describe, expect, it, vi } from 'vitest';
import {
  buildFcmMessage,
  classifyFcmError,
  createFcmSender,
  createGoogleAccessTokenProvider,
  parseRetryAfter,
  retryDelaySeconds,
  runPushDispatcher,
  timingSafeSecretEqual,
} from '../../../../supabase/functions/_shared/push-dispatcher-core.mjs';

async function testServiceAccount() {
  const keyPair = await crypto.subtle.generateKey(
    {
      name: 'RSASSA-PKCS1-v1_5',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true,
    ['sign', 'verify'],
  );
  const pkcs8 = await crypto.subtle.exportKey('pkcs8', keyPair.privateKey);
  const base64 = Buffer.from(pkcs8)
    .toString('base64')
    .match(/.{1,64}/gu)
    .join('\n');
  return {
    type: 'service_account',
    project_id: 'safebus-test-project',
    client_email: 'dispatcher@safebus-test-project.iam.gserviceaccount.com',
    private_key: `-----BEGIN PRIVATE KEY-----\n${base64}\n-----END PRIVATE KEY-----\n`,
  };
}

describe('Supabase Android push dispatcher', () => {
  it('uses private generic notification-plus-data payloads and stable collapse keys', () => {
    const message = buildFcmMessage({
      fcm_token: 'token',
      notification_id: 'notification-id',
      event_type: 'trip_missing',
      category: 'operations',
      severity: 'urgent',
      title: 'SafeBus update',
      body: 'Open SafeBus to view this update.',
      android_channel: 'urgent_operations',
      collapse_key: 'notification-notification-id',
    });
    expect(message.message.notification).toEqual({
      title: 'SafeBus update',
      body: 'Open SafeBus to view this update.',
    });
    expect(message.message.data).not.toHaveProperty('studentName');
    expect(message.message.android).toMatchObject({
      priority: 'HIGH',
      collapseKey: 'notification-notification-id',
      notification: { visibility: 'PRIVATE', tag: 'notification-notification-id' },
    });
  });

  it('classifies invalid and transient FCM errors', () => {
    expect(classifyFcmError({ fcmErrorCode: 'UNREGISTERED', httpStatus: 404 })).toMatchObject({
      retry: false,
      invalidateDevice: true,
    });
    expect(classifyFcmError({ fcmErrorCode: 'QUOTA_EXCEEDED', httpStatus: 429 })).toMatchObject({
      retry: true,
      category: 'temporary_provider_error',
    });
    expect(retryDelaySeconds(2, 900)).toBe(900);
    expect(retryDelaySeconds(99, 999999)).toBe(86400);
    expect(
      parseRetryAfter('Wed, 02 Sep 2026 22:01:30 GMT', Date.parse('2026-09-02T22:00:00Z')),
    ).toBe(90);
  });

  it('compares the dedicated dispatcher secret without a plain-text equality branch', async () => {
    await expect(timingSafeSecretEqual('same-secret', 'same-secret')).resolves.toBe(true);
    await expect(timingSafeSecretEqual('wrong-secret', 'same-secret')).resolves.toBe(false);
    await expect(timingSafeSecretEqual('', 'same-secret')).resolves.toBe(false);
  });

  it('signs a scoped Google OAuth assertion and caches the short-lived access token', async () => {
    const serviceAccount = await testServiceAccount();
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ access_token: 'access-token', expires_in: 3600 }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const getAccessToken = createGoogleAccessTokenProvider(serviceAccount, {
      fetchImpl,
      now: () => Date.parse('2026-09-02T22:00:00Z'),
    });
    await expect(getAccessToken()).resolves.toBe('access-token');
    await expect(getAccessToken()).resolves.toBe('access-token');
    expect(fetchImpl).toHaveBeenCalledOnce();
    const parameters = new URLSearchParams(fetchImpl.mock.calls[0][1].body);
    expect(parameters.get('grant_type')).toBe('urn:ietf:params:oauth:grant-type:jwt-bearer');
    expect(parameters.get('assertion')?.split('.')).toHaveLength(3);
  });

  it('sends the HTTP v1 message with a bearer token and no sensitive preview fields', async () => {
    const serviceAccount = await testServiceAccount();
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ access_token: 'access-token', expires_in: 3600 }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ name: 'projects/test/messages/message-1' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
    const send = createFcmSender(serviceAccount, { fetchImpl });
    const row = {
      fcm_token: 'device-token',
      notification_id: 'notification-id',
      event_type: 'trip_started',
      category: 'trip_status',
      severity: 'info',
      title: 'SafeBus update',
      body: 'Open SafeBus to view this update.',
      android_channel: 'trip_updates',
      collapse_key: 'notification-notification-id',
    };
    await expect(send(row)).resolves.toBe('projects/test/messages/message-1');
    expect(fetchImpl.mock.calls[1][0]).toBe(
      'https://fcm.googleapis.com/v1/projects/safebus-test-project/messages:send',
    );
    expect(fetchImpl.mock.calls[1][1].headers.authorization).toBe('Bearer access-token');
    const payload = JSON.parse(fetchImpl.mock.calls[1][1].body);
    expect(payload.message.data).toEqual({
      notificationId: 'notification-id',
      eventType: 'trip_started',
      category: 'trip_status',
      destination: '/notifications',
    });
    expect(JSON.stringify(payload)).not.toMatch(
      /studentName|routeName|stopName|latitude|longitude/,
    );
  });

  it('completes a claimed delivery through the leased worker contract', async () => {
    const claimed = {
      outbox_id: 'o1',
      tenant_id: 't1',
      fcm_token: 'token',
      notification_id: 'n1',
      event_type: 'trip_started',
      category: 'trip_status',
      severity: 'info',
      title: 'SafeBus update',
      body: 'Open SafeBus to view this update.',
      android_channel: 'trip_updates',
      collapse_key: 'notification-n1',
      attempt_count: 1,
    };
    const rpc = vi
      .fn()
      .mockResolvedValueOnce([claimed])
      .mockResolvedValueOnce([claimed])
      .mockResolvedValueOnce(true);
    const send = vi.fn().mockResolvedValue('projects/test/messages/message-1');
    const response = await runPushDispatcher({ rpc, send, workerId: 'edge-test' });
    expect(response).toMatchObject({ claimed: 1, delivered: 1, retry: 0, failed: 0 });
    expect(send).toHaveBeenCalledOnce();
    expect(rpc.mock.calls[1][0]).toBe('resolve_push_notification_delivery');
    expect(rpc.mock.calls[2][0]).toBe('complete_push_notification_delivery');
  });

  it('honors Retry-After and requeues transient provider failures', async () => {
    const claimed = { outbox_id: 'o1', tenant_id: 't1', attempt_count: 2 };
    const resolved = { ...claimed, fcm_token: 'token', notification_id: 'n1' };
    const rpc = vi
      .fn()
      .mockResolvedValueOnce([claimed])
      .mockResolvedValueOnce([resolved])
      .mockResolvedValueOnce(true);
    const send = vi
      .fn()
      .mockRejectedValue({ fcmErrorCode: 'UNAVAILABLE', httpStatus: 503, retryAfter: 900 });
    const now = Date.parse('2026-09-02T22:00:00Z');
    const response = await runPushDispatcher({ rpc, send, workerId: 'edge-test', now: () => now });
    expect(response.retry).toBe(1);
    expect(rpc.mock.calls[2]).toEqual([
      'retry_push_notification_delivery',
      expect.objectContaining({
        p_failure_category: 'temporary_provider_error',
        p_available_after: '2026-09-02T22:15:00.000Z',
        p_retry_after_seconds: 900,
      }),
    ]);
  });
});
