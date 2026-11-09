import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ createClient: vi.fn(), alert: vi.fn(), dispose: vi.fn() }));
vi.mock('@supabase/supabase-js', () => ({ createClient: mocks.createClient }));
vi.mock('../../../../scripts/lib/monitor-alert-email.mjs', () => ({
  sendMonitorAlerts: mocks.alert,
}));
vi.mock('../../netlify/functions/disposal-accounts.mjs', () => ({
  disposeOneAccount: mocks.dispose,
}));
import {
  RETENTION_CLASSES,
  validateLifecycleResult,
  handler,
} from '../../netlify/functions/retention-lifecycle-scheduled.mjs';
const result = (legacy = false) => ({
  version: 1,
  dryRun: true,
  limit: 500,
  counts: {
    ...Object.fromEntries(RETENTION_CLASSES.map((k) => [k, 0])),
    ...(legacy ? { gps: 500, archive_manifests: 0 } : {}),
  },
});
beforeEach(() => {
  vi.stubEnv('SUPABASE_URL', 'https://example.supabase.co');
  vi.stubEnv('SUPABASE_SECRET_KEY', 'synthetic-server-key');
  vi.stubEnv('SAFEBUS_RETENTION_LIFECYCLE_EXECUTE', '');
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});
it('normalizes predecessor aggregate counters without retaining a GPS/archive work class', () => {
  expect(RETENTION_CLASSES).not.toContain('gps');
  expect(RETENTION_CLASSES).not.toContain('archive_manifests');
  expect(validateLifecycleResult(result(true), true)).toEqual(result().counts);
  expect(() =>
    validateLifecycleResult({ ...result(), counts: { ...result().counts, unexpected: 0 } }, true),
  ).toThrow();
});
it('runs operational disposal inventory without archive keys or archive RPC/storage access', async () => {
  const rpc = vi.fn(async () => ({ data: result(true), error: null }));
  mocks.createClient.mockReturnValue({ rpc });
  const response = await handler();
  expect(response.statusCode).toBe(200);
  expect(rpc).toHaveBeenCalledOnce();
  expect(rpc).toHaveBeenCalledWith('run_retention_lifecycle', { p_dry_run: true, p_limit: 500 });
  expect(mocks.dispose).not.toHaveBeenCalled();
  expect(mocks.alert).not.toHaveBeenCalled();
  expect(JSON.parse(response.body)).not.toHaveProperty('archive');
});
