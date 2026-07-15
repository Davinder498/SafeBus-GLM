import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';

// Mock @supabase/supabase-js before importing the dispatcher.
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    rpc: vi.fn(),
  })),
}));

// We must set env before importing the dispatcher module.
const ORIGINAL_ENV = { ...process.env };

function setEnv(extra = {}) {
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';
  process.env.SAFEBUS_EMAIL_PROVIDER_API_KEY = 'provider-key';
  process.env.SAFEBUS_EMAIL_FROM = 'noreply@example.test';
  process.env.SAFEBUS_EMAIL_FROM_NAME = 'SafeBus QA';
  process.env.SAFEBUS_NOTIFICATION_DISPATCHER_SECRET = 'dispatcher-secret';
  delete process.env.SAFEBUS_DEV_EMAIL_RECIPIENT_OVERRIDE;
  delete process.env.CONTEXT;
  delete process.env.SAFEBUS_NOTIFICATION_BATCH_SIZE;
  Object.assign(process.env, extra);
}

const { runDispatcher } = await import('../../netlify/functions/guardian-notification-email.mjs');
const { createClient } = await import('@supabase/supabase-js');

function makeEvent(secret = 'dispatcher-secret', method = 'POST') {
  return {
    httpMethod: method,
    headers: secret ? { 'x-safebus-dispatcher-secret': secret } : {},
    body: '',
  };
}

function mockSupabase(rpcImpl) {
  const client = { rpc: vi.fn(rpcImpl) };
  createClient.mockReturnValue(client);
  return client;
}

