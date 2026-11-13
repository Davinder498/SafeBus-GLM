import { beforeEach, describe, expect, it, vi } from 'vitest';
const fixture = vi.hoisted(() => ({
  rows: [] as { id: string }[],
  fail: false,
  filters: [] as string[],
  orders: [] as string[],
}));
vi.mock('@/lib/supabase', () => ({
  supabaseConfigError: null,
  supabase: {
    from: () => {
      const query = {
        select: () => query,
        eq: (key: string, value: string) => {
          fixture.filters.push(`${key}:${value}`);
          return query;
        },
        order: (key: string) => {
          fixture.orders.push(key);
          return query;
        },
        range: async (from: number, to: number) =>
          fixture.fail && from > 0
            ? { data: null, error: { message: 'private provider error' } }
            : { data: fixture.rows.slice(from, Math.min(to + 1, from + 73)), error: null },
      };
      return query;
    },
  },
}));
import { getVisibleDriverProfiles } from './adminOrganizationService';
import { getVisibleGuardians } from './studentGuardianService';
beforeEach(() => {
  fixture.rows = Array.from({ length: 1081 }, (_, i) => ({ id: `record-${i}` }));
  fixture.fail = false;
  fixture.filters = [];
  fixture.orders = [];
});
for (const [name, load, filter] of [
  ['drivers', getVisibleDriverProfiles, 'role:driver'],
  ['guardians', getVisibleGuardians, 'status:active'],
] as const)
  describe(name, () => {
    it('loads every authorized result beyond 250 and the server response cap', async () => {
      expect(await load()).toEqual(fixture.rows);
      expect(fixture.filters.every((value) => value === filter)).toBe(true);
      expect(fixture.orders).toContain('id');
    });
    it('rejects an incomplete list without exposing backend details', async () => {
      fixture.fail = true;
      await expect(load()).rejects.toThrow('Unable to load these records. Please try again.');
    });
  });
