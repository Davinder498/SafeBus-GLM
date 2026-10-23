import { describe, expect, it, vi } from 'vitest';

const request = vi.hoisted(() =>
  vi.fn<typeof fetch>(
    async () =>
      new Response('[]', {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
  ),
);
vi.mock('@/lib/supabase', async () => {
  const { createClient } = await import('@supabase/supabase-js');
  return {
    supabase: createClient('https://example.supabase.co', 'synthetic-anon-key', {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { fetch: request },
    }),
    supabaseConfigError: null,
  };
});
import { fetchBulkImportBatches } from './tenantAdminService';

describe('directory import history query', () => {
  it.each(['student', 'guardian', 'driver'] as const)(
    'filters %s history before limiting the results',
    async (recordType) => {
      await expect(fetchBulkImportBatches(recordType)).resolves.toEqual([]);
      const url = new URL(String(request.mock.calls.at(-1)?.[0]));
      expect(url.pathname).toBe('/rest/v1/bulk_import_batches');
      expect(url.searchParams.get('record_type')).toBe(`eq.${recordType}`);
      expect(url.searchParams.get('limit')).toBe('50');
      expect(url.searchParams.get('order')).toBe('created_at.desc');
    },
  );
});
