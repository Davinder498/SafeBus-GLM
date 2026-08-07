import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
    const rpc = vi.fn().mockResolvedValue({
      data: [{ policy_key: 'raw_location_history', affected_rows: 4, dry_run: true }],
      error: null,
    });
    createClient.mockReturnValue({ rpc });
    const { handler } = await import('../../netlify/functions/safebus-retention-scheduled.mjs');

    const response = await handler();

    expect(response.statusCode).toBe(200);
    expect(rpc).toHaveBeenCalledWith('run_all_retention_deletions', { p_dry_run: true });
    expect(JSON.parse(response.body)).toMatchObject({ dryRun: true });
  });

  it('executes deletion only when explicitly enabled', async () => {
    process.env.SAFEBUS_RETENTION_EXECUTE = 'true';
    const rpc = vi.fn().mockResolvedValue({ data: [], error: null });
    createClient.mockReturnValue({ rpc });
    const { handler } = await import('../../netlify/functions/safebus-retention-scheduled.mjs');

    await handler();

    expect(rpc).toHaveBeenCalledWith('run_all_retention_deletions', { p_dry_run: false });
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
      data: [{
        policy_key: 'trip_records',
        affected_rows: 0,
        dry_run: true,
        status: 'failed',
        error_code: '23503',
      }],
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
