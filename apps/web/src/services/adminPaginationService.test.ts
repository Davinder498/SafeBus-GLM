import { beforeEach, describe, expect, it, vi } from 'vitest';

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('@/lib/supabase', () => ({ supabase: { rpc }, supabaseConfigError: null }));

import { fetchAdminPage } from './adminPaginationService';

const query = {
  page: 1,
  pageSize: 25 as const,
  search: '',
  status: '',
  schoolId: '',
};

describe('admin bus pagination compatibility', () => {
  beforeEach(() => rpc.mockReset());

  it.each(['PGRST202', '42883'])(
    'falls back to the established admin list when the bus RPC is unavailable (%s)',
    async (code) => {
      const fallbackResult = {
        rows: [{ id: 'bus-1', bus_number: '12' }],
        totalCount: 1,
        page: 1,
        pageSize: 25,
      };
      rpc
        .mockResolvedValueOnce({ data: null, error: { code } })
        .mockResolvedValueOnce({ data: fallbackResult, error: null });

      await expect(fetchAdminPage('buses', query)).resolves.toEqual(fallbackResult);
      expect(rpc).toHaveBeenNthCalledWith(1, 'get_admin_buses_page', {
        p_page: 1,
        p_page_size: 25,
        p_search: '',
        p_status: null,
        p_school_id: null,
      });
      expect(rpc).toHaveBeenNthCalledWith(2, 'get_admin_paginated_list', {
        p_entity: 'buses',
        p_page: 1,
        p_page_size: 25,
        p_search: '',
        p_status: null,
        p_school_id: null,
      });
    },
  );

  it('does not retry authorization failures through another RPC', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: '42501' } });

    await expect(fetchAdminPage('buses', query)).rejects.toThrow('Unable to load this list.');
    expect(rpc).toHaveBeenCalledTimes(1);
  });
});
