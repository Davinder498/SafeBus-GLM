import { beforeEach, describe, expect, it, vi } from 'vitest';
import { searchAdminTrips } from '@/services/adminTripSearchService';
import type { AdminTripSearchQuery } from '@/types/adminTripSearch';

const { rpc, from, getUser } = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(),
  getUser: vi.fn(),
}));
vi.mock('@/lib/supabase', () => ({
  supabase: { rpc, from, auth: { getUser } },
  supabaseConfigError: null,
}));

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
  beforeEach(() => {
    rpc.mockReset();
    from.mockReset();
    getUser.mockReset();
  });

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

  function existingTables(
    profile = {
      role: 'tenant_admin',
      tenant_id: 'tenant-1',
      school_id: null as string | null,
      status: 'active',
    },
  ) {
    getUser.mockResolvedValue({ data: { user: { id: 'admin-1' } }, error: null });
    const lookup = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: profile, error: null }),
    };
    const request = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      lte: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      range: vi.fn().mockResolvedValue({
        data: [
          {
            id: row.trip_id,
            route_id: 'route-1',
            service_date: row.service_date,
            status: row.status,
            started_at: row.started_at,
            ended_at: row.ended_at,
            trip_name_snapshot: 'Recorded run',
            route: { route_name: row.route_name, route_code: row.route_code },
            pattern: {
              route_id: 'route-1',
              direction: row.direction,
              display_name: 'Current pattern',
            },
            bus: { bus_number: row.bus_label },
            driver: { profile: { full_name: row.driver_label } },
          },
        ],
        count: 75,
        error: null,
      }),
    };
    from.mockImplementation((table) => (table === 'profiles' ? lookup : request));
    return { request, lookup };
  }

  it.each(['PGRST202', '42883'])(
    'searches existing RLS tables when RPC is missing (%s)',
    async (code) => {
      rpc.mockResolvedValue({ data: null, error: { code } });
      const { request } = existingTables();
      expect(await searchAdminTrips(query)).toMatchObject({
        totalCount: 75,
        page: 3,
        rows: [{ id: 'trip-1', tripPatternName: 'Recorded run' }],
      });
      for (const field of [
        'tenant_id',
        'route.tenant_id',
        'pattern.tenant_id',
        'bus.tenant_id',
        'driver.tenant_id',
        'driver.profile.tenant_id',
      ])
        expect(request.eq).toHaveBeenCalledWith(field, 'tenant-1');
      expect(request.eq).toHaveBeenCalledWith('status', 'paused');
      expect(request.gte).toHaveBeenCalledWith('service_date', '2025-01-14');
      expect(request.lte).toHaveBeenCalledWith('service_date', '2025-01-15');
      expect(request.range).toHaveBeenCalledWith(50, 74);
      expect(request.order.mock.calls).toEqual([
        ['service_date', { ascending: false }],
        ['started_at', { ascending: false }],
        ['id', { ascending: true }],
      ]);
      expect(request.select.mock.calls[0][1]).toEqual({ count: 'exact' });
      expect(rpc).toHaveBeenCalledTimes(1);
    },
  );

  it('restricts school administrators and preserves all-date server pagination', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: 'PGRST202' } });
    const { request } = existingTables({
      role: 'school_admin',
      tenant_id: 'tenant-1',
      school_id: 'school-1',
      status: 'active',
    });
    await searchAdminTrips({ ...query, fromDate: null, toDate: null, status: null, page: 10 });
    expect(request.eq).toHaveBeenCalledWith('route.school_id', 'school-1');
    expect(request.gte).not.toHaveBeenCalled();
    expect(request.lte).not.toHaveBeenCalled();
    expect(request.range).toHaveBeenCalledWith(225, 249);
  });

  it.each([
    { role: 'guardian', tenant_id: 'tenant-1', school_id: null, status: 'active' },
    { role: 'driver', tenant_id: 'tenant-1', school_id: null, status: 'active' },
    { role: 'school_admin', tenant_id: 'tenant-1', school_id: null, status: 'active' },
    { role: 'tenant_admin', tenant_id: 'tenant-1', school_id: null, status: 'inactive' },
  ])('denies an ineligible compatibility caller: %j', async (profile) => {
    rpc.mockResolvedValue({ data: null, error: { code: 'PGRST202' } });
    const { request } = existingTables(profile);
    await expect(searchAdminTrips(query)).rejects.toThrow('Unable to load trips');
    expect(request.select).not.toHaveBeenCalled();
  });

  it('does not fall back on denied RPC access or network failures', async () => {
    for (const code of ['42501', '500']) {
      rpc.mockResolvedValue({ data: null, error: { code } });
      await expect(searchAdminTrips(query)).rejects.toThrow('Unable to load trips');
    }
    expect(from).not.toHaveBeenCalled();
  });

  it('does not turn an uncounted compatibility response into a false zero', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: 'PGRST202' } });
    const { request } = existingTables();
    request.range.mockResolvedValue({ data: [], count: null, error: null });
    await expect(searchAdminTrips(query)).rejects.toThrow('Unable to load trips');
  });

  it('does not turn malformed responses into a false zero', async () => {
    for (const data of [null, [], { rows: [], totalCount: -1 }, { rows: [], totalCount: '10' }]) {
      rpc.mockResolvedValue({ data, error: null });
      await expect(searchAdminTrips(query)).rejects.toThrow('Unable to load trips');
    }
  });

  it.each([
    { fromDate: '', toDate: '' },
    { fromDate: '2025-02-30', toDate: '2025-03-01' },
    { fromDate: '2025-01-15', toDate: '2025-01-14' },
    { fromDate: '2025-01-14', toDate: null },
    { page: 0 },
  ])('rejects invalid filters before making requests: %j', async (invalid) => {
    await expect(searchAdminTrips({ ...query, ...invalid })).rejects.toThrow();
    expect(rpc).not.toHaveBeenCalled();
    expect(from).not.toHaveBeenCalled();
  });
});
