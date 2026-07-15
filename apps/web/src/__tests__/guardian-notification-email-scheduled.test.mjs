import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';

// Mock @supabase/supabase-js before importing the dispatcher.
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({ rpc: vi.fn() })),
}));

const ORIGINAL_ENV = { ...process.env };

function setEnv(extra = {}) {
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';
  process.env.SAFEBUS_EMAIL_PROVIDER_API_KEY = 'provider-key';
  process.env.SAFEBUS_EMAIL_FROM = 'noreply@example.test';
  process.env.SAFEBUS_NOTIFICATION_DISPATCHER_SECRET = 'dispatcher-secret';
  delete process.env.SAFEBUS_DEV_EMAIL_RECIPIENT_OVERRIDE;
  delete process.env.CONTEXT;
  Object.assign(process.env, extra);
}

const { createClient } = await import('@supabase/supabase-js');

describe('scheduled notification dispatcher', () => {
  beforeEach(() => setEnv());
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('successfully runs the scheduled dispatcher with an empty body (Netlify schedule trigger)', async () => {
    const client = { rpc: vi.fn(() => Promise.resolve({ data: [], error: null })) };
    createClient.mockReturnValue(client);

    const { handler } = await import('../../netlify/functions/guardian-notification-email-scheduled.mjs');

    // Netlify scheduled triggers arrive with empty body, no secret header.
    const result = await handler({ httpMethod: 'POST', headers: {}, body: '' });

    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body)).toEqual({ claimed: 0, delivered: 0, retry: 0, failed: 0, cancelled: 0 });
    // The scheduled handler should inject the secret internally so the claim RPC runs.
    expect(client.rpc).toHaveBeenCalled();
  });

  it('processes a claimed row through the scheduled path', async () => {
    const client = {
      rpc: vi.fn((name) => {
        if (name === 'claim_guardian_notification_email_batch') {
          return Promise.resolve({
            data: [{
              id: 's-row-1', tenant_id: 't1', guardian_id: 'g1', student_id: 's1',
              student_trip_event_id: 'e1', notification_type: 'student_picked_up', attempt_count: 1,
            }],
            error: null,
          });
        }
        if (name === 'resolve_guardian_notification_email_payload') {
          return Promise.resolve({
            data: [{
              outbox_id: 's-row-1', tenant_id: 't1', guardian_id: 'g1',
              recipient_email: 'guardian@example.test', student_first_name: 'Avery',
              notification_type: 'student_picked_up', event_created_at: '2026-07-14T15:30:00Z',
              tenant_timezone: 'America/Edmonton',
            }],
            error: null,
          });
        }
        if (name === 'complete_guardian_notification_email') return Promise.resolve({ data: null, error: null });
        return Promise.resolve({ data: null, error: null });
      }),
    };
    createClient.mockReturnValue(client);

    const { handler } = await import('../../netlify/functions/guardian-notification-email-scheduled.mjs');

    // Mock global fetch so the provider call is intercepted.
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ id: 'resend-scheduled-1' }),
    });
    globalThis.fetch = fetchMock;

    const result = await handler({ httpMethod: 'POST', headers: {}, body: '' });
    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body)).toMatchObject({ claimed: 1, delivered: 1 });

    delete globalThis.fetch;
  });

  it('returns 500 when configuration is missing', async () => {
    delete process.env.SAFEBUS_EMAIL_FROM;
    const { handler } = await import('../../netlify/functions/guardian-notification-email-scheduled.mjs');
    const result = await handler({ httpMethod: 'POST', headers: {}, body: '' });
    expect(result.statusCode).toBe(500);
  });
});