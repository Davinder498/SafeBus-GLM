import { beforeEach, describe, expect, it, vi } from 'vitest';
import { searchAdminTripExceptions, searchAdminTripDispatchFlags } from './adminTripReportService';
import type { AdminTripReportQuery } from '@/types/adminTripReport';

const mock = vi.hoisted(() => ({ getUser: vi.fn(), rpc: vi.fn(), from: vi.fn(), mfa: vi.fn() }));
vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: { getUser: mock.getUser, mfa: { getAuthenticatorAssuranceLevel: mock.mfa } },
    from: mock.from,
    rpc: mock.rpc,
  },
  supabaseConfigError: null,
}));
const query: AdminTripReportQuery = {
  view: 'exceptions',
  fromDate: '2025-01-01',
  toDate: '2025-01-31',
  status: 'completed',
  page: 2,
  pageSize: 25,
  exceptionType: 'weather_delay',
  flag: null,
};
const evidence = () => ({
  id: 'event-1',
  tenant_id: 'authority-1',
  driver_trip_id: 'trip-1',
  exception_type: 'weather_delay',
  occurred_at: '2025-01-09T14:00:00Z',
  operational_status: 'late',
  reason_code: 'weather',
  set_at: '2025-01-09T14:10:00Z',
  trip: {
    id: 'trip-1',
    tenant_id: 'authority-1',
    route_id: 'route-1',
    service_date: '2025-01-09',
    status: 'completed',
    started_at: '2025-01-09T14:00:00Z',
    ended_at: null,
    trip_name_snapshot: 'Recorded trip',
    bus_number_snapshot: 'Recorded bus',
    route: { tenant_id: 'authority-1', route_name: 'Route 1', route_code: 'R1' },
    pattern: {
      tenant_id: 'authority-1',
      route_id: 'route-1',
      display_name: 'Current trip',
      direction: 'reverse',
    },
    bus: { tenant_id: 'authority-1', bus_number: 'Current bus' },
    driver: {
      tenant_id: 'authority-1',
      profile: { tenant_id: 'authority-1', full_name: 'Recorded Driver' },
    },
  },
});

let profile: { role: string; tenant_id: string | null; status: string };
let response: { data: unknown; count: number | null; error: { code: string } | null };
let request: Record<string, ReturnType<typeof vi.fn>>;
beforeEach(() => {
  vi.resetAllMocks();
  mock.rpc.mockImplementation(() => ({
    abortSignal: vi.fn(async () => ({ data: null, error: null })),
  }));
  profile = { role: 'tenant_admin', tenant_id: 'authority-1', status: 'active' };
  response = { data: [evidence()], count: 63, error: null };
  mock.getUser.mockResolvedValue({ data: { user: { id: 'admin-1' } }, error: null });
  mock.mfa.mockResolvedValue({ data: { currentLevel: 'aal2' }, error: null });
  request = {};
  for (const method of [
    'select',
    'eq',
    'filter',
    'in',
    'gte',
    'lte',
    'order',
    'range',
    'abortSignal',
  ])
    request[method] = vi.fn(() => request);
  request.then = vi.fn((resolve) => Promise.resolve(response).then(resolve));
  const lookup = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    abortSignal: vi.fn().mockReturnThis(),
    single: vi.fn(async () => ({ data: profile, error: null })),
  };
  mock.from.mockImplementation((table) => (table === 'profiles' ? lookup : request));
});

