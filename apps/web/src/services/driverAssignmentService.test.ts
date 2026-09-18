import { beforeEach, describe, expect, it, vi } from 'vitest';

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('@/lib/supabase', () => ({ supabase: { rpc }, supabaseConfigError: null }));

import { setPlannedDriverAssignment } from './driverAssignmentService';

const input = {
  driverId: 'driver-id',
  busRouteAssignmentId: 'service-id',
  effectiveFrom: '2026-09-18',
  effectiveTo: '2026-12-31',
};

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
      'Only a tenant administrator can change planned assignments.',
    );
    expect(rpc).toHaveBeenCalledTimes(1);
  });
});
