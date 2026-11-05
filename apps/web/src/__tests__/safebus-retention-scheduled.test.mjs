import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RETENTION_POLICY_KEYS } from '../../../../scripts/lib/retention-verification.mjs';
const policies = (dryRun = true) =>
  RETENTION_POLICY_KEYS.map((policy_key) => ({
    policy_key,
    affected_rows: 0,
    dry_run: dryRun,
    status: 'completed',
    error_code: null,
  }));

vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn() }));

const ORIGINAL_ENV = { ...process.env };
const { createClient } = await import('@supabase/supabase-js');

describe('scheduled retention runner', () => {
  beforeEach(() => {
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'server-secret';
    delete process.env.SAFEBUS_RETENTION_EXECUTE;
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('defaults to a non-destructive dry run', async () => {
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({ data: policies(), error: null })
      .mockResolvedValueOnce({
        data: [{ email_deleted: 1, inbox_deleted: 2, push_deleted: 3, devices_staled: 4 }],
        error: null,
      });
    createClient.mockReturnValue({ rpc });
    const { handler } = await import('../../netlify/functions/safebus-retention-scheduled.mjs');

    const response = await handler();

    expect(response.statusCode).toBe(200);
    expect(rpc).toHaveBeenCalledWith('run_all_retention_deletions', { p_dry_run: true });
    expect(rpc).toHaveBeenCalledWith('apply_notification_retention', { p_dry_run: true });
    expect(JSON.parse(response.body)).toMatchObject({ dryRun: true });
  });

  it('keeps legacy inventory observation-only even with its former execution flag', async () => {
    process.env.SAFEBUS_RETENTION_EXECUTE = 'true';
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({ data: policies(true), error: null })
      .mockResolvedValueOnce({
        data: [{ email_deleted: 0, inbox_deleted: 0, push_deleted: 0, devices_staled: 0 }],
        error: null,
      });
    createClient.mockReturnValue({ rpc });
    const { handler } = await import('../../netlify/functions/safebus-retention-scheduled.mjs');

    await handler();

    expect(rpc).toHaveBeenCalledWith('run_all_retention_deletions', { p_dry_run: true });
    expect(rpc).toHaveBeenCalledWith('apply_notification_retention', { p_dry_run: true });
  });

  it('fails closed when server configuration is missing', async () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.SUPABASE_SECRET_KEY;
    const { handler } = await import('../../netlify/functions/safebus-retention-scheduled.mjs');
    const response = await handler();
    expect(response.statusCode).toBe(503);
  });

  it('reports a failed policy as an unsuccessful scheduled run', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: policies().map((row) =>
        row.policy_key === 'trip_records' ? { ...row, status: 'failed', error_code: '23503' } : row,
      ),
      error: null,
    });
    createClient.mockReturnValue({ rpc });
    const { handler } = await import('../../netlify/functions/safebus-retention-scheduled.mjs');

    const response = await handler();

    expect(response.statusCode).toBe(500);
    expect(JSON.parse(response.body)).toMatchObject({
      failedPolicies: [{ policyKey: 'trip_records', errorCode: '23503' }],
    });
  });
});
