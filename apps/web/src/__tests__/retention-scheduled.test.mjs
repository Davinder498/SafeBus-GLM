import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RETENTION_POLICY_KEYS } from '../../../../scripts/lib/retention-verification.mjs';

vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn() }));
const { createClient } = await import('@supabase/supabase-js');
const { runRetention } = await import('../../netlify/functions/safebus-retention-scheduled.mjs');
const policies = (dryRun = true) =>
  RETENTION_POLICY_KEYS.map((policy_key) => ({
    policy_key,
    affected_rows: 0,
    dry_run: dryRun,
    status: 'completed',
    error_code: null,
  }));
const notifications = () => [
  { email_deleted: 0, inbox_deleted: 0, push_deleted: 0, devices_staled: 0 },
];
let rpc;
beforeEach(() => {
  vi.stubEnv('SUPABASE_URL', 'https://example.supabase.co');
  vi.stubEnv('SUPABASE_SECRET_KEY', 'synthetic-server-key');
  vi.stubEnv('SAFEBUS_RETENTION_EXECUTE', '');
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
  rpc = vi
    .fn()
    .mockResolvedValueOnce({ data: policies(), error: null })
    .mockResolvedValueOnce({ data: notifications(), error: null });
  createClient.mockReturnValue({ rpc });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe('scheduled retention acceptance', () => {
  it('defaults both calls to dry-run and accepts the complete aggregate result', async () => {
    const response = await runRetention();
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body).results).toHaveLength(13);
    expect(rpc.mock.calls.map((c) => c[1])).toEqual([{ p_dry_run: true }, { p_dry_run: true }]);
  });
  it.each([
    null,
    [],
    policies().slice(1),
    [...policies(), policies()[0]],
    policies().map((r, i) => (i ? r : { ...r, policy_key: 'unexpected' })),
    policies().map((r, i) => (i ? r : { ...r, status: 'unknown' })),
    policies().map((r, i) => (i ? r : { ...r, dry_run: false })),
    policies().map((r, i) => (i ? r : { ...r, affected_rows: -1 })),
    policies().map((r, i) => (i ? r : { ...r, error_code: '42702' })),
  ])(
    'rejects an incomplete or inconsistent policy result before the notification call: %#',
    async (data) => {
      rpc.mockReset().mockResolvedValue({ data, error: null });
      expect((await runRetention()).statusCode).toBe(500);
      expect(rpc).toHaveBeenCalledTimes(1);
      expect(console.log).not.toHaveBeenCalled();
    },
  );
  it.each([
    null,
    [],
    [{}],
    [{ ...notifications()[0], push_deleted: -1 }],
    [{ ...notifications()[0], email_deleted: '9007199254740992' }],
  ])('rejects malformed notification totals: %#', async (data) => {
    rpc
      .mockReset()
      .mockResolvedValueOnce({ data: policies(), error: null })
      .mockResolvedValueOnce({ data, error: null });
    expect((await runRetention()).statusCode).toBe(500);
    expect(console.log).not.toHaveBeenCalled();
  });
  it('contains transport exceptions without logging provider messages', async () => {
    rpc.mockReset().mockRejectedValue(new Error('private-token-or-customer-detail'));
    const response = await runRetention();
    expect(response.statusCode).toBe(500);
    expect(JSON.stringify(console.error.mock.calls)).not.toContain('private-token');
  });
  it('passes an explicitly configured execution request without changing database approval', async () => {
    vi.stubEnv('SAFEBUS_RETENTION_EXECUTE', 'true');
    rpc
      .mockReset()
      .mockResolvedValueOnce({ data: policies(false), error: null })
      .mockResolvedValueOnce({ data: notifications(), error: null });
    const response = await runRetention();
    expect(response.statusCode).toBe(200);
    expect(rpc.mock.calls.map((c) => c[1])).toEqual([{ p_dry_run: false }, { p_dry_run: false }]);
  });
});

it('keeps RPC errors sanitized and does not continue a failed policy batch', async () => {
  rpc
    .mockReset()
    .mockResolvedValue({
      data: null,
      error: { code: 'private-code', message: 'private-provider-message' },
    });
  const response = await runRetention();
  expect(response.statusCode).toBe(500);
  expect(rpc).toHaveBeenCalledTimes(1);
  expect(JSON.stringify(console.error.mock.calls)).not.toContain('private-');
});
it('rejects missing server configuration before creating a client', async () => {
  vi.stubEnv('SUPABASE_SECRET_KEY', '');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '');
  createClient.mockClear();
  expect((await runRetention()).statusCode).toBe(503);
  expect(createClient).not.toHaveBeenCalled();
});
