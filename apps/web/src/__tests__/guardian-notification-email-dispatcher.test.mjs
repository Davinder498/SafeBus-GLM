import { afterEach, beforeEach, expect, it, vi } from 'vitest';
vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn() }));
import { createClient } from '@supabase/supabase-js';
import { handler, runDispatcher } from '../../netlify/functions/guardian-notification-email.mjs';
const original = { ...process.env };
const payload = {
  id: '00000000-0000-4000-8000-000000000001',
  recipient_email: 'guardian@example.test',
  notification_type: 'student_picked_up',
  title: 'Student picked up',
  body: 'Alex Morgan was picked up on Bus 12.',
  event_occurred_at: '2026-10-28T12:00:00Z',
  tenant_timezone: 'America/Edmonton',
  idempotency_key: 'guardian-notification-outbox:stable-id',
};
const event = {
  httpMethod: 'POST',
  headers: { 'x-safebus-dispatcher-secret': 'dispatcher-secret' },
};
beforeEach(() =>
  Object.assign(process.env, {
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'local-test-only',
    SAFEBUS_EMAIL_PROVIDER_API_KEY: 'local-test-provider',
    SAFEBUS_EMAIL_FROM: 'noreply@example.test',
    SAFEBUS_NOTIFICATION_DISPATCHER_SECRET: 'dispatcher-secret',
  }),
);
afterEach(() => {
  process.env = { ...original };
  vi.clearAllMocks();
});
function client({
  resolved = payload,
  claimError = false,
  resolveError = false,
  attempt = 1,
} = {}) {
  let claimed = false;
  const rpc = vi.fn(async (name, args) => {
    if (name === 'claim_notification_deliveries') {
      if (claimError) return { error: { code: 'unavailable' } };
      if (claimed) return { data: [] };
      claimed = true;
      return { data: [{ id: payload.id, attempt_count: attempt }] };
    }
    if (name === 'resolve_notification_deliveries')
      return resolveError
        ? { error: { code: 'unavailable' } }
        : { data: resolved ? [resolved] : [] };
    if (name === 'settle_notification_deliveries') return { data: args.p_results.length };
    throw Error('Unexpected RPC ' + name);
  });
  createClient.mockReturnValue({ rpc });
  return rpc;
}
it('keeps the manual endpoint secret-protected', async () => {
  client();
  expect((await handler({ ...event, headers: {} })).statusCode).toBe(401);
});
it('fails closed on missing configuration', async () => {
  delete process.env.SAFEBUS_EMAIL_FROM;
  expect((await handler(event)).statusCode).toBe(500);
});
it('sends the exact authorized copy with stable idempotency and settles one group', async () => {
  const rpc = client(),
    send = vi.fn().mockResolvedValue({ providerMessageId: 'provider-id' }),
    result = await runDispatcher(event, send);
  expect(JSON.parse(result.body)).toMatchObject({ claimed: 1, delivered: 1 });
  expect(send).toHaveBeenCalledOnce();
  expect(send.mock.calls[0][0]).toMatchObject({
    to: payload.recipient_email,
    subject: 'SafeBus: Student picked up',
    idempotency: payload.idempotency_key,
  });
  expect(send.mock.calls[0][0].text.split('\n')[0]).toBe(payload.body);
  expect(rpc.mock.calls.find(([n]) => n === 'settle_notification_deliveries')[1].p_results).toEqual(
    [{ id: payload.id, state: 'delivered', provider_id: 'provider-id' }],
  );
});
it.each([500, 408, 429, 422, 401])('classifies provider failure %s', async (status) => {
  const rpc = client(),
    result = await runDispatcher(event, vi.fn().mockRejectedValue({ status })),
    state = [401, 422].includes(status) ? 'failed' : 'retry';
  expect(JSON.parse(result.body)[state]).toBe(1);
  const settled = rpc.mock.calls.find(([n]) => n === 'settle_notification_deliveries')[1]
    .p_results[0];
  expect(settled.state).toBe(state);
  expect(settled).not.toHaveProperty('recipient_email');
});
it('keeps an exhausted transient failure terminal', async () => {
  client({ attempt: 5 });
  expect(
    JSON.parse((await runDispatcher(event, vi.fn().mockRejectedValue({ status: 503 }))).body)
      .failed,
  ).toBe(1);
});
it('never sends a row whose authorization was revoked', async () => {
  client({ resolved: null });
  const send = vi.fn(),
    r = await runDispatcher(event, send);
  expect(send).not.toHaveBeenCalled();
  expect(JSON.parse(r.body).cancelled).toBe(1);
});
it('never falls back to a legacy template if resolution fails', async () => {
  const rpc = client({ resolveError: true }),
    send = vi.fn();
  await expect(runDispatcher(event, send)).rejects.toThrow('notification_worker_failed');
  expect(send).not.toHaveBeenCalled();
  expect(rpc.mock.calls.map(([n]) => n)).toEqual([
    'claim_notification_deliveries',
    'resolve_notification_deliveries',
  ]);
});
it.each(['', 'invalid'])('cancels unusable address %s', async (recipient_email) => {
  client({ resolved: { ...payload, recipient_email } });
  const send = vi.fn(),
    r = await runDispatcher(event, send);
  expect(send).not.toHaveBeenCalled();
  expect(JSON.parse(r.body).cancelled).toBe(1);
});
it('ignores development recipient overrides in production', async () => {
  process.env.CONTEXT = 'production';
  process.env.SAFEBUS_DEV_EMAIL_RECIPIENT_OVERRIDE = 'override@example.test';
  client();
  const send = vi.fn().mockResolvedValue({ providerMessageId: 'provider-id' });
  await runDispatcher(event, send);
  expect(send.mock.calls[0][0].to).toBe(payload.recipient_email);
});
it('renders driver copy using the same envelope', async () => {
  client({
    resolved: {
      ...payload,
      notification_type: 'driver_assignment_changed',
      title: 'Assignment changed',
      body: 'Your Bus 12 assignment on Route A has changed.',
      recipient_email: 'driver@example.test',
    },
  });
  const send = vi.fn().mockResolvedValue({ providerMessageId: 'provider-id' });
  await runDispatcher(event, send);
  expect(send.mock.calls[0][0]).toMatchObject({
    to: 'driver@example.test',
    subject: 'SafeBus: Assignment changed',
  });
});
it('reports claim dependency failure', async () => {
  client({ claimError: true });
  expect((await handler(event)).statusCode).toBe(500);
});
