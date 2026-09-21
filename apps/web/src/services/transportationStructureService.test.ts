import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase', () => ({ supabase: null, supabaseConfigError: null }));

import { describeRouteError } from './transportationStructureService';

describe('route save error translation', () => {
  it('identifies the route-code constraint precisely', () => {
    expect(
      describeRouteError({
        code: '23505',
        message: 'duplicate key value violates unique constraint "routes_tenant_route_code_unique"',
      }).message,
    ).toBe(
      'A route with this code already exists in your organization. Use a different route code.',
    );
  });

  it('does not mislabel a stop-order conflict as a duplicate route code', () => {
    expect(
      describeRouteError({
        code: '23505',
        message: 'duplicate key value violates unique constraint "route_stops_route_order_unique"',
      }).message,
    ).toBe(
      'The stop sequence could not be updated safely. Reload this route and try saving the stops again.',
    );
  });
});
