import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { rpc, from } = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn() }));
vi.mock('@/lib/supabase', () => ({ supabase: { rpc, from }, supabaseConfigError: null }));

import {
  fetchOwnPlannedDriverAssignments,
  setPlannedDriverAssignment,
} from './driverAssignmentService';

const input = {
  driverId: 'driver-id',
  busRouteAssignmentId: 'service-id',
  effectiveFrom: '2026-09-18',
  effectiveTo: '2026-12-31',
};

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('driver plans use the inclusive Alberta service day', () => {
  it.each([
    ['2026-01-16T01:00:00Z', '2026-01-15'],
    ['2026-07-16T01:00:00Z', '2026-07-15'],
    ['2026-11-03T01:00:00Z', '2026-11-02'],
    ['2026-11-02T06:30:00Z', '2026-11-02'],
    ['2026-11-03T05:59:59Z', '2026-11-02'],
    ['2026-11-03T06:00:00Z', '2026-11-03'],
  ])('keeps plans ending today visible at %s', async (instant, expectedDay) => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(instant));
    const filters = { eq: vi.fn(), or: vi.fn(), order: vi.fn() };
    const stored = {
      id: 'plan',
      status: 'active',
      effective_from: '2024-02-29',
      effective_to: expectedDay,
      trip_type: 'morning',
      bus: { bus_number: '12' },
      route: { route_code: 'R', route_name: 'Rural' },
      trip_pattern: { direction: 'forward', display_name: 'Outbound' },
    };
    const query = {
      select: vi.fn(() => query),
      eq: filters.eq.mockImplementation(() => query),
      or: filters.or.mockImplementation(() => query),
      order: filters.order.mockImplementation(() => query),
      then: (resolve: (value: unknown) => unknown) =>
        Promise.resolve({ data: [stored], error: null }).then(resolve),
    };
    from.mockReturnValue(query);
    const plans = await fetchOwnPlannedDriverAssignments();
    expect(from).toHaveBeenLastCalledWith('driver_route_assignments');
    expect(filters.eq).toHaveBeenCalledWith('status', 'active');
    expect(filters.or).toHaveBeenCalledWith(`effective_to.is.null,effective_to.gte.${expectedDay}`);
    expect(plans[0]).toMatchObject({ effective_from: '2024-02-29', effective_to: expectedDay });
  });
});

describe('planned driver assignment saves', () => {
  beforeEach(() => {
    rpc.mockReset();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  it('uses the atomic RPC with dates and replacement identity', async () => {
    const result = { id: 'new-assignment', status: 'active' };
    rpc.mockResolvedValue({ data: result, error: null });
    await expect(
      setPlannedDriverAssignment({ ...input, existingAssignmentId: 'old-assignment' }),
    ).resolves.toEqual(result);
    expect(rpc).toHaveBeenCalledWith('admin_set_driver_bus_assignment', {
      p_driver_id: input.driverId,
      p_bus_route_assignment_id: input.busRouteAssignmentId,
      p_effective_from: input.effectiveFrom,
      p_effective_to: input.effectiveTo,
      p_existing_assignment_id: 'old-assignment',
    });
  });

  it.each(['42883', 'PGRST202'])(
    'reports an unavailable backend without leaking SQL (%s)',
    async (code) => {
      rpc.mockResolvedValue({
        data: null,
        error: { code, message: 'internal SQL function details' },
      });
      await expect(setPlannedDriverAssignment(input)).rejects.toThrow(
        'Planned assignments are temporarily unavailable. Please contact support.',
      );
      expect(rpc).toHaveBeenCalledTimes(1);
    },
  );

  it('keeps date validation distinct from a backend failure', async () => {
    rpc.mockResolvedValue({
      data: null,
      error: {
        code: '22007',
        message: 'Planned dates must be within the selected bus service dates.',
      },
    });
    await expect(setPlannedDriverAssignment(input)).rejects.toThrow(
      'Planned dates must be within the selected bus service dates.',
    );
  });

  it('does not retry or bypass a tenant authorization denial', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: '42501' } });
    await expect(setPlannedDriverAssignment(input)).rejects.toThrow(
      'Only a school authority administrator can change planned assignments.',
    );
    expect(rpc).toHaveBeenCalledTimes(1);
  });
});