describe('read-only authority trip evidence', () => {
  it.each(['tenant_admin', 'transportation_admin'])(
    'uses caller context, bounded server filtering and snapshot labels for %s',
    async (role) => {
      profile.role = role;
      const result = await searchAdminTripExceptions(query);
      expect(result).toMatchObject({
        totalCount: 63,
        page: 2,
        pageSize: 25,
        rows: [
          {
            category: 'weather_delay',
            trip: {
              id: 'trip-1',
              busLabel: 'Recorded bus',
              tripPatternName: 'Recorded trip',
              direction: 'return',
            },
          },
        ],
      });
      expect(mock.from).toHaveBeenCalledWith('trip_exceptions');
      expect(request.select).toHaveBeenCalledWith(expect.stringContaining('driver_trips!inner'), {
        count: 'exact',
      });
      expect(request.eq.mock.calls).toContainEqual(['tenant_id', 'authority-1']);
      expect(request.eq.mock.calls).toContainEqual([
        'trip.driver.profile.tenant_id',
        'authority-1',
      ]);
      expect(request.eq.mock.calls).toContainEqual(['trip.status', 'completed']);
      expect(request.filter).toHaveBeenCalledWith('exception_type', 'eq', 'weather_delay');
      expect(request.gte).toHaveBeenCalledWith('trip.service_date', '2025-01-01');
      expect(request.lte).toHaveBeenCalledWith('trip.service_date', '2025-01-31');
      expect(request.range).toHaveBeenCalledWith(25, 49);
      expect(request.order.mock.calls).toEqual([
        ['occurred_at', { ascending: false }],
        ['id', { ascending: true }],
      ]);
    },
  );
  it('filters explicit latest dispatch flags, never synthesizing a normal or missing record', async () => {
    await searchAdminTripDispatchFlags({ ...query, flag: 'missing', status: 'ongoing' });
    expect(request.in.mock.calls).toContainEqual(['operational_status', ['missing']]);
    expect(request.in.mock.calls).toContainEqual(['trip.status', ['active', 'paused']]);
    expect(request.order.mock.calls[0]).toEqual(['set_at', { ascending: false }]);
    response = { data: [], count: 0, error: null };
    expect((await searchAdminTripDispatchFlags({ ...query, flag: null })).rows).toEqual([]);
    expect(request.in.mock.calls).toContainEqual(['operational_status', ['late', 'missing']]);
  });
  it.each(['guardian', 'driver', 'school_admin', 'platform_super_admin'])(
    'rejects the %s reporting surface',
    async (role) => {
      profile.role = role;
      await expect(searchAdminTripExceptions(query)).rejects.toThrow('administrator permissions');
      expect(mock.from).not.toHaveBeenCalledWith('trip_exceptions');
    },
  );
  it.each([{ status: 'suspended' }, { tenant_id: null }])(
    'rejects inactive or missing authority context %j',
    async (changes) => {
      Object.assign(profile, changes);
      await expect(searchAdminTripExceptions(query)).rejects.toThrow('administrator permissions');
    },
  );
  it('rejects an expired identity and missing MFA before querying evidence', async () => {
    mock.getUser.mockResolvedValueOnce({ data: { user: null }, error: {} });
    await expect(searchAdminTripExceptions(query)).rejects.toThrow('administrator permissions');
    mock.mfa.mockResolvedValue({ data: { currentLevel: 'aal1' }, error: null });
    await expect(searchAdminTripExceptions(query)).rejects.toThrow('administrator permissions');
    expect(mock.from).not.toHaveBeenCalledWith('trip_exceptions');
  });
  it('fails closed when the server rejects a revoked, suspended or non-MFA administrator', async () => {
    mock.rpc.mockImplementation(() => ({
      abortSignal: vi.fn(async () => ({ data: null, error: { code: '42501' } })),
    }));
    await expect(searchAdminTripExceptions(query)).rejects.toThrow('administrator permissions');
    expect(mock.from).not.toHaveBeenCalledWith('trip_exceptions');
  });
  it.each(['42501', 'PGRST301', 'PGRST303'])('classifies server access denial %s', async (code) => {
    response.error = { code };
    await expect(searchAdminTripExceptions(query)).rejects.toThrow('administrator permissions');
  });
  it.each([
    { page: 0 },
    { pageSize: 1000 },
    { fromDate: '2025-02-30' },
    { toDate: null },
    { status: 'invented' },
    { exceptionType: 'invented' },
    { flag: 'normal' },
  ])('rejects invalid filters %j', async (changes) => {
    await expect(
      searchAdminTripExceptions({ ...query, ...changes } as AdminTripReportQuery),
    ).rejects.toThrow();
    expect(mock.from).not.toHaveBeenCalled();
  });
  it('rejects mismatched authorities, routes and malformed counts', async () => {
    const row = evidence();
    row.trip.driver.profile.tenant_id = 'authority-2';
    response.data = [row];
    await expect(searchAdminTripExceptions(query)).rejects.toThrow('Unable to load');
    row.trip.driver.profile.tenant_id = 'authority-1';
    row.trip.pattern.route_id = 'other-route';
    await expect(searchAdminTripExceptions(query)).rejects.toThrow('Unable to load');
    response = { data: [], count: null, error: null };
    await expect(searchAdminTripExceptions(query)).rejects.toThrow('Unable to load');
  });
  it('preserves separate exception records for the same trip and propagates cancellation', async () => {
    response.data = [evidence(), { ...evidence(), id: 'event-2' }];
    const controller = new AbortController();
    expect(
      (await searchAdminTripExceptions(query, controller.signal)).rows.map((r) => r.id),
    ).toEqual(['event-1', 'event-2']);
    expect(request.abortSignal).toHaveBeenCalledWith(controller.signal);
    controller.abort();
    await expect(searchAdminTripExceptions(query, controller.signal)).rejects.toThrow();
  });
});
