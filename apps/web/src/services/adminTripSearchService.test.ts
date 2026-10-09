import { beforeEach, describe, expect, it, vi } from 'vitest';
import { searchAdminTrips } from '@/services/adminTripSearchService';
import type { AdminTripSearchQuery } from '@/types/adminTripSearch';

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('@/lib/supabase', () => ({ supabase: { rpc }, supabaseConfigError: null }));

const query: AdminTripSearchQuery = {
  fromDate: '2025-01-14',
  toDate: '2025-01-15',
  status: 'paused',
  page: 3,
  pageSize: 25,
};
const row = {
  trip_id: 'trip-1',
  service_date: '2025-01-14',
  status: 'paused',
  started_at: '2025-01-14T14:30:00Z',
  ended_at: null,
  route_name: 'Prairie Route',
  route_code: 'PR1',
  trip_pattern_name: 'Home bound',
  direction: 'reverse',
  bus_label: '12',
  driver_label: 'Alex',
};

describe('administrative trip search service', () => {
  beforeEach(() => rpc.mockReset());

  it('sends server-side date/status/page filters and maps recorded runs', async () => {
    rpc.mockResolvedValue({ data: { rows: [row], totalCount: 75 }, error: null });
    const result = await searchAdminTrips(query);
    expect(rpc).toHaveBeenCalledWith('search_admin_trips', {
      p_from_date: '2025-01-14',
      p_to_date: '2025-01-15',
      p_status: 'paused',
      p_page: 3,
      p_page_size: 25,
    });
    expect(result).toMatchObject({
      page: 3,
      pageSize: 25,
      totalCount: 75,
      rows: [{ id: 'trip-1', direction: 'return', status: 'paused', endedAt: null }],
    });
  });

  it('sends null date bounds for all dates and preserves empty-page totals', async () => {
    rpc.mockResolvedValue({ data: { rows: [], totalCount: 40 }, error: null });
    expect(
      await searchAdminTrips({ ...query, fromDate: null, toDate: null, status: null }),
    ).toMatchObject({ rows: [], totalCount: 40 });
    expect(rpc.mock.calls[0][1]).toMatchObject({
      p_from_date: null,
      p_to_date: null,
      p_status: null,
    });
  });

  it('fails explicitly when the prepared RPC is unavailable', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: 'PGRST202' } });
    await expect(searchAdminTrips(query)).rejects.toThrow('Unable to load trips');
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it('does not turn malformed responses into a false zero', async () => {
    for (const data of [null, [], { rows: [], totalCount: -1 }, { rows: [], totalCount: '10' }]) {
      rpc.mockResolvedValue({ data, error: null });
      await expect(searchAdminTrips(query)).rejects.toThrow('Unable to load trips');
    }
  });
});