describe('runDispatcher integration', () => {
  beforeEach(() => setEnv());
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.clearAllMocks();
  });

  it('returns 401 when dispatcher secret is missing', async () => {
    mockSupabase(() => Promise.resolve({ data: [], error: null }));
    const result = await runDispatcher(makeEvent(''));
    expect(result.statusCode).toBe(401);
  });

  it('returns 401 when dispatcher secret is incorrect', async () => {
    mockSupabase(() => Promise.resolve({ data: [], error: null }));
    const result = await runDispatcher(makeEvent('wrong-secret'));
    expect(result.statusCode).toBe(401);
  });

  it('returns 500 on configuration error', async () => {
    delete process.env.SAFEBUS_EMAIL_FROM;
    const { handler } = await import('../../netlify/functions/guardian-notification-email.mjs');
    const result = await handler(makeEvent('dispatcher-secret'));
    expect(result.statusCode).toBe(500);
  });

  it('returns empty summary when no rows are claimed', async () => {
    mockSupabase(() => Promise.resolve({ data: [], error: null }));
    const result = await runDispatcher(makeEvent('dispatcher-secret'));
    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body)).toEqual({ claimed: 0, delivered: 0, retry: 0, failed: 0, cancelled: 0 });
  });

  it('delivers a pickup email and completes the outbox row', async () => {
    const row = { id: 'row-1', tenant_id: 't1', guardian_id: 'g1', student_id: 's1', student_trip_event_id: 'e1', notification_type: 'student_picked_up', attempt_count: 1 };
    const claimedRows = [row];
    const client = mockSupabase((name) => {
      if (name === 'claim_guardian_notification_email_batch') return Promise.resolve({ data: claimedRows, error: null });
      if (name === 'resolve_guardian_notification_email_payload') {
        return Promise.resolve({
          data: [{
            outbox_id: 'row-1', tenant_id: 't1', guardian_id: 'g1',
            recipient_email: 'guardian@example.test', student_first_name: 'Avery',
            notification_type: 'student_picked_up', event_created_at: '2026-07-14T15:30:00Z',
            tenant_timezone: 'America/Edmonton',
          }],
          error: null,
        });
      }
      if (name === 'complete_guardian_notification_email') return Promise.resolve({ data: null, error: null });
      return Promise.resolve({ data: null, error: null });
    });

    const sendEmail = vi.fn().mockResolvedValue({ providerMessageId: 'resend-msg-123' });
    const result = await runDispatcher(makeEvent('dispatcher-secret'), sendEmail);

    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body)).toMatchObject({ claimed: 1, delivered: 1 });
    expect(sendEmail).toHaveBeenCalledOnce();
    // Idempotency key should reference the outbox id
    expect(sendEmail.mock.calls[0][0].idempotency).toBe('guardian-notification-outbox:row-1');
    // Complete should have been called with the provider message id
    const completeCall = client.rpc.mock.calls.find((c) => c[0] === 'complete_guardian_notification_email');
    expect(completeCall[1]).toMatchObject({ p_outbox_id: 'row-1', p_provider_message_id: 'resend-msg-123' });
  });

  it('delivers a drop-off email', async () => {
    const row = { id: 'row-2', tenant_id: 't1', guardian_id: 'g1', student_id: 's1', student_trip_event_id: 'e2', notification_type: 'student_dropped_off', attempt_count: 1 };
    mockSupabase((name) => {
      if (name === 'claim_guardian_notification_email_batch') return Promise.resolve({ data: [row], error: null });
      if (name === 'resolve_guardian_notification_email_payload') {
        return Promise.resolve({
          data: [{
            outbox_id: 'row-2', tenant_id: 't1', guardian_id: 'g1',
            recipient_email: 'guardian@example.test', student_first_name: 'Sam',
            notification_type: 'student_dropped_off', event_created_at: '2026-07-14T16:00:00Z',
            tenant_timezone: 'America/Edmonton',
          }],
          error: null,
        });
      }
      if (name === 'complete_guardian_notification_email') return Promise.resolve({ data: null, error: null });
      return Promise.resolve({ data: null, error: null });
    });
    const sendEmail = vi.fn().mockResolvedValue({ providerMessageId: 'resend-msg-456' });
    const result = await runDispatcher(makeEvent('dispatcher-secret'), sendEmail);
    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body)).toMatchObject({ claimed: 1, delivered: 1 });
    expect(sendEmail.mock.calls[0][0].subject).toContain('drop-off');
  });

  it('cancels when payload resolution returns no rows (eligibility revoked)', async () => {
    const row = { id: 'row-3', tenant_id: 't1', guardian_id: 'g1', student_id: 's1', student_trip_event_id: 'e3', notification_type: 'student_picked_up', attempt_count: 1 };
    mockSupabase((name) => {
      if (name === 'claim_guardian_notification_email_batch') return Promise.resolve({ data: [row], error: null });
      if (name === 'resolve_guardian_notification_email_payload') return Promise.resolve({ data: [], error: null });
      if (name === 'cancel_guardian_notification_email') return Promise.resolve({ data: null, error: null });
      return Promise.resolve({ data: null, error: null });
    });
    const sendEmail = vi.fn();
    const result = await runDispatcher(makeEvent('dispatcher-secret'), sendEmail);
    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body)).toMatchObject({ claimed: 1, cancelled: 1 });
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('cancels when recipient email is missing', async () => {
    const row = { id: 'row-4', tenant_id: 't1', guardian_id: 'g1', student_id: 's1', student_trip_event_id: 'e4', notification_type: 'student_picked_up', attempt_count: 1 };
    mockSupabase((name) => {
      if (name === 'claim_guardian_notification_email_batch') return Promise.resolve({ data: [row], error: null });
      if (name === 'resolve_guardian_notification_email_payload') {
        return Promise.resolve({
          data: [{
            outbox_id: 'row-4', tenant_id: 't1', guardian_id: 'g1',
            recipient_email: '', student_first_name: 'Avery',
            notification_type: 'student_picked_up', event_created_at: '2026-07-14T15:30:00Z',
            tenant_timezone: 'America/Edmonton',
          }],
          error: null,
        });
      }
      if (name === 'cancel_guardian_notification_email') return Promise.resolve({ data: null, error: null });
      return Promise.resolve({ data: null, error: null });
    });
    const sendEmail = vi.fn();
    const result = await runDispatcher(makeEvent('dispatcher-secret'), sendEmail);
    expect(JSON.parse(result.body)).toMatchObject({ claimed: 1, cancelled: 1 });
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('cancels when recipient email is invalid', async () => {
    const row = { id: 'row-5', tenant_id: 't1', guardian_id: 'g1', student_id: 's1', student_trip_event_id: 'e5', notification_type: 'student_picked_up', attempt_count: 1 };
    mockSupabase((name) => {
      if (name === 'claim_guardian_notification_email_batch') return Promise.resolve({ data: [row], error: null });
      if (name === 'resolve_guardian_notification_email_payload') {
        return Promise.resolve({
          data: [{
            outbox_id: 'row-5', tenant_id: 't1', guardian_id: 'g1',
            recipient_email: 'not-an-email', student_first_name: 'Avery',
            notification_type: 'student_picked_up', event_created_at: '2026-07-14T15:30:00Z',
            tenant_timezone: 'America/Edmonton',
          }],
          error: null,
        });
      }
      if (name === 'cancel_guardian_notification_email') return Promise.resolve({ data: null, error: null });
      return Promise.resolve({ data: null, error: null });
    });
    const result = await runDispatcher(makeEvent('dispatcher-secret'), vi.fn());
    expect(JSON.parse(result.body)).toMatchObject({ claimed: 1, cancelled: 1 });
  });

  it('retries on temporary provider failure (5xx)', async () => {
    const row = { id: 'row-6', tenant_id: 't1', guardian_id: 'g1', student_id: 's1', student_trip_event_id: 'e6', notification_type: 'student_picked_up', attempt_count: 1 };
    mockSupabase((name) => {
      if (name === 'claim_guardian_notification_email_batch') return Promise.resolve({ data: [row], error: null });
      if (name === 'resolve_guardian_notification_email_payload') {
        return Promise.resolve({
          data: [{
            outbox_id: 'row-6', tenant_id: 't1', guardian_id: 'g1',
            recipient_email: 'guardian@example.test', student_first_name: 'Avery',
            notification_type: 'student_picked_up', event_created_at: '2026-07-14T15:30:00Z',
            tenant_timezone: 'America/Edmonton',
          }],
          error: null,
        });
      }
      if (name === 'retry_guardian_notification_email') return Promise.resolve({ data: null, error: null });
      return Promise.resolve({ data: null, error: null });
    });
    const sendEmail = vi.fn().mockRejectedValue(Object.assign(new Error('provider_error'), { status: 503, providerMessage: 'service_unavailable' }));
    const result = await runDispatcher(makeEvent('dispatcher-secret'), sendEmail);
    expect(JSON.parse(result.body)).toMatchObject({ claimed: 1, retry: 1 });
  });

  it('retries on provider timeout', async () => {
    const row = { id: 'row-7', tenant_id: 't1', guardian_id: 'g1', student_id: 's1', student_trip_event_id: 'e7', notification_type: 'student_picked_up', attempt_count: 1 };
    mockSupabase((name) => {
      if (name === 'claim_guardian_notification_email_batch') return Promise.resolve({ data: [row], error: null });
      if (name === 'resolve_guardian_notification_email_payload') {
        return Promise.resolve({
          data: [{
            outbox_id: 'row-7', tenant_id: 't1', guardian_id: 'g1',
            recipient_email: 'guardian@example.test', student_first_name: 'Avery',
            notification_type: 'student_picked_up', event_created_at: '2026-07-14T15:30:00Z',
            tenant_timezone: 'America/Edmonton',
          }],
          error: null,
        });
      }
      if (name === 'retry_guardian_notification_email') return Promise.resolve({ data: null, error: null });
      return Promise.resolve({ data: null, error: null });
    });
    const sendEmail = vi.fn().mockRejectedValue(Object.assign(new Error('timeout'), { providerMessage: 'timeout' }));
    const result = await runDispatcher(makeEvent('dispatcher-secret'), sendEmail);
    expect(JSON.parse(result.body)).toMatchObject({ claimed: 1, retry: 1 });
  });

  it('fails permanently on permanent provider error (422)', async () => {
    const row = { id: 'row-8', tenant_id: 't1', guardian_id: 'g1', student_id: 's1', student_trip_event_id: 'e8', notification_type: 'student_picked_up', attempt_count: 1 };
    mockSupabase((name) => {
      if (name === 'claim_guardian_notification_email_batch') return Promise.resolve({ data: [row], error: null });
      if (name === 'resolve_guardian_notification_email_payload') {
        return Promise.resolve({
          data: [{
            outbox_id: 'row-8', tenant_id: 't1', guardian_id: 'g1',
            recipient_email: 'guardian@example.test', student_first_name: 'Avery',
            notification_type: 'student_picked_up', event_created_at: '2026-07-14T15:30:00Z',
            tenant_timezone: 'America/Edmonton',
          }],
          error: null,
        });
      }
      if (name === 'fail_guardian_notification_email') return Promise.resolve({ data: null, error: null });
      return Promise.resolve({ data: null, error: null });
    });
    const sendEmail = vi.fn().mockRejectedValue(Object.assign(new Error('provider_error'), { status: 422, providerMessage: 'validation_error' }));
    const result = await runDispatcher(makeEvent('dispatcher-secret'), sendEmail);
    expect(JSON.parse(result.body)).toMatchObject({ claimed: 1, failed: 1 });
  });

  it('uses DEV recipient override in non-production context', async () => {
    setEnv({ SAFEBUS_DEV_EMAIL_RECIPIENT_OVERRIDE: 'qa@example.test', CONTEXT: 'deploy-preview' });
    const row = { id: 'row-9', tenant_id: 't1', guardian_id: 'g1', student_id: 's1', student_trip_event_id: 'e9', notification_type: 'student_picked_up', attempt_count: 1 };
    mockSupabase((name) => {
      if (name === 'claim_guardian_notification_email_batch') return Promise.resolve({ data: [row], error: null });
      if (name === 'resolve_guardian_notification_email_payload') {
        return Promise.resolve({
          data: [{
            outbox_id: 'row-9', tenant_id: 't1', guardian_id: 'g1',
            recipient_email: 'real@example.test', student_first_name: 'Avery',
            notification_type: 'student_picked_up', event_created_at: '2026-07-14T15:30:00Z',
            tenant_timezone: 'America/Edmonton',
          }],
          error: null,
        });
      }
      if (name === 'complete_guardian_notification_email') return Promise.resolve({ data: null, error: null });
      return Promise.resolve({ data: null, error: null });
    });
    const sendEmail = vi.fn().mockResolvedValue({ providerMessageId: 'msg' });
    await runDispatcher(makeEvent('dispatcher-secret'), sendEmail);
    expect(sendEmail.mock.calls[0][0].to).toBe('qa@example.test');
  });

  it('ignores DEV override in production context', async () => {
    setEnv({ SAFEBUS_DEV_EMAIL_RECIPIENT_OVERRIDE: 'qa@example.test', CONTEXT: 'production' });
    const row = { id: 'row-10', tenant_id: 't1', guardian_id: 'g1', student_id: 's1', student_trip_event_id: 'e10', notification_type: 'student_picked_up', attempt_count: 1 };
    mockSupabase((name) => {
      if (name === 'claim_guardian_notification_email_batch') return Promise.resolve({ data: [row], error: null });
      if (name === 'resolve_guardian_notification_email_payload') {
        return Promise.resolve({
          data: [{
            outbox_id: 'row-10', tenant_id: 't1', guardian_id: 'g1',
            recipient_email: 'real@example.test', student_first_name: 'Avery',
            notification_type: 'student_picked_up', event_created_at: '2026-07-14T15:30:00Z',
            tenant_timezone: 'America/Edmonton',
          }],
          error: null,
        });
      }
      if (name === 'complete_guardian_notification_email') return Promise.resolve({ data: null, error: null });
      return Promise.resolve({ data: null, error: null });
    });
    const sendEmail = vi.fn().mockResolvedValue({ providerMessageId: 'msg' });
    await runDispatcher(makeEvent('dispatcher-secret'), sendEmail);
    expect(sendEmail.mock.calls[0][0].to).toBe('real@example.test');
  });

  it('returns 500 when claim RPC errors', async () => {
    mockSupabase((name) => {
      if (name === 'claim_guardian_notification_email_batch') return Promise.resolve({ data: null, error: { message: 'boom' } });
      return Promise.resolve({ data: null, error: null });
    });
    const { handler } = await import('../../netlify/functions/guardian-notification-email.mjs');
    const result = await handler(makeEvent('dispatcher-secret'));
    expect(result.statusCode).toBe(500);
  });
});
